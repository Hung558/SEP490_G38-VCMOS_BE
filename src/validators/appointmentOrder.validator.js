// Each function returns { errors, value }:
//   - errors: [] when valid, otherwise [{ field, message }]
//   - value:  the sanitized data the controller should pass on to the service

const STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'];
const NOTE_MAX_LENGTH = 500;
const CANCEL_REASON_MAX_LENGTH = 200;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const APPOINTMENT_CODE_REGEX = /^APT-[A-Z0-9]{6}$/;

const isMongoId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

// Today as YYYY-MM-DD in Vietnam time (the server may run in UTC)
const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

// Rejects things like 2026-02-31 that pass the regex but are not real dates
const isRealDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const isPositiveInt = (v) => typeof v === 'string' && /^\d+$/.test(v) && Number(v) >= 1;

const isBlank = (v) => v === undefined || v === null || v === '';

const checkStatus = (status, errors) => {
  if (isBlank(status)) return undefined;
  if (!STATUSES.includes(status)) {
    errors.push({ field: 'status', message: 'Trạng thái không hợp lệ' });
    return undefined;
  }
  return status;
};

const checkDateRange = ({ from, to }, errors) => {
  const fromProvided = !isBlank(from);
  const toProvided = !isBlank(to);
  const fromOk = fromProvided && isRealDate(from);
  const toOk = toProvided && isRealDate(to);

  if (fromProvided && !fromOk) {
    errors.push({ field: 'from', message: 'from phải đúng định dạng YYYY-MM-DD và hợp lệ' });
  }
  if (toProvided && !toOk) {
    errors.push({ field: 'to', message: 'to phải đúng định dạng YYYY-MM-DD và hợp lệ' });
  }
  if (fromOk && toOk && from > to) {
    errors.push({ field: 'from', message: 'from không được lớn hơn to' });
  }

  return { from: fromOk ? from : undefined, to: toOk ? to : undefined };
};

const checkPagination = ({ page, limit }, errors) => {
  if (!isBlank(page) && !isPositiveInt(page)) {
    errors.push({ field: 'page', message: 'page phải là số nguyên >= 1' });
  }
  if (!isBlank(limit) && (!isPositiveInt(limit) || Number(limit) > MAX_LIMIT)) {
    errors.push({ field: 'limit', message: `limit phải từ 1 đến ${MAX_LIMIT}` });
  }
  return {
    page: isBlank(page) ? DEFAULT_PAGE : Number(page),
    limit: isBlank(limit) ? DEFAULT_LIMIT : Number(limit),
  };
};

// status + date range + pagination, shared by every list endpoint
const checkCommonListFilters = (query, errors) => ({
  status: checkStatus(query.status, errors),
  ...checkDateRange(query, errors),
  ...checkPagination(query, errors),
});

// Optional ObjectId query param (ownerId, petId, ...)
const checkOptionalMongoId = (value, field, errors) => {
  if (isBlank(value)) return undefined;
  if (!isMongoId(value)) {
    errors.push({ field, message: `${field} không hợp lệ` });
    return undefined;
  }
  return value;
};

const validateCreateOnlineAppointment = (body = {}) => {
  const errors = [];
  const { petId, date, note } = body;

  if (!isMongoId(petId)) {
    errors.push({ field: 'petId', message: 'petId không hợp lệ' });
  }

  if (!isRealDate(date)) {
    errors.push({ field: 'date', message: 'Ngày phải đúng định dạng YYYY-MM-DD và hợp lệ' });
  } else if (date < todayVN()) {
    errors.push({ field: 'date', message: 'Ngày hẹn không được ở trong quá khứ' });
  }

  let cleanNote;
  if (!isBlank(note)) {
    if (typeof note !== 'string') {
      errors.push({ field: 'note', message: 'Ghi chú phải là chuỗi' });
    } else {
      cleanNote = note.trim();
      if (cleanNote.length > NOTE_MAX_LENGTH) {
        errors.push({ field: 'note', message: `Ghi chú tối đa ${NOTE_MAX_LENGTH} ký tự` });
      }
    }
  }

  return { errors, value: { petId, date, note: cleanNote } };
};

const validateListOnlineAppointments = (query = {}) => {
  const errors = [];
  const value = checkCommonListFilters(query, errors);
  return { errors, value };
};

// Query strings arrive as 'true' / 'false'; accept real booleans too
const parseBoolean = (v) => {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
};

const validateListAllAppointments = (query = {}) => {
  const errors = [];
  const { isOnline, ownerId, petId, code } = query;

  let cleanIsOnline;
  if (!isBlank(isOnline)) {
    cleanIsOnline = parseBoolean(isOnline);
    if (cleanIsOnline === undefined) {
      errors.push({ field: 'isOnline', message: 'isOnline phải là true hoặc false' });
    }
  }

  let cleanCode;
  if (!isBlank(code)) {
    cleanCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
    if (!APPOINTMENT_CODE_REGEX.test(cleanCode)) {
      errors.push({ field: 'code', message: 'Mã lịch hẹn không hợp lệ (ví dụ: APT-K7M2QX)' });
    }
  }

  return {
    errors,
    value: {
      ...checkCommonListFilters(query, errors),
      isOnline: cleanIsOnline,
      ownerId: checkOptionalMongoId(ownerId, 'ownerId', errors),
      petId: checkOptionalMongoId(petId, 'petId', errors),
      code: cleanCode,
    },
  };
};

const validateAppointmentId = (params = {}) => {
  const errors = [];
  if (!isMongoId(params.id)) {
    errors.push({ field: 'id', message: 'id không hợp lệ' });
  }
  return { errors, value: params.id };
};

// UC-18: Bắt buộc nhập lý do hủy (MSG22), tối đa 200 ký tự (MSG03)
const validateCancelAppointment = (body = {}) => {
  const errors = [];
  const rawReason = body.reason !== undefined ? body.reason : body.cancelReason;
  let cleanReason;

  if (isBlank(rawReason)) {
    errors.push({ field: 'reason', message: 'Vui lòng nhập lý do hủy' });
  } else if (typeof rawReason !== 'string') {
    errors.push({ field: 'reason', message: 'Lý do hủy phải là chuỗi' });
  } else {
    cleanReason = rawReason.trim();
    if (!cleanReason) {
      errors.push({ field: 'reason', message: 'Vui lòng nhập lý do hủy' });
    } else if (cleanReason.length > CANCEL_REASON_MAX_LENGTH) {
      errors.push({
        field: 'reason',
        message: `Lý do hủy tối đa ${CANCEL_REASON_MAX_LENGTH} ký tự`,
      });
    }
  }

  return { errors, value: { reason: cleanReason } };
};

module.exports = {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateListAllAppointments,
  validateAppointmentId,
  validateCancelAppointment,
};