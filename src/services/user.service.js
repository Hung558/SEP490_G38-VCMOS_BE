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

// Cập nhật thông tin cá nhân: email gửi rỗng hoặc null thì xoá email khỏi document
// (để không bị đụng partial unique index của email).
const updateMyProfile = async (userId, fullName, phone, email) => {
  const fieldsToSet = {
    fullName: fullName.trim(),
    phone: phone.trim(),
  };

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const updateQuery = { $set: fieldsToSet };

  if (trimmedEmail) {
    fieldsToSet.email = trimmedEmail;
  } else if (email !== undefined) {
    updateQuery.$unset = { email: 1 };
  }

  try {
    const user = await User.findByIdAndUpdate(userId, updateQuery, { returnDocument: 'after' })
      .select(PROFILE_FIELDS)
      .lean();

    if (!user) {
      throw httpError(404, 'Không tìm thấy người dùng');
    }

    return user;
  } catch (error) {
    // Trùng phone hoặc email với tài khoản khác (unique index chặn)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];
      const label = duplicateField === 'email' ? 'Email' : 'Số điện thoại';
      throw httpError(409, `${label} đã được sử dụng`);
    }
    throw error;
  }
};

module.exports = { getMyProfile, updateMyProfile };
