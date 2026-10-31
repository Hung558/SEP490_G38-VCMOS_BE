// Test chức năng Quản trị tài khoản nhân sự & người dùng của Admin (SCR-32: UC-60, UC-61, UC-62, BR-22)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../src/models/User');
const Pet = require('../src/models/Pet');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';
const ownerData = { fullName: 'Nguyen Van A', phone: '0901234567', email: 'a@mail.com', password: 'password123' };

let adminUser;
let adminToken;
let petOwnerToken;
let petOwnerId;
let createdStaffId;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  await Pet.syncIndexes();

  // Tạo 1 tài khoản PetOwner qua luồng đăng ký thường
  const registerRes = await request(app).post('/api/auth/register').send(ownerData);
  petOwnerId = registerRes.body.user._id;
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: ownerData.phone, password: ownerData.password });
  petOwnerToken = loginRes.body.token;

  // Tạo 1 tài khoản Admin
  adminUser = await User.create({
    code: 'USR-ADMIN1',
    fullName: 'Quan Tri Vien',
    phone: '0988888888',
    email: 'admin@vcmos.vn',
    role: 'Admin',
    status: 'Active',
  });
  adminToken = jwt.sign({ id: adminUser._id, role: 'Admin' }, process.env.JWT_SECRET);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Admin Account Management (/api/admin/users - SCR-32, UC-60/61/62, BR-22)', () => {
  test('chưa đăng nhập (401) hoặc không phải Admin (403) thì bị chặn ở mọi API quản trị', async () => {
    const noAuth = await request(app).get('/api/admin/users');
    expect(noAuth.status).toBe(401);

    const petOwnerRes = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${petOwnerToken}`);
    expect(petOwnerRes.status).toBe(403);
  });

  test('POST /api/admin/users (UC-61): tạo tài khoản nhân sự thành công, tự sinh mã USR-XXXXXX và đăng nhập được', async () => {
    const res = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'BS Tran Minh',
        phone: '0977111222',
        email: 'VetMinh@vcmos.vn',
        password: 'staffpassword123',
        role: 'Veterinarian',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      fullName: 'BS Tran Minh',
      phone: '0977111222',
      email: 'vetminh@vcmos.vn',
      role: 'Veterinarian',
      status: 'Active',
    });
    expect(res.body.user.code).toMatch(/^USR-[A-Z0-9]{6}$/);
    expect(res.body.user.passwordHash).toBeUndefined();
    createdStaffId = res.body.user._id;

    // Nhân sự vừa tạo có thể đăng nhập bằng SĐT và mật khẩu tạm thời
    const loginStaff = await request(app)
      .post('/api/auth/login')
      .send({ identifier: '0977111222', password: 'staffpassword123' });
    expect(loginStaff.status).toBe(200);
    expect(loginStaff.body.user.role).toBe('Veterinarian');
  });

  test('POST /api/admin/users: báo lỗi 400 nếu tạo sai role (vd PetOwner/Admin) hoặc thiếu dữ liệu, 409 nếu trùng SĐT/email', async () => {
    const badRole = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Khach Hang',
        phone: '0977333444',
        password: 'staffpassword123',
        role: 'PetOwner',
      });
    expect(badRole.status).toBe(400);
    expect(badRole.body.errors.role).toBeTruthy();

    const duplicatePhone = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Le Tan Trung SDT',
        phone: '0977111222',
        password: 'staffpassword123',
        role: 'Receptionist',
      });
    expect(duplicatePhone.status).toBe(409);

    const duplicateEmail = await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Le Tan Trung Email',
        phone: '0977555666',
        email: 'vetminh@vcmos.vn',
        password: 'staffpassword123',
        role: 'Receptionist',
      });
    expect(duplicateEmail.status).toBe(409);
  });

  test('GET /api/admin/users (UC-60): xem danh sách, lọc theo role/status và tìm kiếm theo từ khóa', async () => {
    const allRes = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(allRes.status).toBe(200);
    expect(allRes.body.users.length).toBeGreaterThanOrEqual(3);
    expect(allRes.body.users[0].passwordHash).toBeUndefined();

    const filterRole = await request(app)
      .get('/api/admin/users?role=Veterinarian&status=Active')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filterRole.status).toBe(200);
    expect(filterRole.body.users).toHaveLength(1);
    expect(filterRole.body.users[0].phone).toBe('0977111222');

    const searchRes = await request(app)
      .get('/api/admin/users?search=0977111222')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.users).toHaveLength(1);

    const invalidFilter = await request(app)
      .get('/api/admin/users?role=InvalidRole')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(invalidFilter.status).toBe(400);
  });

  test('GET /api/admin/users/:id: xem chi tiết tài khoản (kèm danh sách pets nếu là PetOwner)', async () => {
    const staffDetail = await request(app)
      .get(`/api/admin/users/${createdStaffId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(staffDetail.status).toBe(200);
    expect(staffDetail.body.user.fullName).toBe('BS Tran Minh');

    const ownerDetail = await request(app)
      .get(`/api/admin/users/${petOwnerId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ownerDetail.status).toBe(200);
    expect(Array.isArray(ownerDetail.body.user.pets)).toBe(true);

    const badId = await request(app)
      .get('/api/admin/users/invalid-id')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badId.status).toBe(400);

    const notFound = await request(app)
      .get(`/api/admin/users/${new mongoose.Types.ObjectId()}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(notFound.status).toBe(404);
  });

  test('PUT /api/admin/users/:id: cập nhật họ tên và điều chuyển vai trò nhân sự (không đổi phone/email)', async () => {
    const updateRes = await request(app)
      .put(`/api/admin/users/${createdStaffId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: 'Tran Minh Cap Nhat',
        role: 'Groomer',
        phone: '0999999999', // Gửi thử phone/email nhưng BE sẽ bỏ qua để bảo vệ định danh đăng nhập
        email: 'hacked@vcmos.vn',
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user).toMatchObject({
      fullName: 'Tran Minh Cap Nhat',
      phone: '0977111222',
      email: 'vetminh@vcmos.vn',
      role: 'Groomer',
    });

    // Không cho phép đổi role của tài khoản PetOwner sang nhân viên
    const changeOwnerRole = await request(app)
      .put(`/api/admin/users/${petOwnerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fullName: ownerData.fullName,
        role: 'Receptionist',
      });
    expect(changeOwnerRole.status).toBe(400);
  });

  test('PATCH /api/admin/users/:id/status (UC-62): khóa & mở khóa tài khoản, chặn Admin tự khóa chính mình', async () => {
    // 1. Khóa tài khoản nhân sự
    const lockRes = await request(app)
      .patch(`/api/admin/users/${createdStaffId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Locked' });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.user.status).toBe('Locked');

    // Nhân sự bị khóa không thể đăng nhập (403)
    const loginLocked = await request(app)
      .post('/api/auth/login')
      .send({ identifier: '0977111222', password: 'staffpassword123' });
    expect(loginLocked.status).toBe(403);

    // 2. Mở khóa tài khoản
    const unlockRes = await request(app)
      .patch(`/api/admin/users/${createdStaffId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Active' });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.user.status).toBe('Active');

    // 3. Chặn Admin tự khóa tài khoản của chính mình
    const selfLock = await request(app)
      .patch(`/api/admin/users/${adminUser._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Locked' });
    expect(selfLock.status).toBe(400);

    // 4. Chặn truyền status = Inactive (Admin chỉ được Active hoặc Locked)
    const inactiveAttempt = await request(app)
      .patch(`/api/admin/users/${createdStaffId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' });
    expect(inactiveAttempt.status).toBe(400);
    expect(inactiveAttempt.body.message).toBe('Trạng thái chỉ được là Active hoặc Locked');
    expect(inactiveAttempt.body.errors.status).toBe('Trạng thái chỉ được là Active hoặc Locked');
  });

  test('DELETE /api/admin/users/:id (BR-22): cấm xóa vật lý tài khoản người dùng', async () => {
    const delRes = await request(app)
      .delete(`/api/admin/users/${createdStaffId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(403);

    // Tài khoản vẫn còn nguyên trong DB
    const stillExists = await User.findById(createdStaffId).lean();
    expect(stillExists).toBeTruthy();
  });
});

