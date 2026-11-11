const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const { createOnlineAppointment } = require('./appointmentOrder.service');

const CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ trước giờ hẹn (BR-07)

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

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

/**
 * Lễ tân / Admin xem danh sách các dịch vụ nằm trong 1 đơn lịch hẹn (`orderId`).
 */
async function getAppointmentServicesByOrderId(orderId) {
  const services = await AppointmentService.find({ orderId })
    .populate('serviceId')
    .populate('preferredStaffId', 'code fullName role status')
    .populate('assignedStaffId', 'code fullName role status')
    .sort({ sequenceNo: 1 })
    .lean();

  return {
    message: 'Lấy danh sách dịch vụ của lịch hẹn thành công',
    data: services,
  };
}

/**
 * Lễ tân (Receptionist) phân công Bác sĩ (Veterinarian) hoặc Groomer cho 1 dịch vụ trong lịch hẹn.
 * - Nếu khách đã Check-in (orderStatus === 'CheckedIn') và dịch vụ đang là 'Booked',
 *   hệ thống tự động chuyển status của dịch vụ sang 'Waiting', cấp số thứ tự hàng đợi (queueNo)
 *   và ghi nhận thời điểm vào hàng đợi (enqueueAt) để Bác sĩ / Groomer thấy trên Work Queue.
 */
async function assignStaffToAppointmentService({ appointmentServiceId, assignedStaffId, orderStatus }) {
  const currentService = await AppointmentService.findById(appointmentServiceId).lean();
  if (!currentService) {
    throw createError('Không tìm thấy dịch vụ trong lịch hẹn', 404);
  }

  // Tính số thứ tự hàng đợi (queueNo) tiếp theo của nhân viên đó
  const lastQueued = await AppointmentService.findOne({
    assignedStaffId,
    queueNo: { $ne: null },
  })
    .sort({ queueNo: -1 })
    .select('queueNo')
    .lean();

  const nextQueueNo = lastQueued && lastQueued.queueNo ? lastQueued.queueNo + 1 : 1;

  const fieldsToSet = {
    assignedStaffId,
    queueNo: nextQueueNo,
  };

  // Nếu đơn hẹn đã Check-in hoặc đang InProgress thì chuyển luôn sang Waiting;
  // còn nếu đơn đang là Booked (Lễ tân xếp sẵn bác sĩ trước khi khách đến) thì giữ status = 'Booked',
  // đến khi khách tới bấm Check-in sẽ tự động nhảy sang 'Waiting'
  if (orderStatus === 'CheckedIn' || orderStatus === 'InProgress') {
    fieldsToSet.status = 'Waiting';
    fieldsToSet.enqueueAt = new Date();
  }

  const updated = await AppointmentService.findByIdAndUpdate(
    appointmentServiceId,
    { $set: fieldsToSet },
    { returnDocument: 'after' }
  )
    .populate('serviceId')
    .populate('preferredStaffId', 'code fullName role status')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  return {
    message: 'Phân công nhân sự cho dịch vụ thành công',
    data: updated,
  };
}

/**
 * Lấy tất cả dịch vụ trong lịch hẹn được phân công cho một nhân viên (Bác sĩ / Groomer).
 *
 * Kết quả được sắp xếp theo thứ tự hàng đợi (`queueNo`, tăng dần); các dịch vụ chưa có
 * `queueNo` được xếp cuối, sau đó theo `createdAt`.
 *
 * @param {Object} payload
 * @param {string} payload.assignedStaffId - Id của nhân viên được phân công
 * @param {string} [payload.status] - Lọc theo trạng thái dịch vụ (Booked, Waiting, InProgress, Done, Cancelled, Overdue)
 * @returns {Promise<{ message: string, data: AppointmentService[] }>}
 */
async function getAppointmentServicesByAssignedStaffId({ assignedStaffId, status }) {
  const filter = { assignedStaffId };
  if (status) filter.status = status;

  const services = await AppointmentService.find(filter)
    .populate('serviceId')
    .populate('orderId')
    .populate('preferredStaffId', 'code fullName role status')
    .populate('assignedStaffId', 'code fullName role status')
    .sort({ isEmergency: -1, queueNo: 1, enqueueAt: 1 })
    .lean();

  return {
    message: 'Lấy danh sách dịch vụ của nhân viên thành công',
    data: services,
  };
}

/**
 * UC-18, BR-07, BR-09: Hủy 1 dịch vụ lẻ trong lịch hẹn (do PetOwner hoặc Receptionist thực hiện).
 * - Nếu tất cả dịch vụ trong đơn đều đã bị hủy -> đơn chuyển sang 'Cancelled'.
 * - Nếu đơn còn dịch vụ khác chưa hủy -> giữ nguyên trạng thái đơn (hoặc chuyển sang 'WaitOwner'
 *   nếu đơn đã Check-in và tất cả các dịch vụ còn lại đều đã 'Done').
 */
async function cancelAppointmentService({ appointmentServiceId, userId, role, reason }) {
  // 1. Tìm dịch vụ trong lịch hẹn
  const currentService = await AppointmentService.findById(appointmentServiceId).lean();
  if (!currentService) {
    throw createError('Không tìm thấy dịch vụ trong lịch hẹn', 404);
  }

  // 2. Tìm đơn lịch hẹn cha
  const order = await AppointmentOrder.findById(currentService.orderId).lean();
  if (!order) {
    throw createError('Không tìm thấy lịch hẹn', 404);
  }

  // 3. Kiểm tra quyền sở hữu nếu là PetOwner (chống IDOR)
  if (role === 'PetOwner' && String(order.ownerId) !== String(userId)) {
    throw createError('Bạn chỉ có thể hủy dịch vụ trong lịch hẹn của chính mình', 403);
  }

  // 4. Kiểm tra trạng thái và khung giờ cho phép hủy (UC-18, BR-07)
  if (currentService.status === 'Cancelled') {
    throw createError('Dịch vụ này đã bị hủy trước đó', 409);
  }

  if (role === 'PetOwner') {
    if (order.derivedStatus !== 'Booked' || currentService.status !== 'Booked') {
      throw createError(
        'Không thể tự hủy dịch vụ sau khi đã check-in. Vui lòng liên hệ phòng khám để được hỗ trợ',
        409
      );
    }

    const startTimeStr = currentService.scheduledStart || order.slotStart;
    if (startTimeStr) {
      const scheduledStartMs = new Date(`${order.date}T${startTimeStr}:00+07:00`).getTime();
      if (!Number.isNaN(scheduledStartMs) && scheduledStartMs - Date.now() < CANCELLATION_WINDOW_MS) {
        throw createError(
          'Không thể tự hủy dịch vụ trong vòng 2 giờ trước giờ hẹn. Vui lòng liên hệ phòng khám để được hỗ trợ',
          409
        );
      }
    } else if (order.date && order.date < todayVN()) {
      throw createError(
        'Không thể tự hủy dịch vụ khi đã qua ngày hẹn. Vui lòng liên hệ phòng khám để được hỗ trợ',
        409
      );
    }
  } else {
    // Lễ tân chỉ được hủy dịch vụ chưa bắt đầu (Booked / Waiting) thuộc đơn chưa kết thúc
    if (['Done', 'Cancelled', 'Overdue'].includes(order.derivedStatus)) {
      throw createError(
        `Không thể hủy dịch vụ của lịch hẹn đang ở trạng thái "${order.derivedStatus}"`,
        409
      );
    }
    if (!['Booked', 'Waiting'].includes(currentService.status)) {
      throw createError(
        `Không thể hủy dịch vụ đang ở trạng thái "${currentService.status}"`,
        409
      );
    }
  }

  // 5. Cập nhật trạng thái dịch vụ sang Cancelled và giải phóng hàng đợi
  const now = new Date();
  const updatedService = await AppointmentService.findByIdAndUpdate(
    appointmentServiceId,
    {
      $set: {
        status: 'Cancelled',
        cancelReason: reason,
        cancelledAt: now,
        cancelledBy: userId,
        queueNo: null,
        enqueueAt: null,
      },
    },
    { returnDocument: 'after' }
  )
    .populate('serviceId')
    .populate('preferredStaffId', 'code fullName role status')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  // 6. Tính toán lại trạng thái đơn lịch hẹn (BR-09, UC-18 Alt Flow 5a)
  const allServices = await AppointmentService.find({ orderId: order._id })
    .select('status')
    .lean();

  if (allServices.length > 0 && allServices.every((item) => item.status === 'Cancelled')) {
    await AppointmentOrder.findByIdAndUpdate(order._id, {
      $set: {
        derivedStatus: 'Cancelled',
        cancelReason: reason,
        cancelledAt: now,
        cancelledBy: userId,
      },
    });
  } else if (['CheckedIn', 'InProgress'].includes(order.derivedStatus)) {
    const activeServices = allServices.filter((item) => item.status !== 'Cancelled');
    if (activeServices.length > 0 && activeServices.every((item) => item.status === 'Done')) {
      await AppointmentOrder.findByIdAndUpdate(order._id, {
        $set: { derivedStatus: 'WaitOwner' },
      });
    }
  }

  return {
    message: 'Hủy dịch vụ trong lịch hẹn thành công',
    data: updatedService,
  };
}

module.exports = {
  createOnlineAppointmentService,
  createOnlineBooking,
  getAppointmentServicesByOrderId,
  assignStaffToAppointmentService,
  getAppointmentServicesByAssignedStaffId,
  cancelAppointmentService,
};