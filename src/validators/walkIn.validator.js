const { isValidObjectId } = require('mongoose');
const { PHONE_REGEX, EMAIL_REGEX, MAX_FULLNAME } = require('./auth.validator');
const { validateIntakePayload } = require('./appointmentOrder.validator');

const MAX_PET_NAME = 100;
const MAX_SHORT_TEXT = 50;
const MAX_PET_NOTES = 1000;
const MAX_WEIGHT = 500;
const MAX_ORDER_NOTE = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Lấy ngày hôm nay theo múi giờ Việt Nam (YYYY-MM-DD)
const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

// Kiểm tra ngày có tồn tại thật trong lịch (tránh 2026-02-30)
const isRealDate = (str) => {
  if (typeof str !== 'string' || !DATE_REGEX.test(str)) return false;
  const parsed = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === str;
};

/**
 * Validate tham số tra cứu khách hàng theo SĐT tại quầy (UC-20)
 */
const validateLookupCustomer = (query = {}) => {
  const errors = {};
  const { phone } = query;

  if (isBlank(phone)) {
    errors.phone = 'Vui lòng nhập số điện thoại cần tra cứu';
  } else if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    errors.phone = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { phone: typeof phone === 'string' ? phone.trim() : '' },
  };
};

/**
 * Validate dữ liệu đăng ký khám vãng lai tại quầy (Walk-in - UC-19, UC-21, BR-04, BR-06)
 */
const validateCreateWalkInBooking = (body = {}) => {
  const errors = {};

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu yêu cầu không hợp lệ' },
      value: null,
    };
  }

  const {
    phone,
    fullName,
    email,
    petId,
    petInfo,
    date,
    note,
    intake,
    services,
    cageId,
    requiresIsolation,
  } = body;

  // 1. Validate thông tin khách hàng
  let cleanPhone;
  if (isBlank(phone)) {
    errors.phone = 'Số điện thoại khách hàng là bắt buộc';
  } else if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
    errors.phone = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0';
  } else {
    cleanPhone = phone.trim();
  }

  let cleanFullName;
  if (!isBlank(fullName)) {
    if (typeof fullName !== 'string') {
      errors.fullName = 'Họ tên khách hàng phải là chuỗi ký tự';
    } else if (fullName.trim().length > MAX_FULLNAME) {
      errors.fullName = `Họ tên khách hàng không được vượt quá ${MAX_FULLNAME} ký tự`;
    } else {
      cleanFullName = fullName.trim();
    }
  }

  let cleanEmail;
  if (!isBlank(email)) {
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Địa chỉ email không hợp lệ';
    } else {
      cleanEmail = email.trim().toLowerCase();
    }
  }

  // 2. Validate thông tin thú cưng: chọn thú cưng cũ (petId) HOẶC tạo thú cưng mới (petInfo)
  const hasPetId = !isBlank(petId);
  const hasPetInfo = petInfo !== undefined && petInfo !== null;

  let cleanPetId = null;
  let cleanPetInfo = null;

  if (!hasPetId && !hasPetInfo) {
    errors.pet = 'Vui lòng chọn thú cưng có sẵn (petId) hoặc nhập thông tin thú cưng mới (petInfo)';
  } else if (hasPetId && hasPetInfo) {
    errors.pet = 'Chỉ được chọn một trong hai: thú cưng có sẵn (petId) hoặc tạo thú cưng mới (petInfo)';
  } else if (hasPetId) {
    if (typeof petId !== 'string' || !isValidObjectId(petId)) {
      errors.petId = 'Mã thú cưng (petId) không hợp lệ';
    } else {
      cleanPetId = petId;
    }
  } else if (hasPetInfo) {
    if (typeof petInfo !== 'object' || Array.isArray(petInfo)) {
      errors.petInfo = 'Thông tin thú cưng mới (petInfo) phải là một đối tượng hợp lệ';
    } else {
      cleanPetInfo = {};

      if (isBlank(petInfo.name)) {
        errors['petInfo.name'] = 'Tên thú cưng là bắt buộc khi tạo thú cưng mới';
      } else if (typeof petInfo.name !== 'string' || petInfo.name.trim().length > MAX_PET_NAME) {
        errors['petInfo.name'] = `Tên thú cưng không được vượt quá ${MAX_PET_NAME} ký tự`;
      } else {
        cleanPetInfo.name = petInfo.name.trim();
      }

      const optionalTextFields = [
        { key: 'species', label: 'Loài', max: MAX_SHORT_TEXT },
        { key: 'breed', label: 'Giống', max: MAX_SHORT_TEXT },
        { key: 'coatColor', label: 'Màu lông', max: MAX_SHORT_TEXT },
        { key: 'notes', label: 'Ghi chú thú cưng', max: MAX_PET_NOTES },
      ];

      for (const { key, label, max } of optionalTextFields) {
        const rawVal = petInfo[key];
        if (!isBlank(rawVal)) {
          if (typeof rawVal !== 'string' || rawVal.trim().length > max) {
            errors[`petInfo.${key}`] = `${label} phải là chuỗi và tối đa ${max} ký tự`;
          } else {
            cleanPetInfo[key] = rawVal.trim();
          }
        }
      }

      if (!isBlank(petInfo.dob)) {
        const parsedDob = new Date(petInfo.dob);
        if (Number.isNaN(parsedDob.getTime())) {
          errors['petInfo.dob'] = 'Ngày sinh thú cưng không hợp lệ';
        } else if (parsedDob.getTime() > Date.now()) {
          errors['petInfo.dob'] = 'Ngày sinh thú cưng không được ở tương lai';
        } else {
          cleanPetInfo.dob = parsedDob;
        }
      }

      if (!isBlank(petInfo.weight)) {
        const weightNum = typeof petInfo.weight === 'string' ? Number(petInfo.weight.trim()) : petInfo.weight;
        if (typeof weightNum !== 'number' || !Number.isFinite(weightNum) || weightNum < 0 || weightNum > MAX_WEIGHT) {
          errors['petInfo.weight'] = `Cân nặng thú cưng phải là số từ 0 đến ${MAX_WEIGHT} kg`;
        } else {
          cleanPetInfo.weight = weightNum;
        }
      }
    }
  }

  // 3. Validate ngày khám (mặc định là ngày hôm nay nếu không truyền)
  const today = todayVN();
  let cleanDate = today;
  if (!isBlank(date)) {
    if (!isRealDate(date)) {
      errors.date = 'Ngày khám phải đúng định dạng YYYY-MM-DD và là ngày hợp lệ';
    } else if (date < today) {
      errors.date = 'Ngày khám không được ở trong quá khứ';
    } else {
      cleanDate = date;
    }
  }

  // 4. Validate ghi chú đơn khám
  let cleanNote;
  if (!isBlank(note)) {
    if (typeof note !== 'string') {
      errors.note = 'Ghi chú đơn khám phải là chuỗi ký tự';
    } else if (note.trim().length > MAX_ORDER_NOTE) {
      errors.note = `Ghi chú đơn khám không được vượt quá ${MAX_ORDER_NOTE} ký tự`;
    } else {
      cleanNote = note.trim();
    }
  }

  // 4b. Validate phiếu kê khai ban đầu của lễ tân (intake - tuỳ chọn khi tạo đơn vãng lai)
  let cleanIntake;
  if (intake !== undefined) {
    const intakeResult = validateIntakePayload(intake);
    if (intakeResult.fieldErrors.intake) {
      errors.intake = intakeResult.fieldErrors.intake;
    }
    if (intakeResult.fieldErrors.symptoms) {
      errors['intake.symptoms'] = intakeResult.fieldErrors.symptoms;
    }
    if (intakeResult.fieldErrors.initialCondition) {
      errors['intake.initialCondition'] = intakeResult.fieldErrors.initialCondition;
    }
    cleanIntake = intakeResult.value;
  }

  // 5. Validate danh sách dịch vụ yêu cầu
  const cleanServices = [];
  if (!Array.isArray(services) || services.length === 0) {
    errors.services = 'Đơn tiếp nhận vãng lai phải có ít nhất một dịch vụ';
  } else {
    for (let i = 0; i < services.length; i++) {
      const item = services[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors[`services[${i}]`] = 'Phần tử dịch vụ không hợp lệ';
        continue;
      }

      if (isBlank(item.serviceId) || typeof item.serviceId !== 'string' || !isValidObjectId(item.serviceId)) {
        errors[`services[${i}].serviceId`] = 'Mã dịch vụ (serviceId) không hợp lệ';
      }

      let cleanStaffId = null;
      if (!isBlank(item.assignedStaffId)) {
        if (typeof item.assignedStaffId !== 'string' || !isValidObjectId(item.assignedStaffId)) {
          errors[`services[${i}].assignedStaffId`] = 'Mã nhân viên phụ trách (assignedStaffId) không hợp lệ';
        } else {
          cleanStaffId = item.assignedStaffId;
        }
      }

      let cleanIsEmergency = false;
      if (item.isEmergency !== undefined) {
        if (typeof item.isEmergency !== 'boolean') {
          errors[`services[${i}].isEmergency`] = 'Cờ cấp cứu (isEmergency) phải là true hoặc false';
        } else {
          cleanIsEmergency = item.isEmergency;
        }
      }

      cleanServices.push({
        serviceId: item.serviceId,
        assignedStaffId: cleanStaffId,
        isEmergency: cleanIsEmergency,
      });
    }
  }

  // 6. Validate chuồng lưu giữ (cageId & requiresIsolation - tuỳ chọn)
  let cleanCageId = null;
  if (!isBlank(cageId)) {
    if (typeof cageId !== 'string' || !isValidObjectId(cageId)) {
      errors.cageId = 'Mã chuồng lưu giữ (cageId) không hợp lệ';
    } else {
      cleanCageId = cageId;
    }
  }

  let cleanRequiresIsolation = false;
  if (requiresIsolation !== undefined && requiresIsolation !== null) {
    if (typeof requiresIsolation !== 'boolean') {
      errors.requiresIsolation = 'Cờ chuồng cách ly (requiresIsolation) phải là true hoặc false';
    } else {
      cleanRequiresIsolation = requiresIsolation;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      phone: cleanPhone,
      fullName: cleanFullName,
      email: cleanEmail,
      petId: cleanPetId,
      petInfo: cleanPetInfo,
      date: cleanDate,
      note: cleanNote,
      intake: cleanIntake,
      services: cleanServices,
      cageId: cleanCageId,
      requiresIsolation: cleanRequiresIsolation,
    },
  };
};

module.exports = {
  validateLookupCustomer,
  validateCreateWalkInBooking,
  todayVN,
};

