const mongoose = require('mongoose');

const SIZES = ['S', 'M', 'L', 'XL'];
const STATUSES = ['Available', 'Occupied'];
const SORT_FIELDS = ['label', 'size', 'status', 'createdAt', 'updatedAt'];
const MAX_LIMIT = 100;

class ValidationError extends Error {
  constructor(errors) {
    super(errors[0]);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors; // all messages, for the controller to return if wanted
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const pick = (obj, fields) =>
  fields.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});

// Accepts true/false or 'true'/'false' (query strings). Returns undefined if invalid.
const toBoolean = (v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
};

const toPositiveInt = (v) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * Validate and sanitize the writable cage fields.
 * Pushes messages into `errors` and returns the cleaned data.
 */
function checkCageFields(body, { requireAll }) {
  const errors = [];
  const data = {};

  // label
  if (body.label !== undefined) {
    if (typeof body.label !== 'string' || body.label.trim() === '') {
      errors.push('Nhãn chuồng phải là chuỗi không rỗng');
    } else {
      data.label = body.label.trim();
    }
  } else if (requireAll) {
    errors.push('Nhãn chuồng là bắt buộc');
  }

  // size
  if (body.size !== undefined) {
    if (!SIZES.includes(body.size)) {
      errors.push(`Kích thước chuồng phải là một trong: ${SIZES.join(', ')}`);
    } else {
      data.size = body.size;
    }
  } else if (requireAll) {
    errors.push('Kích thước chuồng là bắt buộc');
  }

  // isIsolated
  if (body.isIsolated !== undefined) {
    if (typeof body.isIsolated !== 'boolean') {
      errors.push('Trạng thái cách ly phải là true hoặc false');
    } else {
      data.isIsolated = body.isIsolated;
    }
  }

  // status
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      errors.push(`Trạng thái chuồng phải là một trong: ${STATUSES.join(', ')}`);
    } else {
      data.status = body.status;
    }
  }

  return { data, errors };
}

/**
 * Validate a cage id (e.g. req.params.id).
 * Returns the id.
 */
function validateCageId(id) {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    throw new ValidationError(['Mã chuồng không hợp lệ']);
  }
  return id;
}

/**
 * Validate the body for creating a cage (e.g. req.body).
 * Returns sanitized data ready for cage.service.createCage.
 */
function validateCreateCage(body) {
  if (!isPlainObject(body)) {
    throw new ValidationError(['Dữ liệu gửi lên không hợp lệ']);
  }

  const { data, errors } = checkCageFields(pick(body, ['label', 'size', 'isIsolated', 'status']), {
    requireAll: true,
  });
  if (errors.length) throw new ValidationError(errors);

  return data;
}

/**
 * Validate the body for updating a cage (e.g. req.body).
 * Only provided fields are checked; at least one is required.
 * Returns sanitized data ready for cage.service.updateCage.
 */
function validateUpdateCage(body) {
  if (!isPlainObject(body)) {
    throw new ValidationError(['Dữ liệu gửi lên không hợp lệ']);
  }

  const { data, errors } = checkCageFields(pick(body, ['label', 'size', 'isIsolated', 'status']), {
    requireAll: false,
  });
  if (errors.length) throw new ValidationError(errors);
  if (Object.keys(data).length === 0) {
    throw new ValidationError(['Cần cung cấp ít nhất một trường để cập nhật']);
  }

  return data;
}

/**
 * Validate the query for listing cages (e.g. req.query).
 * Returns { filters, options } ready for cage.service.getCages.
 */
function validateGetCages(query = {}) {
  if (!isPlainObject(query)) {
    throw new ValidationError(['Tham số truy vấn không hợp lệ']);
  }

  const errors = [];
  const filters = {};
  const options = {};

  if (query.status !== undefined) {
    if (!STATUSES.includes(query.status)) {
      errors.push(`Trạng thái chuồng phải là một trong: ${STATUSES.join(', ')}`);
    } else {
      filters.status = query.status;
    }
  }

  if (query.size !== undefined) {
    if (!SIZES.includes(query.size)) {
      errors.push(`Kích thước chuồng phải là một trong: ${SIZES.join(', ')}`);
    } else {
      filters.size = query.size;
    }
  }

  if (query.isIsolated !== undefined) {
    const value = toBoolean(query.isIsolated);
    if (value === undefined) {
      errors.push('Trạng thái cách ly phải là true hoặc false');
    } else {
      filters.isIsolated = value;
    }
  }

  if (query.page !== undefined) {
    const page = toPositiveInt(query.page);
    if (page === undefined) errors.push('Số trang phải là số nguyên dương');
    else options.page = page;
  }

  if (query.limit !== undefined) {
    const limit = toPositiveInt(query.limit);
    if (limit === undefined || limit > MAX_LIMIT) {
      errors.push(`Số lượng mỗi trang phải là số nguyên từ 1 đến ${MAX_LIMIT}`);
    } else {
      options.limit = limit;
    }
  }

  if (query.sort !== undefined) {
    const field = typeof query.sort === 'string' ? query.sort.replace(/^-/, '') : '';
    if (!SORT_FIELDS.includes(field)) {
      errors.push(`Trường sắp xếp phải là một trong: ${SORT_FIELDS.join(', ')} (thêm "-" phía trước để sắp xếp giảm dần)`);
    } else {
      options.sort = query.sort;
    }
  }

  if (errors.length) throw new ValidationError(errors);

  return { filters, options };
}

module.exports = {
  ValidationError,
  validateCageId,
  validateCreateCage,
  validateUpdateCage,
  validateGetCages,
};