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

module.exports = { getMyProfile };

