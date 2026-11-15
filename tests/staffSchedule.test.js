// Test luồng Báo bận 3 ca (StaffSchedule Blacklist), Lọc nhân sự khả dụng theo serviceId & (date, shift), và Cảnh báo xung đột ca
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const StaffSchedule = require('../src/models/StaffSchedule');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const formatDateOffsetVN = (offsetDays) => {
  const target = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(target);
};

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let vet1;
let vet2;
let groomer1;
let receptionist;
let owner;
let petDoc;
let examService;
let groomingService;

let vet1Token;
let vet2Token;
let groomerToken;
let receptionistToken;
let ownerToken;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    Pet.syncIndexes(),
    Service.syncIndexes(),
    StaffSchedule.syncIndexes(),
    AppointmentOrder.syncIndexes(),
    AppointmentService.syncIndexes(),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);
  [vet1, vet2, groomer1, receptionist, owner] = await User.create([
    { code: 'USR-SCHV01', fullName: 'BS. Nguyễn Văn An', phone: '0933000001', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-SCHV02', fullName: 'BS. Trần Thị Bình', phone: '0933000002', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-SCHG01', fullName: 'KTV. Lê Minh Châu', phone: '0933000003', passwordHash, role: 'Groomer', status: 'Active' },
    { code: 'USR-SCHR01', fullName: 'Lễ Tân Thu Hương', phone: '0933000004', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-SCHO01', fullName: 'Khách Hàng Minh', phone: '0933000005', passwordHash, role: 'PetOwner', status: 'Active' },
  ]);

  vet1Token = signToken(vet1);
  vet2Token = signToken(vet2);
  groomerToken = signToken(groomer1);
  receptionistToken = signToken(receptionist);
  ownerToken = signToken(owner);

  petDoc = await Pet.create({
    code: 'PET-SCH001',
    ownerId: owner._id,
    name: 'Lu',
    species: 'Dog',
    breed: 'Poodle',
    weight: 6.0,
    status: 'Active',
  });

  [examService, groomingService] = await Service.create([
    {
      code: 'SRV-SCHEX1',
      name: 'Khám tổng quát',
      category: 'Examination',
      requiredRole: 'Veterinarian',
      defaultDuration: 30,
      basePrice: 150000,
      status: 'Active',
    },
    {
      code: 'SRV-SCHGR1',
      name: 'Tắm & Cắt tỉa',
      category: 'Grooming',
      requiredRole: 'Groomer',
      defaultDuration: 60,
      basePrice: 200000,
      status: 'Active',
    },
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('StaffSchedule Blacklist 3 Ca & Lọc nhân sự khả dụng', () => {
  const targetDate = formatDateOffsetVN(3);
  let vet1BusyId;

  test('1. Chặn PetOwner truy cập (403) và chặn báo bận ngày trong quá khứ (400)', async () => {
    const ownerRes = await request(app)
      .post('/api/staff-schedules')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ date: targetDate, shift: 'MORNING' });
    expect(ownerRes.status).toBe(403);

    const pastDate = formatDateOffsetVN(-1);
    const pastRes = await request(app)
      .post('/api/staff-schedules')
      .set('Authorization', `Bearer ${vet1Token}`)
      .send({ date: pastDate, shift: 'MORNING' });
    expect(pastRes.status).toBe(400);
  });

  test('2. Mặc định mọi nhân sự đều khả dụng; Bác sĩ tự báo bận ca MORNING sẽ bị ẩn ở ca MORNING nhưng vẫn hiện ở ca AFTERNOON', async () => {
    // Trước khi báo bận: GET /api/users/staff?serviceId=examService trả về đủ 2 bác sĩ (vet1, vet2)
    const beforeRes = await request(app)
      .get(`/api/users/staff?serviceId=${examService._id}&date=${targetDate}&shift=MORNING`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.body.items.map((u) => u._id)).toEqual(
      expect.arrayContaining([String(vet1._id), String(vet2._id)])
    );
    expect(beforeRes.body.items.map((u) => u._id)).not.toContain(String(groomer1._id));

    // vet1 tự báo bận ca MORNING ngày targetDate
    const busyRes = await request(app)
      .post('/api/staff-schedules')
      .set('Authorization', `Bearer ${vet1Token}`)
      .send({
        date: targetDate,
        shift: 'MORNING',
        reason: 'Đi công tác buổi sáng',
      });
    expect(busyRes.status).toBe(201);
    expect(busyRes.body.data.shift).toBe('MORNING');
    expect(busyRes.body.data.createdBy._id).toBe(String(vet1._id));
    expect(busyRes.body.warning).toBeNull();
    vet1BusyId = busyRes.body.data._id;

    // Báo trùng lại cùng (staffId, date, shift) -> 409
    const dupRes = await request(app)
      .post('/api/staff-schedules')
      .set('Authorization', `Bearer ${vet1Token}`)
      .send({ date: targetDate, shift: 'MORNING' });
    expect(dupRes.status).toBe(409);

    // Lọc nhân sự cho examService ở ca MORNING -> ẩn vet1, chỉ còn vet2
    const morningRes = await request(app)
      .get(`/api/users/staff?serviceId=${examService._id}&date=${targetDate}&shift=MORNING`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(morningRes.status).toBe(200);
    expect(morningRes.body.items.map((u) => u._id)).not.toContain(String(vet1._id));
    expect(morningRes.body.items.map((u) => u._id)).toContain(String(vet2._id));

    // Ca AFTERNOON cùng ngày vẫn còn cả vet1 và vet2
    const afternoonRes = await request(app)
      .get(`/api/users/staff?serviceId=${examService._id}&date=${targetDate}&shift=AFTERNOON`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(afternoonRes.status).toBe(200);
    expect(afternoonRes.body.items.map((u) => u._id)).toEqual(
      expect.arrayContaining([String(vet1._id), String(vet2._id)])
    );

    // Lọc cho dịch vụ Grooming -> chỉ hiện groomer1
    const groomRes = await request(app)
      .get(`/api/users/staff?serviceId=${groomingService._id}&date=${targetDate}&shift=MORNING`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(groomRes.status).toBe(200);
    expect(groomRes.body.items.map((u) => u._id)).toEqual([String(groomer1._id)]);
  });

  test('3. Chặn gán bác sĩ đã báo bận vào đơn Check-in cùng ca (409), hủy báo bận thì gán được bình thường', async () => {
    const order = await AppointmentOrder.create({
      code: 'APT-SCH001',
      petId: petDoc._id,
      ownerId: owner._id,
      date: targetDate,
      slotStart: '09:30', // MORNING
      isOnline: true,
      derivedStatus: 'Booked',
    });
    const svc = await AppointmentService.create({
      orderId: order._id,
      serviceId: examService._id,
      sequenceNo: 1,
      status: 'Booked',
      scheduledStart: '09:30',
    });

    // Thử Check-in gán vet1 (đang báo bận ca MORNING) -> 409
    const blockedCheckIn = await request(app)
      .patch(`/api/appointment-orders/${order._id}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        serviceAssignments: [{ appointmentServiceId: String(svc._id), assignedStaffId: String(vet1._id) }],
      });
    expect(blockedCheckIn.status).toBe(409);

    // Bác sĩ khác không được xóa hộ báo bận của vet1 (403)
    const forbidDelete = await request(app)
      .delete(`/api/staff-schedules/${vet1BusyId}`)
      .set('Authorization', `Bearer ${vet2Token}`);
    expect(forbidDelete.status).toBe(403);

    // vet1 tự hủy báo bận -> 200, xuất hiện lại và Check-in gán vet1 thành công
    const deleteRes = await request(app)
      .delete(`/api/staff-schedules/${vet1BusyId}`)
      .set('Authorization', `Bearer ${vet1Token}`);
    expect(deleteRes.status).toBe(200);

    const okCheckIn = await request(app)
      .patch(`/api/appointment-orders/${order._id}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        serviceAssignments: [{ appointmentServiceId: String(svc._id), assignedStaffId: String(vet1._id) }],
      });
    expect(okCheckIn.status).toBe(200);
  });

  test('4. Lễ tân báo bận hộ nhân sự đang có ca Waiting/InProgress -> tạo thành công kèm cảnh báo warning & conflictingServices', async () => {
    const conflictDate = formatDateOffsetVN(5);
    const conflictOrder = await AppointmentOrder.create({
      code: 'APT-SCH002',
      petId: petDoc._id,
      ownerId: owner._id,
      date: conflictDate,
      slotStart: '14:00', // AFTERNOON
      derivedStatus: 'CheckedIn',
      checkedInAt: new Date(),
    });
    await AppointmentService.create({
      orderId: conflictOrder._id,
      serviceId: groomingService._id,
      assignedStaffId: groomer1._id,
      sequenceNo: 1,
      status: 'Waiting',
      scheduledStart: '14:00',
      queueNo: 1,
      enqueueAt: new Date(),
    });

    const res = await request(app)
      .post('/api/staff-schedules')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        staffId: String(groomer1._id),
        date: conflictDate,
        shift: 'AFTERNOON',
        reason: 'Xin nghỉ đột xuất buổi chiều',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.createdBy._id).toBe(String(receptionist._id));
    expect(res.body.warning).toMatch(/Cảnh báo/i);
    expect(res.body.conflictingServices).toHaveLength(1);
    expect(res.body.conflictingServices[0].orderCode).toBe('APT-SCH002');

    // Xem danh sách lịch báo bận từ phía Groomer (/me) & Lễ tân
    const myRes = await request(app)
      .get(`/api/staff-schedules/me?date=${conflictDate}`)
      .set('Authorization', `Bearer ${groomerToken}`);
    expect(myRes.status).toBe(200);
    expect(myRes.body.data).toHaveLength(1);

    const listAllRes = await request(app)
      .get(`/api/staff-schedules?date=${conflictDate}&shift=AFTERNOON`)
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(listAllRes.status).toBe(200);
    expect(listAllRes.body.data).toHaveLength(1);
  });
});

