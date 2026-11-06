const { createOnlineAppointmentService } = require('../services/appointmentService.service');
const { validateCreateOnlineAppointmentService } = require('../validators/appointmentService.validator');

const handleError = (res, err) => {
  const statusCode = err.statusCode || 500;
  const message = err.statusCode ? err.message : 'Lỗi máy chủ, vui lòng thử lại sau';
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

module.exports = {
  createOnlineAppointmentServiceController,
};