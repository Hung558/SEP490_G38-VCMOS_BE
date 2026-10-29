const adminService = require('../services/admin.service');
const {
  validateCreateStaff,
  validateUpdateUserByAdmin,
  validateUpdateUserStatus,
} = require('../validators/admin.validator');

const getAllUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers(req.query || {});
    res.status(200).json({ users });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await adminService.getUserById(req.params.id);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const createStaffAccount = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateCreateStaff(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const user = await adminService.createStaffAccount(body);
    res.status(201).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updateUserByAdmin = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateUpdateUserByAdmin(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const user = await adminService.updateUserByAdmin(req.params.id, body);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const updateUserStatus = async (req, res) => {
  try {
    const body = req.body || {};
    const { isValid, errors } = validateUpdateUserStatus(body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
    }

    const user = await adminService.updateUserStatus(req.user.id, req.params.id, body.status);
    res.status(200).json({ user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// BR-22: Cấm xóa vật lý tài khoản người dùng để bảo toàn lịch sử khám và hóa đơn
const deleteUser = (req, res) => {
  return res.status(403).json({
    message: 'Không được phép xóa vật lý tài khoản người dùng (BR-22). Vui lòng sử dụng chức năng khóa tài khoản',
  });
};

module.exports = {
  getAllUsers,
  getUserById,
  createStaffAccount,
  updateUserByAdmin,
  updateUserStatus,
  deleteUser,
};

