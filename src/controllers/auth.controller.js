const authService = require('../services/auth.service');
const { validateRegister, validateLogin } = require('../validators/auth.validator');

const register = async (req, res) => {
  const { isValid, errors } = validateRegister(req.body);
  if (!isValid) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    const user = await authService.register(req.body);
    res.status(201).json({ message: 'Đăng ký thành công', user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  const { isValid, errors } = validateLogin(req.body);
  if (!isValid) return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

  try {
    const { token, user } = await authService.login(req.body);
    res.status(200).json({ message: 'Đăng nhập thành công', token, user });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

// Server không lưu token (JWT stateless) nên logout = FE xoá token đi.
// Lưu ý: token cũ vẫn dùng được tới khi hết hạn (JWT_EXPIRES_IN, mặc định 1 ngày).
// Nếu cần thu hồi token ngay lập tức thì phải lưu danh sách token bị huỷ (blacklist) trong DB.
const logout = (req, res) => {
  res.status(200).json({ message: 'Đăng xuất thành công' });
};

module.exports = { register, login, logout };
