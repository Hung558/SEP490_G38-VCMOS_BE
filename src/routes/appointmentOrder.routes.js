const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/appointmentOrder.controller');

const router = express.Router();

// Every route requires a logged-in user.
router.use(protect, authorize('PetOwner'));

router.post('/online', controller.createOnlineBooking);
router.get('/me', controller.listMyOnlineBooking);
router.get('/me/:id', controller.getMyOnlineBookingById);

module.exports = router;