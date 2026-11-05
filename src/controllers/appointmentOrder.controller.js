const appointmentService = require('../services/appointmentOrder.service');
const {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateAppointmentId,
} = require('../validators/appointmentOrder.validator');

const handleError = (res, err) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
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

const checkInBooking = async (req, res) => {
  const { errors, value: id } = validateAppointmentId(req.params);
  if (errors.length) return sendValidationError(res, errors);

  try {
    const appointment = await appointmentService.checkInAppointment(id);
    return res.json({ message: 'Check-in thành công', data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  createOnlineBooking,
  listMyOnlineBooking,
  getMyOnlineBookingById,
  checkInBooking
};