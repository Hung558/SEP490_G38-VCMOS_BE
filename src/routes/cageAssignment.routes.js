const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const cageAssignmentController = require('../controllers/cageAssignment.controller');

const router = express.Router();

// All routes require a logged-in user with the Receptionist role
router.use(protect, authorize('Receptionist'));

router.get('/', cageAssignmentController.getAllCageAssignments);
router.get('/:id', cageAssignmentController.getCageAssignmentById);
router.post('/', cageAssignmentController.createCageAssignment);

module.exports = router;