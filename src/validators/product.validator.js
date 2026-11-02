const Product = require('../models/Product');

// Read enums from the schema so the validator never drifts from the model.
const CATEGORIES = Product.schema.path('category').enumValues; // ['Medicine', 'Vaccine', 'Retail']
const STATUSES = Product.schema.path('status').enumValues; // ['Active', 'Inactive']

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_NAME_LENGTH = 200;
const MAX_UNIT_LENGTH = 50;
const MAX_SEARCH_LENGTH = 100;

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a 400 error carrying `statusCode` (so the controller's error handler
 * can use it directly) and `errors`: an array of { field, message }.
 */
const createValidationError = (errors, message = 'Dữ liệu không hợp lệ') => {
  const err = new Error(message);
  err.statusCode = 400;
  err.errors = errors;
  return err;
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isPositiveIntString = (value) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

const assertBodyObject = (body) => {
  if (!isPlainObject(body)) {
    throw createValidationError([{ field: 'body', message: 'Body phải là một object JSON' }]);
  }
};

/**
 * Validate a string field (type, non-empty, max length).
 * Pushes an error into `errors` when invalid, otherwise returns the trimmed value.
 */
const checkRequiredString = (errors, field, value, label, maxLength) => {
  if (!isNonEmptyString(value)) {
    errors.push({ field, message: `${label} là bắt buộc và phải là chuỗi không rỗng` });
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push({ field, message: `${label} không được vượt quá ${maxLength} ký tự` });
    return undefined;
  }
  return trimmed;
};

const checkEnum = (errors, field, value, allowed, label) => {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push({ field, message: `${label} phải là một trong: ${allowed.join(', ')}` });
    return false;
  }
  return true;
};

const checkUnitPrice = (errors, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push({ field: 'unitPrice', message: 'Đơn giá phải là số không âm' });
    return false;
  }
  return true;
};

/**
 * Fields that clients must not set directly:
 * - `code` is auto-generated
 * - `status` is changed only via activate / inactivate
 */
const checkForbiddenFields = (errors, body) => {
  if (body.code !== undefined) {
    errors.push({ field: 'code', message: 'Không được phép chỉ định mã sản phẩm (được tạo tự động)' });
  }
  if (body.status !== undefined) {
    errors.push({
      field: 'status',
      message: 'Không được phép chỉ định trạng thái; dùng activate/inactivate để thay đổi',
    });
  }
};

/* -------------------------------------------------------------------------- */
/* Validators (throw a 400 error on failure, return sanitized data on success) */
/* -------------------------------------------------------------------------- */

/**
 * Validate a product id (MongoDB ObjectId: 24 hex chars).
 * @returns {string} the id
 */
const validateProductId = (id) => {
  if (typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
    throw createValidationError(
      [{ field: 'id', message: 'ID sản phẩm không hợp lệ' }],
      'ID sản phẩm không hợp lệ'
    );
  }
  return id;
};

/**
 * Validate the query string of GET /products.
 * All params are optional; empty strings are treated as "not provided".
 * When present they must be single strings (this also blocks array / object
 * injection such as ?search[$ne]=x).
 * @returns {{category?: string, status?: string, search?: string, page: number, limit: number}}
 */
const validateListQuery = (query = {}) => {
  const errors = [];
  const result = { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT };
  const provided = (v) => v !== undefined && v !== '';

  const { category, status, search, page, limit } = query;

  if (provided(category)) {
    if (checkEnum(errors, 'category', category, CATEGORIES, 'Loại sản phẩm')) {
      result.category = category;
    }
  }

  if (provided(status)) {
    if (checkEnum(errors, 'status', status, STATUSES, 'Trạng thái')) {
      result.status = status;
    }
  }

  if (provided(search)) {
    if (typeof search !== 'string') {
      errors.push({ field: 'search', message: 'Từ khóa tìm kiếm phải là chuỗi' });
    } else if (search.trim().length > MAX_SEARCH_LENGTH) {
      errors.push({
        field: 'search',
        message: `Từ khóa tìm kiếm không được vượt quá ${MAX_SEARCH_LENGTH} ký tự`,
      });
    } else if (search.trim()) {
      result.search = search.trim();
    }
  }

  if (provided(page)) {
    if (isPositiveIntString(page)) {
      result.page = parseInt(page, 10);
    } else {
      errors.push({ field: 'page', message: 'page phải là số nguyên dương' });
    }
  }

  if (provided(limit)) {
    if (!isPositiveIntString(limit)) {
      errors.push({ field: 'limit', message: 'limit phải là số nguyên dương' });
    } else if (parseInt(limit, 10) > MAX_LIMIT) {
      errors.push({ field: 'limit', message: `limit không được vượt quá ${MAX_LIMIT}` });
    } else {
      result.limit = parseInt(limit, 10);
    }
  }

  if (errors.length) throw createValidationError(errors);
  return result;
};

/**
 * Validate the body of POST /products.
 * Required: name, category, unit. Optional: unitPrice.
 * `code` and `status` are rejected.
 * @returns {{name: string, category: string, unit: string, unitPrice?: number}}
 */
const validateCreateProduct = (body) => {
  assertBodyObject(body);

  const errors = [];
  checkForbiddenFields(errors, body);

  const name = checkRequiredString(errors, 'name', body.name, 'Tên sản phẩm', MAX_NAME_LENGTH);
  const unit = checkRequiredString(errors, 'unit', body.unit, 'Đơn vị tính', MAX_UNIT_LENGTH);

  if (body.category === undefined) {
    errors.push({ field: 'category', message: 'Loại sản phẩm là bắt buộc' });
  } else {
    checkEnum(errors, 'category', body.category, CATEGORIES, 'Loại sản phẩm');
  }

  if (body.unitPrice !== undefined) checkUnitPrice(errors, body.unitPrice);

  if (errors.length) throw createValidationError(errors);

  return {
    name,
    category: body.category,
    unit,
    ...(body.unitPrice !== undefined && { unitPrice: body.unitPrice }),
  };
};

/**
 * Validate the body of PUT /products/:id (partial update).
 * All fields optional, but at least one updatable field must be provided.
 * Provided fields follow the same rules as on create.
 * `code` and `status` are rejected.
 * @returns {{name?: string, category?: string, unit?: string, unitPrice?: number}}
 */
const validateUpdateProduct = (body) => {
  assertBodyObject(body);

  const errors = [];
  checkForbiddenFields(errors, body);

  const updatable = ['name', 'category', 'unit', 'unitPrice'];
  const hasUpdatableField = updatable.some((key) => body[key] !== undefined);

  if (!hasUpdatableField && errors.length === 0) {
    errors.push({
      field: 'body',
      message: `Cần cung cấp ít nhất một trường để cập nhật: ${updatable.join(', ')}`,
    });
  }

  const sanitized = {};

  if (body.name !== undefined) {
    const name = checkRequiredString(errors, 'name', body.name, 'Tên sản phẩm', MAX_NAME_LENGTH);
    if (name !== undefined) sanitized.name = name;
  }
  if (body.unit !== undefined) {
    const unit = checkRequiredString(errors, 'unit', body.unit, 'Đơn vị tính', MAX_UNIT_LENGTH);
    if (unit !== undefined) sanitized.unit = unit;
  }
  if (body.category !== undefined) {
    if (checkEnum(errors, 'category', body.category, CATEGORIES, 'Loại sản phẩm')) {
      sanitized.category = body.category;
    }
  }
  if (body.unitPrice !== undefined) {
    if (checkUnitPrice(errors, body.unitPrice)) sanitized.unitPrice = body.unitPrice;
  }

  if (errors.length) throw createValidationError(errors);
  return sanitized;
};

module.exports = {
  validateProductId,
  validateListQuery,
  validateCreateProduct,
  validateUpdateProduct,
};