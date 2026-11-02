const productService = require('../services/product.service');
const productValidator = require('../validators/product.validator');

/**
 * Centralised error handling:
 * - Validator / service errors carry `statusCode` (400, 404, 409, 500...).
 *   Validator errors also carry `errors` ([{ field, message }]).
 * - Mongoose CastError (malformed ObjectId) -> 400
 * - Mongoose ValidationError (enum / min / required) -> 400
 * - Anything else -> 500
 */
const handleError = (res, err) => {
  if (err.statusCode) {
    const body = { success: false, message: err.message };
    if (Array.isArray(err.errors)) body.errors = err.errors;
    return res.status(err.statusCode).json(body);
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'ID sản phẩm không hợp lệ' });
  }
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ', errors });
  }
  console.error('[ProductController]', err);
  return res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
};

/**
 * GET /products
 * Query: category, status, search, page, limit
 */
const listProducts = async (req, res) => {
  try {
    const filters = productValidator.validateListQuery(req.query);
    const result = await productService.listProducts(filters);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * GET /products/:id
 */
const getProductById = async (req, res) => {
  try {
    const id = productValidator.validateProductId(req.params.id);
    const product = await productService.getProductById(id);
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * POST /products
 * Body: { name, category, unit, unitPrice? }
 */
const createProduct = async (req, res) => {
  try {
    const data = productValidator.validateCreateProduct(req.body);
    const product = await productService.createProduct(data);
    return res.status(201).json({ success: true, data: product });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * PUT /products/:id
 * Body: { name?, category?, unit?, unitPrice? } (at least one)
 */
const updateProduct = async (req, res) => {
  try {
    const id = productValidator.validateProductId(req.params.id);
    const data = productValidator.validateUpdateProduct(req.body);
    const product = await productService.updateProduct(id, data);
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * PATCH /products/:id/inactivate
 */
const inactivateProduct = async (req, res) => {
  try {
    const id = productValidator.validateProductId(req.params.id);
    const product = await productService.inactivateProduct(id);
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * PATCH /products/:id/activate
 */
const activateProduct = async (req, res) => {
  try {
    const id = productValidator.validateProductId(req.params.id);
    const product = await productService.activateProduct(id);
    return res.status(200).json({ success: true, data: product });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  inactivateProduct,
  activateProduct,
};