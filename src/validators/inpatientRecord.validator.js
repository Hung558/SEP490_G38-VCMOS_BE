const mongoose = require('mongoose');

const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);
const isOptText = (v) => v === undefined || v === null || typeof v === 'string';

// Mỗi hàm trả về { errors: string[], value } — controller sẽ trả 400 nếu errors.length > 0
const validateCreate = (body = {}) => {
  const errors = [];
  const { petId, orderId, cageId, initialDiagnosis, treatmentPlan } = body;

  if (!isId(petId)) errors.push('petId không hợp lệ');
  if (!isId(orderId)) errors.push('orderId không hợp lệ');
  if (!isId(cageId)) errors.push('cageId không hợp lệ');
  if (!isOptText(initialDiagnosis)) errors.push('initialDiagnosis phải là chuỗi');
  if (!isOptText(treatmentPlan)) errors.push('treatmentPlan phải là chuỗi');

  return {
    errors,
    value: {
      petId,
      orderId,
      cageId,
      initialDiagnosis: initialDiagnosis?.trim(),
      treatmentPlan: treatmentPlan?.trim(),
    },
  };
};

const STATUSES = ['Admitted', 'Discharged'];

const validateListQuery = (query = {}) => {
  const errors = [];
  const { status, petId, attendingVetId, mine } = query;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);

  if (status !== undefined && !STATUSES.includes(status)) errors.push('status không hợp lệ');
  if (petId !== undefined && !isId(petId)) errors.push('petId không hợp lệ');
  if (attendingVetId !== undefined && !isId(attendingVetId)) errors.push('attendingVetId không hợp lệ');

  return { errors, value: { status, petId, attendingVetId, mine: mine === 'true', page, limit } };
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 2000;

// Đúng định dạng YYYY-MM-DD và là ngày có thật trên lịch (loại 2026-02-30)
const isValidDateString = (v) => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const validateCreateLog = (body = {}) => {
  const errors = [];
  const { date, observations, notes } = body;

  if (date !== undefined && date !== null && !isValidDateString(date)) {
    errors.push('date phải có định dạng YYYY-MM-DD và là ngày hợp lệ');
  }
  for (const [name, v] of [['observations', observations], ['notes', notes]]) {
    if (!isOptText(v)) errors.push(`${name} phải là chuỗi`);
    else if (typeof v === 'string' && v.trim().length > MAX_TEXT) {
      errors.push(`${name} không được vượt quá ${MAX_TEXT} ký tự`);
    }
  }

  const obs = typeof observations === 'string' ? observations.trim() : '';
  const nt = typeof notes === 'string' ? notes.trim() : '';
  if (!errors.length && !obs && !nt) errors.push('Cần nhập ít nhất observations hoặc notes');

  return { errors, value: { date: date || undefined, observations: obs || undefined, notes: nt || undefined } };
};

const validateLogQuery = (query = {}) => {
  const errors = [];
  const { date, from, to } = query;
  for (const [name, v] of [['date', date], ['from', from], ['to', to]]) {
    if (v !== undefined && !isValidDateString(v)) errors.push(`${name} phải có định dạng YYYY-MM-DD và là ngày hợp lệ`);
  }
  if (!errors.length && from && to && from > to) errors.push('from không được sau to');
  return { errors, value: { date, from, to } };
};

// Chủ thú cưng xem nhật ký: dùng lại kiểm tra date/from/to của validateLogQuery, thêm recordId và phân trang
const validateOwnerLogQuery = (query = {}) => {
  const base = validateLogQuery(query);
  const errors = [...base.errors];
  const { recordId } = query;
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);

  if (recordId !== undefined && !isId(recordId)) errors.push('recordId không hợp lệ');

  return { errors, value: { ...base.value, recordId, page, limit } };
};

module.exports = {
  validateCreate,
  validateListQuery,
  validateCreateLog,
  validateLogQuery,
  validateOwnerLogQuery,
  isId,
};