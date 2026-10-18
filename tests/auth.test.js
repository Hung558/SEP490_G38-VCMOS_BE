// Test auth trên MongoDB LOCAL (không dùng MONGO_URI/Atlas). Cần mongod chạy ở máy.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../src/models/User');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';
const owner = { fullName: 'Nguyen Van A', phone: '0901234567', email: 'A@Mail.com', password: 'password123' };

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
});
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Auth', () => {
  test('register: thành công, role luôn là PetOwner, không trả passwordHash', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...owner, role: 'Admin' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'PetOwner', email: 'a@mail.com' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('register: email optional, nhiều user không có email vẫn đăng ký được', async () => {
    const noEmail = [
      { fullName: 'B', phone: '0911111111', password: 'password123' },
      { fullName: 'C', phone: '0922222222', email: '', password: 'password123' },
      { fullName: 'D', phone: '0933333333', email: null, password: 'password123' },
    ];
    for (const body of noEmail) {
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status).toBe(201);
      expect(res.body.user.email).toBeUndefined();
    }
  });

  test('register: validate input', async () => {
    const res = await request(app).post('/api/auth/register').send({ phone: '123', password: '1' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(['fullName', 'password', 'phone']);
  });

  test('register: trùng phone / email → 409', async () => {
    expect((await request(app).post('/api/auth/register').send(owner)).status).toBe(409);
    const dupEmail = { ...owner, phone: '0907654321', email: 'a@mail.com' };
    expect((await request(app).post('/api/auth/register').send(dupEmail)).status).toBe(409);
  });

  test('login bằng phone và email (không phân biệt hoa thường)', async () => {
    for (const identifier of [owner.phone, 'a@MAIL.com']) {
      const res = await request(app).post('/api/auth/login').send({ identifier, password: owner.password });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    }
  });

  test('login sai mật khẩu / không tồn tại → 401 cùng message', async () => {
    const a = await request(app).post('/api/auth/login').send({ identifier: owner.phone, password: 'wrongpass' });
    const b = await request(app).post('/api/auth/login').send({ identifier: '0999999999', password: 'wrongpass' });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.message).toBe(b.body.message);
  });

  test('login tài khoản bị khoá → 403', async () => {
    await User.updateOne({ phone: owner.phone }, { status: 'Locked' });
    const res = await request(app).post('/api/auth/login').send({ identifier: owner.phone, password: owner.password });
    expect(res.status).toBe(403);
    await User.updateOne({ phone: owner.phone }, { status: 'Active' });
  });

  test('logout: cần token hợp lệ', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401);
    expect((await request(app).post('/api/auth/logout').set('Authorization', 'Bearer abc')).status).toBe(401);

    const { body } = await request(app).post('/api/auth/login').send({ identifier: owner.phone, password: owner.password });
    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${body.token}`);
    expect(res.status).toBe(200);
  });
});
