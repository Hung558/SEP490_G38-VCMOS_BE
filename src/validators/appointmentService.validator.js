const { isValidObjectId } = require('mongoose');
const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const Service = require('../models/Service');
const User = require('../models/User');

const BLOCKED_ORDER_STATUSES = ['Done', 'Cancelled', 'Overdue'];
const BLOCKED_SERVICE_STATUSES = ['InProgress', 'Done', 'Cancelled', 'Overdue'];
const CLINICAL_STAFF_ROLES = ['Veterinarian', 'Groomer'];
const SERVICE_STATUSES = ['Booked', 'Waiting', 'InProgress', 'Done', 'Cancelled', 'Overdue'];

const DEFAULT_ONLY_FIELDS = [
  'preferredStaffId',
  'assignedStaffId',
  'status',
  'queueNo',
  'enqueueAt',
  'dequeueAt',
  'groomingNote',
];

// Các trường của lịch hẹn không được truyền vào khi đặt lịch (dùng giá trị mặc định / sinh tự động)
const BOOKING_ORDER_DEFAULT_ONLY_FIELDS = ['code', 'isOnline', 'derivedStatus', 'checkedInAt'];

// Mỗi dịch vụ trong lịch đặt: ngoài các trường mặc định, orderId cũng không được truyền (lịch hẹn chưa tồn tại)
const BOOKING_SERVICE_DEFAULT_ONLY_FIELDS = [...DEFAULT_ONLY_FIELDS, 'orderId'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CANCEL_REASON_MAX_LENGTH = 200;

const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// Ngày phải có thật trong lịch (vd: 2026-02-30 là không hợp lệ)
const isRealDate = (str) => {
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
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

/**
 * Kiểm tra dữ liệu trước khi gọi `createOnlineBooking`.
 * Trả về payload đã kiểm tra nếu hợp lệ, ném lỗi (có `statusCode`) nếu không hợp lệ.
 *
 * Việc thú cưng có tồn tại / thuộc về chủ nuôi và chống đặt trùng trong ngày
 * do `createOnlineAppointment` xử lý, không kiểm tra lại ở đây.
 *
 * @param {Object} payload - { petId, date, note?, services: [{ serviceId, sequenceNo?, isEmergency? }] }
 * @returns {Promise<Object>} payload
 * @throws {Error} lỗi với `statusCode` 400 | 404 | 409 và thông báo tiếng Việt
 */
async function validateCreateOnlineBooking(payload) {
  const data = payload || {};
  const { petId, date, note, services } = data;

  // 1. Các trường của lịch hẹn không được phép truyền vào
  const forbidden = BOOKING_ORDER_DEFAULT_ONLY_FIELDS.filter((field) => data[field] !== undefined);
  if (forbidden.length > 0) {
    throw createError(`Không được truyền các trường: ${forbidden.join(', ')}`);
  }

  // 2. Kiểm tra thông tin lịch hẹn
  if (!petId) throw createError('petId là bắt buộc');
  if (!isValidObjectId(petId)) throw createError('petId không hợp lệ');

  if (!date) throw createError('date là bắt buộc');
  if (typeof date !== 'string' || !DATE_REGEX.test(date) || !isRealDate(date)) {
    throw createError('date phải có định dạng YYYY-MM-DD và là ngày hợp lệ');
  }

  if (note !== undefined && typeof note !== 'string') {
    throw createError('note phải là chuỗi');
  }

  // 3. Kiểm tra danh sách dịch vụ
  if (!Array.isArray(services) || services.length === 0) {
    throw createError('Lịch hẹn phải có ít nhất một dịch vụ');
  }

  services.forEach((item, i) => {
    const label = `services[${i}]`;

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw createError(`${label} không hợp lệ`);
    }

    const forbiddenInItem = BOOKING_SERVICE_DEFAULT_ONLY_FIELDS.filter((f) => item[f] !== undefined);
    if (forbiddenInItem.length > 0) {
      throw createError(`${label}: không được truyền các trường: ${forbiddenInItem.join(', ')}`);
    }

    if (!item.serviceId) throw createError(`${label}: serviceId là bắt buộc`);
    if (!isValidObjectId(item.serviceId)) throw createError(`${label}: serviceId không hợp lệ`);

    if (item.sequenceNo !== undefined && (!Number.isInteger(item.sequenceNo) || item.sequenceNo < 1)) {
      throw createError(`${label}: sequenceNo phải là số nguyên dương`);
    }

    if (item.isEmergency !== undefined && typeof item.isEmergency !== 'boolean') {
      throw createError(`${label}: isEmergency phải là true hoặc false`);
    }
  });

  // 4. Kiểm tra trùng số thứ tự: mô phỏng đúng cách `createOnlineBooking` tạo dịch vụ tuần tự
  //    (không truyền sequenceNo => tự tăng = số lớn nhất hiện có + 1)
  const usedSeq = new Set();
  let maxSeq = 0;
  services.forEach((item, i) => {
    let seq = item.sequenceNo;
    if (seq === undefined) {
      seq = maxSeq + 1;
    } else if (usedSeq.has(seq)) {
      throw createError(`services[${i}]: Số thứ tự dịch vụ bị trùng trong lịch hẹn này`, 409);
    }
    usedSeq.add(seq);
    maxSeq = Math.max(maxSeq, seq);
  });

  // 5. Kiểm tra dịch vụ tồn tại và đang hoạt động (1 truy vấn cho tất cả)
  const serviceIds = [...new Set(services.map((s) => String(s.serviceId)))];
  const found = await Service.find({ _id: { $in: serviceIds } }).select('status').lean();
  const serviceMap = new Map(found.map((s) => [String(s._id), s]));

  services.forEach((item, i) => {
    const service = serviceMap.get(String(item.serviceId));
    if (!service) throw createError(`services[${i}]: Không tìm thấy dịch vụ`, 404);
    if (service.status !== 'Active') throw createError(`services[${i}]: Dịch vụ hiện không hoạt động`);
  });

  return data;
}

/**
 * Kiểm tra dữ liệu khi Lễ tân (Receptionist) xem danh sách dịch vụ của 1 đơn lịch hẹn.
 */
async function validateGetServicesByOrderId(orderId) {
  if (!orderId) throw createError('orderId là bắt buộc');
  if (!isValidObjectId(orderId)) throw createError('orderId không hợp lệ');

  const orderExists = await AppointmentOrder.exists({ _id: orderId });
  if (!orderExists) throw createError('Không tìm thấy lịch hẹn', 404);

  return orderId;
}

/**
 * Kiểm tra dữ liệu khi Lễ tân (Receptionist) phân công Bác sĩ / Groomer cho 1 dịch vụ trong lịch hẹn.
 *
 * @param {string} appointmentServiceId - ID của AppointmentService trên params
 * @param {Object} payload - { assignedStaffId }
 */
async function validateAssignStaffToService(appointmentServiceId, payload) {
  if (!appointmentServiceId || !isValidObjectId(appointmentServiceId)) {
    throw createError('ID dịch vụ lịch hẹn không hợp lệ');
  }

  const data = payload || {};
  const { assignedStaffId } = data;

  if (!assignedStaffId) {
    throw createError('assignedStaffId là bắt buộc');
  }
  if (!isValidObjectId(assignedStaffId)) {
    throw createError('assignedStaffId không hợp lệ');
  }

  // 1. Kiểm tra bản ghi dịch vụ trong lịch hẹn có tồn tại không
  const appointmentService = await AppointmentService.findById(appointmentServiceId)
    .select('orderId status')
    .lean();
  if (!appointmentService) {
    throw createError('Không tìm thấy dịch vụ trong lịch hẹn', 404);
  }

  // Không cho phân công lại nếu dịch vụ đang thực hiện hoặc đã kết thúc
  if (BLOCKED_SERVICE_STATUSES.includes(appointmentService.status)) {
    throw createError(
      `Không thể phân công nhân sự cho dịch vụ đang ở trạng thái "${appointmentService.status}"`,
      409
    );
  }

  // 2. Kiểm tra đơn lịch hẹn không nằm ở trạng thái đã đóng
  const order = await AppointmentOrder.findById(appointmentService.orderId)
    .select('derivedStatus')
    .lean();
  if (!order) {
    throw createError('Không tìm thấy lịch hẹn', 404);
  }
  if (BLOCKED_ORDER_STATUSES.includes(order.derivedStatus)) {
    throw createError(
      `Không thể phân công nhân sự cho lịch hẹn đang ở trạng thái "${order.derivedStatus}"`,
      409
    );
  }

  // 3. Kiểm tra nhân sự được chọn có tồn tại, đang Active và đúng role Bác sĩ / Groomer không
  const staff = await User.findById(assignedStaffId).select('role status').lean();
  if (!staff) {
    throw createError('Không tìm thấy nhân viên được phân công', 404);
  }
  if (!CLINICAL_STAFF_ROLES.includes(staff.role)) {
    throw createError('Nhân sự được phân công phải có vai trò Veterinarian hoặc Groomer');
  }
  if (staff.status !== 'Active') {
    throw createError('Nhân sự được phân công hiện không ở trạng thái hoạt động (Active)');
  }

  return {
    appointmentServiceId,
    assignedStaffId,
    orderStatus: order.derivedStatus,
  };
}

/**
 * Kiểm tra dữ liệu khi lấy danh sách dịch vụ được phân công cho 1 nhân viên (Bác sĩ / Groomer).
 * Trả về payload đã kiểm tra nếu hợp lệ, ném lỗi (có `statusCode`) nếu không hợp lệ.
 *
 * @param {Object} payload - { assignedStaffId, status? }
 * @returns {Promise<{ assignedStaffId: string, status?: string }>}
 * @throws {Error} lỗi với `statusCode` 400 | 404 và thông báo tiếng Việt
 */
async function validateGetServicesByAssignedStaffId(payload) {
  const data = payload || {};
  const { assignedStaffId, status } = data;

  // 1. Kiểm tra định dạng
  if (!assignedStaffId) throw createError('assignedStaffId là bắt buộc');
  if (!isValidObjectId(assignedStaffId)) throw createError('assignedStaffId không hợp lệ');

  if (status !== undefined && !SERVICE_STATUSES.includes(status)) {
    throw createError(`status phải là một trong: ${SERVICE_STATUSES.join(', ')}`);
  }

  // 2. Kiểm tra nhân viên tồn tại và đúng role Bác sĩ / Groomer
  //    (không bắt buộc Active để vẫn xem được lịch sử của nhân viên đã ngừng hoạt động)
  const staff = await User.findById(assignedStaffId).select('role').lean();
  if (!staff) throw createError('Không tìm thấy nhân viên', 404);
  if (!CLINICAL_STAFF_ROLES.includes(staff.role)) {
    throw createError('Nhân viên phải có vai trò Veterinarian hoặc Groomer');
  }

  return { assignedStaffId, status };
}

/**
 * Kiểm tra dữ liệu khi PetOwner hoặc Lễ tân hủy 1 dịch vụ lẻ trong lịch hẹn (UC-18, BR-07).
 */
async function validateCancelAppointmentService(appointmentServiceId, payload) {
  if (!appointmentServiceId || !isValidObjectId(appointmentServiceId)) {
    throw createError('ID dịch vụ lịch hẹn không hợp lệ');
  }

  const data = payload || {};
  const rawReason = data.reason !== undefined ? data.reason : data.cancelReason;

  if (rawReason === undefined || rawReason === null || rawReason === '') {
    throw createError('Vui lòng nhập lý do hủy');
  }
  if (typeof rawReason !== 'string') {
    throw createError('Lý do hủy phải là chuỗi');
  }

  const cleanReason = rawReason.trim();
  if (!cleanReason) {
    throw createError('Vui lòng nhập lý do hủy');
  }
  if (cleanReason.length > CANCEL_REASON_MAX_LENGTH) {
    throw createError(`Lý do hủy tối đa ${CANCEL_REASON_MAX_LENGTH} ký tự`);
  }

  return {
    appointmentServiceId,
    reason: cleanReason,
  };
}

module.exports = {
  validateCreateOnlineAppointmentService,
  validateCreateOnlineBooking,
  validateGetServicesByOrderId,
  validateAssignStaffToService,
  validateGetServicesByAssignedStaffId,
  validateCancelAppointmentService,
};