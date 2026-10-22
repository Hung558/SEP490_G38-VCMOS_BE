const express = require('express');
const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');

const router = express.Router();

// Mọi role đã đăng nhập đều xem được profile của chính mình
router.get('/me', protect, userController.getMyProfile);

module.exports = router;

