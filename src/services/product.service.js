const crypto = require('crypto');
const Product = require('../models/Product');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;

const generateProductCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `PRD-${suffix}`; // ví dụ: PRD-K7M2QX
};

const createError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const isDuplicateKeyError = (err) => err && err.code === 11000;

const isDuplicateCode = (err) =>
  isDuplicateKeyError(err) && err.keyPattern && err.keyPattern.code;

/**
 * List products with optional filters and pagination.
 * @param {Object} [options]
 * @param {string} [options.category]
 * @param {string} [options.status]
 * @param {string} [options.search] - matches name or code (case-insensitive)
 * @param {number} [options.page=1]
 * @param {number} [options.limit=20]
 */
const listProducts = async ({ category, status, search, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (category) filter.category = category;
  if (status) filter.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { code: regex }];
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

/**
 * Get a product by id.
 */
const getProductById = async (id) => {
  const product = await Product.findById(id).lean();
  if (!product) throw createError('Không tìm thấy sản phẩm', 404);
  return product;
};

/**
 * Create a product. `code` is generated randomly; retried on collision.
 * New products always have status `Active`.
 */
const createProduct = async ({ name, category, unit, unitPrice }) => {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    try {
      const product = await Product.create({
        code: generateProductCode(),
        name,
        category,
        unit,
        unitPrice,
        status: 'Active',
      });
      return product.toObject();
    } catch (err) {
      if (isDuplicateCode(err)) continue; // code collision -> regenerate
      if (isDuplicateKeyError(err)) {
        throw createError('Sản phẩm với cùng tên và đơn vị tính đã tồn tại', 409);
      }
      throw err;
    }
  }
  throw createError('Không thể tạo mã sản phẩm duy nhất, vui lòng thử lại', 500);
};

/**
 * Update a product. `code` and `status` cannot be changed here
 * (use `activateProduct` / `inactivateProduct` for status).
 */
const updateProduct = async (id, { name, category, unit, unitPrice }) => {
  const updates = { name, category, unit, unitPrice };
  Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

  try {
    const product = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();
    if (!product) throw createError('Không tìm thấy sản phẩm', 404);
    return product;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw createError('Sản phẩm với cùng tên và đơn vị tính đã tồn tại', 409);
    }
    throw err;
  }
};

/**
 * Inactivate (soft delete) a product.
 */
const inactivateProduct = async (id) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { status: 'Inactive' } },
    { new: true }
  ).lean();
  if (!product) throw createError('Không tìm thấy sản phẩm', 404);
  return product;
};

/**
 * Activate a product.
 */
const activateProduct = async (id) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: { status: 'Active' } },
    { new: true }
  ).lean();
  if (!product) throw createError('Không tìm thấy sản phẩm', 404);
  return product;
};

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  inactivateProduct,
  activateProduct,
};