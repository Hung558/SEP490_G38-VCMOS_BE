const express = require('express');
const adminController = require('../controllers/admin.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Mọi route quản trị tài khoản (SCR-32: UC-60, UC-61, UC-62, BR-22) đều chỉ dành cho Admin
router.use(protect, authorize('Admin'));

router.get('/', adminController.getAllUsers);
router.post('/', adminController.createStaffAccount);
router.get('/:id', adminController.getUserById);
router.put('/:id', adminController.updateUserByAdmin);
router.patch('/:id/status', adminController.updateUserStatus);
router.delete('/:id', adminController.deleteUser);

module.exports = router;

