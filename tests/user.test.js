// Test profile trên MongoDB LOCAL (không dùng MONGO_URI/Atlas). Cần mongod chạy ở máy.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../src/models/User');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';
const owner = { fullName: 'Nguyen Van A', phone: '0901234567', email: 'a@mail.com', password: 'password123' };

let token;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();

  // Tạo user qua API đăng ký rồi login để lấy token thật
  await request(app).post('/api/auth/register').send(owner);
  const res = await request(app).post('/api/auth/login').send({ identifier: owner.phone, password: owner.password });
  token = res.body.token;
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('GET /api/users/me', () => {
  test('có token → trả profile của chính mình, không có passwordHash', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      fullName: owner.fullName,
      phone: owner.phone,
      email: owner.email,
      role: 'PetOwner',
      status: 'Active',
    });
    expect(res.body.user.code).toBeTruthy();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('không có token → 401', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  test('token của user đã bị xoá → 404', async () => {
    const deletedUserId = new mongoose.Types.ObjectId();
    const ghostToken = jwt.sign({ id: deletedUserId, role: 'PetOwner' }, process.env.JWT_SECRET);
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${ghostToken}`);
    expect(res.status).toBe(404);
  });
});


// Các test dưới chạy tuần tự và dùng chung user "owner" ở trên (đã đăng ký trong beforeAll)
describe('PUT /api/users/me', () => {
  const otherUser = { fullName: 'Tran Thi B', phone: '0912345678', email: 'b@mail.com', password: 'password123' };

  beforeAll(async () => {
    // Tạo thêm 1 user khác để test trùng SĐT / email
    await request(app).post('/api/auth/register').send(otherUser);
  });

  const updateProfile = (body) =>
    request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`).send(body);

  test('không có token → 401', async () => {
    const res = await request(app).put('/api/users/me').send({ fullName: 'X', phone: '0900000000' });
    expect(res.status).toBe(401);
  });

  test('không gửi body → 400 (không phải 500)', async () => {
    const res = await request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['fullName', 'phone']);
  });

  test('dữ liệu sai → 400 kèm lỗi từng field', async () => {
    const res = await updateProfile({ fullName: '   ', phone: '123', email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['email', 'fullName', 'phone']);
  });

  test('trùng SĐT của người khác → 409', async () => {
    const res = await updateProfile({ fullName: owner.fullName, phone: otherUser.phone });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Số điện thoại đã được sử dụng');
  });

  test('trùng email của người khác → 409', async () => {
    const res = await updateProfile({ fullName: owner.fullName, phone: owner.phone, email: otherUser.email });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email đã được sử dụng');
  });

  test('cập nhật thành công, không đổi được role/status/code', async () => {
    const before = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    const res = await updateProfile({
      fullName: 'Nguyen Van A Moi',
      phone: '0909999999',
      email: 'New@Mail.com',
      role: 'Admin',
      status: 'Locked',
      code: 'USR-HACKED',
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      fullName: 'Nguyen Van A Moi',
      phone: '0909999999',
      email: 'new@mail.com',
      role: 'PetOwner',
      status: 'Active',
      code: before.body.user.code,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('gửi email rỗng → xoá email', async () => {
    const res = await updateProfile({ fullName: 'Nguyen Van A Moi', phone: '0909999999', email: '' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBeUndefined();
  });
});
