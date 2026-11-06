const { isValidObjectId } = require('mongoose');
const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const Service = require('../models/Service');

const BLOCKED_ORDER_STATUSES = ['Done', 'Cancelled', 'Overdue'];

const DEFAULT_ONLY_FIELDS = [
  'preferredStaffId',
  'assignedStaffId',
  'status',
  'queueNo',
  'enqueueAt',
  'dequeueAt',
  'groomingNote',
];

const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Kiểm tra dữ liệu trước khi gọi `createOnlineAppointmentService`.
 * Trả về payload đã kiểm tra nếu hợp lệ, ném lỗi (có `statusCode`) nếu không hợp lệ.
 *
 * Các trường `preferredStaffId`, `assignedStaffId`, `status`, `queueNo`,
 * `enqueueAt`, `dequeueAt`, `groomingNote` không được phép truyền vào.
 *
 * @param {Object} payload - { orderId, serviceId, sequenceNo?, isEmergency? }
 * @returns {Promise<Object>} payload
 * @throws {Error} lỗi với `statusCode` 400 | 404 | 409 và thông báo tiếng Việt
 */
async function validateCreateOnlineAppointmentService(payload) {
  const data = payload || {};
  const { orderId, serviceId, sequenceNo, isEmergency } = data;

  // 1. Các trường không được phép truyền vào (dùng giá trị mặc định)
  const forbidden = DEFAULT_ONLY_FIELDS.filter((field) => data[field] !== undefined);
  if (forbidden.length > 0) {
    throw createError(`Không được truyền các trường: ${forbidden.join(', ')}`);
  }

  // 2. Kiểm tra định dạng
  if (!orderId) throw createError('orderId là bắt buộc');
  if (!isValidObjectId(orderId)) throw createError('orderId không hợp lệ');

  if (!serviceId) throw createError('serviceId là bắt buộc');
  if (!isValidObjectId(serviceId)) throw createError('serviceId không hợp lệ');

  if (sequenceNo !== undefined && (!Number.isInteger(sequenceNo) || sequenceNo < 1)) {
    throw createError('sequenceNo phải là số nguyên dương');
  }

  if (isEmergency !== undefined && typeof isEmergency !== 'boolean') {
    throw createError('isEmergency phải là true hoặc false');
  }

  // 3. Kiểm tra lịch hẹn
  const order = await AppointmentOrder.findById(orderId).select('isOnline derivedStatus').lean();
  if (!order) throw createError('Không tìm thấy lịch hẹn', 404);
  if (!order.isOnline) throw createError('Lịch hẹn này không phải lịch hẹn online');
  if (BLOCKED_ORDER_STATUSES.includes(order.derivedStatus)) {
    throw createError(`Không thể thêm dịch vụ vào lịch hẹn có trạng thái "${order.derivedStatus}"`);
  }

  // 4. Kiểm tra dịch vụ
  const service = await Service.findById(serviceId).select('status').lean();
  if (!service) throw createError('Không tìm thấy dịch vụ', 404);
  if (service.status !== 'Active') throw createError('Dịch vụ hiện không hoạt động');

  // 5. Kiểm tra trùng số thứ tự (nếu có truyền)
  if (sequenceNo !== undefined) {
    const duplicated = await AppointmentService.exists({ orderId, sequenceNo });
    if (duplicated) throw createError('Số thứ tự dịch vụ đã tồn tại trong lịch hẹn này', 409);
  }

  return data;
}

module.exports = {
  validateCreateOnlineAppointmentService,
};