const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const walkInController = require('../controllers/walkIn.controller');

const router = express.Router();

router.use(protect);

// UC-20: Lễ tân / Admin tra cứu khách hàng theo SĐT kèm danh sách thú cưng
router.get('/customer-lookup', authorize('Receptionist', 'Admin'), walkInController.lookupCustomer);

// UC-19, UC-21, BR-04: Lễ tân đăng ký khám vãng lai tại quầy (Walk-in)
router.post('/', authorize('Receptionist'), walkInController.createWalkInBooking);

module.exports = router;

