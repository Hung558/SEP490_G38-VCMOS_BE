const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadCommunityPostPhotos } = require('../middlewares/upload.middleware');
const communityPostController = require('../controllers/communityPost.controller');
const communityInteractionController = require('../controllers/communityInteraction.controller');

const router = express.Router();

// ===== Public (Guest + PetOwner): chỉ xem bài đã duyệt (Published), KHÔNG cần đăng nhập =====
// Phải khai báo TRƯỚC '/:id', nếu không 'public' sẽ bị hiểu là một :id.
router.get('/public', communityPostController.listPublished);
router.get('/public/:id', communityPostController.getPublishedById);
router.get('/:id/comments', communityInteractionController.listComments);

// ===== Chỉ PetOwner =====
// POST/PUT bài viết chỉ nhận multipart/form-data. Upload đặt SAU protect + authorize để người chưa đăng nhập không upload được.
const petOwnerOnly = [protect, authorize('PetOwner')];

// Các route tĩnh phải khai báo TRƯỚC '/:id'
router.get('/timeline-share/preview', petOwnerOnly, communityPostController.previewTimelineShare);
router.post('/timeline-share', petOwnerOnly, communityPostController.createTimelineShare);
router.post('/reports', petOwnerOnly, communityInteractionController.createReport);
router.delete('/comments/:commentId', petOwnerOnly, communityInteractionController.deleteComment);

// Tương tác trên bài viết cụ thể (thu hồi bài đã đăng, thích/bỏ thích, bình luận & trả lời 1 cấp)
router.patch('/:id/withdraw', petOwnerOnly, communityInteractionController.withdrawPost);
router.post('/:id/like', petOwnerOnly, communityInteractionController.toggleLike);
router.get('/:id/like-status', petOwnerOnly, communityInteractionController.getLikeStatus);
router.post('/:id/comments', petOwnerOnly, communityInteractionController.createComment);

// Quản lý bài viết cá nhân của PetOwner (xem mọi trạng thái; sửa/xoá khi còn PendingReview)
router.post('/', petOwnerOnly, uploadCommunityPostPhotos, communityPostController.create);
router.get('/', petOwnerOnly, communityPostController.list);
router.get('/:id', petOwnerOnly, communityPostController.getById);
router.put('/:id', petOwnerOnly, uploadCommunityPostPhotos, communityPostController.update);
router.delete('/:id', petOwnerOnly, communityPostController.remove);

module.exports = router;