const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const TIMELINE_TYPES = ['All', 'Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'];
const ORDER_STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Kiểm tra chuỗi YYYY-MM-DD và đảm bảo là ngày có thật trên lịch (loại 2026-02-31)
const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/**
 * Kiểm tra petId trên params để trả 400 rõ ràng thay vì CastError 500 từ Mongoose.
 */
const validatePetIdParam = (petId) => {
  if (typeof petId !== 'string' || !OBJECT_ID_REGEX.test(petId)) {
    return {
      isValid: false,
      errors: { petId: 'ID thú cưng không hợp lệ' },
    };
  }
  return { isValid: true, value: petId };
};

/**
 * Kiểm tra & chuẩn hóa query lọc Dòng thời gian thú cưng hợp nhất (SCR-08, UC-13).
 * Query hỗ trợ: type, status, from, to, page, limit.
 */
const validatePetTimelineQuery = (query = {}) => {
  const errors = {};
  const value = {
    type: 'All',
    status: undefined,
    from: undefined,
    to: undefined,
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  };

  if (!isBlank(query.type)) {
    const cleanType = typeof query.type === 'string' ? query.type.trim() : '';
    if (!TIMELINE_TYPES.includes(cleanType)) {
      errors.type = `Loại mốc thời gian phải là một trong: ${TIMELINE_TYPES.join(', ')}`;
    } else {
      value.type = cleanType;
    }
  }

  if (!isBlank(query.status)) {
    const cleanStatus = typeof query.status === 'string' ? query.status.trim() : '';
    if (!ORDER_STATUSES.includes(cleanStatus)) {
      errors.status = `Trạng thái lịch hẹn phải là một trong: ${ORDER_STATUSES.join(', ')}`;
    } else {
      value.status = cleanStatus;
    }
  }

  if (!isBlank(query.from)) {
    const cleanFrom = typeof query.from === 'string' ? query.from.trim() : '';
    if (!isValidDateString(cleanFrom)) {
      errors.from = 'Ngày bắt đầu (from) phải có định dạng YYYY-MM-DD hợp lệ';
    } else {
      value.from = cleanFrom;
    }
  }

  if (!isBlank(query.to)) {
    const cleanTo = typeof query.to === 'string' ? query.to.trim() : '';
    if (!isValidDateString(cleanTo)) {
      errors.to = 'Ngày kết thúc (to) phải có định dạng YYYY-MM-DD hợp lệ';
    } else {
      value.to = cleanTo;
    }
  }

  if (value.from && value.to && value.from > value.to) {
    errors.to = 'Ngày kết thúc (to) phải lớn hơn hoặc bằng ngày bắt đầu (from)';
  }

  if (!isBlank(query.page)) {
    const parsedPage = Number(query.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      errors.page = 'Trang (page) phải là số nguyên từ 1 trở lên';
    } else {
      value.page = parsedPage;
    }
  }

  if (!isBlank(query.limit)) {
    const parsedLimit = Number(query.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
      errors.limit = `Số lượng mỗi trang (limit) phải là số nguyên từ 1 đến ${MAX_LIMIT}`;
    } else {
      value.limit = parsedLimit;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value,
  };
};

module.exports = {
  TIMELINE_TYPES,
  ORDER_STATUSES,
  validatePetIdParam,
  validatePetTimelineQuery,
};

