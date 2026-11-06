const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const { createOnlineAppointmentServiceController } = require('../controllers/appointmentService.controller');

const router = express.Router();

// Chỉ PetOwner được tạo dịch vụ cho lịch hẹn online
router.post('/online', protect, authorize('PetOwner'), createOnlineAppointmentServiceController);

module.exports = router;