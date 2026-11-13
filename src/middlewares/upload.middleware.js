const multer = require('multer');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB mỗi ảnh
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Lưu ảnh trong bộ nhớ (buffer) rồi đẩy thẳng lên Cloudinary, không ghi ra đĩa
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 2 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      const err = new Error('Ảnh phải có định dạng JPEG, PNG hoặc WebP');
      err.statusCode = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const groomingNotePhotos = upload.fields([
  { name: 'beforePhoto', maxCount: 1 },
  { name: 'afterPhoto', maxCount: 1 },
]);

/**
 * Nhận ảnh cho ghi chú chăm sóc: multipart/form-data với 2 trường file tùy chọn
 * `beforePhoto`, `afterPhoto`. Gán `req.files = { beforePhoto?: [file], afterPhoto?: [file] }`.
 * Request JSON thông thường (không có file) vẫn đi qua bình thường.
 * Đặt SAU protect + authorize để người chưa đăng nhập không upload được.
 */
const uploadGroomingNotePhotos = (req, res, next) => {
  groomingNotePhotos(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: `Mỗi ảnh tối đa ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`,
        LIMIT_UNEXPECTED_FILE: 'Chỉ nhận ảnh qua các trường beforePhoto và afterPhoto (mỗi trường 1 ảnh)',
        LIMIT_FILE_COUNT: 'Chỉ được tải lên tối đa 2 ảnh',
      };
      return res.status(400).json({ message: messages[err.code] || 'Tải ảnh lên không hợp lệ' });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ, vui lòng thử lại sau' });
  });
};

module.exports = { uploadGroomingNotePhotos };