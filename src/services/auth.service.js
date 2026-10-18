const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { PHONE_REGEX } = require('../validators/auth.validator');

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const toPublicUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  phone: user.phone,
  email: user.email,
  role: user.role,
  status: user.status,
});

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

// Tự đăng ký luôn là PetOwner; tài khoản nhân viên do Admin tạo.
const register = async ({ fullName, phone, email, password }) => {
  phone = phone.trim();
  email = email ? email.trim().toLowerCase() : undefined;

  if (await User.exists({ phone })) throw httpError(409, 'Số điện thoại đã được đăng ký');
  if (email && (await User.exists({ email }))) throw httpError(409, 'Email đã được đăng ký');

  try {
    const user = await User.create({
      fullName: fullName.trim(),
      phone,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'PetOwner',
    });
    return toPublicUser(user);
  } catch (err) {
    // 2 request đăng ký cùng lúc vượt qua check ở trên → unique index chặn
    if (err.code === 11000) throw httpError(409, 'Số điện thoại hoặc email đã được đăng ký');
    throw err;
  }
};

// identifier = số điện thoại hoặc email
const login = async ({ identifier, password }) => {
  identifier = identifier.trim();
  const query = PHONE_REGEX.test(identifier) ? { phone: identifier } : { email: identifier.toLowerCase() };

  const user = await User.findOne(query).select('+passwordHash');
  // Không phân biệt "sai tài khoản" hay "sai mật khẩu" để tránh dò tài khoản
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw httpError(401, 'Thông tin đăng nhập không chính xác');
  }
  if (user.status === 'Locked') throw httpError(403, 'Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên');
  if (user.status === 'Inactive') throw httpError(403, 'Tài khoản đã ngừng hoạt động');

  return { token: generateToken(user), user: toPublicUser(user) };
};

module.exports = { register, login };
