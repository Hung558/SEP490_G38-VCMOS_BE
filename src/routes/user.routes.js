const express = require('express');
const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Mọi role đã đăng nhập đều xem, sửa và xác thực email trong profile của chính mình
router.get('/me', protect, userController.getMyProfile);
router.put('/me', protect, userController.updateMyProfile);
router.post('/me/email/send-otp', protect, userController.sendMyEmailOtp);
router.post('/me/email/verify', protect, userController.verifyMyEmail);

// Đổi mật khẩu khi đang đăng nhập (cần email đã xác thực + mật khẩu hiện tại + OTP)
router.post('/me/password/send-otp', protect, userController.sendChangePasswordOtp);
router.put('/me/password', protect, userController.changeMyPassword);

// Quên mật khẩu qua email đã xác thực (public, khớp với URL bên FE)
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

module.exports = router;
