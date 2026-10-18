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

module.exports = { protect };
