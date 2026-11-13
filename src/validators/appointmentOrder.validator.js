// Each function returns { errors, value }:
//   - errors: [] when valid, otherwise [{ field, message }]
//   - value:  the sanitized data the controller should pass on to the service

const STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'];
const NOTE_MAX_LENGTH = 500;
const INTAKE_FIELD_MAX_LENGTH = 500;
const CANCEL_REASON_MAX_LENGTH = 200;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const APPOINTMENT_CODE_REGEX = /^APT-[A-Z0-9]{6}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CLINIC_OPEN_TIME = '08:00';
const CLINIC_CLOSE_TIME = '18:00';

const isMongoId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

// Today as YYYY-MM-DD in Vietnam time (the server may run in UTC)
const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

// Current time as HH:mm in Vietnam time
const currentTimeVN = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

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
  const { petId, date, note, slotStart, slotEnd } = body;

  if (!isMongoId(petId)) {
    errors.push({ field: 'petId', message: 'petId không hợp lệ' });
  }

  const dateOk = isRealDate(date);
  if (!dateOk) {
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

  let cleanSlotStart;
  if (!isBlank(slotStart)) {
    if (typeof slotStart !== 'string' || !TIME_REGEX.test(slotStart.trim())) {
      errors.push({ field: 'slotStart', message: 'slotStart phải có định dạng HH:mm (ví dụ: 09:00)' });
    } else {
      cleanSlotStart = slotStart.trim();
      if (cleanSlotStart < CLINIC_OPEN_TIME || cleanSlotStart >= CLINIC_CLOSE_TIME) {
        errors.push({
          field: 'slotStart',
          message: `Giờ hẹn phải nằm trong khung giờ làm việc (${CLINIC_OPEN_TIME} - ${CLINIC_CLOSE_TIME})`,
        });
      } else if (dateOk && date === todayVN() && cleanSlotStart <= currentTimeVN()) {
        errors.push({ field: 'slotStart', message: 'Giờ hẹn không được ở trong quá khứ' });
      }
    }
  }

  let cleanSlotEnd;
  if (!isBlank(slotEnd)) {
    if (typeof slotEnd !== 'string' || !TIME_REGEX.test(slotEnd.trim())) {
      errors.push({ field: 'slotEnd', message: 'slotEnd phải có định dạng HH:mm (ví dụ: 09:30)' });
    } else {
      cleanSlotEnd = slotEnd.trim();
      if (cleanSlotEnd > CLINIC_CLOSE_TIME) {
        errors.push({
          field: 'slotEnd',
          message: `Giờ kết thúc dự kiến vượt quá giờ đóng cửa phòng khám (${CLINIC_CLOSE_TIME})`,
        });
      } else if (cleanSlotStart && cleanSlotEnd <= cleanSlotStart) {
        errors.push({ field: 'slotEnd', message: 'slotEnd phải lớn hơn slotStart' });
      }
    }
  }

  const value = { petId, date, note: cleanNote };
  if (cleanSlotStart !== undefined) value.slotStart = cleanSlotStart;
  if (cleanSlotEnd !== undefined) value.slotEnd = cleanSlotEnd;

  return { errors, value };
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

/**
 * Kiểm tra và làm sạch phiếu kê khai ban đầu của lễ tân (intake: { symptoms, initialCondition }).
 * Dùng chung cho cả check-in lịch hẹn online và tiếp nhận walk-in tại quầy.
 */
const validateIntakePayload = (rawIntake) => {
  const fieldErrors = {};

  if (!rawIntake || typeof rawIntake !== 'object' || Array.isArray(rawIntake)) {
    fieldErrors.intake = 'Phiếu kê khai ban đầu (intake) phải là một đối tượng hợp lệ';
    return { fieldErrors, value: undefined };
  }

  const cleanSymptoms =
    typeof rawIntake.symptoms === 'string' ? rawIntake.symptoms.trim() : '';
  const cleanInitialCondition =
    typeof rawIntake.initialCondition === 'string' ? rawIntake.initialCondition.trim() : '';

  if (typeof rawIntake.symptoms !== 'string' || !cleanSymptoms) {
    fieldErrors.symptoms = 'Vui lòng nhập triệu chứng ban đầu';
  } else if (cleanSymptoms.length > INTAKE_FIELD_MAX_LENGTH) {
    fieldErrors.symptoms = `Triệu chứng ban đầu tối đa ${INTAKE_FIELD_MAX_LENGTH} ký tự`;
  }

  if (typeof rawIntake.initialCondition !== 'string' || !cleanInitialCondition) {
    fieldErrors.initialCondition = 'Vui lòng nhập tình trạng lúc đến';
  } else if (cleanInitialCondition.length > INTAKE_FIELD_MAX_LENGTH) {
    fieldErrors.initialCondition = `Tình trạng lúc đến tối đa ${INTAKE_FIELD_MAX_LENGTH} ký tự`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, value: undefined };
  }

  return {
    fieldErrors: {},
    value: {
      symptoms: cleanSymptoms,
      initialCondition: cleanInitialCondition,
    },
  };
};

// Kiểm tra dữ liệu lễ tân gửi khi Check-in (cageId, requiresIsolation, và phiếu kê khai ban đầu intake)
const validateCheckInAppointment = (body = {}) => {
  const errors = [];
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const { cageId, requiresIsolation, intake } = data;

  let cleanCageId;
  if (!isBlank(cageId)) {
    if (!isMongoId(String(cageId))) {
      errors.push({ field: 'cageId', message: 'cageId không hợp lệ' });
    } else {
      cleanCageId = String(cageId);
    }
  }

  let cleanRequiresIsolation = false;
  if (requiresIsolation !== undefined && requiresIsolation !== null) {
    if (typeof requiresIsolation !== 'boolean') {
      errors.push({ field: 'requiresIsolation', message: 'requiresIsolation phải là true hoặc false' });
    } else {
      cleanRequiresIsolation = requiresIsolation;
    }
  }

  let cleanIntake;
  if (intake !== undefined) {
    const intakeResult = validateIntakePayload(intake);
    if (intakeResult.fieldErrors.intake) {
      errors.push({ field: 'intake', message: intakeResult.fieldErrors.intake });
    }
    if (intakeResult.fieldErrors.symptoms) {
      errors.push({ field: 'intake.symptoms', message: intakeResult.fieldErrors.symptoms });
    }
    if (intakeResult.fieldErrors.initialCondition) {
      errors.push({
        field: 'intake.initialCondition',
        message: intakeResult.fieldErrors.initialCondition,
      });
    }
    cleanIntake = intakeResult.value;
  }

  return {
    errors,
    value: {
      cageId: cleanCageId,
      requiresIsolation: cleanRequiresIsolation,
      intake: cleanIntake,
    },
  };
};

module.exports = {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateListAllAppointments,
  validateAppointmentId,
  validateCancelAppointment,
  validateCheckInAppointment,
  validateIntakePayload,
};