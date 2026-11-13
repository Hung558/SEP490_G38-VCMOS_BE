const {
  createOnlineAppointmentService,
  createOnlineBooking,
  getAppointmentServicesByOrderId,
  assignStaffToAppointmentService,
  getAppointmentServicesByAssignedStaffId,
  cancelAppointmentService,
  updateAppointmentServiceStatus,
  createGroomingNote,
  getGroomingNoteByServiceId,
  getMyGroomingNotes,
} = require('../services/appointmentService.service');
const {
  validateCreateOnlineAppointmentService,
  validateCreateOnlineBooking,
  validateGetServicesByOrderId,
  validateAssignStaffToService,
  validateGetServicesByAssignedStaffId,
  validateCancelAppointmentService,
  validateUpdateAppointmentServiceStatus,
  validateCreateGroomingNote,
  validateGetGroomingNoteByServiceId,
  validateGetMyGroomingNotes,
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

/**
 * GET /appointment-services?orderId=...
 * Lễ tân / Admin xem danh sách các dịch vụ nằm trong 1 đơn lịch hẹn
 */
async function getAppointmentServicesByOrderIdController(req, res) {
  try {
    const orderId = await validateGetServicesByOrderId(req.query && req.query.orderId);
    const { message, data } = await getAppointmentServicesByOrderId(orderId);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * PATCH /appointment-services/:id/assign-staff
 * Body: { assignedStaffId }
 * Lễ tân (Receptionist) phân công Bác sĩ / Groomer cho 1 dịch vụ trong lịch hẹn
 */
async function assignStaffToAppointmentServiceController(req, res) {
  try {
    const validated = await validateAssignStaffToService(req.params.id, req.body);
    const { message, data } = await assignStaffToAppointmentService(validated);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /appointment-services/my-queue?status=...
 * Bác sĩ / Groomer xem danh sách dịch vụ được phân công cho chính mình
 * Query: { status? }
 */
async function getAppointmentServicesByAssignedStaffIdController(req, res) {
  try {
    const payload = await validateGetServicesByAssignedStaffId({
      assignedStaffId: req.user.id, // lấy từ token (protect), không nhận từ query
      status: req.query && req.query.status,
    });
    const { message, data } = await getAppointmentServicesByAssignedStaffId(payload);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * PATCH /appointment-services/:id/cancel
 * Body: { reason }
 * PetOwner hoặc Lễ tân hủy 1 dịch vụ lẻ trong lịch hẹn (UC-18, BR-07)
 */
async function cancelAppointmentServiceController(req, res) {
  try {
    const validated = await validateCancelAppointmentService(req.params.id, req.body);
    const { message, data } = await cancelAppointmentService({
      ...validated,
      userId: req.user?.id,
      role: req.user?.role,
    });
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * PATCH /appointment-services/:id/start
 * Không cần body: status luôn được đặt thành 'InProgress'.
 * Groomer / Veterinarian bắt đầu thực hiện 1 dịch vụ trong lịch hẹn
 * (phân quyền được kiểm tra ở route bằng authorize('Groomer', 'Veterinarian'))
 */
async function startAppointmentServiceController(req, res) {
  try {
    const validated = await validateUpdateAppointmentServiceStatus(req.params.id, {
      status: 'InProgress',
    });
    const { message, data } = await updateAppointmentServiceStatus(validated);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * POST /appointment-services/:id/grooming-note
 * Content-Type: multipart/form-data (hoặc JSON nếu không có ảnh)
 * Text: beforeNote?, afterNote?, recommendations?
 * File: beforePhoto?, afterPhoto? (JPEG/PNG/WebP, tối đa 5MB/ảnh) -> lưu trên Cloudinary
 * Cần ít nhất 1 ghi chú hoặc 1 ảnh.
 * Groomer tạo ghi chú chăm sóc cho dịch vụ được phân công cho chính mình
 */
async function createGroomingNoteController(req, res) {
  try {
    const validated = await validateCreateGroomingNote(
      req.params.id,
      req.user.id,
      req.body,
      req.files // { beforePhoto?, afterPhoto? } do multer gán
    );
    const { message, data } = await createGroomingNote(validated);
    return res.status(201).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /appointment-services/my-grooming-notes
 * Groomer xem danh sách ghi chú chăm sóc của chính mình
 */
async function getMyGroomingNotesController(req, res) {
  try {
    const validated = await validateGetMyGroomingNotes({ groomerId: req.user.id });
    const { message, data } = await getMyGroomingNotes(validated);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /appointment-services/:id/grooming-note
 * Groomer xem ghi chú chăm sóc của 1 dịch vụ được phân công cho chính mình
 */
async function getGroomingNoteByServiceIdController(req, res) {
  try {
    const validated = await validateGetGroomingNoteByServiceId(req.params.id, req.user.id);
    const { message, data } = await getGroomingNoteByServiceId(validated);
    return res.status(200).json({ message, data });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  createOnlineAppointmentServiceController,
  createOnlineBookingController,
  getAppointmentServicesByOrderIdController,
  assignStaffToAppointmentServiceController,
  getAppointmentServicesByAssignedStaffIdController,
  cancelAppointmentServiceController,
  startAppointmentServiceController,
  createGroomingNoteController,
  getMyGroomingNotesController,
  getGroomingNoteByServiceIdController,
};