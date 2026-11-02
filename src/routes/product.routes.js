const express = require('express');
const productController = require('../controllers/product.controller');
const { protect, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Write operations: must be logged in (protect) AND have role Admin (authorize).
// `authorize` must always come AFTER `protect` because it reads req.user.
const adminOnly = [protect, authorize('Admin')];

router.get('/', productController.listProducts);
router.post('/', ...adminOnly, productController.createProduct);
router.get('/:id', productController.getProductById);
router.put('/:id', ...adminOnly, productController.updateProduct);
router.patch('/:id/activate', ...adminOnly, productController.activateProduct);
router.patch('/:id/inactivate', ...adminOnly, productController.inactivateProduct);

module.exports = router;