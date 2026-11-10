const { isValidObjectId } = require('mongoose');

const MAX_SOAP_TEXT = 3000;
const MAX_PRESCRIPTION_TEXT = 300;
const MAX_WEIGHT = 500;
const MAX_DURATION_DAYS = 365;

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Kiểm tra ObjectId hợp lệ cho các tham số trên URL (appointmentServiceId, petId)
 */
const validateObjectIdParam = (id, fieldLabel = 'ID') => {
  if (isBlank(id) || typeof id !== 'string' || !isValidObjectId(id.trim())) {
    return {
      isValid: false,
      errors: { id: `${fieldLabel} không hợp lệ` },
      value: null,
    };
  }
  return {
    isValid: true,
    errors: {},
    value: id.trim(),
  };
};

/**
 * Kiểm tra và làm sạch danh sách đơn thuốc (prescriptions - UC-36)
 */
const sanitizePrescriptions = (prescriptions, errors) => {
  if (prescriptions === undefined) return undefined;

  if (!Array.isArray(prescriptions)) {
    errors.prescriptions = 'Danh sách đơn thuốc (prescriptions) phải là một mảng';
    return undefined;
  }

  const cleanList = [];

  for (let i = 0; i < prescriptions.length; i++) {
    const item = prescriptions[i];
    const prefix = `prescriptions[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors[prefix] = 'Phần tử đơn thuốc không hợp lệ';
      continue;
    }

    if (isBlank(item.productId) || typeof item.productId !== 'string' || !isValidObjectId(item.productId.trim())) {
      errors[`${prefix}.productId`] = 'Mã thuốc/sản phẩm (productId) không hợp lệ';
    }

    if (isBlank(item.dosage) || typeof item.dosage !== 'string') {
      errors[`${prefix}.dosage`] = 'Liều lượng (dosage) là bắt buộc';
    } else if (item.dosage.trim().length > MAX_PRESCRIPTION_TEXT) {
      errors[`${prefix}.dosage`] = `Liều lượng tối đa ${MAX_PRESCRIPTION_TEXT} ký tự`;
    }

    if (isBlank(item.frequency) || typeof item.frequency !== 'string') {
      errors[`${prefix}.frequency`] = 'Tần suất dùng (frequency) là bắt buộc';
    } else if (item.frequency.trim().length > MAX_PRESCRIPTION_TEXT) {
      errors[`${prefix}.frequency`] = `Tần suất dùng tối đa ${MAX_PRESCRIPTION_TEXT} ký tự`;
    }

    let cleanInstructions = '';
    if (!isBlank(item.instructions)) {
      if (typeof item.instructions !== 'string' || item.instructions.trim().length > MAX_PRESCRIPTION_TEXT) {
        errors[`${prefix}.instructions`] = `Hướng dẫn sử dụng phải là chuỗi tối đa ${MAX_PRESCRIPTION_TEXT} ký tự`;
      } else {
        cleanInstructions = item.instructions.trim();
      }
    }

    let cleanDurationDays = 1;
    if (item.durationDays !== undefined && item.durationDays !== null && item.durationDays !== '') {
      const days = typeof item.durationDays === 'string' ? Number(item.durationDays.trim()) : item.durationDays;
      if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_DURATION_DAYS) {
        errors[`${prefix}.durationDays`] = `Số ngày dùng thuốc (durationDays) phải là số nguyên từ 1 đến ${MAX_DURATION_DAYS}`;
      } else {
        cleanDurationDays = days;
      }
    } else {
      errors[`${prefix}.durationDays`] = 'Số ngày dùng thuốc (durationDays) là bắt buộc';
    }

    cleanList.push({
      productId: typeof item.productId === 'string' ? item.productId.trim() : item.productId,
      dosage: typeof item.dosage === 'string' ? item.dosage.trim() : '',
      frequency: typeof item.frequency === 'string' ? item.frequency.trim() : '',
      instructions: cleanInstructions,
      durationDays: cleanDurationDays,
    });
  }

  return cleanList;
};

/**
 * Validate dữ liệu khi Lưu nháp (Draft) hoặc Hoàn tất (Finalized) Bệnh án SOAP (UC-37, BR-13)
 */
const validateMedicalRecordPayload = (body = {}, { requireAllSoap = false } = {}) => {
  const errors = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu bệnh án không hợp lệ' },
      value: null,
    };
  }

  const soapFields = [
    { key: 'subjectiveNote', label: 'Triệu chứng chủ quan (Subjective - S)' },
    { key: 'objectiveNote', label: 'Kết quả khám lâm sàng (Objective - O)' },
    { key: 'assessment', label: 'Chẩn đoán bệnh (Assessment - A)' },
    { key: 'plan', label: 'Phác đồ điều trị (Plan - P)' },
  ];

  const cleanValue = {};

  for (const { key, label } of soapFields) {
    const raw = body[key];
    if (raw !== undefined) {
      if (raw !== null && typeof raw !== 'string') {
        errors[key] = `${label} phải là chuỗi ký tự`;
      } else if (typeof raw === 'string' && raw.trim().length > MAX_SOAP_TEXT) {
        errors[key] = `${label} không được vượt quá ${MAX_SOAP_TEXT} ký tự`;
      } else {
        cleanValue[key] = typeof raw === 'string' ? raw.trim() : '';
      }
    } else if (requireAllSoap) {
      // Nếu hoàn tất ngay mà không truyền thì đánh dấu để service kiểm tra kết hợp với bản Draft trong DB
      cleanValue[key] = undefined;
    }
  }

  // Ghi chú bổ sung (notes - không bắt buộc)
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      errors.notes = 'Ghi chú bổ sung (notes) phải là chuỗi ký tự';
    } else if (typeof body.notes === 'string' && body.notes.trim().length > MAX_SOAP_TEXT) {
      errors.notes = `Ghi chú bổ sung không được vượt quá ${MAX_SOAP_TEXT} ký tự`;
    } else {
      cleanValue.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    }
  }

  // Cân nặng mới nhất của thú cưng đo tại phòng khám (weight - cập nhật vào Pet.weight theo T-33)
  if (body.weight !== undefined && body.weight !== null && body.weight !== '') {
    const weightNum = typeof body.weight === 'string' ? Number(body.weight.trim()) : body.weight;
    if (typeof weightNum !== 'number' || !Number.isFinite(weightNum) || weightNum <= 0 || weightNum > MAX_WEIGHT) {
      errors.weight = `Cân nặng thú cưng phải là số lớn hơn 0 và tối đa ${MAX_WEIGHT} kg`;
    } else {
      cleanValue.weight = weightNum;
    }
  }

  // Đơn thuốc (prescriptions - UC-36)
  const cleanPrescriptions = sanitizePrescriptions(body.prescriptions, errors);
  if (cleanPrescriptions !== undefined) {
    cleanValue.prescriptions = cleanPrescriptions;
  }

  // Chuồng chờ chủ đón khi hoàn tất ca khám (waitingCageId - BR-10)
  if (!isBlank(body.waitingCageId)) {
    if (typeof body.waitingCageId !== 'string' || !isValidObjectId(body.waitingCageId.trim())) {
      errors.waitingCageId = 'Mã chuồng chờ đón (waitingCageId) không hợp lệ';
    } else {
      cleanValue.waitingCageId = body.waitingCageId.trim();
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: cleanValue,
  };
};

module.exports = {
  validateObjectIdParam,
  validateMedicalRecordPayload,
  isBlank,
};

