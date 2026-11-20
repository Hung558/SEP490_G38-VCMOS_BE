const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadCommunityPostPhotos } = require('../middlewares/upload.middleware');
const communityPostController = require('../controllers/communityPost.controller');

const router = express.Router();

// ===== Public (Guest + PetOwner): chỉ xem bài đã duyệt (Published), KHÔNG cần đăng nhập =====
// Phải khai báo TRƯỚC '/:id', nếu không 'public' sẽ bị hiểu là một :id.
router.get('/public', communityPostController.listPublished);
router.get('/public/:id', communityPostController.getPublishedById);

// ===== Chỉ PetOwner, chỉ thao tác trên bài của chính mình =====
// Xem được mọi trạng thái; sửa/xoá chỉ khi bài còn PendingReview.
// POST/PUT chỉ nhận multipart/form-data. Upload đặt SAU protect + authorize để người chưa đăng nhập không upload được.
const petOwnerOnly = [protect, authorize('PetOwner')];

router.post('/', petOwnerOnly, uploadCommunityPostPhotos, communityPostController.create);
router.get('/', petOwnerOnly, communityPostController.list);
router.get('/:id', petOwnerOnly, communityPostController.getById);
router.put('/:id', petOwnerOnly, uploadCommunityPostPhotos, communityPostController.update);
router.delete('/:id', petOwnerOnly, communityPostController.remove);

module.exports = router;