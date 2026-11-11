const appointmentService = require('../services/appointmentOrder.service');
const {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateListAllAppointments,
  validateAppointmentId,
  validateCancelAppointment,
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
  const { errors, value: id } = validateAppointmentId(req.params);
  if (errors.length) return sendValidationError(res, errors);

  const cageId = req.body?.cageId;
  if (cageId !== undefined && cageId !== null && cageId !== '' && !/^[0-9a-fA-F]{24}$/.test(String(cageId))) {
    return sendValidationError(res, [{ field: 'cageId', message: 'cageId không hợp lệ' }]);
  }

  try {
    const appointment = await appointmentService.checkInAppointment(id, {
      cageId: cageId || undefined,
      staffId: req.user?.id,
      requiresIsolation: req.body?.requiresIsolation,
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

module.exports = {
  createOnlineBooking,
  listMyOnlineBooking,
  getMyOnlineBookingById,
  listAllBooking,
  checkInBooking,
  cancelBooking,
};