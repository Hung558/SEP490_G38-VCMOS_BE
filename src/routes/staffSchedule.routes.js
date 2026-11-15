const express = require('express');
const staffScheduleController = require('../controllers/staffSchedule.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, authorize('Veterinarian', 'Groomer', 'Receptionist', 'Admin'));

// Bác sĩ / Groomer xem nhanh lịch báo bận của chính mình
router.get('/me', staffScheduleController.getMyBusySchedules);

// Xem danh sách báo bận (Vet/Groomer xem của mình; Receptionist/Admin xem & lọc theo staffId, date, from/to, shift)
router.get('/', staffScheduleController.listBusySchedules);

// Đăng ký báo bận (Vet/Groomer tự báo; Receptionist/Admin báo hộ qua staffId)
router.post('/', staffScheduleController.createBusySchedule);

// Hủy lịch báo bận (xóa khỏi blacklist để khả dụng lại)
router.delete('/:id', staffScheduleController.deleteBusySchedule);

module.exports = router;

