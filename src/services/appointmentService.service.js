const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');

const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Tạo mới dịch vụ cho lịch hẹn online.
 *
 * Dữ liệu đầu vào được giả định là hợp lệ.
 * `preferredStaffId`, `assignedStaffId`, `status`, `queueNo`, `enqueueAt`,
 * `dequeueAt` và `groomingNote` không nhận từ đầu vào, dùng giá trị mặc định của schema.
 *
 * @param {Object} payload
 * @param {string} payload.ownerId - Id của người dùng đang đăng nhập (PetOwner); phải là chủ của lịch hẹn
 * @param {string} payload.orderId
 * @param {string} payload.serviceId
 * @param {number} [payload.sequenceNo] - Tự tăng nếu không truyền
 * @param {boolean} [payload.isEmergency]
 * @returns {Promise<{ message: string, data: AppointmentService }>}
 * @throws {Error} 403 nếu lịch hẹn không thuộc về `ownerId`
 */
async function createOnlineAppointmentService({ ownerId, orderId, serviceId, sequenceNo, isEmergency }) {
  // PetOwner chỉ được tạo dịch vụ cho lịch hẹn của chính mình
  const isOwner = await AppointmentOrder.exists({ _id: orderId, ownerId });
  if (!isOwner) {
    throw createError('Bạn chỉ có thể tạo dịch vụ cho lịch hẹn của mình', 403);
  }

  let seq = sequenceNo;
  if (seq === undefined) {
    const last = await AppointmentService.findOne({ orderId })
      .sort({ sequenceNo: -1 })
      .select('sequenceNo')
      .lean();
    seq = last ? last.sequenceNo + 1 : 1;
  }

  const doc = { orderId, serviceId, sequenceNo: seq };
  if (typeof isEmergency === 'boolean') doc.isEmergency = isEmergency;

  try {
    const data = await AppointmentService.create(doc);
    return { message: 'Tạo dịch vụ cho lịch hẹn online thành công', data };
  } catch (err) {
    if (err.code === 11000) {
      throw createError('Số thứ tự dịch vụ đã tồn tại trong lịch hẹn này', 409);
    }
    throw err;
  }
}

module.exports = {
  createOnlineAppointmentService,
};