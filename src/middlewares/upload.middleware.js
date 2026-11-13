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

const subtaskResultPhoto = upload.single('resultImage');

/**
 * Bao bọc middleware multer để chuẩn hoá lỗi upload (dung lượng, số lượng, sai tên trường) về 400 JSON.
 */
const createUploadErrorHandler = (multerMiddleware, unexpectedFileMessage, maxFiles = 2) => (req, res, next) => {
  multerMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: `Mỗi ảnh tối đa ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`,
        LIMIT_UNEXPECTED_FILE: unexpectedFileMessage,
        LIMIT_FILE_COUNT: `Chỉ được tải lên tối đa ${maxFiles} ảnh`,
      };
      return res.status(400).json({ message: messages[err.code] || 'Tải ảnh lên không hợp lệ' });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ message: err.message });
    }
    return res.status(500).json({ message: 'Lỗi máy chủ, vui lòng thử lại sau' });
  });
};

/**
 * Nhận ảnh cho ghi chú chăm sóc: multipart/form-data với 2 trường file tùy chọn
 * `beforePhoto`, `afterPhoto`. Gán `req.files = { beforePhoto?: [file], afterPhoto?: [file] }`.
 * Request JSON thông thường (không có file) vẫn đi qua bình thường.
 * Đặt SAU protect + authorize để người chưa đăng nhập không upload được.
 */
const uploadGroomingNotePhotos = createUploadErrorHandler(
  groomingNotePhotos,
  'Chỉ nhận ảnh qua các trường beforePhoto và afterPhoto (mỗi trường 1 ảnh)',
  2
);

/**
 * Nhận ảnh kết quả cận lâm sàng / dịch vụ phụ qua trường `resultImage` (tối đa 1 ảnh).
 * Request JSON thông thường (không gửi file) vẫn đi qua bình thường.
 */
const uploadSubtaskResultPhoto = createUploadErrorHandler(
  subtaskResultPhoto,
  'Chỉ nhận ảnh qua trường resultImage (tối đa 1 ảnh)',
  1
);

module.exports = {
  uploadGroomingNotePhotos,
  uploadSubtaskResultPhoto,
};