const appointmentService = require('../services/appointmentOrder.service');
const AppointmentServiceModel = require('../models/AppointmentService');
const {
  validateCreateOnlineAppointment,
  validateListOnlineAppointments,
  validateListAllAppointments,
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

  try {
    const appointment = await appointmentService.checkInAppointment(id);

    // Khi khách đến Check-in, nếu các dịch vụ bên trong đã được Lễ tân phân công Bác sĩ từ trước
    // thì tự động chuyển trạng thái dịch vụ từ 'Booked' sang 'Waiting' để vào hàng đợi của Bác sĩ
    await AppointmentServiceModel.updateMany(
      { orderId: id, status: 'Booked', assignedStaffId: { $ne: null } },
      { $set: { status: 'Waiting', enqueueAt: appointment.checkedInAt || new Date() } }
    );

    return res.json({ message: 'Check-in thành công', data: appointment });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  createOnlineBooking,
  listMyOnlineBooking,
  getMyOnlineBookingById,
  listAllBooking,
  checkInBooking
};