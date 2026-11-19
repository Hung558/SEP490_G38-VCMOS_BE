const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { uploadCommunityPostPhotos } = require('../middlewares/upload.middleware');
const communityPostController = require('../controllers/communityPost.controller');

const router = express.Router();

// Toàn bộ API dưới đây chỉ dành cho PetOwner và chỉ thao tác trên bài của chính mình.
// Xem được mọi trạng thái; sửa/xoá chỉ khi bài còn PendingReview.
// POST/PUT chỉ nhận multipart/form-data. Upload đặt SAU protect + authorize để người chưa đăng nhập không upload được.
router.use(protect, authorize('PetOwner'));

router.post('/', uploadCommunityPostPhotos, communityPostController.create);
router.get('/', communityPostController.list);
router.get('/:id', communityPostController.getById);
router.put('/:id', uploadCommunityPostPhotos, communityPostController.update);
router.delete('/:id', communityPostController.remove);

module.exports = router;