const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const {
  createOnlineAppointmentServiceController,
  createOnlineBookingController,
} = require('../controllers/appointmentService.controller');

const router = express.Router();

router.post('/online', protect, authorize('PetOwner'), createOnlineAppointmentServiceController);
router.post('/online-booking', protect, authorize('PetOwner'), createOnlineBookingController);

module.exports = router;