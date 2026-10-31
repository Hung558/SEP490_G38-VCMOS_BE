const {
  PHONE_REGEX,
  EMAIL_REGEX,
  MAX_FULLNAME,
  MIN_PASSWORD,
  MAX_PASSWORD,
  isBlank,
} = require('./auth.validator');

const STAFF_ROLES = ['Receptionist', 'Veterinarian', 'Groomer'];
const ALL_ROLES = ['PetOwner', 'Receptionist', 'Veterinarian', 'Groomer', 'Admin'];
const USER_STATUSES = ['Active', 'Inactive', 'Locked'];
const ADMIN_ALLOWED_STATUSES = ['Active', 'Locked'];

const validatePasswordValue = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`;
  }
  if (password.length > MAX_PASSWORD) {
    return `Mật khẩu không được vượt quá ${MAX_PASSWORD} ký tự`;
  }
  return null;
};

// UC-61: Admin tạo tài khoản nhân sự (chỉ cho phép các role nhân viên: Lễ tân, Bác sĩ, Groomer)
const validateCreateStaff = ({ fullName, phone, email, password, role } = {}) => {
  const errors = {};

  if (isBlank(fullName)) errors.fullName = 'Họ tên là bắt buộc';
  else if (fullName.trim().length > MAX_FULLNAME) errors.fullName = `Họ tên không được vượt quá ${MAX_FULLNAME} ký tự`;

  if (isBlank(phone)) errors.phone = 'Số điện thoại là bắt buộc';
  else if (!PHONE_REGEX.test(phone.trim())) errors.phone = 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0';

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';
  }

  const passwordError = validatePasswordValue(password);
  if (passwordError) errors.password = passwordError;

  if (isBlank(role)) {
    errors.role = 'Vai trò nhân viên là bắt buộc';
  } else if (!STAFF_ROLES.includes(role)) {
    errors.role = 'Vai trò nhân viên chỉ được là Receptionist, Veterinarian hoặc Groomer';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

// SCR-32: Admin cập nhật thông tin tài khoản người dùng / nhân sự
const validateUpdateUserByAdmin = ({ fullName, phone, email, role } = {}) => {
  const errors = {};

  if (isBlank(fullName)) errors.fullName = 'Họ tên là bắt buộc';
  else if (fullName.trim().length > MAX_FULLNAME) errors.fullName = `Họ tên không được vượt quá ${MAX_FULLNAME} ký tự`;

  if (isBlank(phone)) errors.phone = 'Số điện thoại là bắt buộc';
  else if (!PHONE_REGEX.test(phone.trim())) errors.phone = 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0';

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';
  }

  if (role !== undefined && !STAFF_ROLES.includes(role)) {
    errors.role = 'Vai trò nhân viên chỉ được là Receptionist, Veterinarian hoặc Groomer';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

// UC-62: Admin chỉ được phép khóa (Locked) hoặc mở khóa (Active) tài khoản
const validateUpdateUserStatus = ({ status } = {}) => {
  const errors = {};

  if (isBlank(status)) {
    errors.status = 'Trạng thái tài khoản là bắt buộc';
  } else if (!ADMIN_ALLOWED_STATUSES.includes(status)) {
    errors.status = 'Trạng thái chỉ được là Active hoặc Locked';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = {
  STAFF_ROLES,
  ALL_ROLES,
  USER_STATUSES,
  ADMIN_ALLOWED_STATUSES,
  validateCreateStaff,
  validateUpdateUserByAdmin,
  validateUpdateUserStatus,
};

