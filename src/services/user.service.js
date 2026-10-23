const User = require('../models/User');

// Tạo lỗi có kèm mã HTTP để controller biết trả status nào
const httpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// Chỉ lấy các field được phép hiển thị (passwordHash đã có select: false trong model)
const PROFILE_FIELDS = 'code fullName phone email role status createdAt';

const getMyProfile = async (userId) => {
  const user = await User.findById(userId).select(PROFILE_FIELDS).lean();

  // Token vẫn hợp lệ nhưng tài khoản đã bị xoá khỏi DB
  if (!user) {
    throw httpError(404, 'Không tìm thấy người dùng');
  }

  return user;
};

/**
 * Cập nhật thông tin cá nhân.
 * - Field nào là undefined thì giữ nguyên.
 * - email = '' hoặc null nghĩa là xoá email (phù hợp với partial unique index).
 */
const updateMyProfile = async (userId, fullName, phone, email) => {
  const update = { $set: {}, $unset: {} };

  if (fullName !== undefined) update.$set.fullName = fullName;
  if (phone !== undefined) update.$set.phone = phone;

  if (email !== undefined) {
    if (email) update.$set.email = email;
    else update.$unset.email = 1; // empty/null -> remove email (partial unique index only covers strings)
  }

  if (!Object.keys(update.$set).length) delete update.$set;
  if (!Object.keys(update.$unset).length) delete update.$unset;

  try {
    const user = await User.findByIdAndUpdate(userId, update, { new: true })
      .select(PROFILE_FIELDS)
      .lean();

    if (!user) {
      throw httpError(404, 'Không tìm thấy người dùng');
    }

    return user;
  } catch (error) {
    // Trùng phone hoặc email (unique index)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const label = field === 'email' ? 'Email' : 'Số điện thoại';
      throw httpError(409, `${label} đã được sử dụng`);
    }
    throw error;
  }
};

module.exports = { getMyProfile, updateMyProfile };
