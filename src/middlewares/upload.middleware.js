const multer = require('multer');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB mỗi ảnh
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AI_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png'];

const createImageFileFilter = (allowedMimeTypes, invalidMessage) => (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    const err = new Error(invalidMessage);
    err.statusCode = 400;
    return cb(err);
  }
  return cb(null, true);
};

// Lưu ảnh trong bộ nhớ (buffer) rồi đẩy thẳng lên Cloudinary, không ghi ra đĩa
const createImageUpload = (
  maxFiles,
  allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES,
  invalidMessage = 'Ảnh phải có định dạng JPEG, PNG hoặc WebP'
) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: maxFiles },
    fileFilter: createImageFileFilter(allowedMimeTypes, invalidMessage),
  });

const upload = createImageUpload(2);

const groomingNotePhotos = upload.fields([
  { name: 'beforePhoto', maxCount: 1 },
  { name: 'afterPhoto', maxCount: 1 },
]);

const subtaskResultPhoto = upload.single('resultImage');

// Bài viết cộng đồng: 1 ảnh bìa + tối đa 10 ảnh cho các mốc timeline
const MAX_TIMELINE_IMAGES = 10;
const communityPostUpload = createImageUpload(1 + MAX_TIMELINE_IMAGES);
const communityPostPhotos = communityPostUpload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'timelineImages', maxCount: MAX_TIMELINE_IMAGES },
]);

// Đánh giá sức khỏe AI (UC-14 / MSG35): tối đa 3 ảnh JPG/PNG, mỗi ảnh <= 5MB
const MAX_AI_ASSESSMENT_PHOTOS = 3;
const aiAssessmentUpload = createImageUpload(
  MAX_AI_ASSESSMENT_PHOTOS,
  ALLOWED_AI_IMAGE_MIME_TYPES,
  'Chỉ chấp nhận ảnh định dạng JPG hoặc PNG (MSG35)'
);
const aiAssessmentPhotos = aiAssessmentUpload.fields([
  { name: 'photos', maxCount: MAX_AI_ASSESSMENT_PHOTOS },
  { name: 'photo', maxCount: MAX_AI_ASSESSMENT_PHOTOS },
]);

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

const handleCommunityPostPhotos = createUploadErrorHandler(
  communityPostPhotos,
  `Chỉ nhận ảnh qua trường image (1 ảnh) và timelineImages (tối đa ${MAX_TIMELINE_IMAGES} ảnh)`,
  1 + MAX_TIMELINE_IMAGES
);

/**
 * Nhận bài viết cộng đồng CHỈ qua multipart/form-data (mọi ảnh phải tải lên Cloudinary), gồm:
 * - `image`: ảnh chính của bài (tối đa 1 ảnh)
 * - `timelineImages`: ảnh cho các mốc timeline (tối đa 10 ảnh); mốc nào dùng ảnh nào được chỉ định
 *   bằng `timelineItems[].imageIndex` (vị trí của ảnh trong `timelineImages`).
 * Gán `req.files = { image?: [file], timelineImages?: [file, ...] }`.
 * Request không phải multipart (vd. JSON) bị từ chối 415.
 */
const uploadCommunityPostPhotos = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return res.status(415).json({ message: 'Chỉ chấp nhận multipart/form-data' });
  }
  return handleCommunityPostPhotos(req, res, next);
};

const handleAiAssessmentPhotos = createUploadErrorHandler(
  aiAssessmentPhotos,
  `Chỉ được tải lên tối đa ${MAX_AI_ASSESSMENT_PHOTOS} ảnh qua trường photos (hoặc photo)`,
  MAX_AI_ASSESSMENT_PHOTOS
);

/**
 * Nhận tối đa 3 ảnh JPG/PNG cho đánh giá AI qua trường `photos` hoặc `photo`.
 * Cho phép gửi cả `application/json` (0 ảnh) lẫn `multipart/form-data` (0..3 ảnh).
 */
const uploadAiAssessmentPhotos = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next();
  }
  return handleAiAssessmentPhotos(req, res, (err) => {
    if (err) return next(err);
    const totalCount =
      (req.files?.photos?.length || 0) + (req.files?.photo?.length || 0);
    if (totalCount > MAX_AI_ASSESSMENT_PHOTOS) {
      return res.status(400).json({
        message: `Chỉ được tải lên tối đa ${MAX_AI_ASSESSMENT_PHOTOS} ảnh (MSG35)`,
      });
    }
    return next();
  });
};

module.exports = {
  uploadGroomingNotePhotos,
  uploadSubtaskResultPhoto,
  uploadCommunityPostPhotos,
  uploadAiAssessmentPhotos,
  MAX_TIMELINE_IMAGES,
  MAX_AI_ASSESSMENT_PHOTOS,
};