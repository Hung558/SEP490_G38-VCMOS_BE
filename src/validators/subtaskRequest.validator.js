const { isValidObjectId } = require('mongoose');

const SUBTASK_STATUSES = ['Pending', 'InProgress', 'Completed'];
const MAX_TASK_TYPE_LENGTH = 200;
const MAX_INSTRUCTIONS_LENGTH = 2000;
const MAX_RESULT_TEXT_LENGTH = 3000;

const CREATE_ALLOWED_FIELDS = ['appointmentServiceId', 'assignedStaffId', 'taskType', 'instructions'];
const COMPLETE_ALLOWED_FIELDS = ['resultText'];

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Kiểm tra tham số ObjectId trên URL (id, appointmentServiceId).
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
 * Kiểm tra dữ liệu khi Bác sĩ chính tạo yêu cầu cận lâm sàng / dịch vụ phụ (POST /api/subtask-requests).
 */
const validateCreateSubtaskPayload = (body = {}) => {
  if (!isPlainObject(body)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu tạo yêu cầu cận lâm sàng / dịch vụ phụ không hợp lệ' },
      value: null,
    };
  }

  const errors = {};

  // Chặn các trường nhạy cảm hoặc không hợp lệ (status, requestedById, completedAt...)
  const unknownFields = Object.keys(body).filter((field) => !CREATE_ALLOWED_FIELDS.includes(field));
  if (unknownFields.length > 0) {
    errors.fields = `Không được truyền các trường: ${unknownFields.join(', ')}`;
  }

  if (
    isBlank(body.appointmentServiceId) ||
    typeof body.appointmentServiceId !== 'string' ||
    !isValidObjectId(body.appointmentServiceId.trim())
  ) {
    errors.appointmentServiceId = 'Mã dịch vụ lịch hẹn (appointmentServiceId) không hợp lệ';
  }

  if (
    isBlank(body.assignedStaffId) ||
    typeof body.assignedStaffId !== 'string' ||
    !isValidObjectId(body.assignedStaffId.trim())
  ) {
    errors.assignedStaffId = 'Mã nhân sự được phân công (assignedStaffId) không hợp lệ';
  }

  let cleanTaskType = '';
  if (isBlank(body.taskType) || typeof body.taskType !== 'string') {
    errors.taskType = 'Loại công việc (taskType) là bắt buộc';
  } else {
    cleanTaskType = body.taskType.trim();
    if (cleanTaskType.length > MAX_TASK_TYPE_LENGTH) {
      errors.taskType = `Loại công việc tối đa ${MAX_TASK_TYPE_LENGTH} ký tự`;
    }
  }

  let cleanInstructions = '';
  if (body.instructions !== undefined && body.instructions !== null) {
    if (typeof body.instructions !== 'string') {
      errors.instructions = 'Hướng dẫn thực hiện (instructions) phải là chuỗi văn bản';
    } else {
      cleanInstructions = body.instructions.trim();
      if (cleanInstructions.length > MAX_INSTRUCTIONS_LENGTH) {
        errors.instructions = `Hướng dẫn thực hiện tối đa ${MAX_INSTRUCTIONS_LENGTH} ký tự`;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors, value: null };
  }

  return {
    isValid: true,
    errors: {},
    value: {
      appointmentServiceId: body.appointmentServiceId.trim(),
      assignedStaffId: body.assignedStaffId.trim(),
      taskType: cleanTaskType,
      instructions: cleanInstructions,
    },
  };
};

/**
 * Kiểm tra query lọc trạng thái hàng đợi Sub-task (GET /api/subtask-requests/my-queue?status=...).
 */
const validateListMySubtasksQuery = (query = {}) => {
  if (!isPlainObject(query)) {
    return {
      isValid: false,
      errors: { query: 'Tham số truy vấn không hợp lệ' },
      value: null,
    };
  }

  if (isBlank(query.status)) {
    return { isValid: true, errors: {}, value: {} };
  }

  if (typeof query.status !== 'string' || !SUBTASK_STATUSES.includes(query.status.trim())) {
    return {
      isValid: false,
      errors: {
        status: `Trạng thái phải thuộc một trong các giá trị: ${SUBTASK_STATUSES.join(', ')}`,
      },
      value: null,
    };
  }

  return {
    isValid: true,
    errors: {},
    value: { status: query.status.trim() },
  };
};

/**
 * Kiểm tra dữ liệu khi nhân sự trả kết quả & hoàn tất Sub-task (PATCH /api/subtask-requests/:id/complete).
 * Hỗ trợ kết quả chữ (resultText), ảnh kết quả (resultImage qua multer) hoặc cả hai.
 */
const validateCompleteSubtaskPayload = (body, file) => {
  const safeBody = body === undefined || body === null ? {} : body;
  if (!isPlainObject(safeBody)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu hoàn tất yêu cầu không hợp lệ' },
      value: null,
    };
  }

  const errors = {};

  // Ảnh phải đi qua file upload resultImage để BE chủ động upload Cloudinary, không nhận URL tự nhập
  const unknownFields = Object.keys(safeBody).filter(
    (field) => !COMPLETE_ALLOWED_FIELDS.includes(field)
  );
  if (unknownFields.length > 0) {
    errors.fields = `Không được truyền các trường: ${unknownFields.join(', ')}`;
  }

  let cleanResultText;
  if (safeBody.resultText !== undefined && safeBody.resultText !== null) {
    if (typeof safeBody.resultText !== 'string') {
      errors.resultText = 'Kết quả thực hiện (resultText) phải là chuỗi văn bản';
    } else {
      const trimmed = safeBody.resultText.trim();
      if (trimmed.length > MAX_RESULT_TEXT_LENGTH) {
        errors.resultText = `Kết quả thực hiện tối đa ${MAX_RESULT_TEXT_LENGTH} ký tự`;
      } else if (trimmed) {
        cleanResultText = trimmed;
      }
    }
  }

  const resultImageFile =
    file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0 ? file : null;

  if (!cleanResultText && !resultImageFile && !errors.resultText) {
    errors.result = 'Vui lòng nhập kết quả thực hiện (resultText) hoặc tải lên ảnh kết quả (resultImage)';
  }

  if (Object.keys(errors).length > 0) {
    return { isValid: false, errors, value: null };
  }

  return {
    isValid: true,
    errors: {},
    value: {
      resultText: cleanResultText,
      resultImageFile,
    },
  };
};

module.exports = {
  SUBTASK_STATUSES,
  validateObjectIdParam,
  validateCreateSubtaskPayload,
  validateListMySubtasksQuery,
  validateCompleteSubtaskPayload,
};

