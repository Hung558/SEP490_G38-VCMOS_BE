const userService = require('../services/user.service');
const {
  validateUpdateMyProfile,
  validateVerifyMyEmail,
  validateForgotPassword,
  validateResetPassword,
  validateChangeMyPassword,
} = require('../validators/user.validator');

// Lấy id từ token (req.user do protect gán), không nhận id từ client để chống xem profile người khác
const getMyProfile = async (req, res) => {
  try {
    const user = await userService.getMyProfile(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    // Express 5: request không gửi body JSON thì req.body là undefined → dùng {} để validator trả 400
    const body = req.body || {};
    const { fullName, phone, email } = body;

    const { isValid, errors } = validateUpdateMyProfile({ fullName, phone, email });
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const user = await userService.updateMyProfile(req.user.id, fullName, phone, email);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const sendMyEmailOtp = async (req, res) => {
  try {
    const { devToken } = await userService.sendMyEmailOtp(req.user.id);
    const response = { message: 'Mã xác thực đã được gửi tới email của bạn' };
    if (devToken) response.devToken = devToken;

    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const verifyMyEmail = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateVerifyMyEmail(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const user = await userService.verifyMyEmail(req.user.id, body.otp);
    res.status(200).json({ message: 'Xác thực email thành công', user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateForgotPassword(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const { devToken } = await userService.forgotPassword(body.email);
    const response = { message: 'Mã OTP khôi phục mật khẩu đã được gửi tới email của bạn' };
    if (devToken) response.devToken = devToken;

    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateResetPassword(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const otpValue = body.otp !== undefined ? body.otp : body.token;
    await userService.resetPassword(body.email, otpValue, body.password);
    res.status(200).json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const sendChangePasswordOtp = async (req, res) => {
  try {
    const { devToken } = await userService.sendChangePasswordOtp(req.user.id);
    const response = { message: 'Mã OTP đổi mật khẩu đã được gửi tới email của bạn' };
    if (devToken) response.devToken = devToken;

    res.status(200).json(response);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const changeMyPassword = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateChangeMyPassword(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    await userService.changeMyPassword(req.user.id, body.currentPassword, body.newPassword, body.otp);
    res.status(200).json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = {
  getMyProfile,
  updateMyProfile,
  sendMyEmailOtp,
  verifyMyEmail,
  forgotPassword,
  resetPassword,
  sendChangePasswordOtp,
  changeMyPassword,
};
