const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const cageAssignmentController = require('../controllers/cageAssignment.controller');

const router = express.Router();

// All routes require a logged-in user
router.use(protect);

// Receptionist, Veterinarian, Groomer được phép xem, phân công và giải phóng chuồng (BR-10, UC-27, UC-29)
router.get(
  '/',
  authorize('Receptionist', 'Veterinarian', 'Groomer'),
  cageAssignmentController.getAllCageAssignments
);
router.get(
  '/:id',
  authorize('Receptionist', 'Veterinarian', 'Groomer'),
  cageAssignmentController.getCageAssignmentById
);
router.post(
  '/',
  authorize('Receptionist', 'Veterinarian', 'Groomer'),
  cageAssignmentController.createCageAssignment
);

// Look up the open cage assignment of an order
router.get(
  '/order/:orderId',
  authorize('Receptionist', 'Veterinarian', 'Groomer'),
  cageAssignmentController.getCageAssignmentByOrderId
);

// Release a pet from its cage (cage becomes Available)
router.patch(
  '/:id/release',
  authorize('Receptionist', 'Veterinarian', 'Groomer'),
  cageAssignmentController.releaseCageAssignment
);

module.exports = router;