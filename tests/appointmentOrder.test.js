// Test luồng ghi chú đặt lịch (note) & phiếu kê khai lễ tân khi check-in (intake) trên MongoDB LOCAL (vcmos_test)
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
const MedicalRecord = require('../src/models/MedicalRecord');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const formatDateOffsetVN = (daysOffset) => {
  const target = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(target);
};

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let ownerUser;
let receptionistUser;
let vetUser;
let petDoc;
let medicalService;
let ownerToken;
let receptionistToken;
let vetToken;

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
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);
  [ownerUser, receptionistUser, vetUser] = await User.create([
    {
      code: 'USR-INT001',
      fullName: 'Nguyễn Chủ Nuôi',
      phone: '0911000001',
      passwordHash,
      role: 'PetOwner',
      status: 'Active',
    },
    {
      code: 'USR-INT002',
      fullName: 'Trần Lễ Tân',
      phone: '0911000002',
      passwordHash,
      role: 'Receptionist',
      status: 'Active',
    },
    {
      code: 'USR-INT003',
      fullName: 'BS. Lê Thú Y',
      phone: '0911000003',
      passwordHash,
      role: 'Veterinarian',
      status: 'Active',
    },
  ]);

  ownerToken = signToken(ownerUser);
  receptionistToken = signToken(receptionistUser);
  vetToken = signToken(vetUser);

  petDoc = await Pet.create({
    code: 'PET-INT001',
    ownerId: ownerUser._id,
    name: 'Mực',
    species: 'Chó',
    breed: 'Corgi',
    weight: 9,
    status: 'Active',
  });

  medicalService = await Service.create({
    code: 'SRV-INT001',
    name: 'Khám lâm sàng',
    category: 'Examination',
    basePrice: 180000,
    defaultDuration: 30,
    status: 'Active',
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Appointment Symptom Note & Reception Check-in Intake Flow', () => {
  let onlineOrderId;
  let onlineServiceId;
  let legacyOrderId;

  test('1. Chủ nuôi không được tự truyền trường intake khi đặt lịch online (400)', async () => {
    const res = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: petDoc._id,
        date: formatDateOffsetVN(1),
        note: 'Bé ho từ tối qua',
        intake: { symptoms: 'Giả mạo', initialCondition: 'Giả mạo' },
        services: [{ serviceId: medicalService._id }],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/intake/i);
  });

  test('2. Chủ nuôi đặt lịch online kèm ghi chú triệu chứng (note) thành công', async () => {
    const res = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: petDoc._id,
        date: formatDateOffsetVN(1),
        slotStart: '09:00',
        note: 'Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng',
        services: [{ serviceId: medicalService._id }],
      });

    expect(res.status).toBe(201);
    onlineOrderId = res.body.data.appointment._id;
    onlineServiceId = res.body.data.services[0]._id;
    expect(res.body.data.appointment.note).toBe('Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng');
    expect(res.body.data.appointment.intake).toBeNull();
  });

  test('3. Lễ tân phân công bác sĩ và check-in thất bại (400) nếu gửi intake rỗng hoặc vượt 500 ký tự', async () => {
    const assignRes = await request(app)
      .patch(`/api/appointment-services/${onlineServiceId}/assign-staff`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ assignedStaffId: vetUser._id });
    expect(assignRes.status).toBe(200);

    const blankRes = await request(app)
      .patch(`/api/appointment-orders/${onlineOrderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        intake: {
          symptoms: '   ',
          initialCondition: 'Tỉnh táo',
        },
      });

    expect(blankRes.status).toBe(400);
    expect(blankRes.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'intake.symptoms' }),
      ])
    );

    const longRes = await request(app)
      .patch(`/api/appointment-orders/${onlineOrderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        intake: {
          symptoms: 'Ho nhẹ',
          initialCondition: 'a'.repeat(501),
        },
      });

    expect(longRes.status).toBe(400);
    expect(longRes.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'intake.initialCondition' }),
      ])
    );
  });

  test('4. Lễ tân check-in thành công với phiếu kê khai ban đầu (intake) và lưu đầy đủ vào DB', async () => {
    const res = await request(app)
      .patch(`/api/appointment-orders/${onlineOrderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        intake: {
          symptoms: '  Ho khan từng cơn, chảy nước mũi trong  ',
          initialCondition: '  Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ  ',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.derivedStatus).toBe('CheckedIn');
    expect(res.body.data.intake).toMatchObject({
      symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
      initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
      recordedBy: String(receptionistUser._id),
    });
    expect(res.body.data.intake.recordedAt).toBeTruthy();

    const listRes = await request(app)
      .get('/api/appointment-orders')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(listRes.status).toBe(200);
    const foundOrder = listRes.body.data.find((o) => String(o._id) === String(onlineOrderId));
    expect(foundOrder.note).toBe('Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng');
    expect(foundOrder.intake).toMatchObject({
      symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
      initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
    });
  });

  test('5. Vẫn tương thích ngược nếu FE chưa bật cờ intake (check-in không gửi body intake)', async () => {
    const legacyBooking = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: petDoc._id,
        date: formatDateOffsetVN(2),
        slotStart: '11:00',
        note: 'Tái khám kiểm tra tai',
        services: [{ serviceId: medicalService._id }],
      });

    expect(legacyBooking.status).toBe(201);
    legacyOrderId = legacyBooking.body.data.appointment._id;

    const checkInRes = await request(app)
      .patch(`/api/appointment-orders/${legacyOrderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({});

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.data.derivedStatus).toBe('CheckedIn');
    expect(checkInRes.body.data.intake).toBeNull();
  });

  test('6. Bác sĩ xem hàng đợi (my-queue), chi tiết bệnh án, tiền sử khám và hồ sơ thú cưng đều thấy đủ note & intake', async () => {
    // 6a. Hàng đợi của bác sĩ
    const queueRes = await request(app)
      .get('/api/appointment-services/my-queue')
      .set('Authorization', `Bearer ${vetToken}`);

    expect(queueRes.status).toBe(200);
    const queuedItem = queueRes.body.data.find(
      (item) => String(item._id) === String(onlineServiceId)
    );
    expect(queuedItem).toBeTruthy();
    expect(queuedItem.orderId.note).toBe('Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng');
    expect(queuedItem.orderId.intake).toMatchObject({
      symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
      initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
    });

    // 6b. Bác sĩ bắt đầu & hoàn thành khám để tạo bệnh án
    await request(app)
      .patch(`/api/appointment-services/${onlineServiceId}/status`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({ status: 'InProgress' });

    const completeRes = await request(app)
      .post(`/api/medical-records/service/${onlineServiceId}/complete`)
      .set('Authorization', `Bearer ${vetToken}`)
      .send({
        subjectiveNote: 'Ho khan 2 ngày',
        objectiveNote: 'Phổi ran nhẹ',
        assessment: 'Viêm hô hấp trên nhẹ',
        plan: 'Uống thuốc và theo dõi thêm 5 ngày',
      });
    expect(completeRes.status).toBe(200);

    // 6c. Xem chi tiết bệnh án -> có orderId.note và orderId.intake
    const recordDetailRes = await request(app)
      .get(`/api/medical-records/service/${onlineServiceId}`)
      .set('Authorization', `Bearer ${vetToken}`);

    expect(recordDetailRes.status).toBe(200);
    expect(recordDetailRes.body.appointmentServiceId.orderId.note).toBe(
      'Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng'
    );
    expect(recordDetailRes.body.appointmentServiceId.orderId.intake).toMatchObject({
      symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
      initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
    });

    // 6d. Xem tiền sử bệnh lý theo petId -> có orderId.note và orderId.intake
    const historyRes = await request(app)
      .get(`/api/medical-records/pet/${petDoc._id}`)
      .set('Authorization', `Bearer ${vetToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.records[0].appointmentServiceId.orderId.note).toBe(
      'Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng'
    );
    expect(historyRes.body.records[0].appointmentServiceId.orderId.intake).toMatchObject({
      symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
      initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
    });

    // 6e. Bác sĩ xem hồ sơ thú cưng (/api/pets/:petId) -> thấy appointmentNotes gồm cả note & intake
    const petProfileRes = await request(app)
      .get(`/api/pets/${petDoc._id}`)
      .set('Authorization', `Bearer ${vetToken}`);

    expect(petProfileRes.status).toBe(200);
    expect(petProfileRes.body.pet.name).toBe('Mực');
    expect(Array.isArray(petProfileRes.body.appointmentNotes)).toBe(true);
    const matchingOrderNote = petProfileRes.body.appointmentNotes.find(
      (item) => String(item._id) === String(onlineOrderId)
    );
    expect(matchingOrderNote).toMatchObject({
      note: 'Bé bỏ ăn 1 ngày, ho nhẹ buổi sáng',
      intake: {
        symptoms: 'Ho khan từng cơn, chảy nước mũi trong',
        initialCondition: 'Tỉnh táo, hơi mệt, thân nhiệt 38.9 độ',
      },
    });
  });
});

