const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const MIN_DESCRIPTION_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_AI_PHOTOS = 3;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB mỗi ảnh
const MAX_SYMPTOMS_COUNT = 20;
const MAX_SYMPTOM_LENGTH = 100;

const VALID_URGENCIES = ['Routine', 'Monitor', 'Urgent'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const hasJpegSignature = (buf) =>
  Buffer.isBuffer(buf) && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

const hasPngSignature = (buf) =>
  Buffer.isBuffer(buf) &&
  buf.length > 8 &&
  buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const isJpegOrPngBuffer = (buf) => hasJpegSignature(buf) || hasPngSignature(buf);

/**
 * Chuẩn hóa danh sách triệu chứng (tùy chọn):
 * - Nhận mảng JSON, chuỗi JSON `["vomiting", "Đi khập khiễng"]`, hoặc chuỗi phân cách dấu phẩy / xuống dòng.
 * - Hỗ trợ cả mã chuẩn lẫn triệu chứng tự do do người dùng tự nhập.
 */
const parseSymptomsInput = (rawSymptoms) => {
  if (isBlank(rawSymptoms)) {
    return { valid: true, value: [] };
  }

  let items = [];
  if (Array.isArray(rawSymptoms)) {
    items = rawSymptoms;
  } else if (typeof rawSymptoms === 'string') {
    const trimmed = rawSymptoms.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          return { valid: false, message: 'Danh sách triệu chứng phải là một mảng hợp lệ' };
        }
        items = parsed;
      } catch {
        return { valid: false, message: 'Chuỗi JSON triệu chứng không hợp lệ' };
      }
    } else {
      items = trimmed.split(/[,;\n]+/);
    }
  } else {
    return { valid: false, message: 'Danh sách triệu chứng phải là mảng hoặc chuỗi' };
  }

  const normalized = [];
  const seen = new Set();

  for (const rawItem of items) {
    if (typeof rawItem !== 'string') {
      return { valid: false, message: 'Mỗi triệu chứng phải là chuỗi ký tự' };
    }
    const clean = rawItem.trim();
    if (!clean) continue;
    if (clean.length > MAX_SYMPTOM_LENGTH) {
      return {
        valid: false,
        message: `Mỗi triệu chứng tối đa ${MAX_SYMPTOM_LENGTH} ký tự`,
      };
    }

    const dedupeKey = clean.toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      normalized.push(clean);
    }
  }

  if (normalized.length > MAX_SYMPTOMS_COUNT) {
    return {
      valid: false,
      message: `Chỉ được nhập tối đa ${MAX_SYMPTOMS_COUNT} triệu chứng`,
    };
  }

  return { valid: true, value: normalized };
};

/**
 * Kiểm tra payload POST /api/ai-assessments (UC-14, SCR-10, MSG02, MSG03, MSG35).
 */
const validateCreateAiAssessment = (body = {}, files = []) => {
  const errors = {};
  const value = {};

  if (isBlank(body.petId) || typeof body.petId !== 'string' || !OBJECT_ID_REGEX.test(body.petId.trim())) {
    errors.petId = 'Mã thú cưng (petId) không hợp lệ';
  } else {
    value.petId = body.petId.trim();
  }

  if (isBlank(body.description) || typeof body.description !== 'string') {
    errors.description = 'Mô tả chi tiết triệu chứng là bắt buộc';
  } else {
    const trimmedDesc = body.description.trim();
    if (trimmedDesc.length < MIN_DESCRIPTION_LENGTH || trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Mô tả triệu chứng phải từ ${MIN_DESCRIPTION_LENGTH} đến ${MAX_DESCRIPTION_LENGTH} ký tự`;
    } else {
      value.description = trimmedDesc;
    }
  }

  const symptomResult = parseSymptomsInput(body.symptoms);
  if (!symptomResult.valid) {
    errors.symptoms = symptomResult.message;
  } else {
    value.symptoms = symptomResult.value;
  }

  const fileList = Array.isArray(files) ? files : [];
  if (fileList.length > MAX_AI_PHOTOS) {
    errors.photos = `Chỉ được tải lên tối đa ${MAX_AI_PHOTOS} ảnh (MSG35)`;
  } else {
    for (const file of fileList) {
      if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
        errors.photos = 'Tệp ảnh không hợp lệ hoặc bị rỗng';
        break;
      }
      if (file.buffer.length > MAX_PHOTO_SIZE_BYTES) {
        errors.photos = 'Chỉ chấp nhận ảnh dung lượng tối đa 5MB mỗi ảnh (MSG35)';
        break;
      }
      if (!isJpegOrPngBuffer(file.buffer)) {
        errors.photos = 'Chỉ chấp nhận ảnh định dạng JPG hoặc PNG (MSG35)';
        break;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value,
  };
};

/**
 * Kiểm tra query phân trang / lọc lịch sử đánh giá AI (GET /api/ai-assessments).
 */
const validateListAiAssessmentsQuery = (query = {}) => {
  const errors = {};
  const value = {
    petId: undefined,
    urgency: undefined,
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  };

  if (!isBlank(query.petId)) {
    const cleanPetId = typeof query.petId === 'string' ? query.petId.trim() : '';
    if (!OBJECT_ID_REGEX.test(cleanPetId)) {
      errors.petId = 'Mã thú cưng (petId) không hợp lệ';
    } else {
      value.petId = cleanPetId;
    }
  }

  if (!isBlank(query.urgency)) {
    const cleanUrgency = typeof query.urgency === 'string' ? query.urgency.trim() : '';
    if (!VALID_URGENCIES.includes(cleanUrgency)) {
      errors.urgency = `Mức độ khẩn cấp phải là một trong: ${VALID_URGENCIES.join(', ')}`;
    } else {
      value.urgency = cleanUrgency;
    }
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

const validateAssessmentIdParam = (id) => {
  if (typeof id !== 'string' || !OBJECT_ID_REGEX.test(id.trim())) {
    return {
      isValid: false,
      errors: { id: 'Mã đánh giá AI không hợp lệ' },
    };
  }
  return { isValid: true, value: id.trim() };
};

module.exports = {
  MIN_DESCRIPTION_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_AI_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  VALID_URGENCIES,
  isJpegOrPngBuffer,
  parseSymptomsInput,
  validateCreateAiAssessment,
  validateListAiAssessmentsQuery,
  validateAssessmentIdParam,
};
