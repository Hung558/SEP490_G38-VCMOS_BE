// Test luồng Bác sĩ khám lâm sàng, ghi bệnh án chuẩn SOAP, kê đơn thuốc & hoàn tất ca khám (SCR-18, UC-32, UC-36, UC-37)
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

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

let vetToken;
let otherVetToken;
let ownerToken;
let otherOwnerToken;
let receptionistToken;

let vetUser;
let otherVetUser;
let ownerUser;
let otherOwnerUser;
let petDoc;
let examService;
let vaccineService;
let activeMedicine;
let inactiveMedicine;
let waitingCage;
let finishCage;

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

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
    SubtaskRequest.syncIndexes(),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);

  [vetUser, otherVetUser, ownerUser, otherOwnerUser] = await User.create([
    {
      code: 'USR-VET101',
      fullName: 'BS. Trần Quốc Bảo',
      phone: '0911000001',
      passwordHash,
      role: 'Veterinarian',
      status: 'Active',
    },
    {
      code: 'USR-VET102',
      fullName: 'BS. Lê Thu Hà',
      phone: '0911000002',
      passwordHash,
      role: 'Veterinarian',
      status: 'Active',
    },
    {
      code: 'USR-OWN101',
      fullName: 'Chủ Nuôi Mochi',
      phone: '0911000003',
      passwordHash,
      role: 'PetOwner',
      status: 'Active',
    },
    {
      code: 'USR-OWN102',
      fullName: 'Chủ Nuôi Khác',
      phone: '0911000004',
      passwordHash,
      role: 'PetOwner',
      status: 'Active',
    },
  ]);

  const receptionist = await User.create({
    code: 'USR-REC101',
    fullName: 'Lễ Tân Minh Anh',
    phone: '0911000005',
    passwordHash,
    role: 'Receptionist',
    status: 'Active',
  });

  vetToken = signToken(vetUser);
  otherVetToken = signToken(otherVetUser);
  ownerToken = signToken(ownerUser);
  otherOwnerToken = signToken(otherOwnerUser);
  receptionistToken = signToken(receptionist);

  petDoc = await Pet.create({
    code: 'PET-100001',
    ownerId: ownerUser._id,
    name: 'Mochi',
    species: 'Dog',
    breed: 'Corgi',
    gender: 'Male',
    weight: 8.5,
    status: 'Active',
  });

  [examService, vaccineService] = await Service.create([
    {
      code: 'SRV-EX101',
      name: 'Khám nội khoa tổng quát',
      category: 'Examination',
      basePrice: 200000,
      durationMinutes: 30,
      status: 'Active',
    },
    {
      code: 'SRV-EX102',
      name: 'Tiêm phòng dại',
      category: 'Examination',
      basePrice: 150000,
      durationMinutes: 20,
      status: 'Active',
    },
  ]);

  [activeMedicine, inactiveMedicine] = await Product.create([
    {
      code: 'PRD-MED101',
      name: 'Amoxicillin 250mg',
      category: 'Medicine',
      unit: 'Viên',
      unitPrice: 12000,
      status: 'Active',
    },
    {
      code: 'PRD-MED102',
      name: 'Thuốc Nhỏ Tai Hết Hàng',
      category: 'Medicine',
      unit: 'Lọ',
      unitPrice: 85000,
      status: 'Inactive',
    },
  ]);

  [waitingCage, finishCage] = await Cage.create([
    {
      label: 'W-01',
      size: 'M',
      status: 'Available',
    },
    {
      label: 'W-02',
      size: 'M',
      status: 'Available',
    },
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('MedicalRecord Workflow (/api/medical-records)', () => {
  let orderDoc;
  let firstServiceDoc;
  let secondServiceDoc;

  beforeAll(async () => {
    orderDoc = await AppointmentOrder.create({
      code: 'APO-MED001',
      ownerId: ownerUser._id,
      petId: petDoc._id,
      date: '2026-11-10',
      derivedStatus: 'CheckedIn',
      checkedInAt: new Date(),
    });

    [firstServiceDoc, secondServiceDoc] = await AppointmentService.create([
      {
        orderId: orderDoc._id,
        serviceId: examService._id,
        assignedStaffId: vetUser._id,
        sequenceNo: 1,
        priceSnapshot: 200000,
        status: 'Waiting',
        enqueueAt: new Date(),
      },
      {
        orderId: orderDoc._id,
        serviceId: vaccineService._id,
        assignedStaffId: vetUser._id,
        sequenceNo: 2,
        priceSnapshot: 150000,
        status: 'Waiting',
        enqueueAt: new Date(),
      },
    ]);

    // Xếp thú cưng vào chuồng chờ W-01 lúc vừa check-in
    await Cage.findByIdAndUpdate(waitingCage._id, { $set: { status: 'Occupied' } });
    await CageAssignment.create({
      cageId: waitingCage._id,
      orderId: orderDoc._id,
      assignedById: vetUser._id,
      assignedAt: new Date(),
      releasedAt: null,
    });
  });

  describe('1. POST /api/medical-records/service/:appointmentServiceId/start', () => {
    it('chặn bác sĩ khác không được phân công ca khám (403)', async () => {
      const res = await request(app)
        .post(`/api/medical-records/service/${firstServiceDoc._id}/start`)
        .set('Authorization', `Bearer ${otherVetToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/không phải là bác sĩ được phân công/i);
    });

    it('chặn bắt đầu dịch vụ số 2 khi dịch vụ số 1 chưa hoàn thành theo BR-12 (409)', async () => {
      const res = await request(app)
        .post(`/api/medical-records/service/${secondServiceDoc._id}/start`)
        .set('Authorization', `Bearer ${vetToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Dịch vụ đứng trước/i);
    });

    it('bắt đầu ca khám số 1 thành công: chuyển sang InProgress, tự động nhả chuồng chờ (BR-10) và tạo bản nháp bệnh án', async () => {
      const res = await request(app)
        .post(`/api/medical-records/service/${firstServiceDoc._id}/start`)
        .set('Authorization', `Bearer ${vetToken}`);

      expect(res.status).toBe(200);
      expect(res.body.appointmentService.status).toBe('InProgress');
      expect(res.body.medicalRecord.status).toBe('Draft');
      expect(res.body.releasedCageAssignment).toBeTruthy();
      expect(res.body.releasedCageAssignment.releasedAt).toBeTruthy();

      const cageAfter = await Cage.findById(waitingCage._id).lean();
      expect(cageAfter.status).toBe('Available');

      const orderAfter = await AppointmentOrder.findById(orderDoc._id).lean();
      expect(orderAfter.derivedStatus).toBe('InProgress');
    });
  });

  describe('2. PUT /api/medical-records/service/:appointmentServiceId (Lưu nháp SOAP & Kê đơn)', () => {
    it('chặn kê thuốc đang hết hàng / Inactive theo BR-16 (400)', async () => {
      const res = await request(app)
        .put(`/api/medical-records/service/${firstServiceDoc._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          subjectiveNote: 'Bỏ ăn 2 ngày, mệt mỏi',
          prescriptions: [
            {
              productId: String(inactiveMedicine._id),
              dosage: '2 giọt',
              frequency: '2 lần/ngày',
              durationDays: 5,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/hết hàng \(Inactive\)/i);
    });

    it('lưu nháp bệnh án SOAP, chụp snapshot đơn thuốc (UC-36) và tự động cập nhật cân nặng thú cưng (T-33)', async () => {
      const res = await request(app)
        .put(`/api/medical-records/service/${firstServiceDoc._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          subjectiveNote: 'Bỏ ăn 2 ngày, nôn khan buổi sáng',
          objectiveNote: 'Nhiệt độ 39.2 độ C, niêm mạc hồng nhạt',
          assessment: 'Viêm dạ dày ruột cấp nhẹ',
          weight: 9.2,
          prescriptions: [
            {
              productId: String(activeMedicine._id),
              dosage: '1 viên',
              frequency: '2 lần/ngày sau ăn',
              instructions: 'Nghiền nhỏ trộn thức ăn mềm',
              durationDays: 5,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Draft');
      expect(res.body.subjectiveNote).toBe('Bỏ ăn 2 ngày, nôn khan buổi sáng');
      expect(res.body.prescriptions).toHaveLength(1);
      expect(res.body.prescriptions[0].productNameSnapshot).toBe('Amoxicillin 250mg');
      expect(res.body.prescriptions[0].unitSnapshot).toBe('Viên');

      const updatedPet = await Pet.findById(petDoc._id).lean();
      expect(updatedPet.weight).toBe(9.2);
    });
  });

  describe('3. POST /api/medical-records/service/:appointmentServiceId/complete (Hoàn tất bệnh án)', () => {
    it('chặn hoàn tất nếu thiếu trường trong bộ 4 trường S - O - A - P theo BR-13 (400)', async () => {
      // Bản nháp mới có S, O, A nhưng chưa có Plan (P)
      const res = await request(app)
        .post(`/api/medical-records/service/${firstServiceDoc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.errors.plan).toBeDefined();
    });

    it('chặn hoàn tất ca khám khi vẫn còn SubtaskRequest cận lâm sàng chưa hoàn thành theo MSG26 (409)', async () => {
      const subtask = await SubtaskRequest.create({
        appointmentServiceId: firstServiceDoc._id,
        requestedById: vetUser._id,
        assignedStaffId: otherVetUser._id,
        taskType: 'Xét nghiệm máu tổng quát',
        instructions: 'Lấy mẫu máu tĩnh mạch chân trước',
        status: 'Pending',
      });

      const res = await request(app)
        .post(`/api/medical-records/service/${firstServiceDoc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          plan: 'Uống kháng sinh 5 ngày, tái khám sau 1 tuần',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/cận lâm sàng \(Sub-task\) chưa hoàn thành/i);

      // Giả lập Sub-task đã hoàn thành để đi tiếp
      await SubtaskRequest.findByIdAndUpdate(subtask._id, {
        $set: { status: 'Completed', completedAt: new Date() },
      });
    });

    it('hoàn tất ca khám số 1 thành công: giữ bệnh án ở trạng thái Draft theo BR-14 (chờ thu tiền mới Finalized), chuyển dịch vụ sang Done', async () => {
      const res = await request(app)
        .post(`/api/medical-records/service/${firstServiceDoc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          plan: 'Uống kháng sinh 5 ngày, ăn cháo thịt băm, tái khám sau 1 tuần',
          notes: 'Theo dõi phân và triệu chứng nôn',
        });

      expect(res.status).toBe(200);
      // BR-14: Bệnh án vẫn ở Draft cho đến khi hóa đơn được thanh toán (Invoice Paid)
      expect(res.body.medicalRecord.status).toBe('Draft');
      expect(res.body.appointmentService.status).toBe('Done');
      // Còn dịch vụ số 2 chưa làm nên đơn hẹn vẫn ở InProgress
      expect(res.body.appointmentOrder.derivedStatus).toBe('InProgress');
    });

    it('chặn chỉnh sửa bệnh án sau khi đã khóa Finalized (khi hóa đơn đã thanh toán) theo BR-14 (409)', async () => {
      // Giả lập hóa đơn đã thanh toán (Paid) -> Bệnh án được khóa Finalized
      await MedicalRecord.findOneAndUpdate(
        { appointmentServiceId: firstServiceDoc._id },
        { $set: { status: 'Finalized' } }
      );

      const res = await request(app)
        .put(`/api/medical-records/service/${firstServiceDoc._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          assessment: 'Sửa lại chẩn đoán sau khi đã khóa',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đã được khóa \(Finalized\)/i);
    });

    it('cho phép Bác sĩ (Veterinarian) gọi GET /api/cages để lấy danh sách chuồng trống chọn waitingCageId (BR-10, UC-27) và chặn PetOwner (403)', async () => {
      const vetListRes = await request(app)
        .get('/api/cages?status=Available')
        .set('Authorization', `Bearer ${vetToken}`);
      expect(vetListRes.status).toBe(200);
      expect(vetListRes.body.success).toBe(true);
      expect(Array.isArray(vetListRes.body.data.items)).toBe(true);

      const vetDetailRes = await request(app)
        .get(`/api/cages/${finishCage._id}`)
        .set('Authorization', `Bearer ${vetToken}`);
      expect(vetDetailRes.status).toBe(200);

      const ownerListRes = await request(app)
        .get('/api/cages?status=Available')
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(ownerListRes.status).toBe(403);
    });

    it('bắt đầu và hoàn tất nốt dịch vụ số 2 -> kiểm tra tải trọng chuồng (BR-11), tự động chuyển đơn hẹn sang WaitOwner (BR-09) và gán chuồng chờ đón (BR-10)', async () => {
      const startRes = await request(app)
        .post(`/api/medical-records/service/${secondServiceDoc._id}/start`)
        .set('Authorization', `Bearer ${vetToken}`);
      expect(startRes.status).toBe(200);

      // Tạo 1 chuồng cỡ S (<= 5kg) để kiểm tra chặn BR-11 vì Mochi đang nặng 9.2kg
      const smallCage = await Cage.create({
        label: 'W-SMALL',
        size: 'S',
        status: 'Available',
      });

      const overWeightRes = await request(app)
        .post(`/api/medical-records/service/${secondServiceDoc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          subjectiveNote: 'Khách yêu cầu tiêm phòng dại định kỳ',
          objectiveNote: 'Thể trạng đủ điều kiện tiêm',
          assessment: 'Đủ điều kiện tiêm chủng',
          plan: 'Tiêm 1 mũi vaccine Rabies dưới da, theo dõi 30 phút tại chuồng chờ',
          waitingCageId: String(smallCage._id),
        });
      expect(overWeightRes.status).toBe(400);
      expect(overWeightRes.body.message).toMatch(/Chuồng cỡ S/i);

      const completeRes = await request(app)
        .post(`/api/medical-records/service/${secondServiceDoc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          subjectiveNote: 'Khách yêu cầu tiêm phòng dại định kỳ',
          objectiveNote: 'Thể trạng đủ điều kiện tiêm',
          assessment: 'Đủ điều kiện tiêm chủng',
          plan: 'Tiêm 1 mũi vaccine Rabies dưới da, theo dõi 30 phút tại chuồng chờ',
          waitingCageId: String(finishCage._id),
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.appointmentService.status).toBe('Done');
      expect(completeRes.body.appointmentOrder.derivedStatus).toBe('WaitOwner');
      expect(completeRes.body.waitingCageAssignment).toBeTruthy();

      const finishCageAfter = await Cage.findById(finishCage._id).lean();
      expect(finishCageAfter.status).toBe('Occupied');
    });
  });

  describe('4. Xem chi tiết bệnh án & Tiền sử bệnh lý thú cưng (UC-32, BR-23)', () => {
    it('cho phép đúng chủ nuôi xem chi tiết bệnh án của thú cưng mình', async () => {
      const res = await request(app)
        .get(`/api/medical-records/service/${firstServiceDoc._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.assessment).toBe('Viêm dạ dày ruột cấp nhẹ');
    });

    it('chặn chủ nuôi khác xem trộm bệnh án thú cưng không phải của mình theo BR-23 (403)', async () => {
      const res = await request(app)
        .get(`/api/medical-records/service/${firstServiceDoc._id}`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/không có quyền truy cập/i);
    });

    it('cho phép bác sĩ và đúng chủ nuôi xem danh sách tiền sử bệnh lý của thú cưng (GET /api/medical-records/pet/:petId)', async () => {
      const vetRes = await request(app)
        .get(`/api/medical-records/pet/${petDoc._id}`)
        .set('Authorization', `Bearer ${vetToken}`);

      expect(vetRes.status).toBe(200);
      expect(vetRes.body.pet.name).toBe('Mochi');
      expect(vetRes.body.records).toHaveLength(2);

      const otherOwnerRes = await request(app)
        .get(`/api/medical-records/pet/${petDoc._id}`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(otherOwnerRes.status).toBe(403);
    });
  });

  describe('5. Ràng buộc đi tắt qua Lưu nháp / Hoàn tất bệnh án (BR-10, BR-12)', () => {
    it('chặn lưu nháp bệnh án khi dịch vụ còn Booked (khách chưa Check-in) và chặn đi tắt nhảy bước BR-12, đồng thời tự nhả chuồng chờ BR-10 khi hợp lệ', async () => {
      const bookedOrder = await AppointmentOrder.create({
        code: 'APO-MED002',
        ownerId: ownerUser._id,
        petId: petDoc._id,
        date: '2026-11-12',
        derivedStatus: 'Booked',
      });

      const bookedService = await AppointmentService.create({
        orderId: bookedOrder._id,
        serviceId: examService._id,
        assignedStaffId: vetUser._id,
        sequenceNo: 1,
        priceSnapshot: 200000,
        status: 'Booked',
      });

      // 1. Chưa Check-in (Booked) không được lưu nháp bệnh án -> 409
      const draftBookedRes = await request(app)
        .put(`/api/medical-records/service/${bookedService._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({ subjectiveNote: 'Ghi trước khi khách đến' });
      expect(draftBookedRes.status).toBe(409);

      // 2. Đơn CheckedIn có 2 dịch vụ Waiting + đang giữ chuồng chờ
      const checkedOrder = await AppointmentOrder.create({
        code: 'APO-MED003',
        ownerId: ownerUser._id,
        petId: petDoc._id,
        date: '2026-11-13',
        derivedStatus: 'CheckedIn',
        checkedInAt: new Date(),
      });

      const [step1Svc, step2Svc] = await AppointmentService.create([
        {
          orderId: checkedOrder._id,
          serviceId: examService._id,
          assignedStaffId: vetUser._id,
          sequenceNo: 1,
          priceSnapshot: 200000,
          status: 'Waiting',
          enqueueAt: new Date(),
        },
        {
          orderId: checkedOrder._id,
          serviceId: vaccineService._id,
          assignedStaffId: vetUser._id,
          sequenceNo: 2,
          priceSnapshot: 150000,
          status: 'Waiting',
          enqueueAt: new Date(),
        },
      ]);

      await Cage.findByIdAndUpdate(waitingCage._id, { $set: { status: 'Occupied' } });
      await CageAssignment.create({
        cageId: waitingCage._id,
        orderId: checkedOrder._id,
        assignedById: vetUser._id,
        assignedAt: new Date(),
        releasedAt: null,
      });

      // 2a. Bỏ qua /start mà lưu nháp hoặc hoàn tất thẳng bước 2 khi bước 1 chưa xong -> 409 (BR-12)
      const skipDraftRes = await request(app)
        .put(`/api/medical-records/service/${step2Svc._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({ subjectiveNote: 'Nhảy bước 2' });
      expect(skipDraftRes.status).toBe(409);

      const skipCompleteRes = await request(app)
        .post(`/api/medical-records/service/${step2Svc._id}/complete`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({
          subjectiveNote: 'S',
          objectiveNote: 'O',
          assessment: 'A',
          plan: 'P',
        });
      expect(skipCompleteRes.status).toBe(409);

      // 2b. Lưu nháp thẳng ở bước 1 từ Waiting -> thành công 200, chuyển InProgress và tự nhả chuồng chờ (BR-10)
      const validDirectDraftRes = await request(app)
        .put(`/api/medical-records/service/${step1Svc._id}`)
        .set('Authorization', `Bearer ${vetToken}`)
        .send({ subjectiveNote: 'Khám bước 1 trực tiếp từ Waiting' });
      expect(validDirectDraftRes.status).toBe(200);

      const cageAfter = await Cage.findById(waitingCage._id).lean();
      const closedAssignment = await CageAssignment.findOne({ orderId: checkedOrder._id }).lean();
      expect(cageAfter.status).toBe('Available');
      expect(closedAssignment.releasedAt).toBeTruthy();
    });
  });
});
