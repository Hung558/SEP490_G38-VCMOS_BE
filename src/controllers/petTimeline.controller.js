const petTimelineService = require('../services/petTimeline.service');
const {
  validatePetIdParam,
  validatePetTimelineQuery,
} = require('../validators/petTimeline.validator');

/**
 * GET /api/pets/:petId/timeline
 * Xem Dòng thời gian Thú cưng Hợp nhất (Unified Pet Timeline — UC-13, SCR-08, BR-23)
 */
const getPetTimeline = async (req, res) => {
  try {
    const idCheck = validatePetIdParam(req.params.petId);
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: idCheck.errors.petId,
        errors: idCheck.errors,
      });
    }

    const queryCheck = validatePetTimelineQuery(req.query);
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số lọc dòng thời gian thú cưng không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await petTimelineService.getPetTimeline(
      req.user,
      idCheck.value,
      queryCheck.value
    );
    return res.status(200).json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        message: err.message,
        ...(err.errors && { errors: err.errors }),
      });
    }
    console.error('Lỗi getPetTimeline:', err);
    return res.status(500).json({ message: 'Lỗi máy chủ, vui lòng thử lại sau' });
  }
};

module.exports = {
  getPetTimeline,
};

