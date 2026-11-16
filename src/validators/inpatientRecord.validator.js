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

module.exports = { validateCreate, validateListQuery, isId };