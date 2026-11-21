const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const moderationController = require('../controllers/communityModeration.controller');

const router = express.Router();

// Toàn bộ luồng kiểm duyệt cộng đồng chỉ dành cho Admin (SCR-33: UC-57, UC-58, UC-59)
router.use(protect, authorize('Admin'));

router.get('/posts', moderationController.listPosts);
router.patch('/posts/:id/moderate', moderationController.moderatePost);
router.get('/reports', moderationController.listReports);
router.patch('/reports/:id/resolve', moderationController.resolveReport);

module.exports = router;
