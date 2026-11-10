const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// Yêu cầu header: Authorization: Bearer <token>  →  gán req.user = { id, role }
// Kiểm tra trạng thái tài khoản trong DB để chặn truy cập ngay lập tức khi Admin khóa tài khoản (UC-62)
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Chưa đăng nhập' });
  }

  const token = header.split(' ')[1]; // "Bearer <token>" → lấy phần <token>

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      mongoose.connection.readyState === 1 &&
      mongoose.isValidObjectId(decoded.id) &&
      typeof User.findById === 'function'
    ) {
      const findQuery = User.findById(decoded.id);
      const user =
        findQuery && typeof findQuery.select === 'function'
          ? await findQuery.select('status role').lean()
          : null;

      if (user) {
        if (user.status !== 'Active') {
          return res.status(403).json({
            message:
              user.status === 'Locked'
                ? 'Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên'
                : 'Tài khoản đã ngừng hoạt động',
          });
        }
        req.user = { id: decoded.id, role: user.role || decoded.role };
        return next();
      }
    }

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ message: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};

// Phân quyền theo role, luôn đặt SAU protect vì cần req.user.
// Ví dụ: router.post('/', protect, authorize('Admin', 'Receptionist'), controller.create)
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // Phòng trường hợp quên gắn protect trước authorize
    if (!req.user) {
      return res.status(401).json({ message: 'Chưa đăng nhập' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện chức năng này' });
    }

    next();
  };
};

module.exports = { protect, authorize };
