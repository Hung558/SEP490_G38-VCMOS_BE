const jwt = require('jsonwebtoken');

// Yêu cầu header: Authorization: Bearer <token>  →  gán req.user = { id, role }
const protect = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Chưa đăng nhập' });
  }

  const token = header.split(' ')[1]; // "Bearer <token>" → lấy phần <token>

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
