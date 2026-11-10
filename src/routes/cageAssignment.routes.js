const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const cageAssignmentController = require('../controllers/cageAssignment.controller');

const router = express.Router();

// All routes require a logged-in user
router.use(protect);

router.get('/', authorize('Receptionist'), cageAssignmentController.getAllCageAssignments);
router.get('/:id', authorize('Receptionist'), cageAssignmentController.getCageAssignmentById);
router.post('/', authorize('Receptionist'), cageAssignmentController.createCageAssignment);

// Veterinarian / Groomer: look up the open cage assignment of an order
router.get('/order/:orderId', authorize('Veterinarian', 'Groomer'), cageAssignmentController.getCageAssignmentByOrderId);

// Veterinarian / Groomer: release a pet from its cage (cage becomes Available)
router.patch('/:id/release', authorize('Veterinarian', 'Groomer'), cageAssignmentController.releaseCageAssignment);

module.exports = router;