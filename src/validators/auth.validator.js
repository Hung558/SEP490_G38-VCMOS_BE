const PHONE_REGEX = /^0\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FULLNAME = 100;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt chỉ xử lý tối đa 72 byte đầu tiên

const isBlank = (value) => typeof value !== 'string' || !value.trim();

const validateRegister = ({ fullName, phone, email, password } = {}) => {
  const errors = {};

  if (isBlank(fullName)) errors.fullName = 'Họ tên là bắt buộc';
  else if (fullName.trim().length > MAX_FULLNAME) errors.fullName = `Họ tên không được vượt quá ${MAX_FULLNAME} ký tự`;

  if (isBlank(phone)) errors.phone = 'Số điện thoại là bắt buộc';
  else if (!PHONE_REGEX.test(phone.trim())) errors.phone = 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0';

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';
  }

  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    errors.password = `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`;
  } else if (password.length > MAX_PASSWORD) {
    errors.password = `Mật khẩu không được vượt quá ${MAX_PASSWORD} ký tự`;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateLogin = ({ identifier, password } = {}) => {
  const errors = {};

  if (isBlank(identifier)) errors.identifier = 'Vui lòng nhập số điện thoại hoặc email';
  if (typeof password !== 'string' || !password) errors.password = 'Vui lòng nhập mật khẩu';

  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = {
  validateRegister,
  validateLogin,
  PHONE_REGEX,
  EMAIL_REGEX,
  MAX_FULLNAME,
  isBlank,
};
