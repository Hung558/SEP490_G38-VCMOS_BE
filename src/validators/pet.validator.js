const MAX_NAME_LENGTH = 100;
const MAX_SHORT_TEXT_LENGTH = 50; // species, breed, coatColor
const MAX_NOTES_LENGTH = 1000;
const MAX_WEIGHT = 500; // kg
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
const DATA_URI_REGEX = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/; //
const LIST_STATUSES = ['Active', 'Deleted', 'All'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const TEXT_FIELDS = [
  { key: 'species', label: 'Loài', max: MAX_SHORT_TEXT_LENGTH },
  { key: 'breed', label: 'Giống', max: MAX_SHORT_TEXT_LENGTH },
  { key: 'coatColor', label: 'Màu lông', max: MAX_SHORT_TEXT_LENGTH },
  { key: 'notes', label: 'Ghi chú', max: MAX_NOTES_LENGTH },
];

const createError = (message, statusCode, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

// Multipart form fields arrive as strings, and empty inputs arrive as ''.
// Treat undefined, null and blank strings as "blank".
const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

const assertObject = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw createError('Dữ liệu không hợp lệ.', 400, [{ field: 'body', message: 'Dữ liệu không hợp lệ.' }]);
  }
};

/* ------------------------------ Photo checks ----------------------------- */

const hasJpegSignature = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

const hasPngSignature = (buf) =>
  buf.length > 8 &&
  buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

const hasWebpSignature = (buf) =>
  buf.length > 12 &&
  buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buf.subarray(8, 12).toString('ascii') === 'WEBP';

const validatePhoto = (photo, errors) => {
  if (isBlank(photo)) return;

  if (Buffer.isBuffer(photo)) {
    if (photo.length === 0) {
      errors.push({ field: 'photo', message: 'Ảnh không được để trống.' });
    } else if (photo.length > MAX_PHOTO_SIZE) {
      errors.push({ field: 'photo', message: 'Ảnh không được vượt quá 5MB.' });
    } else if (!hasJpegSignature(photo) && !hasPngSignature(photo) && !hasWebpSignature(photo)) {
      // Check the real file signature; the client-supplied mimetype can be faked.
      errors.push({ field: 'photo', message: 'Ảnh phải có định dạng JPEG, PNG hoặc WebP.' });
    }
    return;
  }

  // Only base64 image data URIs are allowed as strings. Plain file paths and remote URLs are
  // rejected because Cloudinary would read them server-side (local file read / SSRF risk).
  if (typeof photo === 'string') {
    const match = photo.match(DATA_URI_REGEX);
    if (!match) {
      errors.push({ field: 'photo', message: 'Ảnh phải là tệp tải lên hoặc data URI JPEG, PNG, WebP.' });
    } else if (Math.floor((match[2].length * 3) / 4) > MAX_PHOTO_SIZE) {
      errors.push({ field: 'photo', message: 'Ảnh không được vượt quá 5MB.' });
    }
    return;
  }

  errors.push({ field: 'photo', message: 'Ảnh không hợp lệ.' });
};

/* --------------------------- Shared field sanitizer ---------------------- */

/**
 * Validates and sanitizes the pet fields. Pushes problems into `errors`, returns the clean values.
 *
 * partial = false (create): `name` is required; blank optional fields are ignored.
 * partial = true  (update): only fields present in `data` are checked (undefined = leave unchanged);
 *                           `name` cannot be blanked; blank optional fields are returned as `null`
 *                           so the service clears them.
 */
const sanitizePetFields = (data, errors, { partial }) => {
  const value = {};

  // name
  if (!partial || data.name !== undefined) {
    if (isBlank(data.name)) {
      errors.push({ field: 'name', message: 'Tên thú cưng là bắt buộc.' });
    } else if (typeof data.name !== 'string') {
      errors.push({ field: 'name', message: 'Tên thú cưng phải là chuỗi.' });
    } else if (data.name.trim().length > MAX_NAME_LENGTH) {
      errors.push({ field: 'name', message: `Tên thú cưng không được vượt quá ${MAX_NAME_LENGTH} ký tự.` });
    } else {
      value.name = data.name.trim();
    }
  }

  // optional text fields
  for (const { key, label, max } of TEXT_FIELDS) {
    const raw = data[key];
    if (raw === undefined) continue;
    if (isBlank(raw)) {
      if (partial) value[key] = null; // blank on update = clear the field
      continue;
    }
    if (typeof raw !== 'string') {
      errors.push({ field: key, message: `${label} phải là chuỗi.` });
    } else if (raw.trim().length > max) {
      errors.push({ field: key, message: `${label} không được vượt quá ${max} ký tự.` });
    } else {
      value[key] = raw.trim();
    }
  }

  // dob: valid date, not in the future
  if (data.dob !== undefined) {
    if (isBlank(data.dob)) {
      if (partial) value.dob = null; // [NEW]
    } else {
      const isDateLike = data.dob instanceof Date || typeof data.dob === 'string';
      const dob = isDateLike ? new Date(data.dob) : null;
      if (!dob || Number.isNaN(dob.getTime())) {
        errors.push({ field: 'dob', message: 'Ngày sinh không hợp lệ.' });
      } else if (dob.getTime() > Date.now()) {
        errors.push({ field: 'dob', message: 'Ngày sinh không được ở tương lai.' });
      } else {
        value.dob = dob;
      }
    }
  }

  // weight: number or numeric string, 0 <= weight <= MAX_WEIGHT
  if (data.weight !== undefined) {
    if (isBlank(data.weight)) {
      if (partial) value.weight = null;
    } else {
      const weight = typeof data.weight === 'string' ? Number(data.weight.trim()) : data.weight;
      if (typeof weight !== 'number' || !Number.isFinite(weight)) {
        errors.push({ field: 'weight', message: 'Cân nặng phải là một số.' });
      } else if (weight < 0 || weight > MAX_WEIGHT) {
        errors.push({ field: 'weight', message: `Cân nặng phải nằm trong khoảng 0 - ${MAX_WEIGHT} kg.` });
      } else {
        value.weight = weight;
      }
    }
  }

  return value;
};

/* ------------------------------ Public validators ------------------------ */

/**
 * Validate and sanitize the input of `createPet`.
 *
 * @param {object} data   - raw input (e.g. req.body)
 * @param {Buffer|string} [photo] - optional photo (e.g. req.file?.buffer)
 * @returns {object} sanitized data containing only allowed fields
 * @throws {Error} statusCode 400 with `errors: [{ field, message }]` if validation fails
 */
const validateCreatePet = (data, photo) => {
  assertObject(data);

  const errors = [];
  const value = sanitizePetFields(data, errors, { partial: false });
  validatePhoto(photo, errors);

  if (errors.length > 0) {
    throw createError('Dữ liệu thú cưng không hợp lệ.', 400, errors);
  }
  return value;
};

/**
 * Validate and sanitize the input of `updatePet`.
 *
 * @param {object} [data]  - raw input (e.g. req.body); only provided fields are validated
 * @param {Buffer|string} [photo] - optional replacement photo
 * @returns {object} only the fields to change. A field set to `null` means "clear it".
 * @throws {Error} statusCode 400 with `errors` if invalid, or if there is nothing to update
 */
const validateUpdatePet = (data = {}, photo) => {
  assertObject(data);

  const errors = [];
  const value = sanitizePetFields(data, errors, { partial: true });
  validatePhoto(photo, errors);

  if (errors.length === 0 && Object.keys(value).length === 0 && isBlank(photo)) {
    errors.push({ field: 'body', message: 'Cần ít nhất một thông tin để cập nhật.' });
  }

  if (errors.length > 0) {
    throw createError('Dữ liệu cập nhật thú cưng không hợp lệ.', 400, errors);
  }
  return value;
};

/**
 * Validate a pet id (e.g. req.params.petId) so a malformed id returns 400
 * instead of a Mongoose CastError (500). Usable for get/update/delete.
 */
const validatePetId = (petId) => {
  if (typeof petId !== 'string' || !OBJECT_ID_REGEX.test(petId)) {
    throw createError('Mã thú cưng không hợp lệ.', 400, [{ field: 'petId', message: 'Mã thú cưng không hợp lệ.' }]);
  }
  return petId;
};

// Query params are always strings (or arrays if repeated), so parse them strictly.
const parsePositiveInt = (value, fallback) => {
  if (value === undefined) return fallback;
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
};

const parseListQuery = (query) => {
  const errors = [];
  const status = query.status === undefined ? 'Active' : query.status;
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const limit = parsePositiveInt(query.limit, DEFAULT_LIMIT);

  if (!LIST_STATUSES.includes(status)) {
    errors.push({ field: 'status', message: `Trạng thái phải là một trong: ${LIST_STATUSES.join(', ')}.` });
  }
  if (!Number.isInteger(page) || page < 1) {
    errors.push({ field: 'page', message: 'Trang phải là số nguyên từ 1 trở lên.' });
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    errors.push({ field: 'limit', message: `Số lượng mỗi trang phải từ 1 đến ${MAX_LIMIT}.` });
  }

  if (errors.length > 0) throw createError('Tham số truy vấn không hợp lệ.', 400, errors);
  return { status, page, limit };
};

module.exports = {
  validateCreatePet,
  validateUpdatePet,
  validatePetId,
  parseListQuery
};