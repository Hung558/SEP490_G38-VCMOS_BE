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

    const tooLong = await updateProfile({ fullName: 'A'.repeat(101), phone: owner.phone });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.errors.fullName).toBeTruthy();
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

describe('Email verification (/api/users/me/email/*)', () => {
  test('chưa có email mà bấm gửi OTP → 400', async () => {
    // Ở test cuối của PUT /me ở trên, email của owner đã bị xoá
    const res = await request(app)
      .post('/api/users/me/email/send-otp')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Tài khoản chưa cập nhật địa chỉ email');
  });

  test('cập nhật email → gửi OTP → nhập sai OTP (400) → nhập đúng OTP (200, isEmailVerified = true)', async () => {
    // 1. Cập nhật lại email cho owner
    await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Nguyen Van A Moi', phone: '0909999999', email: 'verify@mail.com' });

    // 2. Yêu cầu gửi mã OTP
    const sendRes = await request(app)
      .post('/api/users/me/email/send-otp')
      .set('Authorization', `Bearer ${token}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.devToken).toMatch(/^\d{6}$/);

    // 3. Nhập sai định dạng OTP → 400
    const badFormat = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: '123' });
    expect(badFormat.status).toBe(400);

    // 4. Nhập sai mã OTP → 400
    const wrongOtp = sendRes.body.devToken === '000000' ? '111111' : '000000';
    const wrongRes = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: wrongOtp });
    expect(wrongRes.status).toBe(400);

    // 5. Nhập đúng mã OTP → 200 và isEmailVerified = true
    const verifyRes = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: sendRes.body.devToken });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.isEmailVerified).toBe(true);
    expect(verifyRes.body.user.emailOtpHash).toBeUndefined();
  });

  test('email đã xác thực rồi mà gọi gửi OTP hoặc verify lần nữa → 400', async () => {
    const sendAgain = await request(app)
      .post('/api/users/me/email/send-otp')
      .set('Authorization', `Bearer ${token}`);
    expect(sendAgain.status).toBe(400);

    const verifyAgain = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: '123456' });
    expect(verifyAgain.status).toBe(400);
  });

  test('đổi sang email mới → isEmailVerified tự động reset về false', async () => {
    const res = await request(app)
      .put('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Nguyen Van A Moi', phone: '0909999999', email: 'another@mail.com' });
    expect(res.status).toBe(200);
    expect(res.body.user.isEmailVerified).toBe(false);
  });
});

describe('Forgot Password & Change Password via verified Email OTP', () => {
  const verifiedEmail = 'another@mail.com';

  test('email chưa verify thì KHÔNG được dùng forgot-password hoặc change-password → 400', async () => {
    // Hiện tại another@mail.com của owner đang có isEmailVerified = false
    const forgotRes = await request(app).post('/api/users/forgot-password').send({ email: verifiedEmail });
    expect(forgotRes.status).toBe(400);

    const changeOtpRes = await request(app)
      .post('/api/users/me/password/send-otp')
      .set('Authorization', `Bearer ${token}`);
    expect(changeOtpRes.status).toBe(400);
  });

  test('sau khi verify email → đổi mật khẩu (send-otp + PUT /me/password) thành công', async () => {
    // 1. Verify email another@mail.com trước
    const sendVerify = await request(app)
      .post('/api/users/me/email/send-otp')
      .set('Authorization', `Bearer ${token}`);
    await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ otp: sendVerify.body.devToken });

    // 2. Gửi OTP đổi mật khẩu
    const sendPwdOtp = await request(app)
      .post('/api/users/me/password/send-otp')
      .set('Authorization', `Bearer ${token}`);
    expect(sendPwdOtp.status).toBe(200);
    expect(sendPwdOtp.body.devToken).toMatch(/^\d{6}$/);

    // 3. Nhập sai mật khẩu cũ → 400
    const wrongOldPwd = await request(app)
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        otp: sendPwdOtp.body.devToken,
        currentPassword: 'wrong_old_password',
        newPassword: 'newpassword123',
      });
    expect(wrongOldPwd.status).toBe(400);
    expect(wrongOldPwd.body.message).toBe('Mật khẩu hiện tại không chính xác');

    // 4. Nhập đúng mật khẩu cũ + đúng OTP → 200
    const changeRes = await request(app)
      .put('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        otp: sendPwdOtp.body.devToken,
        currentPassword: owner.password,
        newPassword: 'newpassword123',
      });
    expect(changeRes.status).toBe(200);

    // 5. Đăng nhập bằng mật khẩu mới thành công
    const loginNew = await request(app)
      .post('/api/auth/login')
      .send({ identifier: verifiedEmail, password: 'newpassword123' });
    expect(loginNew.status).toBe(200);
  });

  test('quên mật khẩu (forgot-password + reset-password) qua email đã verify thành công', async () => {
    // 1. Yêu cầu OTP quên mật khẩu
    const forgotRes = await request(app)
      .post('/api/users/forgot-password')
      .send({ email: verifiedEmail });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.devToken).toMatch(/^\d{6}$/);

    // 2. Đặt lại mật khẩu mới (truyền field "token" giống FE ForgotPasswordForm.tsx)
    const resetRes = await request(app)
      .post('/api/users/reset-password')
      .send({
        email: verifiedEmail,
        token: forgotRes.body.devToken,
        password: 'resetpassword456',
      });
    expect(resetRes.status).toBe(200);

    // 3. Đăng nhập bằng mật khẩu vừa reset thành công
    const loginAfterReset = await request(app)
      .post('/api/auth/login')
      .send({ identifier: verifiedEmail, password: 'resetpassword456' });
    expect(loginAfterReset.status).toBe(200);
  });
});
