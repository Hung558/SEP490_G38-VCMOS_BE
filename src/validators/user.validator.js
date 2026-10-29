const {
  PHONE_REGEX,
  EMAIL_REGEX,
  MAX_FULLNAME,
  MIN_PASSWORD,
  MAX_PASSWORD,
  isBlank,
} = require('./auth.validator');

const OTP_REGEX = /^\d{6}$/;

const validatePasswordValue = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`;
  }
  if (password.length > MAX_PASSWORD) {
    return `Mật khẩu không được vượt quá ${MAX_PASSWORD} ký tự`;
  }
  return null;
};

const validateUpdateMyProfile = ({ fullName, phone, email } = {}) => {
  const errors = {};

  if (isBlank(fullName)) errors.fullName = 'Họ tên là bắt buộc';
  else if (fullName.trim().length > MAX_FULLNAME) errors.fullName = `Họ tên không được vượt quá ${MAX_FULLNAME} ký tự`;

  if (isBlank(phone)) errors.phone = 'Số điện thoại là bắt buộc';
  else if (!PHONE_REGEX.test(phone.trim())) errors.phone = 'Số điện thoại phải gồm 10 số, bắt đầu bằng 0';

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateVerifyMyEmail = ({ otp } = {}) => {
  const errors = {};

  if (isBlank(otp)) errors.otp = 'Vui lòng nhập mã xác thực';
  else if (!OTP_REGEX.test(otp.trim())) errors.otp = 'Mã xác thực phải gồm 6 chữ số';

  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateForgotPassword = ({ email } = {}) => {
  const errors = {};

  if (isBlank(email)) errors.email = 'Email là bắt buộc';
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';

  return { isValid: Object.keys(errors).length === 0, errors };
};

// Hỗ trợ nhận mã OTP qua field "otp" hoặc "token" (để khớp với ForgotPasswordForm bên FE)
const validateResetPassword = ({ email, otp, token, password } = {}) => {
  const errors = {};
  const otpValue = otp !== undefined ? otp : token;

  if (isBlank(email)) errors.email = 'Email là bắt buộc';
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = 'Email không hợp lệ';

  if (isBlank(otpValue)) errors.otp = 'Vui lòng nhập mã xác thực';
  else if (!OTP_REGEX.test(otpValue.trim())) errors.otp = 'Mã xác thực phải gồm 6 chữ số';

  const passwordError = validatePasswordValue(password);
  if (passwordError) errors.password = passwordError;

  return { isValid: Object.keys(errors).length === 0, errors };
};

const validateChangeMyPassword = ({ otp, currentPassword, newPassword } = {}) => {
  const errors = {};

  if (isBlank(otp)) errors.otp = 'Vui lòng nhập mã xác thực';
  else if (!OTP_REGEX.test(otp.trim())) errors.otp = 'Mã xác thực phải gồm 6 chữ số';

  if (typeof currentPassword !== 'string' || !currentPassword) {
    errors.currentPassword = 'Vui lòng nhập mật khẩu hiện tại';
  }

  const newPasswordError = validatePasswordValue(newPassword);
  if (newPasswordError) {
    errors.newPassword = newPasswordError;
  } else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = {
  validateUpdateMyProfile,
  validateVerifyMyEmail,
  validateForgotPassword,
  validateResetPassword,
  validateChangeMyPassword,
};

