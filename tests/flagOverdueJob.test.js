// Test tiến trình ngầm JOB-01 — Tự động đánh dấu lịch hẹn quá hạn Overdue (UC-23, BR-08, SRS 6.1)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

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
const {
  flagOverdueAppointments,
  runFlagOverdueWithRetry,
  scheduleFlagOverdueJob,
  getDateStringVN,
} = require('../src/jobs/flagOverdueAppointments.job');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let owner;
let admin;
let receptionist;
let vet;
let ownerToken;
let adminToken;
let receptionistToken;

let pet1;
let pet2;
let examService;
let groomService;

const TARGET_DATE = '2026-11-24';
const PAST_DATE = '2026-11-23';
const FUTURE_DATE = '2026-11-25';

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  const passwordHash = await bcrypt.hash('Password123', 10);

  [owner, admin, receptionist, vet] = await User.create([
    { code: 'USR-OV0001', fullName: 'Chủ nuôi OV', phone: '0966111001', email: 'ovowner@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-OV0002', fullName: 'Admin OV', phone: '0966111002', email: 'ovadmin@test.vn', passwordHash, role: 'Admin', status: 'Active' },
    { code: 'USR-OV0003', fullName: 'Lễ tân OV', phone: '0966111003', email: 'ovrecep@test.vn', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-OV0004', fullName: 'BS Thú y OV', phone: '0966111004', email: 'ovvet@test.vn', passwordHash, role: 'Veterinarian', status: 'Active' },
  ]);

  ownerToken = signToken(owner);
  adminToken = signToken(admin);
  receptionistToken = signToken(receptionist);

  [pet1, pet2] = await Pet.create([
    { code: 'PET-OV0001', ownerId: owner._id, name: 'Milo', species: 'Dog', breed: 'Poodle', weight: 5.0 },
    { code: 'PET-OV0002', ownerId: owner._id, name: 'Miu', species: 'Cat', breed: 'ALN', weight: 3.5 },
  ]);

  [examService, groomService] = await Service.create([
    { code: 'SRV-OV0001', name: 'Khám tổng quát', category: 'Examination', defaultDuration: 30, basePrice: 150000, status: 'Active' },
    { code: 'SRV-OV0002', name: 'Tắm & cắt tỉa', category: 'Grooming', defaultDuration: 60, basePrice: 250000, status: 'Active' },
  ]);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([AppointmentOrder.deleteMany({}), AppointmentService.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('JOB-01 — Đánh dấu lịch hẹn quá hạn Overdue (UC-23, BR-08, SRS 6.1)', () => {
  test('1. Chuyển đơn Booked chưa Check-in sang Overdue (KHÔNG huỷ đơn) và CHỈ đánh dấu Overdue cho dịch vụ đầu tiên (BR-08)', async () => {
    const order = await AppointmentOrder.create({
      code: 'APT-OV0001',
      petId: pet1._id,
      ownerId: owner._id,
      date: TARGET_DATE,
      slotStart: '09:00',
      slotEnd: '10:30',
      isOnline: true,
      derivedStatus: 'Booked',
      checkedInAt: null,
    });

    const [svc1, svc2] = await AppointmentService.create([
      { orderId: order._id, serviceId: examService._id, sequenceNo: 1, status: 'Booked' },
      { orderId: order._id, serviceId: groomService._id, sequenceNo: 2, status: 'Booked' },
    ]);

    const result = await flagOverdueAppointments({ targetDate: TARGET_DATE, includePastDates: true });

    expect(result.scannedCount).toBe(1);
    expect(result.flaggedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(result.flaggedOrders[0].code).toBe('APT-OV0001');
    expect(String(result.flaggedOrders[0].firstServiceId)).toBe(String(svc1._id));

    const updatedOrder = await AppointmentOrder.findById(order._id).lean();
    expect(updatedOrder.derivedStatus).toBe('Overdue');
    expect(updatedOrder.cancelReason).toBeNull();
    expect(updatedOrder.cancelledAt).toBeNull();

    // BR-08: chỉ dịch vụ #1 chuyển Overdue, dịch vụ #2 giữ nguyên Booked
    const [updatedSvc1, updatedSvc2] = await Promise.all([
      AppointmentService.findById(svc1._id).lean(),
      AppointmentService.findById(svc2._id).lean(),
    ]);
    expect(updatedSvc1.status).toBe('Overdue');
    expect(updatedSvc2.status).toBe('Booked');
  });

  test('2. Chỉ quét đơn Booked <= targetDate; bỏ qua đơn tương lai, đơn đã CheckedIn (UC-23 Alt 1a), InProgress, Done, Cancelled', async () => {
    const [pastBooked, checkedInOrder, cancelledOrder, doneOrder, futureOrder] =
      await AppointmentOrder.create([
        {
          code: 'APT-OV-PAST',
          petId: pet1._id,
          ownerId: owner._id,
          date: PAST_DATE,
          isOnline: true,
          derivedStatus: 'Booked',
          checkedInAt: null,
        },
        {
          code: 'APT-OV-CHK',
          petId: pet2._id,
          ownerId: owner._id,
          date: TARGET_DATE,
          isOnline: true,
          derivedStatus: 'CheckedIn',
          checkedInAt: new Date(),
        },
        {
          code: 'APT-OV-CAN',
          petId: pet1._id,
          ownerId: owner._id,
          date: TARGET_DATE,
          isOnline: true,
          derivedStatus: 'Cancelled',
          cancelReason: 'Khách bận',
        },
        {
          code: 'APT-OV-DONE',
          petId: pet2._id,
          ownerId: owner._id,
          date: TARGET_DATE,
          isOnline: true,
          derivedStatus: 'Done',
          checkedInAt: new Date(),
        },
        {
          code: 'APT-OV-FUT',
          petId: pet1._id,
          ownerId: owner._id,
          date: FUTURE_DATE,
          isOnline: true,
          derivedStatus: 'Booked',
          checkedInAt: null,
        },
      ]);

    const [pastSvc, checkedInSvc1, checkedInSvc2, futureSvc] = await AppointmentService.create([
      { orderId: pastBooked._id, serviceId: examService._id, sequenceNo: 1, status: 'Booked' },
      { orderId: checkedInOrder._id, serviceId: examService._id, sequenceNo: 1, assignedStaffId: vet._id, status: 'InProgress' },
      // Dịch vụ thứ 2 của đơn đã check-in vẫn còn Booked/Waiting -> tuyệt đối không bị đánh Overdue (UC-23 Alt 1a)
      { orderId: checkedInOrder._id, serviceId: groomService._id, sequenceNo: 2, status: 'Booked' },
      { orderId: futureOrder._id, serviceId: examService._id, sequenceNo: 1, status: 'Booked' },
    ]);

    const result = await flagOverdueAppointments({ targetDate: TARGET_DATE, includePastDates: true });
    expect(result.flaggedCount).toBe(1);
    expect(result.flaggedOrders[0].code).toBe('APT-OV-PAST');

    const [rePast, reCheckedIn, reCancelled, reDone, reFuture] = await Promise.all([
      AppointmentOrder.findById(pastBooked._id).lean(),
      AppointmentOrder.findById(checkedInOrder._id).lean(),
      AppointmentOrder.findById(cancelledOrder._id).lean(),
      AppointmentOrder.findById(doneOrder._id).lean(),
      AppointmentOrder.findById(futureOrder._id).lean(),
    ]);

    expect(rePast.derivedStatus).toBe('Overdue');
    expect(reCheckedIn.derivedStatus).toBe('CheckedIn');
    expect(reCancelled.derivedStatus).toBe('Cancelled');
    expect(reDone.derivedStatus).toBe('Done');
    expect(reFuture.derivedStatus).toBe('Booked');

    const [rePastSvc, reChkSvc1, reChkSvc2, reFutSvc] = await Promise.all([
      AppointmentService.findById(pastSvc._id).lean(),
      AppointmentService.findById(checkedInSvc1._id).lean(),
      AppointmentService.findById(checkedInSvc2._id).lean(),
      AppointmentService.findById(futureSvc._id).lean(),
    ]);
    expect(rePastSvc.status).toBe('Overdue');
    expect(reChkSvc1.status).toBe('InProgress');
    expect(reChkSvc2.status).toBe('Booked');
    expect(reFutSvc.status).toBe('Booked');
  });

  test('3. SRS 6.1 Race condition: Nếu đơn vừa được Lễ tân Check-in ngay trong lúc job chạy thì bỏ qua an toàn', async () => {
    const order = await AppointmentOrder.create({
      code: 'APT-OV-RACE',
      petId: pet1._id,
      ownerId: owner._id,
      date: TARGET_DATE,
      isOnline: true,
      derivedStatus: 'Booked',
      checkedInAt: null,
    });

    const svc = await AppointmentService.create({
      orderId: order._id,
      serviceId: examService._id,
      sequenceNo: 1,
      status: 'Booked',
    });

    // Giả lập Lễ tân check-in thành công ngay giữa bước find() và findOneAndUpdate()
    jest.spyOn(AppointmentOrder, 'findOneAndUpdate').mockReturnValueOnce({
      lean: async () => null,
    });

    const result = await flagOverdueAppointments({ targetDate: TARGET_DATE });
    expect(result.scannedCount).toBe(1);
    expect(result.flaggedCount).toBe(0);
    expect(result.skippedCount).toBe(1);

    // Dịch vụ của đơn đó không bị đụng vào
    const unchangedSvc = await AppointmentService.findById(svc._id).lean();
    expect(unchangedSvc.status).toBe('Booked');
  });

  test('4. SRS 6.1 Retry: Thử lại tối đa 3 lần khi DB tạm gián đoạn rồi thành công (và ném lỗi nếu thất bại đủ 3 lần)', async () => {
    let calls = 0;
    const flakyRunner = jest.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('MongoNetworkError: DB unreachable');
      return { flaggedCount: 2, scannedCount: 2, skippedCount: 0, flaggedOrders: [] };
    });

    const okResult = await runFlagOverdueWithRetry({
      targetDate: TARGET_DATE,
      maxRetries: 3,
      retryDelayMs: 5,
      runner: flakyRunner,
    });
    expect(flakyRunner).toHaveBeenCalledTimes(3);
    expect(okResult.flaggedCount).toBe(2);

    const alwaysFailRunner = jest.fn(async () => {
      throw new Error('MongoServerSelectionError');
    });

    await expect(
      runFlagOverdueWithRetry({
        targetDate: TARGET_DATE,
        maxRetries: 3,
        retryDelayMs: 5,
        runner: alwaysFailRunner,
      })
    ).rejects.toThrow('MongoServerSelectionError');
    expect(alwaysFailRunner).toHaveBeenCalledTimes(3);
  });

  test('5. Đăng ký cron job scheduleFlagOverdueJob hợp lệ và dừng sạch sẽ không rò rỉ handle', () => {
    const task = scheduleFlagOverdueJob();
    expect(task).toBeDefined();
    expect(typeof task.stop).toBe('function');
    task.stop();
    expect(getDateStringVN()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('6. API chạy tay POST /api/appointment-orders/flag-overdue: phân quyền Admin, validate 400 và đồng bộ Timeline + Báo cáo', async () => {
    const order = await AppointmentOrder.create({
      code: 'APT-OV-API1',
      petId: pet1._id,
      ownerId: owner._id,
      date: TARGET_DATE,
      isOnline: true,
      derivedStatus: 'Booked',
      checkedInAt: null,
    });
    await AppointmentService.create({
      orderId: order._id,
      serviceId: examService._id,
      sequenceNo: 1,
      status: 'Booked',
    });

    // Chưa đăng nhập -> 401
    const unauth = await request(app).post('/api/appointment-orders/flag-overdue').send({});
    expect(unauth.status).toBe(401);

    // PetOwner / Receptionist -> 403
    for (const token of [ownerToken, receptionistToken]) {
      const forbidden = await request(app)
        .post('/api/appointment-orders/flag-overdue')
        .set('Authorization', `Bearer ${token}`)
        .send({ date: TARGET_DATE });
      expect(forbidden.status).toBe(403);
    }

    // Sai định dạng ngày -> 400
    const badDate = await request(app)
      .post('/api/appointment-orders/flag-overdue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-02-31' });
    expect(badDate.status).toBe(400);
    expect(badDate.body.errors.date).toBeDefined();

    // Admin chạy thành công -> 200
    const okRes = await request(app)
      .post('/api/appointment-orders/flag-overdue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: TARGET_DATE, includePastDates: false });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.flaggedCount).toBe(1);
    expect(okRes.body.data.flaggedOrders[0].code).toBe('APT-OV-API1');

    // Xác nhận phản ánh đúng trên Pet Timeline (UC-23 bước 3) và Báo cáo vận hành
    const [timelineRes, opsRes] = await Promise.all([
      request(app)
        .get(`/api/pets/${pet1._id}/timeline`)
        .set('Authorization', `Bearer ${ownerToken}`),
      request(app)
        .get('/api/reports/operations')
        .query({ from: TARGET_DATE, to: TARGET_DATE })
        .set('Authorization', `Bearer ${adminToken}`),
    ]);

    expect(timelineRes.status).toBe(200);
    expect(timelineRes.body.timeline[0].derivedStatus).toBe('Overdue');
    expect(timelineRes.body.timeline[0].statusLabel).toBe('Chưa đến - quá thời gian');

    expect(opsRes.status).toBe(200);
    expect(opsRes.body.appointments.byStatus.Overdue).toBe(1);
  });
});
