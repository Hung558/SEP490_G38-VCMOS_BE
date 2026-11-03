// Each function returns { errors, value }:
//   - errors: [] when valid, otherwise [{ field, message }]
//   - value:  the sanitized data the controller should pass on to the service

const STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'];
const NOTE_MAX_LENGTH = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

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
  const { status, from, to, page, limit } = query;

  if (!isBlank(status) && !STATUSES.includes(status)) {
    errors.push({ field: 'status', message: 'Trạng thái không hợp lệ' });
  }

  if (!isBlank(from) && !isRealDate(from)) {
    errors.push({ field: 'from', message: 'from phải đúng định dạng YYYY-MM-DD và hợp lệ' });
  }
  if (!isBlank(to) && !isRealDate(to)) {
    errors.push({ field: 'to', message: 'to phải đúng định dạng YYYY-MM-DD và hợp lệ' });
  }
  if (!isBlank(from) && !isBlank(to) && isRealDate(from) && isRealDate(to) && from > to) {
    errors.push({ field: 'from', message: 'from không được lớn hơn to' });
  }

  if (!isBlank(page) && !isPositiveInt(page)) {
    errors.push({ field: 'page', message: 'page phải là số nguyên >= 1' });
  }
  if (!isBlank(limit) && (!isPositiveInt(limit) || Number(limit) > MAX_LIMIT)) {
    errors.push({ field: 'limit', message: `limit phải từ 1 đến ${MAX_LIMIT}` });
  }

  return {
    errors,
    value: {
      status: isBlank(status) ? undefined : status,
      from: isBlank(from) ? undefined : from,
      to: isBlank(to) ? undefined : to,
      page: isBlank(page) ? DEFAULT_PAGE : Number(page),
      limit: isBlank(limit) ? DEFAULT_LIMIT : Number(limit),
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

module.exports = {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateAppointmentId,
};