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

