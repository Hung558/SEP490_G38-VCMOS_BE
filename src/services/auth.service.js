const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { PHONE_REGEX } = require('../validators/auth.validator');
const crypto = require('crypto');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toPublicUser = (user) => ({
  _id: user._id,
  code: user.code,
  fullName: user.fullName,
  phone: user.phone,
  email: user.email,
  isEmailVerified: Boolean(user.isEmailVerified),
  role: user.role,
  status: user.status,
});

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

const generateUserCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `USR-${suffix}`; // ví dụ: USR-K7M2QX
};

// Kiểm tra lỗi trùng khoá (11000) có phải rơi vào đúng field đang cần kiểm tra không
const isDuplicateOn = (err, field) => {
  if (err.code !== 11000) return false;
  if (err.keyPattern) return field in err.keyPattern;
  return String(err.message).includes(`${field}_1`);
};

// Tự đăng ký luôn là PetOwner; tài khoản nhân viên do Admin tạo.
// Theo BR-04 (UC-02 Flow 5a): Nếu SĐT thuộc về tài khoản khách vãng lai tại quầy (PetOwner, status = 'Inactive', passwordHash = null),
// hệ thống tự động kích hoạt tài khoản đó lên 'Active' và đặt mật khẩu để khách giữ nguyên hồ sơ thú cưng & lịch sử khám trước đó.
const register = async ({ fullName, phone, email, password }) => {
  phone = phone.trim();
  email = email ? email.trim().toLowerCase() : undefined;

  if (await User.exists({ phone })) {
    const findQuery = User.findOne ? User.findOne({ phone }) : null;
    const existingUser =
      findQuery && typeof findQuery.select === 'function'
        ? await findQuery.select('+passwordHash')
        : null;

    const isWalkInInactiveAccount =
      existingUser &&
      existingUser.role === 'PetOwner' &&
      existingUser.status === 'Inactive' &&
      !existingUser.passwordHash;

    if (!isWalkInInactiveAccount) {
      throw httpError(409, 'Số điện thoại đã được đăng ký');
    }

    // Kiểm tra email mới (nếu có nhập) chưa bị tài khoản khác sử dụng
    if (email) {
      const emailTaken = await User.exists({ email, _id: { $ne: existingUser._id } });
      if (emailTaken) throw httpError(409, 'Email đã được đăng ký');
    }

    existingUser.fullName = fullName.trim();
    if (email) {
      existingUser.email = email;
    }
    existingUser.passwordHash = await bcrypt.hash(password, 10);
    existingUser.status = 'Active';

    try {
      await existingUser.save();
      return toPublicUser(existingUser);
    } catch (err) {
      if (err.code === 11000) throw httpError(409, 'Số điện thoại hoặc email đã được đăng ký');
      throw err;
    }
  }

  if (email && (await User.exists({ email }))) throw httpError(409, 'Email đã được đăng ký');

  const passwordHash = await bcrypt.hash(password, 10);

  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const user = await User.create({
        code: generateUserCode(),
        fullName: fullName.trim(),
        phone,
        email,
        passwordHash,
        role: 'PetOwner',
      });
      return toPublicUser(user);
    } catch (err) {
      if (isDuplicateOn(err, 'code')) continue;

      // 2 request đăng ký cùng lúc vượt qua check ở trên → unique index chặn
      if (err.code === 11000) throw httpError(409, 'Số điện thoại hoặc email đã được đăng ký');
      throw err;
    }
  }

  throw httpError(500, 'Không thể tạo mã người dùng, vui lòng thử lại');
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 phút (BR-03, MSG12)

// identifier = số điện thoại hoặc email
const login = async ({ identifier, password }) => {
  identifier = identifier.trim();
  const query = PHONE_REGEX.test(identifier) ? { phone: identifier } : { email: identifier.toLowerCase() };

  const user = await User.findOne(query).select('+passwordHash');

  // BR-03 (MSG12): Kiểm tra nếu tài khoản đang trong thời gian bị tạm khóa 30 phút do sai mật khẩu 5 lần
  if (user && user.lockUntil && new Date(user.lockUntil) > new Date()) {
    throw httpError(
      403,
      'Bạn đã nhập sai mật khẩu quá 5 lần liên tiếp. Tài khoản đang bị tạm khóa trong 30 phút'
    );
  }

  // Không phân biệt "sai tài khoản" hay "sai mật khẩu" để tránh dò tài khoản
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    if (user && user.passwordHash) {
      const nextAttempts = (user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = nextAttempts;

      if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        if (typeof user.save === 'function') await user.save();
        throw httpError(
          403,
          'Bạn đã nhập sai mật khẩu 5 lần liên tiếp. Tài khoản bị tạm khóa trong 30 phút'
        );
      }

      if (typeof user.save === 'function') await user.save();
    }
    throw httpError(401, 'Thông tin đăng nhập không chính xác');
  }
  if (user.status === 'Locked') throw httpError(403, 'Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên');
  if (user.status === 'Inactive') throw httpError(403, 'Tài khoản đã ngừng hoạt động');

  // Đăng nhập thành công -> đặt lại bộ đếm số lần sai mật khẩu về 0
  if (user.failedLoginAttempts > 0 || user.lockUntil) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    if (typeof user.save === 'function') await user.save();
  }

  return { token: generateToken(user), user: toPublicUser(user) };
};

module.exports = { register, login, generateUserCode };
