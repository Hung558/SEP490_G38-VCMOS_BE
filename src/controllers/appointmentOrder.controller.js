const appointmentService = require('../services/appointmentOrder.service');
const {
  flagOverdueAppointments,
  getDateStringVN,
  isValidDateString,
} = require('../jobs/flagOverdueAppointments.job');
const {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateListAllAppointments,
  validateAppointmentId,
  validateCancelAppointment,
  validateCheckInAppointment,
} = require('../validators/appointmentOrder.validator');

const handleError = (res, err) => {
  const statusCode = err.status || err.statusCode;
  if (statusCode) {
    return res.status(statusCode).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Lỗi hệ thống' });
};

const sendValidationError = (res, errors) =>
  res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

const createOnlineBooking = async (req, res) => {
  const { errors, value } = validateCreateOnlineAppointment(req.body);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const appointment = await appointmentService.createOnlineAppointment(req.user.id, value);
    return res.status(201).json({ message: 'Đặt lịch thành công', data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

const listMyOnlineBooking = async (req, res) => {
  const { errors, value } = validateListOnlineAppointments(req.query);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const result = await appointmentService.listMyOnlineAppointments(req.user.id, value);
    return res.json({ data: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(res, err);
  }
};

const getMyOnlineBookingById = async (req, res) => {
  const { errors, value: id } = validateAppointmentId(req.params);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const appointment = await appointmentService.getMyOnlineAppointment(req.user.id, id);
    return res.json({ data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

const listAllBooking = async (req, res) => {
  const { errors, value } = validateListAllAppointments(req.query);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const result = await appointmentService.listAllAppointments(value);
    return res.json({ data: result.items, pagination: result.pagination });
  } catch (err) {
    return handleError(res, err);
  }
};

const checkInBooking = async (req, res) => {
  const { errors: idErrors, value: id } = validateAppointmentId(req.params);
  if (idErrors.length) return sendValidationError(res, idErrors);

  const { errors: bodyErrors, value } = validateCheckInAppointment(req.body);
  if (bodyErrors.length) return sendValidationError(res, bodyErrors);

  try {
    const appointment = await appointmentService.checkInAppointment(id, {
      cageId: value.cageId,
      staffId: req.user?.id,
      requiresIsolation: value.requiresIsolation,
      intake: value.intake,
      note: value.note,
      assignedStaffId: value.assignedStaffId,
      serviceAssignments: value.serviceAssignments,
    });

    return res.json({ message: 'Check-in thành công', data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

const cancelBooking = async (req, res) => {
  const { errors: idErrors, value: id } = validateAppointmentId(req.params);
  if (idErrors.length) return sendValidationError(res, idErrors);

  const { errors: bodyErrors, value } = validateCancelAppointment(req.body);
  if (bodyErrors.length) return sendValidationError(res, bodyErrors);

  try {
    const appointment = await appointmentService.cancelAppointment(id, {
      userId: req.user?.id,
      role: req.user?.role,
      reason: value.reason,
    });

    return res.json({ message: 'Hủy lịch hẹn thành công', data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

// Admin kích hoạt thủ công JOB-01 đánh dấu lịch hẹn quá hạn Overdue (phục vụ vận hành / kiểm thử / demo)
const triggerFlagOverdue = async (req, res) => {
  const body = req.body || {};
  const targetDate = body.date !== undefined ? String(body.date).trim() : getDateStringVN();
  const includePastDates = body.includePastDates === undefined ? true : Boolean(body.includePastDates);

  if (!isValidDateString(targetDate)) {
    return res.status(400).json({
      message: 'Ngày mục tiêu (date) phải có định dạng YYYY-MM-DD hợp lệ',
      errors: { date: 'Ngày mục tiêu (date) phải có định dạng YYYY-MM-DD hợp lệ' },
    });
  }

  try {
    const result = await flagOverdueAppointments({ targetDate, includePastDates });
    return res.status(200).json({
      message: 'Đã chạy tiến trình đánh dấu lịch hẹn quá hạn (JOB-01)',
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  createOnlineBooking,
  listMyOnlineBooking,
  getMyOnlineBookingById,
  listAllBooking,
  checkInBooking,
  cancelBooking,
  triggerFlagOverdue,
};