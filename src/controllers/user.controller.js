const userService = require('../services/user.service');
const { validateUpdateMyProfile } = require('../validators/user.validator');

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

module.exports = { getMyProfile, updateMyProfile };
