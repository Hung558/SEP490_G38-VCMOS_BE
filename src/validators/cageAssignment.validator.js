const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.errors = errors;
  }
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Check a MongoDB ObjectId passed as a 24-char hex string.
 * Rejects non-strings (objects, arrays, numbers) to avoid query-operator
 * injection such as { "$ne": null }.
 * Returns an error message, or null if valid.
 */
const checkObjectId = (value, label) => {
  if (value === undefined || value === null || value === '') {
    return `${label} là bắt buộc`;
  }
  if (typeof value !== 'string' || !OBJECT_ID_REGEX.test(value.trim())) {
    return `${label} không hợp lệ`;
  }
  return null;
};

/**
 * Validate data for creating a cage assignment.
 * Expects: { cageId, orderId, assignedById }
 *
 * Throws ValidationError (statusCode 400) listing every problem found.
 */
const validateCreateCageAssignment = (data) => {
  if (!isPlainObject(data)) {
    throw new ValidationError(['Dữ liệu gửi lên không hợp lệ']);
  }

  const errors = [
    checkObjectId(data.cageId, 'ID chuồng'),
    checkObjectId(data.orderId, 'ID đơn hẹn'),
    checkObjectId(data.assignedById, 'ID người phân công'),
  ].filter(Boolean);

  if (errors.length) throw new ValidationError(errors);

  return {
    cageId: data.cageId.trim(),
    orderId: data.orderId.trim(),
    assignedById: data.assignedById.trim(),
  };
};

/**
 * Validate the assignment id from the route params (req.params.id).
 * Returns the trimmed id string.
 */
const validateCageAssignmentId = (id) => {
  const error = checkObjectId(id, 'ID phân công chuồng');
  if (error) throw new ValidationError([error]);
  return id.trim();
};

/**
 * Validate optional list filters from the query string (req.query).
 * Supported: cageId, orderId, active ('true' | 'false').
 * Empty values are ignored; unknown keys are dropped.
 */
const validateListCageAssignmentsQuery = (query = {}) => {
  if (!isPlainObject(query)) {
    throw new ValidationError(['Tham số truy vấn không hợp lệ']);
  }

  const errors = [];
  const filters = {};

  const isProvided = (v) => v !== undefined && v !== null && v !== '';

  if (isProvided(query.cageId)) {
    const err = checkObjectId(query.cageId, 'ID chuồng');
    if (err) errors.push(err);
    else filters.cageId = query.cageId.trim();
  }

  if (isProvided(query.orderId)) {
    const err = checkObjectId(query.orderId, 'ID đơn hẹn');
    if (err) errors.push(err);
    else filters.orderId = query.orderId.trim();
  }

  if (isProvided(query.active)) {
    const raw = typeof query.active === 'string' ? query.active.trim().toLowerCase() : query.active;
    if (raw === 'true' || raw === true) filters.active = true;
    else if (raw === 'false' || raw === false) filters.active = false;
    else errors.push("Tham số active chỉ nhận giá trị 'true' hoặc 'false'");
  }

  if (errors.length) throw new ValidationError(errors);

  return filters;
};

module.exports = {
  ValidationError,
  validateCreateCageAssignment,
  validateCageAssignmentId,
  validateListCageAssignmentsQuery,
};