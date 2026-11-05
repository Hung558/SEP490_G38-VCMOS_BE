const express = require('express');
const cageController = require('../controllers/cage.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// All cage routes require a valid token
router.use(protect);

router.get('/', authorize('Admin', 'Receptionist'), cageController.getCages);
router.get('/:id', authorize('Admin', 'Receptionist'), cageController.getCageById);

router.post('/', authorize('Admin'), cageController.createCage);
router.patch('/:id', authorize('Admin'), cageController.updateCage);

module.exports = router;