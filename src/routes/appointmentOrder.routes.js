const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/appointmentOrder.controller');
const walkInRoutes = require('./walkIn.routes');

const router = express.Router();

// Walk-in routes (/api/appointment-orders/walk-in/*)
router.use('/walk-in', walkInRoutes);

// Every route requires a logged-in user.
router.use(protect);

// Pet owner routes
router.post('/online', authorize('PetOwner'), controller.createOnlineBooking);
router.get('/me', authorize('PetOwner'), controller.listMyOnlineBooking);
router.get('/me/:id', authorize('PetOwner'), controller.getMyOnlineBookingById);

// Admin / Receptionist routes
router.get('/', authorize('Admin', 'Receptionist'), controller.listAllBooking);

// Receptionist routes
router.patch('/:id/check-in', authorize('Receptionist'), controller.checkInBooking);

module.exports = router;