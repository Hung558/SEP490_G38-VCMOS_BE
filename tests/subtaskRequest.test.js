// Test luồng Sub-task Cận lâm sàng & Dịch vụ phụ (PB-10: UC-33, UC-34, SCR-24, MSG26, BR-23)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

jest.setTimeout(15000);

const mockUploadStream = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue({ result: 'ok' });

jest.mock('../src/config/cloudinary', () => ({
  uploader: {
    upload_stream: (...args) => mockUploadStream(...args),
    destroy: (...args) => mockDestroy(...args),
  },
}));

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');
const MedicalRecord = require('../src/models/MedicalRecord');
const SubtaskRequest = require('../src/models/SubtaskRequest');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

let mainVetToken;
let labVetToken;
let groomerToken;
let receptionistToken;
let ownerToken;
let otherOwnerToken;

let mainVetUser;
let labVetUser;
let groomerUser;
let inactiveStaffUser;
let ownerUser;
let otherOwnerUser;
let petDoc;
let examService;
let orderDoc;
let mainApptService;
let waitingApptService;

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

// Tạo buffer PNG tối thiểu để kiểm tra upload multipart/form-data
const SAMPLE_PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    Pet.syncIndexes(),
    Service.syncIndexes(),
    AppointmentOrder.syncIndexes(),
    AppointmentService.syncIndexes(),
    MedicalRecord.syncIndexes(),
    SubtaskRequest.syncIndexes(),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);

  let receptionist;
  [mainVetUser, labVetUser, groomerUser, inactiveStaffUser, receptionist, ownerUser, otherOwnerUser] =
    await User.create([
      {
        code: 'USR-SUBV01',
        fullName: 'BS. Nguyễn Minh Tâm',
        phone: '0922000001',
        passwordHash,
        role: 'Veterinarian',
        status: 'Active',
      },
      {
        code: 'USR-SUBV02',
        fullName: 'BS. Phạm Lan Anh',
        phone: '0922000002',
        passwordHash,
        role: 'Veterinarian',
        status: 'Active',
      },
      {
        code: 'USR-SUBG01',
        fullName: 'KTV. Trần Thanh Tùng',
        phone: '0922000003',
        passwordHash,
        role: 'Groomer',
        status: 'Active',
      },
      {
        code: 'USR-SUBV03',
        fullName: 'BS. Nghỉ Phép',
        phone: '0922000004',
        passwordHash,
        role: 'Veterinarian',
        status: 'Inactive',
      },
      {
        code: 'USR-SUBR01',
        fullName: 'Lễ Tân Thu Trang',
        phone: '0922000005',
        passwordHash,
        role: 'Receptionist',
        status: 'Active',
      },
      {
        code: 'USR-SUBO01',
        fullName: 'Chủ Nuôi Hoàng Nam',
        phone: '0922000006',
        passwordHash,
        role: 'PetOwner',
        status: 'Active',
      },
      {
        code: 'USR-SUBO02',
        fullName: 'Chủ Nuôi Người Lạ',
        phone: '0922000007',
        passwordHash,
        role: 'PetOwner',
        status: 'Active',
      },
    ]);

  mainVetToken = signToken(mainVetUser);
  labVetToken = signToken(labVetUser);
  groomerToken = signToken(groomerUser);
  receptionistToken = signToken(receptionist);
  ownerToken = signToken(ownerUser);
  otherOwnerToken = signToken(otherOwnerUser);

  petDoc = await Pet.create({
    code: 'PET-SUB001',
    ownerId: ownerUser._id,
    name: 'Bông',
    species: 'Chó',
    breed: 'Poodle',
    weight: 5.5,
  });

  examService = await Service.create({
    code: 'SRV-SUB01',
    name: 'Khám tổng quát',
    category: 'Examination',
    basePrice: 150000,
    status: 'Active',
  });

  orderDoc = await AppointmentOrder.create({
    code: 'ORD-SUB001',
    petId: petDoc._id,
    ownerId: ownerUser._id,
    date: '2026-11-13',
    note: 'Thú cưng nôn nhẹ buổi sáng',
    intake: {
      symptoms: 'Mệt mỏi, ít ăn',
      initialCondition: 'Tỉnh táo, niêm mạc hồng nhạt',
      recordedBy: receptionist._id,
      recordedAt: new Date(),
    },
    derivedStatus: 'InProgress',
    checkedInAt: new Date(),
  });

  [mainApptService, waitingApptService] = await AppointmentService.create([
    {
      orderId: orderDoc._id,
      serviceId: examService._id,
      assignedStaffId: mainVetUser._id,
      sequenceNo: 1,
      status: 'InProgress',
      queueNo: 1,
      enqueueAt: new Date(),
      dequeueAt: new Date(),
    },
    {
      orderId: orderDoc._id,
      serviceId: examService._id,
      assignedStaffId: mainVetUser._id,
      sequenceNo: 2,
      status: 'Waiting',
      queueNo: 2,
      enqueueAt: new Date(),
    },
  ]);

  await MedicalRecord.create({
    appointmentServiceId: mainApptService._id,
    petId: petDoc._id,
    subjectiveNote: 'Khách báo nôn khan',
    objectiveNote: 'Nhiệt độ 38.6 độ C',
    assessment: 'Theo dõi viêm dạ dày, cần xét nghiệm máu',
    plan: 'Chờ kết quả xét nghiệm trước khi chốt đơn',
    status: 'Draft',
  });
});

beforeEach(() => {
  mockUploadStream.mockReset();
  mockDestroy.mockClear();
  mockUploadStream.mockImplementation((options, callback) => ({
    end: () =>
      callback(null, {
        secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/subtask-results/blood-test.png',
        public_id: 'subtask-results/mock-id',
      }),
  }));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('PB-10: Sub-task Cận lâm sàng / Dịch vụ phụ (/api/subtask-requests)', () => {
  let createdLabSubtaskId;
  let createdGroomerSubtaskId;

  describe('1. POST /api/subtask-requests (Bác sĩ chính chỉ định Sub-task - UC-33)', () => {
    it('chặn role không phải Veterinarian tạo Sub-task (403)', async () => {
      const res = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(labVetUser._id),
          taskType: 'Xét nghiệm máu',
        });

      expect(res.status).toBe(403);
    });

    it('trả về 400 kèm errors khi dữ liệu đầu vào thiếu hoặc có trường nhạy cảm', async () => {
      const res = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: 'khong-hop-le',
          assignedStaffId: '',
          taskType: '   ',
          status: 'Completed',
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.appointmentServiceId).toBeDefined();
      expect(res.body.errors.assignedStaffId).toBeDefined();
      expect(res.body.errors.taskType).toBeDefined();
      expect(res.body.errors.fields).toBeDefined();
    });

    it('chặn bác sĩ khác không phụ trách ca khám chính tạo Sub-task (403)', async () => {
      const res = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${labVetToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(labVetUser._id),
          taskType: 'Siêu âm ổ bụng',
        });

      expect(res.status).toBe(403);
    });

    it('chặn tạo Sub-task khi ca khám chính chưa ở trạng thái InProgress (409)', async () => {
      const res = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(waitingApptService._id),
          assignedStaffId: String(labVetUser._id),
          taskType: 'Siêu âm ổ bụng',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/InProgress/i);
    });

    it('chặn giao Sub-task cho PetOwner hoặc nhân sự đang Inactive (400)', async () => {
      const ownerAssignRes = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(ownerUser._id),
          taskType: 'Xét nghiệm máu',
        });
      expect(ownerAssignRes.status).toBe(400);

      const inactiveAssignRes = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(inactiveStaffUser._id),
          taskType: 'Xét nghiệm máu',
        });
      expect(inactiveAssignRes.status).toBe(400);
      expect(inactiveAssignRes.body.message).toMatch(/Active/i);
    });

    it('tạo Sub-task cận lâm sàng cho Bác sĩ khác và dịch vụ phụ cho Groomer thành công (201)', async () => {
      const labRes = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(labVetUser._id),
          taskType: 'Xét nghiệm sinh hóa máu',
          instructions: 'Kiểm tra men gan ALT và ure',
        });

      expect(labRes.status).toBe(201);
      expect(labRes.body.data.status).toBe('Pending');
      expect(labRes.body.data.requestedById._id).toBe(String(mainVetUser._id));
      expect(labRes.body.data.assignedStaffId._id).toBe(String(labVetUser._id));
      expect(labRes.body.data.appointmentServiceId.orderId.petId.name).toBe('Bông');
      createdLabSubtaskId = labRes.body.data._id;

      const groomerRes = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(mainApptService._id),
          assignedStaffId: String(groomerUser._id),
          taskType: 'Cạo lông vùng bụng trước siêu âm',
          instructions: 'Cạo sạch vùng bụng dưới nhẹ nhàng',
        });

      expect(groomerRes.status).toBe(201);
      expect(groomerRes.body.data.status).toBe('Pending');
      createdGroomerSubtaskId = groomerRes.body.data._id;
    });
  });

  describe('2. Xem hàng đợi (/my-queue), danh sách theo ca khám & chi tiết (SCR-24, BR-23)', () => {
    it('nhân sự được giao xem đúng hàng đợi của mình và lọc theo ?status', async () => {
      const labQueueRes = await request(app)
        .get('/api/subtask-requests/my-queue?status=Pending')
        .set('Authorization', `Bearer ${labVetToken}`);

      expect(labQueueRes.status).toBe(200);
      expect(labQueueRes.body.data).toHaveLength(1);
      expect(labQueueRes.body.data[0]._id).toBe(createdLabSubtaskId);
      expect(labQueueRes.body.data[0].appointmentServiceId.orderId.intake.symptoms).toBe(
        'Mệt mỏi, ít ăn'
      );

      const badQueryRes = await request(app)
        .get('/api/subtask-requests/my-queue?status=InvalidStatus')
        .set('Authorization', `Bearer ${labVetToken}`);
      expect(badQueryRes.status).toBe(400);
      expect(badQueryRes.body.errors.status).toBeDefined();
    });

    it('cho phép bác sĩ và đúng chủ nuôi xem Sub-task theo ca khám / chi tiết, chặn chủ nuôi khác (BR-23)', async () => {
      const listVetRes = await request(app)
        .get(`/api/subtask-requests/service/${mainApptService._id}`)
        .set('Authorization', `Bearer ${mainVetToken}`);
      expect(listVetRes.status).toBe(200);
      expect(listVetRes.body.data).toHaveLength(2);

      const listOwnerRes = await request(app)
        .get(`/api/subtask-requests/service/${mainApptService._id}`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(listOwnerRes.status).toBe(200);

      const listOtherOwnerRes = await request(app)
        .get(`/api/subtask-requests/service/${mainApptService._id}`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(listOtherOwnerRes.status).toBe(403);

      const detailOtherOwnerRes = await request(app)
        .get(`/api/subtask-requests/${createdLabSubtaskId}`)
        .set('Authorization', `Bearer ${otherOwnerToken}`);
      expect(detailOtherOwnerRes.status).toBe(403);
    });
  });

  describe('3. Thực hiện, trả kết quả (Cloudinary) & gỡ chốt chặn MSG26 (UC-34)', () => {
    it('chặn bác sĩ chính hoàn tất ca khám khi Sub-task vẫn đang Pending theo MSG26 (409)', async () => {
      const res = await request(app)
        .post(`/api/medical-records/service/${mainApptService._id}/complete`)
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/Sub-task/i);
    });

    it('chặn nhân sự khác bấm start / complete Sub-task không phải của mình (403)', async () => {
      const startRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/start`)
        .set('Authorization', `Bearer ${mainVetToken}`);
      expect(startRes.status).toBe(403);

      const completeRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({ resultText: 'Tự ý hoàn thành' });
      expect(completeRes.status).toBe(403);
    });

    it('nhân sự bắt đầu thực hiện Sub-task (Pending -> InProgress) và chặn bắt đầu lại lần 2 (409)', async () => {
      const startRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/start`)
        .set('Authorization', `Bearer ${labVetToken}`);
      expect(startRes.status).toBe(200);
      expect(startRes.body.data.status).toBe('InProgress');

      const retryRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/start`)
        .set('Authorization', `Bearer ${labVetToken}`);
      expect(retryRes.status).toBe(409);
    });

    it('chặn hoàn tất Sub-task nếu không có kết quả chữ lẫn ảnh (400) hoặc tải sai định dạng ảnh (400)', async () => {
      const emptyRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${labVetToken}`)
        .send({});
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.errors.result).toBeDefined();

      const badMimeRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${labVetToken}`)
        .attach('resultImage', Buffer.from('not-an-image'), {
          filename: 'note.txt',
          contentType: 'text/plain',
        });
      expect(badMimeRes.status).toBe(400);
    });

    it('trả về 502 nếu upload Cloudinary lỗi và giữ nguyên trạng thái Sub-task chưa Completed', async () => {
      mockUploadStream.mockImplementationOnce((options, callback) => ({
        end: () => callback(new Error('Cloudinary timeout')),
      }));

      const res = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${labVetToken}`)
        .field('resultText', 'ALT 42 U/L')
        .attach('resultImage', SAMPLE_PNG_BUFFER, {
          filename: 'blood.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(502);

      const unchanged = await SubtaskRequest.findById(createdLabSubtaskId).lean();
      expect(unchanged.status).toBe('InProgress');
      expect(unchanged.resultImageUrl).toBeUndefined();
    });

    it('hoàn tất Sub-task kèm resultText + resultImage Cloudinary thành công và chặn hoàn tất lại (409)', async () => {
      const completeLabRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${labVetToken}`)
        .field('resultText', 'ALT 42 U/L, Ure bình thường')
        .attach('resultImage', SAMPLE_PNG_BUFFER, {
          filename: 'blood.png',
          contentType: 'image/png',
        });

      expect(completeLabRes.status).toBe(200);
      expect(completeLabRes.body.data.status).toBe('Completed');
      expect(completeLabRes.body.data.resultText).toBe('ALT 42 U/L, Ure bình thường');
      expect(completeLabRes.body.data.resultImageUrl).toBe(
        'https://res.cloudinary.com/demo/image/upload/v1/subtask-results/blood-test.png'
      );
      expect(completeLabRes.body.data.completedAt).toBeTruthy();

      const repeatRes = await request(app)
        .patch(`/api/subtask-requests/${createdLabSubtaskId}/complete`)
        .set('Authorization', `Bearer ${labVetToken}`)
        .send({ resultText: 'Cập nhật lại' });
      expect(repeatRes.status).toBe(409);

      // Chốt nốt Sub-task của Groomer (chỉ dùng text, không cần ảnh)
      const completeGroomerRes = await request(app)
        .patch(`/api/subtask-requests/${createdGroomerSubtaskId}/complete`)
        .set('Authorization', `Bearer ${groomerToken}`)
        .send({ resultText: 'Đã cạo sạch vùng bụng dưới, da không trầy xước' });
      expect(completeGroomerRes.status).toBe(200);
      expect(completeGroomerRes.body.data.status).toBe('Completed');
    });

    it('khi toàn bộ Sub-task đã Completed, bác sĩ chính hoàn tất ca khám chính thành công (200)', async () => {
      const completeExamRes = await request(app)
        .post(`/api/medical-records/service/${mainApptService._id}/complete`)
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({});

      expect(completeExamRes.status).toBe(200);
      expect(completeExamRes.body.appointmentService.status).toBe('Done');
      // Vẫn còn waitingApptService chưa làm nên đơn hẹn giữ ở InProgress
      expect(completeExamRes.body.appointmentOrder.derivedStatus).toBe('InProgress');
    });
  });

  describe('4. DELETE /api/subtask-requests/:id (Bác sĩ chính hủy Sub-task khi còn Pending)', () => {
    let pendingSubtaskToDeleteId;

    beforeAll(async () => {
      // Bắt đầu ca khám thứ 2 để bác sĩ tạo Sub-task mới kiểm tra luồng hủy Pending
      await AppointmentService.findByIdAndUpdate(waitingApptService._id, {
        $set: { status: 'InProgress', dequeueAt: new Date() },
      });

      const createRes = await request(app)
        .post('/api/subtask-requests')
        .set('Authorization', `Bearer ${mainVetToken}`)
        .send({
          appointmentServiceId: String(waitingApptService._id),
          assignedStaffId: String(labVetUser._id),
          taskType: 'Test nhanh Parvo',
        });
      expect(createRes.status).toBe(201);
      pendingSubtaskToDeleteId = createRes.body.data._id;
    });

    it('chặn người khác hủy Sub-task (403) và chặn hủy Sub-task đã Completed (409)', async () => {
      const forbiddenRes = await request(app)
        .delete(`/api/subtask-requests/${pendingSubtaskToDeleteId}`)
        .set('Authorization', `Bearer ${labVetToken}`);
      expect(forbiddenRes.status).toBe(403);

      const completedDeleteRes = await request(app)
        .delete(`/api/subtask-requests/${createdLabSubtaskId}`)
        .set('Authorization', `Bearer ${mainVetToken}`);
      expect(completedDeleteRes.status).toBe(409);
    });

    it('bác sĩ chính hủy Sub-task còn Pending thành công (200)', async () => {
      const deleteRes = await request(app)
        .delete(`/api/subtask-requests/${pendingSubtaskToDeleteId}`)
        .set('Authorization', `Bearer ${mainVetToken}`);
      expect(deleteRes.status).toBe(200);

      const found = await SubtaskRequest.findById(pendingSubtaskToDeleteId).lean();
      expect(found).toBeNull();
    });
  });
});
