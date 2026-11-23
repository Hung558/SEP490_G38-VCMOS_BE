const aiAssessmentService = require('../services/aiAssessment.service');
const {
  validateCreateAiAssessment,
  validateListAiAssessmentsQuery,
  validateAssessmentIdParam,
} = require('../validators/aiAssessment.validator');

// Hỗ trợ nhận ảnh dù client gửi qua field `photos` hay `photo`
const extractUploadedPhotos = (req) => {
  const filesObj = req.files || {};
  const fromPhotos = Array.isArray(filesObj.photos) ? filesObj.photos : [];
  const fromPhoto = Array.isArray(filesObj.photo) ? filesObj.photo : [];
  return [...fromPhotos, ...fromPhoto];
};

const handleControllerError = (res, err) => {
  if (err && err.statusCode) {
    const response = { message: err.message };
    if (err.errors) response.errors = err.errors;
    return res.status(err.statusCode).json(response);
  }
  console.error('Lỗi AI Assessment controller:', err);
  return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý đánh giá AI' });
};

/**
 * POST /api/ai-assessments
 * Chủ nuôi gửi ảnh + triệu chứng để AI đánh giá sức khỏe tham khảo (UC-14, BR-20).
 */
const create = async (req, res) => {
  try {
    const files = extractUploadedPhotos(req);
    const check = validateCreateAiAssessment(req.body || {}, files);
    if (!check.isValid) {
      return res.status(400).json({
        message: Object.values(check.errors)[0] || 'Dữ liệu đánh giá AI không hợp lệ',
        errors: check.errors,
      });
    }

    const assessment = await aiAssessmentService.createAiAssessment(req.user, check.value, files);
    return res.status(201).json({
      message: 'Đánh giá sức khỏe tham khảo bằng AI thành công',
      assessment,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/ai-assessments
 * Xem danh sách lịch sử đánh giá AI (PetOwner xem của mình; Receptionist / Vet / Groomer xem tất cả).
 */
const list = async (req, res) => {
  try {
    const queryCheck = validateListAiAssessmentsQuery(req.query || {});
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số lọc lịch sử đánh giá AI không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await aiAssessmentService.listAiAssessments(req.user, queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/ai-assessments/:id
 * Xem chi tiết một bản ghi đánh giá AI.
 */
const getById = async (req, res) => {
  try {
    const idCheck = validateAssessmentIdParam(req.params.id);
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: idCheck.errors.id,
        errors: idCheck.errors,
      });
    }

    const assessment = await aiAssessmentService.getAiAssessmentById(req.user, idCheck.value);
    return res.status(200).json({ assessment });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

module.exports = {
  create,
  list,
  getById,
};
