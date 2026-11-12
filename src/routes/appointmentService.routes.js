const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  createOnlineAppointmentServiceController,
  createOnlineBookingController,
  getAppointmentServicesByOrderIdController,
  assignStaffToAppointmentServiceController,
  getAppointmentServicesByAssignedStaffIdController,
  cancelAppointmentServiceController,
  startAppointmentServiceController,
} = require('../controllers/appointmentService.controller');

const router = express.Router();

// PetOwner đặt lịch online
router.post('/online', protect, authorize('PetOwner'), createOnlineAppointmentServiceController);
router.post('/online-booking', protect, authorize('PetOwner'), createOnlineBookingController);

// Lễ tân / Admin xem danh sách dịch vụ của 1 đơn hẹn (?orderId=...)
router.get('/', protect, authorize('Receptionist', 'Admin'), getAppointmentServicesByOrderIdController);

// Lễ tân phân công Bác sĩ / Groomer cho dịch vụ trong lịch hẹn
router.patch('/:id/assign-staff', protect, authorize('Receptionist'), assignStaffToAppointmentServiceController);

// Bác sĩ / Groomer xem danh sách dịch vụ được phân công cho chính mình (?status=...)
router.get('/my-queue', protect, authorize('Veterinarian', 'Groomer'), getAppointmentServicesByAssignedStaffIdController);

// Bác sĩ / Groomer bắt đầu thực hiện 1 dịch vụ trong lịch hẹn (status -> InProgress)
router.patch('/:id/start', protect, authorize('Veterinarian', 'Groomer'), startAppointmentServiceController);

// PetOwner / Lễ tân hủy 1 dịch vụ lẻ trong lịch hẹn (UC-18, BR-07)
router.patch('/:id/cancel', protect, authorize('PetOwner', 'Receptionist'), cancelAppointmentServiceController);

module.exports = router;