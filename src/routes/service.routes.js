const express = require('express');
const serviceController = require('../controllers/service.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// UC-01 (SCR-02) & UC-66 (SCR-29): Công khai xem danh sách & chi tiết dịch vụ cho mọi vai trò (kể cả Guest)
router.get('/', serviceController.getAllServices);
router.get('/:id', serviceController.getServiceById);

// SCR-29 & UC-66 (Permission Matrix): Chỉ Admin mới được thêm mới, chỉnh sửa, đổi trạng thái dịch vụ
router.post('/', protect, authorize('Admin'), serviceController.createService);
router.put('/:id', protect, authorize('Admin'), serviceController.updateService);
router.patch('/:id/status', protect, authorize('Admin'), serviceController.updateServiceStatus);
router.delete('/:id', protect, authorize('Admin'), serviceController.deleteService);

module.exports = router;

