const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Pet = require('../models/Pet');
const { generateUserCode } = require('./auth.service');
const { ALL_ROLES, STAFF_ROLES, USER_STATUSES } = require('../validators/admin.validator');

const MAX_CODE_RETRIES = 5;

// Chỉ lấy các field được phép hiển thị (không bao giờ trả passwordHash hay mã OTP)
const PROFILE_FIELDS = 'code fullName phone email isEmailVerified role status createdAt';

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// UC-60: Admin xem danh sách và tìm kiếm/lọc tất cả tài khoản người dùng & nhân sự
const getAllUsers = async ({ role, status, search } = {}) => {
  const filter = {};

  if (role !== undefined && role !== '') {
    if (!ALL_ROLES.includes(role)) {
      throw httpError(400, 'Vai trò lọc không hợp lệ');
    }
    filter.role = role;
  }

  if (status !== undefined && status !== '') {
    if (!USER_STATUSES.includes(status)) {
      throw httpError(400, 'Trạng thái lọc không hợp lệ');
    }
    filter.status = status;
  }

  if (typeof search === 'string' && search.trim() !== '') {
    // Escape các ký tự đặc biệt của biểu thức chính quy để tìm kiếm an toàn
    const escapedKeyword = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedKeyword, 'i');
    filter.$or = [
      { fullName: searchRegex },
      { phone: searchRegex },
      { email: searchRegex },
      { code: searchRegex },
    ];
  }

  return User.find(filter).select(PROFILE_FIELDS).sort({ createdAt: -1 }).lean();
};

// SCR-32: Admin xem chi tiết 1 tài khoản (nếu là PetOwner thì lấy kèm danh sách thú cưng)
const getUserById = async (targetUserId) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw httpError(400, 'ID người dùng không hợp lệ');
  }

  const user = await User.findById(targetUserId).select(PROFILE_FIELDS).lean();
  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  if (user.role === 'PetOwner') {
    user.pets = await Pet.find({ ownerId: user._id }).sort({ createdAt: -1 }).lean();
  }

  return user;
};

// UC-61: Admin tạo tài khoản nhân sự (Lễ tân, Bác sĩ, Groomer) và tự sinh mã USR-XXXXXX (BR-24)
const createStaffAccount = async ({ fullName, phone, email, password, role }) => {
  const normalizedPhone = phone.trim();
  const normalizedEmail = email ? email.trim().toLowerCase() : undefined;

  if (await User.exists({ phone: normalizedPhone })) {
    throw httpError(409, 'Số điện thoại đã được đăng ký');
  }
  if (normalizedEmail && (await User.exists({ email: normalizedEmail }))) {
    throw httpError(409, 'Email đã được đăng ký');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const created = await User.create({
        code: generateUserCode(),
        fullName: fullName.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        passwordHash,
        role,
        status: 'Active',
      });

      return User.findById(created._id).select(PROFILE_FIELDS).lean();
    } catch (error) {
      // Nếu trùng mã code ngẫu nhiên thì thử sinh lại mã khác
      if (error.code === 11000 && error.keyPattern && error.keyPattern.code) {
        continue;
      }
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0];
        const label = duplicateField === 'email' ? 'Email' : 'Số điện thoại';
        throw httpError(409, `${label} đã được đăng ký`);
      }
      throw error;
    }
  }

  throw httpError(500, 'Không thể tạo mã nhân viên, vui lòng thử lại');
};

// SCR-32: Admin cập nhật thông tin hành chính của tài khoản (chỉ sửa fullName và điều chuyển role nhân sự;
// không can thiệp vào phone/email vì đó là định danh đăng nhập và gắn với xác thực OTP chính chủ)
const updateUserByAdmin = async (targetUserId, { fullName, role }) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw httpError(400, 'ID người dùng không hợp lệ');
  }

  const currentUser = await User.findById(targetUserId).select('role').lean();
  if (!currentUser) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  if (role !== undefined && role !== currentUser.role) {
    if (!STAFF_ROLES.includes(currentUser.role)) {
      throw httpError(400, 'Chỉ được phép thay đổi vai trò của tài khoản nhân viên');
    }
  }

  const fieldsToSet = {
    fullName: fullName.trim(),
  };

  if (role !== undefined) {
    fieldsToSet.role = role;
  }

  return User.findByIdAndUpdate(
    targetUserId,
    { $set: fieldsToSet },
    { returnDocument: 'after' }
  )
    .select(PROFILE_FIELDS)
    .lean();
};

// UC-62 & BR-22: Admin khóa (Locked) hoặc mở khóa (Active) tài khoản (không xóa vật lý)
const updateUserStatus = async (adminId, targetUserId, status) => {
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw httpError(400, 'ID người dùng không hợp lệ');
  }

  // Không cho Admin tự khóa tài khoản của chính mình
  if (String(adminId) === String(targetUserId) && status === 'Locked') {
    throw httpError(400, 'Không thể tự khóa tài khoản của chính mình');
  }

  const user = await User.findByIdAndUpdate(
    targetUserId,
    { $set: { status } },
    { returnDocument: 'after' }
  )
    .select(PROFILE_FIELDS)
    .lean();

  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  return user;
};

module.exports = {
  getAllUsers,
  getUserById,
  createStaffAccount,
  updateUserByAdmin,
  updateUserStatus,
};

