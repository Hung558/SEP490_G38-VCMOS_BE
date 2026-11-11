const express = require('express');
const cageController = require('../controllers/cage.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// All cage routes require a valid token
router.use(protect);

// Admin, Receptionist, Veterinarian, Groomer đều được xem danh sách và chi tiết chuồng (BR-10, UC-27)
router.get(
  '/',
  authorize('Admin', 'Receptionist', 'Veterinarian', 'Groomer'),
  cageController.getCages
);
router.get(
  '/:id',
  authorize('Admin', 'Receptionist', 'Veterinarian', 'Groomer'),
  cageController.getCageById
);

router.post('/', authorize('Admin'), cageController.createCage);
router.patch('/:id', authorize('Admin'), cageController.updateCage);

module.exports = router;