// Test luồng Hóa đơn tổng hợp, Thanh toán Tiền mặt / VNPay QR + IPN Webhook, Khóa SOAP Finalized, Nhả chuồng & Xuất PDF (UC-45..48)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
process.env.VNP_TMN_CODE = process.env.VNP_TMN_CODE || 'TESTTMN1';
process.env.VNP_HASH_SECRET = process.env.VNP_HASH_SECRET || 'TEST_HASH_SECRET_KEY_1234567890';
process.env.VNP_URL = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
process.env.VNP_RETURN_URL = process.env.VNP_RETURN_URL || 'http://localhost:9999/api/invoices/vnpay-return';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const Product = require('../src/models/Product');
const Cage = require('../src/models/Cage');
const CageAssignment = require('../src/models/CageAssignment');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');
const MedicalRecord = require('../src/models/MedicalRecord');
const InpatientRecord = require('../src/models/InpatientRecord');
const Invoice = require('../src/models/Invoice');
const { sortAndEncodeVnpayParams, signVnpayData } = require('../src/utils/vnpay');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

const buildSignedVnpayQuery = (params) => {
  const sorted = sortAndEncodeVnpayParams(params);
  sorted.vnp_SecureHash = signVnpayData(sorted, process.env.VNP_HASH_SECRET);
  return sorted;
};

let receptionist;
let admin;
let vet;
let owner1;
let owner2;

let receptionistToken;
let adminToken;
let vetToken;
let owner1Token;
let owner2Token;

let pet1;
let pet2;
let examService;
let inpatientService;
let medicineProduct;
let retailProduct;
let inactiveProduct;
let holdingCage;
let wardCage;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    Pet.syncIndexes(),
    Service.syncIndexes(),
    Product.syncIndexes(),
    Cage.syncIndexes(),
    CageAssignment.syncIndexes(),
    AppointmentOrder.syncIndexes(),
    AppointmentService.syncIndexes(),
    MedicalRecord.syncIndexes(),
    InpatientRecord.syncIndexes(),
    Invoice.syncIndexes(),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);
  [receptionist, admin, vet, owner1, owner2] = await User.create([
    { code: 'USR-INVR01', fullName: 'Lễ Tân Lan', phone: '0944000001', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-INVA01', fullName: 'Quản Trị Minh', phone: '0944000002', passwordHash, role: 'Admin', status: 'Active' },
    { code: 'USR-INVV01', fullName: 'BS. Tuấn', phone: '0944000003', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-INVO01', fullName: 'Chủ Pet Một', phone: '0944000004', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-INVO02', fullName: 'Chủ Pet Hai', phone: '0944000005', passwordHash, role: 'PetOwner', status: 'Active' },
  ]);

  receptionistToken = signToken(receptionist);
  adminToken = signToken(admin);
  vetToken = signToken(vet);
  owner1Token = signToken(owner1);
  owner2Token = signToken(owner2);

  [pet1, pet2] = await Pet.create([
    { code: 'PET-INV001', ownerId: owner1._id, name: 'Bông', species: 'Dog', breed: 'Corgi', weight: 8, status: 'Active' },
    { code: 'PET-INV002', ownerId: owner2._id, name: 'Miu', species: 'Cat', breed: 'ALN', weight: 4, status: 'Active' },
  ]);

  [examService, inpatientService] = await Service.create([
    {
      code: 'SRV-INVEX1',
      name: 'Khám lâm sàng',
      category: 'Examination',
      requiredRole: 'Veterinarian',
      defaultDuration: 30,
      basePrice: 150000,
      status: 'Active',
    },
    {
      code: 'SRV-INVIN1',
      name: 'Lưu chuồng nội trú',
      category: 'Inpatient',
      requiredRole: 'Veterinarian',
      defaultDuration: 60,
      basePrice: 200000,
      status: 'Active',
    },
  ]);

  [medicineProduct, retailProduct, inactiveProduct] = await Product.create([
    { code: 'PRD-INVM01', name: 'Kháng sinh A', category: 'Medicine', unit: 'vỉ', unitPrice: 50000, status: 'Active' },
    { code: 'PRD-INVR01', name: 'Pate dinh dưỡng', category: 'Retail', unit: 'hộp', unitPrice: 35000, status: 'Active' },
    { code: 'PRD-INVI01', name: 'Vòng cổ hết hàng', category: 'Retail', unit: 'cái', unitPrice: 90000, status: 'Inactive' },
  ]);

  [holdingCage, wardCage] = await Cage.create([
    { label: 'H-INV-01', size: 'M', maxWeightKg: 15, zone: 'Holding', isIsolated: false, status: 'Occupied' },
    { label: 'W-INV-01', size: 'S', maxWeightKg: 5, zone: 'InpatientWard', isIsolated: false, status: 'Occupied' },
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Module Hóa đơn & Thanh toán (Invoice / VNPay / PDF)', () => {
  let orderCash;
  let apptSvcCash;
  let medicalRecordCash;
  let invoiceCash;

  let orderVnpay;
  let apptSvcVnpay;
  let medicalRecordVnpay;
  let invoiceVnpay;

  let orderInpatient;
  let inpatientRecordDoc;
  let invoiceInpatient;

  beforeAll(async () => {
    // 1. Đơn ngoại trú 1 (thanh toán Tiền mặt) ở trạng thái WaitOwner + có bệnh án Draft + chuồng chờ Occupied
    orderCash = await AppointmentOrder.create({
      code: 'APT-INVC01',
      petId: pet1._id,
      ownerId: owner1._id,
      date: '2026-11-17',
      derivedStatus: 'WaitOwner',
      checkedInAt: new Date(),
    });
    apptSvcCash = await AppointmentService.create({
      orderId: orderCash._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
      queueNo: 1,
    });
    medicalRecordCash = await MedicalRecord.create({
      appointmentServiceId: apptSvcCash._id,
      petId: pet1._id,
      subjectiveNote: 'Bỏ ăn 1 ngày',
      objectiveNote: '38.7 độ',
      assessment: 'Rối loạn tiêu hóa',
      plan: 'Uống thuốc theo đơn',
      prescriptions: [
        {
          productId: medicineProduct._id,
          productNameSnapshot: medicineProduct.name,
          unitSnapshot: medicineProduct.unit,
          dosage: '1 viên',
          frequency: '2 lần/ngày',
          durationDays: 3,
        },
      ],
      status: 'Draft',
    });
    await CageAssignment.create({
      cageId: holdingCage._id,
      orderId: orderCash._id,
      assignedById: receptionist._id,
      releasedAt: null,
    });

    // 2. Đơn ngoại trú 2 (thanh toán VNPay) ở trạng thái WaitOwner
    orderVnpay = await AppointmentOrder.create({
      code: 'APT-INVV01',
      petId: pet2._id,
      ownerId: owner2._id,
      date: '2026-11-17',
      derivedStatus: 'WaitOwner',
      checkedInAt: new Date(),
    });
    apptSvcVnpay = await AppointmentService.create({
      orderId: orderVnpay._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
      queueNo: 2,
    });
    medicalRecordVnpay = await MedicalRecord.create({
      appointmentServiceId: apptSvcVnpay._id,
      petId: pet2._id,
      subjectiveNote: 'Ho nhẹ',
      objectiveNote: '38.5 độ',
      assessment: 'Viêm họng nhẹ',
      plan: 'Theo dõi tại nhà',
      status: 'Draft',
    });

    // 3. Đơn nội trú 3 (đã Discharged 2 ngày)
    orderInpatient = await AppointmentOrder.create({
      code: 'APT-INVI01',
      petId: pet2._id,
      ownerId: owner2._id,
      date: '2026-11-15',
      derivedStatus: 'WaitOwner',
      checkedInAt: new Date('2026-11-15T08:00:00Z'),
    });
    await AppointmentService.create({
      orderId: orderInpatient._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
    });
    inpatientRecordDoc = await InpatientRecord.create({
      petId: pet2._id,
      orderId: orderInpatient._id,
      attendingVetId: vet._id,
      cageId: wardCage._id,
      initialDiagnosis: 'Suy nhược',
      treatmentPlan: 'Truyền dịch 2 ngày',
      admittedAt: new Date('2026-11-15T09:00:00Z'),
      dischargedAt: new Date('2026-11-17T08:00:00Z'), // ~47h -> ceil = 2 ngày
      status: 'Discharged',
    });
    await CageAssignment.create({
      cageId: wardCage._id,
      orderId: orderInpatient._id,
      assignedById: vet._id,
      releasedAt: null,
    });
  });

  test('1. Chặn vai trò không phải Lễ tân lập hóa đơn (403) và chặn sản phẩm Inactive (400 - BR-16)', async () => {
    const forbiddenRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({ orderId: String(orderCash._id) });
    expect(forbiddenRes.status).toBe(403);

    const inactiveRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        orderId: String(orderCash._id),
        retailItems: [{ productId: String(inactiveProduct._id), quantity: 1 }],
      });
    expect(inactiveRes.status).toBe(400);
  });

  test('2. Chặn lập hóa đơn khi đơn chưa WaitOwner hoặc còn đợt nội trú Admitted (409)', async () => {
    const bookedOrder = await AppointmentOrder.create({
      code: 'APT-INVBK1',
      petId: pet1._id,
      ownerId: owner1._id,
      date: '2026-11-18',
      derivedStatus: 'Booked',
    });

    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ orderId: String(bookedOrder._id) });
    expect(res.status).toBe(409);

    const activeInpatientOrder = await AppointmentOrder.create({
      code: 'APT-INVAD1',
      petId: pet1._id,
      ownerId: owner1._id,
      date: '2026-11-17',
      derivedStatus: 'WaitOwner',
    });
    await InpatientRecord.create({
      petId: pet1._id,
      orderId: activeInpatientOrder._id,
      attendingVetId: vet._id,
      cageId: wardCage._id,
      initialDiagnosis: 'Cần theo dõi',
      status: 'Admitted',
    });

    const activeRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ orderId: String(activeInpatientOrder._id) });
    expect(activeRes.status).toBe(409);
  });

  test('3. Lập hóa đơn tổng hợp ngoại trú kèm snapshot giá (UC-45, BR-16, BR-24) và chặn trùng hóa đơn (409)', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        orderId: String(orderCash._id),
        prescriptionQuantities: [{ productId: String(medicineProduct._id), quantity: 2 }],
        retailItems: [{ productId: String(retailProduct._id), quantity: 1 }],
      });

    expect(res.status).toBe(201);
    invoiceCash = res.body.data;
    expect(invoiceCash.code).toMatch(/^INV-[A-Z2-9]{6}$/);
    expect(invoiceCash.paymentStatus).toBe('Unpaid');
    // 150,000 (khám) + 2*50,000 (thuốc) + 1*35,000 (pate) = 285,000
    expect(invoiceCash.totalAmount).toBe(285000);
    expect(invoiceCash.items).toHaveLength(3);

    // Đổi giá trong danh mục gốc -> hóa đơn đã lập không bị thay đổi giá (BR-16)
    await Product.updateOne({ _id: retailProduct._id }, { $set: { unitPrice: 99000 } });
    const reloaded = await Invoice.findById(invoiceCash._id).lean();
    expect(reloaded.totalAmount).toBe(285000);

    // Khôi phục giá gốc để dùng cho test sau
    await Product.updateOne({ _id: retailProduct._id }, { $set: { unitPrice: 35000 } });

    // Chặn lập trùng hóa đơn thứ 2 cho cùng orderId
    const dupRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ orderId: String(orderCash._id) });
    expect(dupRes.status).toBe(409);
  });

  test('4. Thêm / bớt sản phẩm bán lẻ khi hóa đơn còn Unpaid & chặn xóa dịch vụ (UC-45 Alt Flow 5a)', async () => {
    const serviceLine = invoiceCash.items.find((i) => i.type === 'Service');
    const retailLine = invoiceCash.items.find((i) => String(i.refId) === String(retailProduct._id));

    // Chặn xóa dòng Service
    const badRemove = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/items`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ removeItemIds: [String(serviceLine._id)] });
    expect(badRemove.status).toBe(400);

    // Gỡ bỏ dòng pate (35,000) -> tổng còn 250,000
    const removeRes = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/items`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ removeItemIds: [String(retailLine._id)] });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.totalAmount).toBe(250000);

    // Thêm lại 2 hộp pate (+70,000) -> tổng 320,000
    const addRes = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/items`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ addItems: [{ productId: String(retailProduct._id), quantity: 2 }] });
    expect(addRes.status).toBe(200);
    invoiceCash = addRes.body.data;
    expect(invoiceCash.totalAmount).toBe(320000);
  });

  test('5. Thanh toán Tiền mặt -> Paid, Order Done, khóa MedicalRecord Finalized & nhả chuồng (UC-46, BR-14)', async () => {
    // Tiền khách đưa nhỏ hơn tổng tiền -> 400
    const lowCashRes = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/pay-cash`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cashReceived: 300000 });
    expect(lowCashRes.status).toBe(400);

    const payRes = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/pay-cash`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cashReceived: 500000 });
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.paymentStatus).toBe('Paid');
    expect(payRes.body.data.paymentMethod).toBe('Cash');
    expect(payRes.body.changeAmount).toBe(180000);

    const [updatedOrder, updatedMr, updatedCage, closedAssign] = await Promise.all([
      AppointmentOrder.findById(orderCash._id).lean(),
      MedicalRecord.findById(medicalRecordCash._id).lean(),
      Cage.findById(holdingCage._id).lean(),
      CageAssignment.findOne({ orderId: orderCash._id }).lean(),
    ]);
    expect(updatedOrder.derivedStatus).toBe('Done');
    expect(updatedMr.status).toBe('Finalized');
    expect(updatedCage.status).toBe('Available');
    expect(closedAssign.releasedAt).not.toBeNull();

    // Bác sĩ không được phép sửa bệnh án đã Finalized (BR-14)
    const editFinalizedRes = await request(app)
      .put(`/api/medical-records/service/${apptSvcCash._id}`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ objectiveNote: 'Cố sửa sau khi thanh toán' });
    expect([403, 409]).toContain(editFinalizedRes.status);

    // Chặn thanh toán lại hóa đơn đã Paid
    const repayRes = await request(app)
      .patch(`/api/invoices/${invoiceCash._id}/pay-cash`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cashReceived: 320000 });
    expect(repayRes.status).toBe(409);
  });

  test('6. Thanh toán VNPay QR + Return URL (không đổi trạng thái) + IPN Webhook (BR-17)', async () => {
    const createRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ orderId: String(orderVnpay._id) });
    expect(createRes.status).toBe(201);
    invoiceVnpay = createRes.body.data;
    expect(invoiceVnpay.totalAmount).toBe(150000);

    const urlRes = await request(app)
      .post(`/api/invoices/${invoiceVnpay._id}/vnpay-url`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(urlRes.status).toBe(200);
    const { paymentUrl, vnpayTxnRef } = urlRes.body.data;
    expect(paymentUrl).toContain('sandbox.vnpayment.vn');
    expect(paymentUrl).toContain(`vnp_TxnRef=${vnpayTxnRef}`);
    expect(paymentUrl).toContain('vnp_Amount=15000000');

    // Return URL với chữ ký sai -> 400
    const badReturn = await request(app)
      .get('/api/invoices/vnpay-return')
      .query({ vnp_TxnRef: vnpayTxnRef, vnp_Amount: '15000000', vnp_ResponseCode: '00', vnp_SecureHash: 'tampered' });
    expect(badReturn.status).toBe(400);

    // Return URL hợp lệ -> 200 nhưng KHÔNG tự đổi trạng thái hóa đơn (API-04)
    const validQuery = buildSignedVnpayQuery({
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: 15000000,
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: vnpayTxnRef,
    });
    const okReturn = await request(app).get('/api/invoices/vnpay-return').query(validQuery);
    expect(okReturn.status).toBe(200);
    expect(okReturn.body.valid).toBe(true);
    expect(okReturn.body.success).toBe(true);
    const stillUnpaid = await Invoice.findById(invoiceVnpay._id).lean();
    expect(stillUnpaid.paymentStatus).toBe('Unpaid');

    // IPN sai chữ ký -> RspCode 97
    const ipnBadSig = await request(app)
      .get('/api/invoices/vnpay-ipn')
      .query({ ...validQuery, vnp_SecureHash: 'fakehash' });
    expect(ipnBadSig.body.RspCode).toBe('97');

    // IPN sai mã giao dịch -> RspCode 01
    const nfSigned = buildSignedVnpayQuery({
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: 15000000,
      vnp_ResponseCode: '00',
      vnp_TxnRef: 'NOTFOUND999',
    });
    const ipnNotFound = await request(app).get('/api/invoices/vnpay-ipn').query(nfSigned);
    expect(ipnNotFound.body.RspCode).toBe('01');

    // IPN sai số tiền -> RspCode 04
    const wrongAmtQuery = buildSignedVnpayQuery({
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: 100000,
      vnp_ResponseCode: '00',
      vnp_TxnRef: vnpayTxnRef,
    });
    const ipnWrongAmt = await request(app).get('/api/invoices/vnpay-ipn').query(wrongAmtQuery);
    expect(ipnWrongAmt.body.RspCode).toBe('04');

    // IPN giao dịch bị hủy (vnp_ResponseCode = '24') -> RspCode 00 nhưng giữ Unpaid
    const cancelQuery = buildSignedVnpayQuery({
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: 15000000,
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
      vnp_TxnRef: vnpayTxnRef,
    });
    const ipnCancel = await request(app).get('/api/invoices/vnpay-ipn').query(cancelQuery);
    expect(ipnCancel.body.RspCode).toBe('00');
    const afterCancel = await Invoice.findById(invoiceVnpay._id).lean();
    expect(afterCancel.paymentStatus).toBe('Unpaid');

    // IPN hợp lệ -> Paid (VNPay), Order -> Done, MedicalRecord -> Finalized
    const ipnOk = await request(app).get('/api/invoices/vnpay-ipn').query(validQuery);
    expect(ipnOk.body.RspCode).toBe('00');

    const [paidInv, doneOrder, finalizedMr] = await Promise.all([
      Invoice.findById(invoiceVnpay._id).lean(),
      AppointmentOrder.findById(orderVnpay._id).lean(),
      MedicalRecord.findById(medicalRecordVnpay._id).lean(),
    ]);
    expect(paidInv.paymentStatus).toBe('Paid');
    expect(paidInv.paymentMethod).toBe('VNPay');
    expect(doneOrder.derivedStatus).toBe('Done');
    expect(finalizedMr.status).toBe('Finalized');

    // IPN gửi lại lần 2 -> RspCode 02 (Order already confirmed)
    const ipnDup = await request(app).get('/api/invoices/vnpay-ipn').query(validQuery);
    expect(ipnDup.body.RspCode).toBe('02');
  });

  test('7. Lập hóa đơn nội trú (InpatientDay) và thanh toán nhả chuồng nội trú', async () => {
    const res = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ inpatientRecordId: String(inpatientRecordDoc._id) });

    expect(res.status).toBe(201);
    invoiceInpatient = res.body.data;
    const inpatientLine = invoiceInpatient.items.find((i) => i.type === 'InpatientDay');
    expect(inpatientLine).toBeDefined();
    expect(inpatientLine.quantity).toBe(2);
    expect(inpatientLine.unitPriceSnapshot).toBe(200000);
    // 150,000 (khám ban đầu) + 2*200,000 (2 ngày nội trú) = 550,000
    expect(invoiceInpatient.totalAmount).toBe(550000);

    const payRes = await request(app)
      .patch(`/api/invoices/${invoiceInpatient._id}/pay-cash`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({});
    expect(payRes.status).toBe(200);

    const releasedWardCage = await Cage.findById(wardCage._id).lean();
    expect(releasedWardCage.status).toBe('Available');
  });

  test('8. Tra cứu danh sách, phân quyền IDOR (BR-23), xuất PDF (UC-48) và chặn xóa vật lý (BR-22)', async () => {
    // Admin / Lễ tân xem tất cả
    const listAll = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAll.status).toBe(200);
    expect(listAll.body.items.length).toBe(3);

    // Owner1 chỉ thấy hóa đơn của chính mình
    const myInvRes = await request(app)
      .get('/api/invoices/me')
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(myInvRes.status).toBe(200);
    expect(myInvRes.body.items).toHaveLength(1);
    expect(String(myInvRes.body.items[0]._id)).toBe(String(invoiceCash._id));

    // Owner2 không được xem chi tiết hoặc tải PDF hóa đơn của Owner1 (403 IDOR)
    const idorDetail = await request(app)
      .get(`/api/invoices/${invoiceCash._id}`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(idorDetail.status).toBe(403);

    const idorPdf = await request(app)
      .get(`/api/invoices/${invoiceCash._id}/pdf`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(idorPdf.status).toBe(403);

    // Owner1 tải PDF hóa đơn của mình thành công
    const pdfRes = await request(app)
      .get(`/api/invoices/${invoiceCash._id}/pdf`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfRes.body).toString('utf8', 0, 4)).toBe('%PDF');

    // Chặn xóa vật lý hóa đơn (BR-22)
    const delRes = await request(app)
      .delete(`/api/invoices/${invoiceCash._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(403);
  });
});
