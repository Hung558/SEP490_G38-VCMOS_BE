const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadAiAssessmentPhotos } = require('../middlewares/upload.middleware');
const aiAssessmentController = require('../controllers/aiAssessment.controller');

const router = express.Router();

// Toàn bộ tính năng AI (gửi đánh giá & xem lịch sử) chỉ dành riêng cho chủ nuôi (PetOwner)
router.use(protect, authorize('PetOwner'));

router.post('/', uploadAiAssessmentPhotos, aiAssessmentController.create);
router.get('/', aiAssessmentController.list);
router.get('/:id', aiAssessmentController.getById);

module.exports = router;
