const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/appointmentOrder.controller');

const router = express.Router();

// Every route requires a logged-in user.
router.use(protect);

// Pet owner routes
router.post('/online', authorize('PetOwner'), controller.createOnlineBooking);
router.get('/me', authorize('PetOwner'), controller.listMyOnlineBooking);
router.get('/me/:id', authorize('PetOwner'), controller.getMyOnlineBookingById);

// Receptionist routes
router.patch('/:id/check-in', authorize('Receptionist'), controller.checkInBooking);

module.exports = router;