const { isValidObjectId } = require('mongoose');

const SHIFT_VALUES = ['MORNING', 'AFTERNOON', 'EVENING'];
const MAX_REASON_LENGTH = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const isRealDate = (dateStr) => {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr.trim())) return false;
  const trimmed = dateStr.trim();
  const [y, m, d] = trimmed.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d
  );
};

const validateCreateBusySchedule = (body = {}, currentUserRole) => {
  const errors = {};
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : null;

  if (!data) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu báo bận không hợp lệ' },
      value: null,
    };
  }

  let cleanStaffId;
  const isStaffSelf = ['Veterinarian', 'Groomer'].includes(currentUserRole);
  if (!isBlank(data.staffId)) {
    if (typeof data.staffId !== 'string' || !isValidObjectId(data.staffId.trim())) {
      errors.staffId = 'Mã nhân sự (staffId) không hợp lệ';
    } else {
      cleanStaffId = data.staffId.trim();
    }
  } else if (!isStaffSelf) {
    errors.staffId = 'Vui lòng chọn nhân sự cần báo bận (staffId)';
  }

  let cleanDate = '';
  if (isBlank(data.date)) {
    errors.date = 'Ngày báo bận (date) là bắt buộc';
  } else if (!isRealDate(data.date)) {
    errors.date = 'Ngày báo bận (date) phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ';
  } else {
    cleanDate = data.date.trim();
  }

  let cleanShift = '';
  if (isBlank(data.shift) || typeof data.shift !== 'string') {
    errors.shift = `Ca báo bận (shift) phải là một trong: ${SHIFT_VALUES.join(', ')}`;
  } else {
    const normalizedShift = data.shift.trim().toUpperCase();
    if (!SHIFT_VALUES.includes(normalizedShift)) {
      errors.shift = `Ca báo bận (shift) phải là một trong: ${SHIFT_VALUES.join(', ')}`;
    } else {
      cleanShift = normalizedShift;
    }
  }

  let cleanReason = '';
  if (data.reason !== undefined && data.reason !== null) {
    if (typeof data.reason !== 'string') {
      errors.reason = 'Lý do báo bận phải là chuỗi ký tự';
    } else if (data.reason.trim().length > MAX_REASON_LENGTH) {
      errors.reason = `Lý do báo bận tối đa ${MAX_REASON_LENGTH} ký tự`;
    } else {
      cleanReason = data.reason.trim();
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      staffId: cleanStaffId,
      date: cleanDate,
      shift: cleanShift,
      reason: cleanReason,
    },
  };
};

const validateListBusySchedules = (query = {}) => {
  const errors = {};
  const clean = {};

  if (!isBlank(query.staffId)) {
    if (typeof query.staffId !== 'string' || !isValidObjectId(query.staffId.trim())) {
      errors.staffId = 'Mã nhân sự (staffId) không hợp lệ';
    } else {
      clean.staffId = query.staffId.trim();
    }
  }

  if (!isBlank(query.date)) {
    if (!isRealDate(query.date)) {
      errors.date = 'Ngày (date) phải đúng định dạng YYYY-MM-DD';
    } else {
      clean.date = query.date.trim();
    }
  }

  if (!isBlank(query.from)) {
    if (!isRealDate(query.from)) {
      errors.from = 'Ngày bắt đầu (from) phải đúng định dạng YYYY-MM-DD';
    } else {
      clean.from = query.from.trim();
    }
  }

  if (!isBlank(query.to)) {
    if (!isRealDate(query.to)) {
      errors.to = 'Ngày kết thúc (to) phải đúng định dạng YYYY-MM-DD';
    } else {
      clean.to = query.to.trim();
    }
  }

  if (clean.from && clean.to && clean.from > clean.to) {
    errors.dateRange = 'Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to)';
  }

  if (!isBlank(query.shift)) {
    const normalizedShift = typeof query.shift === 'string' ? query.shift.trim().toUpperCase() : '';
    if (!SHIFT_VALUES.includes(normalizedShift)) {
      errors.shift = `Ca làm việc (shift) phải là một trong: ${SHIFT_VALUES.join(', ')}`;
    } else {
      clean.shift = normalizedShift;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: clean,
  };
};

module.exports = {
  SHIFT_VALUES,
  isRealDate,
  validateCreateBusySchedule,
  validateListBusySchedules,
};

