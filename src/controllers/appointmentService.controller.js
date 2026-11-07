const {
  createOnlineAppointmentService,
  createOnlineBooking,
} = require('../services/appointmentService.service');
const {
  validateCreateOnlineAppointmentService,
  validateCreateOnlineBooking,
} = require('../validators/appointmentService.validator');

const handleError = (res, err) => {
  // appointmentService.service.js / validator dùng `statusCode`,
  // còn appointmentOrder.service.js (được gọi qua createOnlineBooking) dùng `status`
  const statusCode = err.statusCode || err.status || 500;
  const message =
    err.statusCode || err.status ? err.message : 'Lỗi máy chủ, vui lòng thử lại sau';
  return res.status(statusCode).json({ message });
};

/**
 * POST /appointment-services/online
 * Body: { orderId, serviceId, sequenceNo?, isEmergency? }
 */
async function createOnlineAppointmentServiceController(req, res) {
  try {
    const payload = await validateCreateOnlineAppointmentService(req.body);
    const { message, data } = await createOnlineAppointmentService({
      ...payload,
      ownerId: req.user.id, // lấy từ token (protect), không nhận từ body
    });
    return res.status(201).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * POST /appointment-services/online-booking
 * Body: { petId, date, note?, services: [{ serviceId, sequenceNo?, isEmergency? }] }
 */
async function createOnlineBookingController(req, res) {
  try {
    const payload = await validateCreateOnlineBooking(req.body);
    const { message, data } = await createOnlineBooking({
      ...payload,
      ownerId: req.user.id, // lấy từ token (protect), không nhận từ body
    });
    return res.status(201).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  createOnlineAppointmentServiceController,
  createOnlineBookingController,
};