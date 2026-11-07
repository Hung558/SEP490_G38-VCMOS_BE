const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const { createOnlineAppointment } = require('./appointmentOrder.service');

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

/**
 * Đặt lịch online: tạo lịch hẹn (AppointmentOrder) cùng một hoặc nhiều dịch vụ (AppointmentService).
 *
 * Dữ liệu đầu vào được giả định là hợp lệ.
 * Nếu tạo dịch vụ thất bại, lịch hẹn và các dịch vụ đã tạo sẽ được xoá để tránh dữ liệu dở dang.
 *
 * @param {Object} payload
 * @param {string} payload.ownerId - Id của người dùng đang đăng nhập (PetOwner)
 * @param {string} payload.petId
 * @param {string} payload.date - YYYY-MM-DD
 * @param {string} [payload.note]
 * @param {Array<{ serviceId: string, sequenceNo?: number, isEmergency?: boolean }>} payload.services
 * @returns {Promise<{ message: string, data: { appointment: AppointmentOrder, services: AppointmentService[] } }>}
 * @throws {Error} 400 nếu không có dịch vụ nào; lỗi từ createOnlineAppointment / createOnlineAppointmentService
 */
async function createOnlineBooking({ ownerId, petId, date, note, services }) {
  if (!Array.isArray(services) || services.length === 0) {
    throw createError('Lịch hẹn phải có ít nhất một dịch vụ', 400);
  }

  // 1. Tạo lịch hẹn (kiểm tra thú cưng, chống đặt trùng, sinh mã, gửi email cho lễ tân)
  const appointment = await createOnlineAppointment(ownerId, { petId, date, note });

  // 2. Tạo từng dịch vụ TUẦN TỰ: nếu chạy song song, các lần tự tăng sequenceNo
  //    sẽ đọc cùng một giá trị "last" và đụng unique index (orderId, sequenceNo)
  const createdServices = [];
  try {
    for (const { serviceId, sequenceNo, isEmergency } of services) {
      const { data } = await createOnlineAppointmentService({
        ownerId,
        orderId: appointment._id,
        serviceId,
        sequenceNo,
        isEmergency,
      });
      createdServices.push(data);
    }
  } catch (err) {
    // Hoàn tác thủ công (không dùng transaction): xoá dịch vụ đã tạo và lịch hẹn
    await Promise.allSettled([
      AppointmentService.deleteMany({ orderId: appointment._id }),
      AppointmentOrder.deleteOne({ _id: appointment._id }),
    ]);
    throw err;
  }

  return {
    message: 'Đặt lịch online thành công',
    data: { appointment, services: createdServices },
  };
}

module.exports = {
  createOnlineAppointmentService,
  createOnlineBooking
};