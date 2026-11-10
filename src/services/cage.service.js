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

// Tải trọng tối đa theo kích thước chuồng (BR-11: S <= 5kg, M: 5-15kg, L: 15-30kg, XL: > 30kg)
const CAGE_MAX_WEIGHT_BY_SIZE = {
  S: 5,
  M: 15,
  L: 30,
  XL: Infinity,
};

/**
 * Kiểm tra chuồng có phù hợp với cân nặng thú cưng và yêu cầu cách ly hay không (BR-11).
 * @param {string} cageSize - 'S' | 'M' | 'L' | 'XL'
 * @param {number} [petWeight] - Cân nặng thú cưng (kg)
 * @param {boolean} [isIsolated=false] - Cờ chuồng cách ly
 * @param {boolean} [requiresIsolation=false] - Thú cưng có cần cách ly không
 * @param {number} [maxWeightKg] - Tải trọng tối đa riêng của chuồng (nếu có cấu hình)
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canCageAccommodatePet(
  cageSize,
  petWeight,
  isIsolated = false,
  requiresIsolation = false,
  maxWeightKg = null
) {
  if (requiresIsolation !== undefined && requiresIsolation !== null) {
    if (Boolean(isIsolated) !== Boolean(requiresIsolation)) {
      return {
        allowed: false,
        reason: requiresIsolation
          ? 'Thú cưng nghi nhiễm bệnh truyền nhiễm bắt buộc phải xếp vào chuồng cách ly (isIsolated = true)'
          : 'Thú cưng thông thường không được xếp vào chuồng cách ly (isIsolated = false)',
      };
    }
  }

  if (typeof petWeight === 'number' && Number.isFinite(petWeight) && petWeight > 0 && cageSize) {
    const limit =
      typeof maxWeightKg === 'number' && maxWeightKg > 0
        ? maxWeightKg
        : CAGE_MAX_WEIGHT_BY_SIZE[cageSize];

    if (limit !== undefined && petWeight > limit) {
      return {
        allowed: false,
        reason: `Chuồng cỡ ${cageSize} (tối đa ${limit}kg) không phù hợp với thú cưng nặng ${petWeight}kg`,
      };
    }
  }

  return { allowed: true };
}

module.exports = {
  ServiceError,
  CAGE_MAX_WEIGHT_BY_SIZE,
  canCageAccommodatePet,
  createCage,
  getCages,
  getCageById,
  updateCage,
};