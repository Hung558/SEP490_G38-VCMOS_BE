const { isBlank } = require('./auth.validator');

const SERVICE_CATEGORIES = ['Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'];
const SERVICE_STATUSES = ['Active', 'Inactive'];
const MIN_SERVICE_NAME = 3;
const MAX_SERVICE_NAME = 100;
const MIN_DURATION = 5;
const MAX_DURATION = 480;
const MAX_DESCRIPTION = 500;

// SCR-29 & UC-66: Validate dữ liệu khi Admin thêm mới dịch vụ
const validateCreateService = ({ name, category, defaultDuration, basePrice, description, status } = {}) => {
  const errors = {};

  if (isBlank(name)) {
    errors.name = 'Tên dịch vụ là bắt buộc';
  } else {
    const trimmedName = name.trim();
    if (trimmedName.length < MIN_SERVICE_NAME) {
      errors.name = `Tên dịch vụ phải có ít nhất ${MIN_SERVICE_NAME} ký tự`;
    } else if (trimmedName.length > MAX_SERVICE_NAME) {
      errors.name = `Tên dịch vụ không được vượt quá ${MAX_SERVICE_NAME} ký tự`;
    }
  }

  if (isBlank(category)) {
    errors.category = 'Danh mục dịch vụ là bắt buộc';
  } else if (!SERVICE_CATEGORIES.includes(category)) {
    errors.category = 'Danh mục dịch vụ không hợp lệ';
  }

  if (defaultDuration === undefined || defaultDuration === null || defaultDuration === '') {
    errors.defaultDuration = 'Thời lượng thực hiện là bắt buộc';
  } else {
    const durationNum = Number(defaultDuration);
    if (!Number.isInteger(durationNum) || durationNum < MIN_DURATION || durationNum > MAX_DURATION) {
      errors.defaultDuration = `Thời lượng thực hiện phải là số nguyên từ ${MIN_DURATION} đến ${MAX_DURATION} phút`;
    }
  }

  if (basePrice === undefined || basePrice === null || basePrice === '') {
    errors.basePrice = 'Giá niêm yết là bắt buộc';
  } else {
    const priceNum = Number(basePrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.basePrice = 'Giá niêm yết phải là số lớn hơn hoặc bằng 0';
    }
  }

  if (description !== undefined && description !== null && description !== '') {
    if (typeof description !== 'string') {
      errors.description = 'Mô tả dịch vụ không hợp lệ';
    } else if (description.trim().length > MAX_DESCRIPTION) {
      errors.description = `Mô tả dịch vụ không được vượt quá ${MAX_DESCRIPTION} ký tự`;
    }
  }

  if (status !== undefined && status !== null && status !== '') {
    if (!SERVICE_STATUSES.includes(status)) {
      errors.status = 'Trạng thái dịch vụ chỉ được là Active hoặc Inactive';
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

// SCR-29 & UC-66: Validate dữ liệu khi Admin cập nhật thông tin dịch vụ
const validateUpdateService = (payload = {}) => {
  return validateCreateService(payload);
};

// SCR-29 & UC-66: Validate khi Admin bật/tắt trạng thái hoạt động của dịch vụ
const validateUpdateServiceStatus = ({ status } = {}) => {
  const errors = {};

  if (isBlank(status)) {
    errors.status = 'Trạng thái dịch vụ là bắt buộc';
  } else if (!SERVICE_STATUSES.includes(status)) {
    errors.status = 'Trạng thái dịch vụ chỉ được là Active hoặc Inactive';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
};

module.exports = {
  SERVICE_CATEGORIES,
  SERVICE_STATUSES,
  validateCreateService,
  validateUpdateService,
  validateUpdateServiceStatus,
};

