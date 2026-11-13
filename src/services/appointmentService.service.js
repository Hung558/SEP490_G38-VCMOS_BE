const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const Service = require('../models/Service');
const { createOnlineAppointment } = require('./appointmentOrder.service');
const cloudinary = require('../config/cloudinary');

const CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ trước giờ hẹn (BR-07)
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CLINIC_OPEN_TIME = '08:00';
const CLINIC_CLOSE_TIME = '18:00';
const CLINIC_CLOSE_MINUTES = 18 * 60;
const DEFAULT_SERVICE_DURATION = 30;

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const parseTimeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const formatMinutesToTime = (totalMinutes) => {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Tạo mới dịch vụ cho lịch hẹn online.
 *
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
async function createOnlineAppointmentService({
  ownerId,
  orderId,
  serviceId,
  sequenceNo,
  isEmergency,
  scheduledStart,
  scheduledEnd,
}) {
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
  if (typeof scheduledStart === 'string') doc.scheduledStart = scheduledStart;
  if (typeof scheduledEnd === 'string') doc.scheduledEnd = scheduledEnd;

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
 * @param {string} [payload.slotStart] - HH:mm (tùy chọn; nếu có, BE tự tính scheduledStart/scheduledEnd và slotEnd)
 * @param {Array<{ serviceId: string, sequenceNo?: number, isEmergency?: boolean }>} payload.services
 * @returns {Promise<{ message: string, data: { appointment: AppointmentOrder, services: AppointmentService[] } }>}
 * @throws {Error} 400 nếu không có dịch vụ nào; lỗi từ createOnlineAppointment / createOnlineAppointmentService
 */
async function createOnlineBooking({ ownerId, petId, date, note, slotStart, services }) {
  if (!Array.isArray(services) || services.length === 0) {
    throw createError('Lịch hẹn phải có ít nhất một dịch vụ', 400);
  }

  // Nếu có truyền slotStart, tính nối tiếp scheduledStart / scheduledEnd cho từng dịch vụ và slotEnd cho đơn tổng
  let cleanSlotStart;
  let computedSlotEnd;
  let serviceTimeWindows = [];

  if (slotStart !== undefined && slotStart !== null && slotStart !== '') {
    if (typeof slotStart !== 'string' || !TIME_REGEX.test(slotStart.trim())) {
      throw createError('slotStart phải có định dạng HH:mm (ví dụ: 09:00)', 400);
    }
    cleanSlotStart = slotStart.trim();
    if (cleanSlotStart < CLINIC_OPEN_TIME || cleanSlotStart >= CLINIC_CLOSE_TIME) {
      throw createError(
        `Giờ hẹn phải nằm trong khung giờ làm việc (${CLINIC_OPEN_TIME} - ${CLINIC_CLOSE_TIME})`,
        400
      );
    }

    const serviceIds = [...new Set(services.map((s) => String(s.serviceId)))];
    let durationMap = new Map();
    if (Service && typeof Service.find === 'function') {
      const query = Service.find({ _id: { $in: serviceIds } });
      const foundServices =
        query && typeof query.select === 'function'
          ? await query.select('defaultDuration').lean()
          : await query;
      if (Array.isArray(foundServices)) {
        durationMap = new Map(foundServices.map((s) => [String(s._id), s.defaultDuration]));
      }
    }

    let currentMinutes = parseTimeToMinutes(cleanSlotStart);
    for (const item of services) {
      const rawDuration = durationMap.get(String(item.serviceId));
      const duration = Number(rawDuration) > 0 ? Number(rawDuration) : DEFAULT_SERVICE_DURATION;
      const startStr = formatMinutesToTime(currentMinutes);
      currentMinutes += duration;
      const endStr = formatMinutesToTime(currentMinutes);
      serviceTimeWindows.push({ scheduledStart: startStr, scheduledEnd: endStr });
    }

    if (currentMinutes > CLINIC_CLOSE_MINUTES) {
      throw createError(
        `Tổng thời lượng dịch vụ vượt quá giờ đóng cửa phòng khám (${CLINIC_CLOSE_TIME})`,
        400
      );
    }
    computedSlotEnd = formatMinutesToTime(currentMinutes);
  }

  // 1. Tạo lịch hẹn (kiểm tra thú cưng, chống đặt trùng, sinh mã, gửi email cho lễ tân)
  const orderInput = { petId, date, note };
  if (cleanSlotStart !== undefined) {
    orderInput.slotStart = cleanSlotStart;
    orderInput.slotEnd = computedSlotEnd;
  }
  const appointment = await createOnlineAppointment(ownerId, orderInput);

  // 2. Tạo từng dịch vụ TUẦN TỰ: nếu chạy song song, các lần tự tăng sequenceNo
  //    sẽ đọc cùng một giá trị "last" và đụng unique index (orderId, sequenceNo)
  const createdServices = [];
  try {
    for (let i = 0; i < services.length; i++) {
      const { serviceId, sequenceNo, isEmergency } = services[i];
      const serviceInput = {
        ownerId,
        orderId: appointment._id,
        serviceId,
        sequenceNo,
        isEmergency,
      };
      if (serviceTimeWindows[i]) {
        serviceInput.scheduledStart = serviceTimeWindows[i].scheduledStart;
        serviceInput.scheduledEnd = serviceTimeWindows[i].scheduledEnd;
      }
      const { data } = await createOnlineAppointmentService(serviceInput);
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

/**
 * Cập nhật trạng thái của 1 dịch vụ trong lịch hẹn.
 *
 * Không kiểm tra quyền hay luật chuyển trạng thái (giả định đã xử lý ở middleware / validator).
 * - Khi chuyển sang 'InProgress': ghi nhận `dequeueAt` (rời hàng đợi); đơn 'CheckedIn' -> 'InProgress'.
 * - Khi tất cả dịch vụ chưa hủy của đơn đều 'Done': đơn chuyển sang 'WaitOwner'.
 *
 * @param {Object} payload
 * @param {string} payload.appointmentServiceId
 * @param {string} payload.status - Trạng thái mới (Booked, Waiting, InProgress, Done, Cancelled, Overdue)
 * @returns {Promise<{ message: string, data: AppointmentService }>}
 * @throws {Error} 404 nếu không tìm thấy dịch vụ hoặc lịch hẹn
 */
async function updateAppointmentServiceStatus({ appointmentServiceId, status }) {
  // 1. Tìm dịch vụ trong lịch hẹn
  const currentService = await AppointmentService.findById(appointmentServiceId).lean();
  if (!currentService) {
    throw createError('Không tìm thấy dịch vụ trong lịch hẹn', 404);
  }

  // 2. Tìm đơn cha và đảm bảo đơn chưa kết thúc
  const order = await AppointmentOrder.findById(currentService.orderId).lean();
  if (!order) {
    throw createError('Không tìm thấy lịch hẹn', 404);
  }
  if (['Done', 'Cancelled', 'Overdue'].includes(order.derivedStatus)) {
    throw createError(
      `Không thể cập nhật dịch vụ của lịch hẹn đang ở trạng thái "${order.derivedStatus}"`,
      409
    );
  }

  // 3. Cập nhật trạng thái dịch vụ
  const fieldsToSet = { status };
  if (status === 'InProgress') fieldsToSet.dequeueAt = new Date();

  const updatedService = await AppointmentService.findByIdAndUpdate(
    appointmentServiceId,
    { $set: fieldsToSet },
    { returnDocument: 'after' }
  )
    .populate('serviceId')
    .populate('preferredStaffId', 'code fullName role status')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  // 4. Đồng bộ trạng thái đơn lịch hẹn
  if (status === 'InProgress' && order.derivedStatus === 'CheckedIn') {
    await AppointmentOrder.findByIdAndUpdate(order._id, { $set: { derivedStatus: 'InProgress' } });
  } else if (status === 'Done' && ['CheckedIn', 'InProgress'].includes(order.derivedStatus)) {
    const allServices = await AppointmentService.find({ orderId: order._id })
      .select('status')
      .lean();
    const activeServices = allServices.filter((item) => item.status !== 'Cancelled');
    if (activeServices.length > 0 && activeServices.every((item) => item.status === 'Done')) {
      await AppointmentOrder.findByIdAndUpdate(order._id, { $set: { derivedStatus: 'WaitOwner' } });
    }
  }

  return {
    message: 'Cập nhật trạng thái dịch vụ thành công',
    data: updatedService,
  };
}

const GROOMING_NOTE_CLOUDINARY_FOLDER = 'grooming-notes';

// Tải 1 ảnh (buffer) lên Cloudinary bằng upload_stream
const uploadImageBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'image' }, (err, result) =>
        err ? reject(err) : resolve(result)
      )
      .end(buffer);
  });

// Xoá ảnh đã tải lên khi các bước sau thất bại; lỗi xoá chỉ bị bỏ qua (best effort)
const deleteCloudinaryImages = (publicIds) =>
  Promise.allSettled(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { resource_type: 'image' }))
  );

/**
 * Groomer tạo ghi chú chăm sóc (GroomingNote) cho 1 dịch vụ được phân công.
 *
 * Dữ liệu đầu vào được giả định đã qua `validateCreateGroomingNote`.
 * - Ảnh `beforePhoto` / `afterPhoto` được tải lên Cloudinary; `secure_url` lưu vào
 *   `beforePhotoUrl` / `afterPhotoUrl`.
 * - Dùng cập nhật nguyên tử với điều kiện `groomingNote: null` để tránh ghi đè khi 2 request
 *   đến cùng lúc. Nếu ghi DB thất bại, ảnh vừa tải lên sẽ bị xoá khỏi Cloudinary.
 *
 * @param {Object} payload
 * @param {string} payload.appointmentServiceId
 * @param {string} payload.groomerId
 * @param {Object} payload.note - { beforeNote?, afterNote?, recommendations? }
 * @param {Object} [payload.photos] - { beforePhoto?: multerFile, afterPhoto?: multerFile }
 * @returns {Promise<{ message: string, data: AppointmentService }>}
 * @throws {Error} 409 nếu dịch vụ đã có ghi chú; 502 nếu tải ảnh lên Cloudinary thất bại
 */
async function createGroomingNote({ appointmentServiceId, groomerId, note, photos = {} }) {
  const noteData = { ...note };
  const uploadedPublicIds = [];

  // 1. Tải ảnh lên Cloudinary (song song)
  const photoEntries = [
    ['beforePhoto', 'beforePhotoUrl'],
    ['afterPhoto', 'afterPhotoUrl'],
  ].filter(([field]) => photos[field]);

  if (photoEntries.length > 0) {
    const folder = `${GROOMING_NOTE_CLOUDINARY_FOLDER}/${appointmentServiceId}`;
    const results = await Promise.allSettled(
      photoEntries.map(([field]) => uploadImageBuffer(photos[field].buffer, folder))
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') uploadedPublicIds.push(r.value.public_id);
    });

    if (results.some((r) => r.status === 'rejected')) {
      await deleteCloudinaryImages(uploadedPublicIds);
      throw createError('Không thể tải ảnh lên, vui lòng thử lại sau', 502);
    }

    results.forEach((r, i) => {
      noteData[photoEntries[i][1]] = r.value.secure_url;
    });
  }

  // 2. Ghi ghi chú vào dịch vụ (nguyên tử)
  let updated;
  try {
    updated = await AppointmentService.findOneAndUpdate(
      { _id: appointmentServiceId, assignedStaffId: groomerId, groomingNote: null },
      { $set: { groomingNote: { ...noteData, createdAt: new Date() } } },
      { returnDocument: 'after', runValidators: true }
    )
      .populate('serviceId')
      .populate('orderId')
      .populate('assignedStaffId', 'code fullName role status')
      .lean();
  } catch (err) {
    await deleteCloudinaryImages(uploadedPublicIds);
    throw err;
  }

  if (!updated) {
    await deleteCloudinaryImages(uploadedPublicIds);
    throw createError('Dịch vụ này đã có ghi chú chăm sóc hoặc không còn được phân công cho bạn', 409);
  }

  return { message: 'Tạo ghi chú chăm sóc thành công', data: updated };
}

/**
 * Groomer xem ghi chú chăm sóc của 1 dịch vụ (quyền sở hữu đã được kiểm tra ở validator).
 *
 * @returns {Promise<{ message: string, data: AppointmentService }>}
 * @throws {Error} 404 nếu dịch vụ chưa có ghi chú
 */
async function getGroomingNoteByServiceId({ appointmentServiceId, groomerId }) {
  const appointmentService = await AppointmentService.findOne({
    _id: appointmentServiceId,
    assignedStaffId: groomerId,
  })
    .populate('serviceId')
    .populate('orderId')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  if (!appointmentService) {
    throw createError('Không tìm thấy dịch vụ trong lịch hẹn', 404);
  }
  if (!appointmentService.groomingNote) {
    throw createError('Dịch vụ này chưa có ghi chú chăm sóc', 404);
  }

  return { message: 'Lấy ghi chú chăm sóc thành công', data: appointmentService };
}

/**
 * Groomer xem danh sách các dịch vụ đã có ghi chú chăm sóc của chính mình (mới nhất trước).
 *
 * @returns {Promise<{ message: string, data: AppointmentService[] }>}
 */
async function getMyGroomingNotes({ groomerId }) {
  const services = await AppointmentService.find({
    assignedStaffId: groomerId,
    groomingNote: { $ne: null },
  })
    .populate('serviceId')
    .populate('orderId')
    .sort({ 'groomingNote.createdAt': -1 })
    .lean();

  return { message: 'Lấy danh sách ghi chú chăm sóc thành công', data: services };
}

module.exports = {
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
};