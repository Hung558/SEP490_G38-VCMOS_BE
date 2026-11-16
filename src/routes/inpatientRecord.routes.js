const router = require('express').Router();
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/inpatientRecord.controller');

router.use(protect, authorize('Veterinarian'));

router.post('/', controller.create);
router.get('/', controller.list);
router.get('/:id', controller.getById);

module.exports = router;