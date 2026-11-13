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

describe('Nhóm 1: Vá các lỗi logic đặt lịch, check-in, phân công, bắt đầu ca & hủy đơn', () => {
  const Cage = require('../src/models/Cage');
  const CageAssignment = require('../src/models/CageAssignment');
  const bcrypt = require('bcryptjs');

  let groomerUser;
  let vetUser2;
  let groomerToken;
  let vet2Token;
  let groomingService;
  let smallCage;
  let largeCage;
  let heavyPet;
  let deletedPet;

  beforeAll(async () => {
    await Cage.syncIndexes();
    await CageAssignment.syncIndexes();

    const passwordHash = await bcrypt.hash('Test@123', 10);
    [groomerUser, vetUser2] = await User.create([
      {
        code: 'USR-INT004',
        fullName: 'Groomer Hồng',
        phone: '0911000004',
        passwordHash,
        role: 'Groomer',
        status: 'Active',
      },
      {
        code: 'USR-INT005',
        fullName: 'BS. Phạm Khác',
        phone: '0911000005',
        passwordHash,
        role: 'Veterinarian',
        status: 'Active',
      },
    ]);
    groomerToken = signToken(groomerUser);
    vet2Token = signToken(vetUser2);

    groomingService = await Service.create({
      code: 'SRV-INT002',
      name: 'Tắm cắt tỉa',
      category: 'Grooming',
      basePrice: 220000,
      defaultDuration: 60,
      status: 'Active',
    });

    [smallCage, largeCage] = await Cage.create([
      {
        label: 'CAG-INT-S01',
        size: 'S',
        maxWeightKg: 10,
        zone: 'Holding',
        isIsolated: false,
        status: 'Available',
      },
      {
        label: 'CAG-INT-L01',
        size: 'L',
        maxWeightKg: 35,
        zone: 'Holding',
        isIsolated: false,
        status: 'Available',
      },
    ]);

    [heavyPet, deletedPet] = await Pet.create([
      {
        code: 'PET-INT002',
        ownerId: ownerUser._id,
        name: 'Gấu To',
        species: 'Chó',
        weight: 25,
        status: 'Active',
      },
      {
        code: 'PET-INT003',
        ownerId: ownerUser._id,
        name: 'Bé Đã Xóa',
        species: 'Mèo',
        weight: 4,
        status: 'Deleted',
      },
    ]);
  });

  test('Fix #5: Chặn đặt lịch online với pet đã Deleted (400) & chặn xóa pet đang có lịch hẹn active (409)', async () => {
    const validDate = formatDateOffsetVN(3);

    const deletedBookingRes = await request(app)
      .post('/api/appointment-orders/online')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: deletedPet._id,
        date: validDate,
        slotStart: '09:00',
      });

    expect(deletedBookingRes.status).toBe(400);
    expect(deletedBookingRes.body.message).toMatch(/xóa/i);

    const activeBookingRes = await request(app)
      .post('/api/appointment-orders/online')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: heavyPet._id,
        date: validDate,
        slotStart: '09:00',
      });
    expect(activeBookingRes.status).toBe(201);

    const deletePetRes = await request(app)
      .delete(`/api/pets/${heavyPet._id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(deletePetRes.status).toBe(409);

    // Dọn đơn vừa tạo để giữ sạch test sau
    await AppointmentService.deleteMany({ orderId: activeBookingRes.body.data._id });
    await AppointmentOrder.deleteOne({ _id: activeBookingRes.body.data._id });
  });

  test('Fix #2 & Fix #3: Check-in sai size chuồng trả 400 và KHÔNG kẹt CheckedIn; hủy đơn CheckedIn tự giải phóng chuồng', async () => {
    const bookingRes = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: heavyPet._id,
        date: formatDateOffsetVN(4),
        slotStart: '10:00',
        services: [{ serviceId: medicalService._id }],
      });
    expect(bookingRes.status).toBe(201);
    const orderId = bookingRes.body.data.appointment._id;

    // 1. Check-in với chuồng size S cho bé 25kg -> thất bại 400 và đơn vẫn là Booked
    const badCheckInRes = await request(app)
      .patch(`/api/appointment-orders/${orderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cageId: smallCage._id });

    expect(badCheckInRes.status).toBe(400);

    const orderAfterFail = await AppointmentOrder.findById(orderId).lean();
    const svcAfterFail = await AppointmentService.findOne({ orderId }).lean();
    const cageAfterFail = await Cage.findById(smallCage._id).lean();
    expect(orderAfterFail.derivedStatus).toBe('Booked');
    expect(svcAfterFail.status).toBe('Booked');
    expect(cageAfterFail.status).toBe('Available');

    // 2. Check-in lại với chuồng size L -> thành công 200, chuồng Occupied
    const okCheckInRes = await request(app)
      .patch(`/api/appointment-orders/${orderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cageId: largeCage._id });

    expect(okCheckInRes.status).toBe(200);
    expect(okCheckInRes.body.data.derivedStatus).toBe('CheckedIn');
    const occupiedCage = await Cage.findById(largeCage._id).lean();
    expect(occupiedCage.status).toBe('Occupied');

    // 3. Hủy đơn CheckedIn -> đơn Cancelled và chuồng tự giải phóng về Available
    const cancelRes = await request(app)
      .patch(`/api/appointment-orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ reason: 'Khách có việc đột xuất' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.derivedStatus).toBe('Cancelled');

    const releasedCage = await Cage.findById(largeCage._id).lean();
    const closedAssignment = await CageAssignment.findOne({ orderId }).lean();
    expect(releasedCage.status).toBe('Available');
    expect(closedAssignment.releasedAt).toBeTruthy();
  });

  test('Fix #4 & Fix #1: Chặn assign sai chuyên môn (400), chặn start trái phép/sai thứ tự (403/409), và start hợp lệ giải phóng chuồng chờ (BR-10)', async () => {
    const bookingRes = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: petDoc._id,
        date: formatDateOffsetVN(5),
        slotStart: '14:00',
        services: [{ serviceId: medicalService._id }, { serviceId: groomingService._id }],
      });
    expect(bookingRes.status).toBe(201);

    const orderId = bookingRes.body.data.appointment._id;
    const step1ServiceId = bookingRes.body.data.services[0]._id;
    const step2ServiceId = bookingRes.body.data.services[1]._id;

    // 1. Gán Bác sĩ cho dịch vụ Grooming -> bị chặn 400
    const wrongRoleAssignRes = await request(app)
      .patch(`/api/appointment-services/${step2ServiceId}/assign-staff`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ assignedStaffId: vetUser._id });
    expect(wrongRoleAssignRes.status).toBe(400);

    // 2. Phân công đúng: Bác sĩ làm bước 1, Groomer làm bước 2
    const assign1 = await request(app)
      .patch(`/api/appointment-services/${step1ServiceId}/assign-staff`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ assignedStaffId: vetUser._id });
    expect(assign1.status).toBe(200);

    const assign2 = await request(app)
      .patch(`/api/appointment-services/${step2ServiceId}/assign-staff`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ assignedStaffId: groomerUser._id });
    expect(assign2.status).toBe(200);

    // 3. Chưa check-in (status còn Booked) mà gọi start -> 409
    const startBeforeCheckInRes = await request(app)
      .patch(`/api/appointment-services/${step1ServiceId}/start`)
      .set('Authorization', `Bearer ${vetToken}`);
    expect(startBeforeCheckInRes.status).toBe(409);

    // 4. Check-in vào chuồng nhỏ (petDoc 9kg <= 10kg)
    const checkInRes = await request(app)
      .patch(`/api/appointment-orders/${orderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cageId: smallCage._id });
    expect(checkInRes.status).toBe(200);

    // 5. Bác sĩ khác không được phân công gọi start -> 403
    const otherVetStartRes = await request(app)
      .patch(`/api/appointment-services/${step1ServiceId}/start`)
      .set('Authorization', `Bearer ${vet2Token}`);
    expect(otherVetStartRes.status).toBe(403);

    // 6. Nhảy cóc gọi start bước 2 khi bước 1 chưa xong -> 409 (BR-12)
    const jumpStepRes = await request(app)
      .patch(`/api/appointment-services/${step2ServiceId}/start`)
      .set('Authorization', `Bearer ${groomerToken}`);
    expect(jumpStepRes.status).toBe(409);

    // 7. Bác sĩ được phân công start bước 1 hợp lệ -> 200, InProgress, và tự giải phóng chuồng chờ (BR-10)
    const validStartRes = await request(app)
      .patch(`/api/appointment-services/${step1ServiceId}/start`)
      .set('Authorization', `Bearer ${vetToken}`);
    expect(validStartRes.status).toBe(200);
    expect(validStartRes.body.data.status).toBe('InProgress');

    const cageAfterStart = await Cage.findById(smallCage._id).lean();
    const assignmentAfterStart = await CageAssignment.findOne({ orderId }).lean();
    expect(cageAfterStart.status).toBe('Available');
    expect(assignmentAfterStart.releasedAt).toBeTruthy();
  });

  test('Hủy dịch vụ lẻ cuối cùng trong đơn CheckedIn -> tự chuyển đơn sang Cancelled và giải phóng chuồng chờ', async () => {
    const bookingRes = await request(app)
      .post('/api/appointment-services/online-booking')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        petId: petDoc._id,
        date: formatDateOffsetVN(6),
        slotStart: '15:30',
        services: [{ serviceId: medicalService._id }],
      });
    expect(bookingRes.status).toBe(201);

    const orderId = bookingRes.body.data.appointment._id;
    const svcId = bookingRes.body.data.services[0]._id;

    const checkInRes = await request(app)
      .patch(`/api/appointment-orders/${orderId}/check-in`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ cageId: smallCage._id });
    expect(checkInRes.status).toBe(200);

    const cancelSvcRes = await request(app)
      .patch(`/api/appointment-services/${svcId}/cancel`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ reason: 'Khách đổi ý về trước khi khám' });

    expect(cancelSvcRes.status).toBe(200);

    const updatedOrder = await AppointmentOrder.findById(orderId).lean();
    const cageAfter = await Cage.findById(smallCage._id).lean();
    const closedAssignment = await CageAssignment.findOne({ orderId }).lean();
    expect(updatedOrder.derivedStatus).toBe('Cancelled');
    expect(cageAfter.status).toBe('Available');
    expect(closedAssignment.releasedAt).toBeTruthy();
  });
});

