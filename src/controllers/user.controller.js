const userService = require('../services/user.service');

// Lấy id từ token (req.user do protect gán), không nhận id từ client để chống xem profile người khác
const getMyProfile = async (req, res) => {
  try {
    const user = await userService.getMyProfile(req.user.id);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

module.exports = { getMyProfile };

