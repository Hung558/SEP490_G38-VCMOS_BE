const router = require('express').Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/inpatientRecord.controller');

// Bác sĩ
router.post('/', protect, authorize('Veterinarian'), controller.create);
router.get('/', protect, authorize('Veterinarian'), controller.list);
router.get('/:id', protect, authorize('Veterinarian'), controller.getById);
router.patch('/:id/discharge', protect, authorize('Veterinarian'), controller.discharge);
router.post('/:id/daily-logs', protect, authorize('Veterinarian'), controller.createLog);
router.get('/:id/daily-logs', protect, authorize('Veterinarian'), controller.listLogs);

// Chủ thú cưng xem nhật ký nội trú của thú cưng của mình
router.get('/pets/:petId/daily-logs', protect, authorize('PetOwner'), controller.listMyPetLogs);

module.exports = router;