const { PHONE_REGEX, EMAIL_REGEX, MAX_FULLNAME, isBlank } = require('./auth.validator');

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

module.exports = { validateUpdateMyProfile };
