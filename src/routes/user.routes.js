const express = require('express');
const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Mọi role đã đăng nhập đều xem, sửa và xác thực email trong profile của chính mình
router.get('/me', protect, userController.getMyProfile);
router.put('/me', protect, userController.updateMyProfile);
router.post('/me/email/send-otp', protect, userController.sendMyEmailOtp);
router.post('/me/email/verify', protect, userController.verifyMyEmail);

module.exports = router;
