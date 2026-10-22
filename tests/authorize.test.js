// Test middleware phân quyền. Không cần DB: tự tạo token và 1 app Express nhỏ chỉ để test.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { protect, authorize } = require('../src/middlewares/auth.middleware');

const app = express();
app.get('/admin-only', protect, authorize('Admin'), (req, res) => res.json({ message: 'ok' }));
app.get('/staff', protect, authorize('Admin', 'Receptionist'), (req, res) => res.json({ message: 'ok' }));
// Route cố tình quên protect để kiểm tra authorize vẫn chặn
app.get('/missing-protect', authorize('Admin'), (req, res) => res.json({ message: 'ok' }));

const tokenOf = (role) => jwt.sign({ id: 'user-id', role }, process.env.JWT_SECRET);

describe('authorize middleware', () => {
  test('đúng role → cho đi tiếp (200)', async () => {
    const res = await request(app).get('/admin-only').set('Authorization', `Bearer ${tokenOf('Admin')}`);
    expect(res.status).toBe(200);
  });

  test('cho phép nhiều role', async () => {
    for (const role of ['Admin', 'Receptionist']) {
      const res = await request(app).get('/staff').set('Authorization', `Bearer ${tokenOf(role)}`);
      expect(res.status).toBe(200);
    }
  });

  test('sai role → 403', async () => {
    const res = await request(app).get('/staff').set('Authorization', `Bearer ${tokenOf('PetOwner')}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBeTruthy();
  });

  test('không có token → 401 (protect chặn trước)', async () => {
    const res = await request(app).get('/admin-only');
    expect(res.status).toBe(401);
  });

  test('quên gắn protect → 401', async () => {
    const res = await request(app).get('/missing-protect');
    expect(res.status).toBe(401);
  });
});

