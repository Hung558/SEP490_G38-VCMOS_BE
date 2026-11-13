const subtaskRequestService = require('../services/subtaskRequest.service');
const {
  validateObjectIdParam,
  validateCreateSubtaskPayload,
  validateListMySubtasksQuery,
  validateCompleteSubtaskPayload,
} = require('../validators/subtaskRequest.validator');

const handleControllerError = (res, err) => {
  if (err && err.statusCode) {
    const response = { message: err.message };
    if (err.errors) response.errors = err.errors;
    return res.status(err.statusCode).json(response);
  }
  console.error('SubtaskRequest controller error:', err);
  return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý yêu cầu cận lâm sàng / dịch vụ phụ' });
};

/**
 * POST /api/subtask-requests
 * Bác sĩ chính chỉ định cận lâm sàng / dịch vụ phụ cho 1 ca khám đang thực hiện
 */
const createSubtask = async (req, res) => {
  try {
    const check = validateCreateSubtaskPayload(req.body);
    if (!check.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu tạo yêu cầu cận lâm sàng / dịch vụ phụ không hợp lệ',
        errors: check.errors,
      });
    }

    const data = await subtaskRequestService.createSubtaskRequest(req.user.id, check.value);
    return res.status(201).json({
      message: 'Tạo yêu cầu cận lâm sàng / dịch vụ phụ thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/subtask-requests/my-queue
 * Nhân sự được phân công xem hàng đợi cận lâm sàng / dịch vụ phụ của chính mình
 */
const getMyQueue = async (req, res) => {
  try {
    const queryCheck = validateListMySubtasksQuery(req.query);
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số lọc danh sách yêu cầu không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const data = await subtaskRequestService.getMySubtaskQueue(req.user.id, queryCheck.value);
    return res.status(200).json({
      message: 'Lấy danh sách yêu cầu cận lâm sàng / dịch vụ phụ được giao thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/subtask-requests/service/:appointmentServiceId
 * Xem danh sách các Sub-task của 1 ca khám
 */
const getByAppointmentServiceId = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.appointmentServiceId, 'Mã dịch vụ lịch hẹn');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã dịch vụ lịch hẹn không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const data = await subtaskRequestService.getSubtasksByAppointmentServiceId(
      req.user,
      idCheck.value
    );
    return res.status(200).json({
      message: 'Lấy danh sách yêu cầu cận lâm sàng / dịch vụ phụ của ca khám thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/subtask-requests/:id
 * Xem chi tiết 1 Sub-task
 */
const getById = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'Mã yêu cầu cận lâm sàng');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã yêu cầu cận lâm sàng không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const data = await subtaskRequestService.getSubtaskRequestById(req.user, idCheck.value);
    return res.status(200).json({
      message: 'Lấy chi tiết yêu cầu cận lâm sàng / dịch vụ phụ thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * PATCH /api/subtask-requests/:id/start
 * Nhân sự được giao nhận thực hiện yêu cầu (Pending -> InProgress)
 */
const startSubtask = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'Mã yêu cầu cận lâm sàng');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã yêu cầu cận lâm sàng không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const data = await subtaskRequestService.startSubtaskRequest(req.user.id, idCheck.value);
    return res.status(200).json({
      message: 'Bắt đầu thực hiện yêu cầu cận lâm sàng / dịch vụ phụ thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * PATCH /api/subtask-requests/:id/complete
 * Nhân sự được giao trả kết quả (resultText và/hoặc ảnh resultImage) và hoàn tất (Completed)
 */
const completeSubtask = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'Mã yêu cầu cận lâm sàng');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã yêu cầu cận lâm sàng không hợp lệ',
        errors: idCheck.errors,
      });
    }

    const bodyCheck = validateCompleteSubtaskPayload(req.body, req.file);
    if (!bodyCheck.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu hoàn tất yêu cầu cận lâm sàng / dịch vụ phụ không hợp lệ',
        errors: bodyCheck.errors,
      });
    }

    const data = await subtaskRequestService.completeSubtaskRequest(
      req.user.id,
      idCheck.value,
      bodyCheck.value
    );
    return res.status(200).json({
      message: 'Hoàn tất yêu cầu cận lâm sàng / dịch vụ phụ thành công',
      data,
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * DELETE /api/subtask-requests/:id
 * Bác sĩ đã tạo hủy yêu cầu khi vẫn còn ở trạng thái Pending
 */
const deletePendingSubtask = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'Mã yêu cầu cận lâm sàng');
    if (!idCheck.isValid) {
      return res.status(400).json({
        message: 'Mã yêu cầu cận lâm sàng không hợp lệ',
        errors: idCheck.errors,
      });
    }

    await subtaskRequestService.deletePendingSubtaskRequest(req.user.id, idCheck.value);
    return res.status(200).json({
      message: 'Hủy yêu cầu cận lâm sàng / dịch vụ phụ thành công',
    });
  } catch (err) {
    return handleControllerError(res, err);
  }
};

module.exports = {
  createSubtask,
  getMyQueue,
  getByAppointmentServiceId,
  getById,
  startSubtask,
  completeSubtask,
  deletePendingSubtask,
};

