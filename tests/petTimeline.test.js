// Test Dòng thời gian Thú cưng Hợp nhất (Unified Pet Timeline — UC-13, SCR-08, BR-09, BR-23)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

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
const SubtaskRequest = require('../src/models/SubtaskRequest');
const InpatientRecord = require('../src/models/InpatientRecord');
const Invoice = require('../src/models/Invoice');
const CommunityPost = require('../src/models/CommunityPost');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let owner1;
let owner2;
let vet;
let groomer;
let receptionist;
let admin;

let owner1Token;
let owner2Token;
let vetToken;
let groomerToken;
let receptionistToken;
let adminToken;

let pet1;
let emptyPet;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  const passwordHash = await bcrypt.hash('Password123', 10);

  [owner1, owner2, vet, groomer, receptionist, admin] = await User.create([
    { code: 'USR-TL0001', fullName: 'Chủ nuôi A', phone: '0911111001', email: 'ownera@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-TL0002', fullName: 'Chủ nuôi B', phone: '0911111002', email: 'ownerb@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-TL0003', fullName: 'BS Hùng', phone: '0911111003', email: 'vettl@test.vn', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-TL0004', fullName: 'Groomer Lan', phone: '0911111004', email: 'groomtl@test.vn', passwordHash, role: 'Groomer', status: 'Active' },
    { code: 'USR-TL0005', fullName: 'Lễ tân Hoa', phone: '0911111005', email: 'receptl@test.vn', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-TL0006', fullName: 'Admin Hệ thống', phone: '0911111006', email: 'admintl@test.vn', passwordHash, role: 'Admin', status: 'Active' },
  ]);

  owner1Token = signToken(owner1);
  owner2Token = signToken(owner2);
  vetToken = signToken(vet);
  groomerToken = signToken(groomer);
  receptionistToken = signToken(receptionist);
  adminToken = signToken(admin);

  [pet1, emptyPet] = await Pet.create([
    {
      code: 'PET-TL0001',
      ownerId: owner1._id,
      name: 'Milo',
      species: 'Dog',
      breed: 'Poodle',
      coatColor: 'Brown',
      weight: 6.5,
      notes: 'Dị ứng hải sản',
    },
    {
      code: 'PET-TL0002',
      ownerId: owner2._id,
      name: 'Miu',
      species: 'Cat',
      breed: 'ALN',
      weight: 3.2,
    },
  ]);

  const [examService, groomingService, labService] = await Service.create([
    { code: 'SRV-TL0001', name: 'Khám tổng quát', category: 'Examination', defaultDuration: 30, basePrice: 150000, status: 'Active' },
    { code: 'SRV-TL0002', name: 'Tắm & cắt tỉa', category: 'Grooming', defaultDuration: 60, basePrice: 250000, status: 'Active' },
    { code: 'SRV-TL0003', name: 'Xét nghiệm máu', category: 'Paraclinical', defaultDuration: 20, basePrice: 120000, status: 'Active' },
  ]);

  const [medicine] = await Product.create([
    { code: 'PRD-TL0001', name: 'Kháng sinh Amox', category: 'Medicine', unit: 'Viên', unitPrice: 15000, status: 'Active' },
  ]);

  const [holdingCage, wardCage] = await Cage.create([
    { label: 'H-01', size: 'M', maxWeightKg: 15, zone: 'Holding', isIsolated: false, status: 'Occupied' },
    { label: 'W-01', size: 'M', maxWeightKg: 15, zone: 'InpatientWard', isIsolated: false, status: 'Occupied' },
  ]);

  // Mốc 1 (cũ hơn): Đơn Done gồm Khám bệnh (có SOAP + Subtask) + Spa (có GroomingNote) + Hóa đơn đã thanh toán
  const order1 = await AppointmentOrder.create({
    code: 'APT-TL0001',
    petId: pet1._id,
    ownerId: owner1._id,
    date: '2026-11-10',
    slotStart: '09:00',
    slotEnd: '10:30',
    note: 'Bé hơi mệt và cần tắm',
    isOnline: true,
    derivedStatus: 'Done',
    checkedInAt: new Date('2026-11-10T08:55:00.000Z'),
  });

  const [order1ExamSvc, order1GroomSvc] = await AppointmentService.create([
    {
      orderId: order1._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
      scheduledStart: '09:00',
      scheduledEnd: '09:30',
    },
    {
      orderId: order1._id,
      serviceId: groomingService._id,
      sequenceNo: 2,
      assignedStaffId: groomer._id,
      status: 'Done',
      scheduledStart: '09:30',
      scheduledEnd: '10:30',
      groomingNote: {
        beforeNote: 'Lông hơi rối ở tai',
        afterNote: 'Đã gỡ rối, tắm sạch và sấy khô',
        beforePhotoUrl: 'https://res.cloudinary.com/demo/image/upload/before.jpg',
        afterPhotoUrl: 'https://res.cloudinary.com/demo/image/upload/after.jpg',
        recommendations: 'Chải lông mỗi 2 ngày',
      },
    },
  ]);

  await MedicalRecord.create({
    appointmentServiceId: order1ExamSvc._id,
    petId: pet1._id,
    subjectiveNote: 'Ho nhẹ 2 ngày',
    objectiveNote: 'Nhiệt độ 38.6°C, cân nặng 6.5kg',
    assessment: 'Viêm đường hô hấp nhẹ',
    plan: 'Uống thuốc 5 ngày và tái khám nếu còn ho',
    prescriptions: [
      {
        productId: medicine._id,
        productNameSnapshot: 'Kháng sinh Amox',
        unitSnapshot: 'Viên',
        dosage: '1 viên',
        frequency: '2 lần/ngày',
        durationDays: 5,
        instructions: 'Uống sau ăn',
      },
    ],
    status: 'Finalized',
  });

  await SubtaskRequest.create({
    appointmentServiceId: order1ExamSvc._id,
    serviceId: labService._id,
    requestedById: vet._id,
    assignedStaffId: vet._id,
    taskType: 'Xét nghiệm máu',
    instructions: 'Kiểm tra bạch cầu',
    resultText: 'Bạch cầu tăng nhẹ',
    resultImageUrl: 'https://res.cloudinary.com/demo/image/upload/lab.jpg',
    status: 'Completed',
    completedAt: new Date('2026-11-10T09:20:00.000Z'),
  });

  await Invoice.create({
    code: 'INV-TL0001',
    orderId: order1._id,
    issuedById: receptionist._id,
    items: [
      { type: 'Service', refId: examService._id, itemNameSnapshot: 'Khám tổng quát', unitPriceSnapshot: 150000, quantity: 1, subtotal: 150000 },
      { type: 'Service', refId: groomingService._id, itemNameSnapshot: 'Tắm & cắt tỉa', unitPriceSnapshot: 250000, quantity: 1, subtotal: 250000 },
    ],
    totalAmount: 400000,
    paymentMethod: 'PayOS',
    paymentStatus: 'Paid',
    paidAt: new Date('2026-11-10T10:45:00.000Z'),
    payosOrderCode: 1794990001,
  });

  // Mốc 2 (mới hơn): Đơn đang InProgress (walk-in) có chuồng đang mở và đợt nội trú Admitted kèm 2 nhật ký hằng ngày
  const order2 = await AppointmentOrder.create({
    code: 'APT-TL0002',
    petId: pet1._id,
    ownerId: owner1._id,
    date: '2026-11-18',
    slotStart: '14:00',
    slotEnd: '14:30',
    note: 'Sốt cao, bỏ ăn',
    isOnline: false,
    derivedStatus: 'InProgress',
    checkedInAt: new Date('2026-11-18T13:50:00.000Z'),
  });

  await AppointmentService.create({
    orderId: order2._id,
    serviceId: examService._id,
    sequenceNo: 1,
    assignedStaffId: vet._id,
    status: 'InProgress',
    isEmergency: true,
    scheduledStart: '14:00',
    scheduledEnd: '14:30',
  });

  await CageAssignment.create({
    cageId: holdingCage._id,
    orderId: order2._id,
    assignedById: receptionist._id,
    assignedAt: new Date('2026-11-18T13:52:00.000Z'),
    releasedAt: null,
  });

  const inpatient = await InpatientRecord.create({
    petId: pet1._id,
    orderId: order2._id,
    attendingVetId: vet._id,
    cageId: wardCage._id,
    initialDiagnosis: 'Sốt xuất huyết theo dõi',
    treatmentPlan: 'Truyền dịch và theo dõi nhiệt độ',
    admittedAt: new Date('2026-11-18T14:30:00.000Z'),
    status: 'Admitted',
    dailyLogs: [
      {
        date: '2026-11-18',
        recordedById: vet._id,
        observations: 'Nhiệt độ 39.8°C, mệt',
        notes: 'Đã truyền dịch lần 1',
      },
      {
        date: '2026-11-19',
        recordedById: vet._id,
        observations: 'Nhiệt độ giảm còn 38.9°C, ăn được ít',
        notes: 'Tiếp tục theo dõi',
      },
    ],
  });

  await Invoice.create({
    code: 'INV-TL0002',
    inpatientRecordId: inpatient._id,
    issuedById: receptionist._id,
    items: [
      { type: 'InpatientDay', refId: inpatient._id, itemNameSnapshot: 'Nội trú 2 ngày', unitPriceSnapshot: 200000, quantity: 2, subtotal: 400000 },
    ],
    totalAmount: 400000,
    paymentMethod: null,
    paymentStatus: 'Unpaid',
  });

  // Bài chia sẻ cộng đồng của pet1 (1 bài PendingReview hiển thị, 1 bài Removed bị lọc bỏ)
  await CommunityPost.create([
    {
      authorId: owner1._id,
      petId: pet1._id,
      postType: 'TimelineShare',
      content: 'Milo vừa đi khám và tắm rất ngoan',
      timelineItems: [{ date: '2026-11-10', title: 'Khám tổng quát & Spa' }],
      status: 'PendingReview',
    },
    {
      authorId: owner1._id,
      petId: pet1._id,
      postType: 'TimelineShare',
      content: 'Bài đã gỡ',
      timelineItems: [{ date: '2026-11-10', title: 'Gỡ bỏ' }],
      status: 'Removed',
    },
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('GET /api/pets/:petId/timeline (Unified Pet Timeline — UC-13, SCR-08, BR-23)', () => {
  test('1. Trả 401 nếu chưa đăng nhập', async () => {
    const res = await request(app).get(`/api/pets/${pet1._id}/timeline`);
    expect(res.status).toBe(401);
  });

  test('2. Trả 400 khi petId hoặc tham số query không hợp lệ', async () => {
    const badId = await request(app)
      .get('/api/pets/invalid-id/timeline')
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(badId.status).toBe(400);
    expect(badId.body.errors.petId).toBeDefined();

    const badQuery = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .query({ type: 'Unknown', status: 'BadStatus', from: '2026-11-20', to: '2026-11-10', page: 0, limit: 999 })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(badQuery.status).toBe(400);
    expect(badQuery.body.errors.type).toBeDefined();
    expect(badQuery.body.errors.status).toBeDefined();
    expect(badQuery.body.errors.to).toBeDefined();
    expect(badQuery.body.errors.page).toBeDefined();
    expect(badQuery.body.errors.limit).toBeDefined();
  });

  test('3. Trả 404 khi thú cưng không tồn tại', async () => {
    const fakePetId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/pets/${fakePetId}/timeline`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(res.status).toBe(404);
  });

  test('4. BR-23: Chặn PetOwner xem dòng thời gian thú cưng của chủ nuôi khác (403)', async () => {
    const res = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(res.status).toBe(403);
  });

  test('5. Chủ nuôi sở hữu thú cưng xem đầy đủ timeline (SOAP, GroomingNote, Subtask, Inpatient, Invoice, SharedPosts)', async () => {
    const res = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .set('Authorization', `Bearer ${owner1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.pet.code).toBe('PET-TL0001');
    expect(res.body.pet.owner.fullName).toBe('Chủ nuôi A');

    // Kiểm tra tổng quan summary
    expect(res.body.summary).toEqual({
      totalVisits: 2,
      completedVisits: 1,
      activeVisits: 1,
      totalMedicalRecords: 1,
      totalGroomingNotes: 1,
      totalInpatientStays: 1,
      hasActiveInpatient: true,
    });

    // Kiểm tra activeInpatient và thứ tự dailyLogs (mới nhất lên đầu)
    expect(res.body.activeInpatient).not.toBeNull();
    expect(res.body.activeInpatient.status).toBe('Admitted');
    expect(res.body.activeInpatient.cage.label).toBe('W-01');
    expect(res.body.activeInpatient.dailyLogs).toHaveLength(2);
    expect(res.body.activeInpatient.dailyLogs[0].date).toBe('2026-11-19');
    expect(res.body.activeInpatient.dailyLogs[1].date).toBe('2026-11-18');
    expect(res.body.activeInpatient.invoice.code).toBe('INV-TL0002');

    // Kiểm tra sharedPosts (không bao gồm bài Removed)
    expect(res.body.sharedPosts).toHaveLength(1);
    expect(res.body.sharedPosts[0].status).toBe('PendingReview');

    // Timeline sắp xếp mới nhất trước: APT-TL0002 -> APT-TL0001
    expect(res.body.timeline).toHaveLength(2);
    const [latest, older] = res.body.timeline;

    // Mốc mới nhất: đang InProgress -> statusLabel theo BR-09 = "Đang Khám tổng quát", có currentCage, chưa được share
    expect(latest.code).toBe('APT-TL0002');
    expect(latest.statusLabel).toBe('Đang Khám tổng quát');
    expect(latest.currentCage.cage.label).toBe('H-01');
    expect(latest.categories).toEqual(expect.arrayContaining(['Examination', 'Inpatient']));
    expect(latest.inpatientRecord.status).toBe('Admitted');
    expect(latest.canShareToCommunity).toBe(false);

    // Mốc cũ hơn: Done -> đủ SOAP, Subtask, GroomingNote, Invoice và canShareToCommunity = true
    expect(older.code).toBe('APT-TL0001');
    expect(older.statusLabel).toBe('Hoàn tất');
    expect(older.canShareToCommunity).toBe(true);
    expect(older.invoice.code).toBe('INV-TL0001');
    expect(older.invoice.totalAmount).toBe(400000);
    expect(older.invoice.paymentMethod).toBe('PayOS');
    expect(older.services).toHaveLength(2);
    expect(older.services[0].medicalRecord.assessment).toBe('Viêm đường hô hấp nhẹ');
    expect(older.services[0].medicalRecord.prescriptions).toHaveLength(1);
    expect(older.services[0].subtasks).toHaveLength(1);
    expect(older.services[0].subtasks[0].resultText).toBe('Bạch cầu tăng nhẹ');
    expect(older.services[1].groomingNote.afterNote).toBe('Đã gỡ rối, tắm sạch và sấy khô');
  });

  test('6. Bác sĩ & Groomer xem được dữ liệu lâm sàng nhưng KHÔNG thấy hóa đơn (BR-23 / SCR-08)', async () => {
    const [vetRes, groomerRes] = await Promise.all([
      request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${vetToken}`),
      request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${groomerToken}`),
    ]);

    for (const res of [vetRes, groomerRes]) {
      expect(res.status).toBe(200);
      expect(res.body.timeline).toHaveLength(2);
      expect(res.body.activeInpatient.invoice).toBeNull();
      expect(res.body.timeline[0].invoice).toBeNull();
      expect(res.body.timeline[1].invoice).toBeNull();
      expect(res.body.timeline[1].canShareToCommunity).toBe(false);
      // Vẫn thấy bệnh án SOAP và GroomingNote phục vụ chuyên môn
      expect(res.body.timeline[1].services[0].medicalRecord.assessment).toBe('Viêm đường hô hấp nhẹ');
      expect(res.body.timeline[1].services[1].groomingNote.recommendations).toBe('Chải lông mỗi 2 ngày');
    }
  });

  test('7. Lễ tân & Admin xem được mọi thú cưng kèm thông tin hóa đơn', async () => {
    const [recepRes, adminRes] = await Promise.all([
      request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${receptionistToken}`),
      request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect(recepRes.status).toBe(200);
    expect(recepRes.body.timeline[1].invoice.code).toBe('INV-TL0001');
    expect(recepRes.body.activeInpatient.invoice.code).toBe('INV-TL0002');
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.timeline[1].invoice.code).toBe('INV-TL0001');
  });

  test('8. Bộ lọc type, status, khoảng ngày from/to và phân trang page/limit hoạt động chính xác', async () => {
    const groomingOnly = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .query({ type: 'Grooming' })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(groomingOnly.status).toBe(200);
    expect(groomingOnly.body.timeline).toHaveLength(1);
    expect(groomingOnly.body.timeline[0].code).toBe('APT-TL0001');

    const inpatientOnly = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .query({ type: 'Inpatient' })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(inpatientOnly.status).toBe(200);
    expect(inpatientOnly.body.timeline).toHaveLength(1);
    expect(inpatientOnly.body.timeline[0].code).toBe('APT-TL0002');

    const dateFiltered = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .query({ from: '2026-11-15', to: '2026-11-20', status: 'InProgress' })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(dateFiltered.status).toBe(200);
    expect(dateFiltered.body.timeline).toHaveLength(1);
    expect(dateFiltered.body.timeline[0].code).toBe('APT-TL0002');

    const page2 = await request(app)
      .get(`/api/pets/${pet1._id}/timeline`)
      .query({ page: 2, limit: 1 })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.timeline).toHaveLength(1);
    expect(page2.body.timeline[0].code).toBe('APT-TL0001');
    expect(page2.body.pagination).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
  });

  test('9. Thú cưng chưa từng có lượt khám trả timeline rỗng sạch sẽ', async () => {
    const res = await request(app)
      .get(`/api/pets/${emptyPet._id}/timeline`)
      .set('Authorization', `Bearer ${owner2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.timeline).toEqual([]);
    expect(res.body.activeInpatient).toBeNull();
    expect(res.body.summary.totalVisits).toBe(0);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });
});

