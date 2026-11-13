// Test tính năng Tiếp nhận khách vãng lai tại quầy (Walk-in & BR-04) trên MongoDB LOCAL (vcmos_test)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const Cage = require('../src/models/Cage');
const CageAssignment = require('../src/models/CageAssignment');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

let receptionistToken;
let petOwnerToken;
let vetUser;
let groomerUser;
let medicalService;
let groomingService;
let availableCage;

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    Pet.syncIndexes(),
    Service.syncIndexes(),
    Cage.syncIndexes(),
    CageAssignment.syncIndexes(),
    AppointmentOrder.syncIndexes(),
    AppointmentService.syncIndexes(),
  ]);

  const passwordHash = await bcrypt.hash('password123', 10);

  const [receptionist, petOwner, vet, groomer] = await User.create([
    {
      code: 'USR-REC001',
      fullName: 'Lễ Tân Quầy 1',
      phone: '0901000001',
      passwordHash,
      role: 'Receptionist',
      status: 'Active',
    },
    {
      code: 'USR-OWN001',
      fullName: 'Chủ Nuôi Online',
      phone: '0901000002',
      passwordHash,
      role: 'PetOwner',
      status: 'Active',
    },
    {
      code: 'USR-VET001',
      fullName: 'BS. Nguyễn Văn Minh',
      phone: '0901000003',
      passwordHash,
      role: 'Veterinarian',
      status: 'Active',
    },
    {
      code: 'USR-GRM001',
      fullName: 'NV Spa Lê Thị Hoa',
      phone: '0901000004',
      passwordHash,
      role: 'Groomer',
      status: 'Active',
    },
  ]);

  receptionistToken = signToken(receptionist);
  petOwnerToken = signToken(petOwner);
  vetUser = vet;
  groomerUser = groomer;

  [medicalService, groomingService] = await Service.create([
    {
      code: 'SRV-MED001',
      name: 'Khám tổng quát thú y',
      category: 'Examination',
      basePrice: 150000,
      defaultDuration: 30,
      status: 'Active',
    },
    {
      code: 'SRV-GRM001',
      name: 'Tắm và cắt tỉa lông',
      category: 'Grooming',
      basePrice: 250000,
      defaultDuration: 60,
      status: 'Active',
    },
  ]);

  availableCage = await Cage.create({
    label: 'CAG-S01',
    size: 'S',
    isIsolated: false,
    status: 'Available',
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Walk-in Customer Reception & BR-04 Activation (/api/appointment-orders/walk-in)', () => {
  const walkInPhone = '0988111222';
  let createdCustomerId;
  let createdCustomerCode;
  let createdPetId;

  describe('1. Tra cứu khách hàng theo SĐT (GET /customer-lookup - UC-20)', () => {
    test('Chặn truy cập nếu chưa đăng nhập (401) hoặc không phải Lễ tân/Admin (403)', async () => {
      const noAuth = await request(app).get(
        `/api/appointment-orders/walk-in/customer-lookup?phone=${walkInPhone}`
      );
      expect(noAuth.status).toBe(401);

      const forbidden = await request(app)
        .get(`/api/appointment-orders/walk-in/customer-lookup?phone=${walkInPhone}`)
        .set('Authorization', `Bearer ${petOwnerToken}`);
      expect(forbidden.status).toBe(403);
    });

    test('Validate định dạng SĐT khi tra cứu → 400', async () => {
      const res = await request(app)
        .get('/api/appointment-orders/walk-in/customer-lookup?phone=12345')
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(400);
      expect(res.body.errors.phone).toBeTruthy();
    });

    test('SĐT chưa có trong hệ thống → trả về found = false, customer = null, pets = []', async () => {
      const res = await request(app)
        .get(`/api/appointment-orders/walk-in/customer-lookup?phone=${walkInPhone}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        found: false,
        customer: null,
        pets: [],
      });
    });

    test('SĐT thuộc về nhân sự nội bộ (Veterinarian) → 409', async () => {
      const res = await request(app)
        .get(`/api/appointment-orders/walk-in/customer-lookup?phone=${vetUser.phone}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(409);
    });
  });

  describe('2. Đăng ký khám vãng lai tại quầy cho khách mới (POST /walk-in - UC-19, UC-21, BR-04)', () => {
    test('Validate dữ liệu thiếu hoặc sai định dạng → 400', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: 'invalid',
          services: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.phone).toBeTruthy();
      expect(res.body.errors.pet).toBeTruthy();
      expect(res.body.errors.services).toBeTruthy();
    });

    test('Khách mới hoàn toàn nhưng không nhập họ tên (fullName) → 400', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: walkInPhone,
          petInfo: { name: 'Milo', species: 'Chó', weight: 4.5 },
          services: [{ serviceId: String(medicalService._id) }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/họ tên/i);
    });

    test('Tiếp nhận khách vãng lai mới + thú cưng mới + phân công Bác sĩ + gán chuồng → 201', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: walkInPhone,
          fullName: 'Trần Thị Khách Vãng Lai',
          petInfo: {
            name: 'Milo',
            species: 'Chó',
            breed: 'Poodle',
            weight: 4.5,
            coatColor: 'Nâu đỏ',
          },
          note: 'Khách đưa bé đến khám trực tiếp tại quầy',
          services: [
            {
              serviceId: String(medicalService._id),
              assignedStaffId: String(vetUser._id),
              isEmergency: true,
            },
            {
              serviceId: String(groomingService._id),
            },
          ],
          cageId: String(availableCage._id),
        });

      expect(res.status).toBe(201);
      const { data } = res.body;

      // 1. Kiểm tra tài khoản Inactive được tạo tự động theo BR-04
      expect(data.isNewCustomer).toBe(true);
      expect(data.customer).toMatchObject({
        fullName: 'Trần Thị Khách Vãng Lai',
        phone: walkInPhone,
        role: 'PetOwner',
        status: 'Inactive',
      });
      expect(data.customer.code).toMatch(/^USR-[A-Z0-9]{6}$/);

      const dbUser = await User.findById(data.customer._id).select('+passwordHash').lean();
      expect(dbUser.passwordHash).toBeNull();

      createdCustomerId = String(data.customer._id);
      createdCustomerCode = data.customer.code;

      // 2. Kiểm tra hồ sơ thú cưng mới được tạo (UC-09)
      expect(data.isNewPet).toBe(true);
      expect(data.pet).toMatchObject({
        name: 'Milo',
        species: 'Chó',
        breed: 'Poodle',
        weight: 4.5,
        status: 'Active',
      });
      expect(data.pet.code).toMatch(/^PET-[A-Z0-9]{6}$/);
      createdPetId = String(data.pet._id);

      // 3. Kiểm tra đơn lịch hẹn Walk-in ở trạng thái CheckedIn ngay lập tức (BR-06)
      expect(data.appointment).toMatchObject({
        isOnline: false,
        derivedStatus: 'CheckedIn',
        note: 'Khách đưa bé đến khám trực tiếp tại quầy',
      });
      expect(data.appointment.code).toMatch(/^APT-[A-Z0-9]{6}$/);
      expect(data.appointment.checkedInAt).toBeTruthy();

      // 4. Kiểm tra danh sách dịch vụ: dịch vụ có assignedStaffId nhảy thẳng vào Waiting + có queueNo (BR-12)
      expect(data.services).toHaveLength(2);
      expect(data.services[0]).toMatchObject({
        sequenceNo: 1,
        status: 'Waiting',
        isEmergency: true,
        queueNo: 1,
      });
      expect(data.services[0].enqueueAt).toBeTruthy();
      expect(data.services[0].assignedStaffId.fullName).toBe(vetUser.fullName);

      // Dịch vụ thứ 2 chưa chọn nhân viên thì ở trạng thái Booked
      expect(data.services[1]).toMatchObject({
        sequenceNo: 2,
        status: 'Booked',
        queueNo: null,
      });

      // 5. Kiểm tra chuồng lưu giữ đã chuyển sang Occupied
      expect(data.cageAssignment).toBeTruthy();
      const updatedCage = await Cage.findById(availableCage._id).lean();
      expect(updatedCage.status).toBe('Occupied');
    });
  });

  describe('3. Khách cũ quay lại quầy & Tra cứu SĐT (UC-20 & UC-19)', () => {
    test('Tra cứu lại SĐT vừa tạo → trả về found = true kèm danh sách thú cưng Milo', async () => {
      const res = await request(app)
        .get(`/api/appointment-orders/walk-in/customer-lookup?phone=${walkInPhone}`)
        .set('Authorization', `Bearer ${receptionistToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.found).toBe(true);
      expect(res.body.data.customer._id).toBe(createdCustomerId);
      expect(res.body.data.pets).toHaveLength(1);
      expect(res.body.data.pets[0]._id).toBe(createdPetId);
    });

    test('Chống tạo trùng ca khám cho cùng 1 thú cưng trong cùng 1 ngày → 409', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: walkInPhone,
          petId: createdPetId,
          services: [{ serviceId: String(medicalService._id) }],
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/đã có lịch hẹn hoặc ca khám/i);
    });

    test('Khách cũ mang thú cưng thứ 2 (mới) đến khám → tái sử dụng tài khoản khách cũ, tạo thú cưng thứ 2', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: walkInPhone,
          petInfo: { name: 'Lu', species: 'Mèo', weight: 3.2 },
          services: [
            {
              serviceId: String(groomingService._id),
              assignedStaffId: String(groomerUser._id),
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isNewCustomer).toBe(false);
      expect(res.body.data.customer._id).toBe(createdCustomerId);
      expect(res.body.data.isNewPet).toBe(true);
      expect(res.body.data.pet.name).toBe('Lu');
      expect(res.body.data.services[0].status).toBe('Waiting');
      expect(res.body.data.services[0].queueNo).toBe(1);
    });
  });

  describe('4. Kích hoạt tài khoản Walk-in Inactive khi khách tự đăng ký Online (BR-04 - UC-02 Flow 5a)', () => {
    test('Khi chưa đăng ký online (passwordHash = null), khách vãng lai chưa thể đăng nhập → 401', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: walkInPhone, password: 'anypassword123' });

      expect(loginRes.status).toBe(401);
    });

    test('Khách vãng lai lên web đăng ký tài khoản bằng đúng SĐT Walk-in → Kích hoạt thành Active & giữ nguyên lịch sử thú cưng', async () => {
      // 1. Gọi POST /api/auth/register với đúng SĐT walkInPhone
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Trần Thị Khách Đã Kích Hoạt',
          phone: walkInPhone,
          email: 'walkin.activated@gmail.com',
          password: 'newpassword123',
        });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.user).toMatchObject({
        _id: createdCustomerId,
        code: createdCustomerCode,
        fullName: 'Trần Thị Khách Đã Kích Hoạt',
        phone: walkInPhone,
        email: 'walkin.activated@gmail.com',
        role: 'PetOwner',
        status: 'Active',
      });

      // 2. Đăng nhập bằng mật khẩu vừa tạo → 200
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ identifier: walkInPhone, password: 'newpassword123' });

      expect(loginRes.status).toBe(200);
      const customerToken = loginRes.body.token;

      // 3. Xem danh sách thú cưng của mình → thấy ngay cả 2 thú cưng (Milo & Lu) đã tạo tại quầy!
      const petsRes = await request(app)
        .get('/api/pets')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(petsRes.status).toBe(200);
      expect(petsRes.body.total).toBe(2);
      const petNames = petsRes.body.items.map((p) => p.name).sort();
      expect(petNames).toEqual(['Lu', 'Milo']);

      // 4. Nếu gọi đăng ký lại lần nữa khi tài khoản đã Active → chặn 409 như bình thường
      const duplicateReg = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Người Khác',
          phone: walkInPhone,
          password: 'anotherpassword123',
        });
      expect(duplicateReg.status).toBe(409);
    });
  });

  describe('Walk-in với phiếu kê khai ban đầu (intake)', () => {
    test('Trả 400 nếu truyền intake thiếu triệu chứng hoặc tình trạng lúc đến', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: '0988777666',
          fullName: 'Khách Walkin Intake Lỗi',
          petInfo: { name: 'Bông', species: 'Mèo' },
          intake: { symptoms: '   ', initialCondition: 'Tỉnh táo' },
          services: [{ serviceId: medicalService._id }],
        });

      expect(res.status).toBe(400);
      expect(res.body.errors['intake.symptoms']).toMatch(/triệu chứng/i);
    });

    test('Lưu note và intake hợp lệ khi tiếp nhận khách vãng lai tại quầy', async () => {
      const res = await request(app)
        .post('/api/appointment-orders/walk-in')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          phone: '0988777666',
          fullName: 'Khách Walkin Intake Đủ',
          petInfo: { name: 'Bông', species: 'Mèo' },
          note: '  Khách báo bé bỏ ăn 1 ngày  ',
          intake: {
            symptoms: '  Bỏ ăn, hơi sốt  ',
            initialCondition: '  Lờ đờ nhẹ, thân nhiệt 39.2 độ  ',
          },
          services: [{ serviceId: medicalService._id, assignedStaffId: vetUser._id }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.appointment.note).toBe('Khách báo bé bỏ ăn 1 ngày');
      expect(res.body.data.appointment.intake).toMatchObject({
        symptoms: 'Bỏ ăn, hơi sốt',
        initialCondition: 'Lờ đờ nhẹ, thân nhiệt 39.2 độ',
      });
      expect(res.body.data.appointment.intake.recordedBy).toBeTruthy();
      expect(res.body.data.appointment.intake.recordedAt).toBeTruthy();
    });
  });
});
