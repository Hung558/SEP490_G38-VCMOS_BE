const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  createOnlineAppointmentServiceController,
  createOnlineBookingController,
  getAppointmentServicesByOrderIdController,
  assignStaffToAppointmentServiceController,
  getAppointmentServicesByAssignedStaffIdController
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

module.exports = router;