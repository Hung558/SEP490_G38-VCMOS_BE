const Cage = require('../models/Cage');

class ServiceError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

// Translate Mongo errors into ServiceErrors
const handleError = (err) => {
  if (err instanceof ServiceError) throw err;
  if (err.code === 11000) {
    throw new ServiceError('Nhãn chuồng đã tồn tại', 409);
  }
  throw err;
};

/**
 * Create a cage.
 */
async function createCage(data) {
  try {
    return await Cage.create(data);
  } catch (err) {
    handleError(err);
  }
}

/**
 * List cages with optional filters and pagination.
 * filters: { status, size, isIsolated }
 * options: { page = 1, limit = 20, sort = 'label' }
 */
async function getCages(filters = {}, options = {}) {
  const { page = 1, limit = 20, sort = 'label' } = options;

  const [items, total] = await Promise.all([
    Cage.find(filters)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Cage.countDocuments(filters),
  ]);

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get a single cage by id.
 */
async function getCageById(id) {
  const cage = await Cage.findById(id);
  if (!cage) throw new ServiceError('Không tìm thấy chuồng', 404);
  return cage;
}

/**
 * Update a cage by id.
 */
async function updateCage(id, data) {
  try {
    const cage = await Cage.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    });
    if (!cage) throw new ServiceError('Không tìm thấy chuồng', 404);
    return cage;
  } catch (err) {
    handleError(err);
  }
}

module.exports = {
  ServiceError,
  createCage,
  getCages,
  getCageById,
  updateCage,
};