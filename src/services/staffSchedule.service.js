const mongoose = require('mongoose');
const StaffSchedule = require('../models/StaffSchedule');
const User = require('../models/User');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');

const SHIFT_VALUES = ['MORNING', 'AFTERNOON', 'EVENING'];
const CLINICAL_STAFF_ROLES = ['Veterinarian', 'Groomer'];

const SHIFT_LABELS = {
  MORNING: 'Ca sáng (08:00 - 12:00)',
  AFTERNOON: 'Ca chiều (12:00 - 17:00)',
  EVENING: 'Ca tối (17:00 - 21:00)',
};

const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const currentTimeVN = () =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

/**
 * Quy đổi mốc giờ HH:mm sang 1 trong 3 ca làm việc: MORNING | AFTERNOON | EVENING.
 */
const getShiftFromTime = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return getShiftFromTime(currentTimeVN());
  const normalized = hhmm.trim();
  if (normalized < '12:00') return 'MORNING';
  if (normalized < '17:00') return 'AFTERNOON';
  return 'EVENING';
};

/**
 * Tìm danh sách ID nhân sự đang có bản ghi báo bận tại (date, shift).
 * Nếu chỉ truyền date mà không truyền shift, chỉ ẩn những nhân sự bận cả 3 ca trong ngày đó
 * (trừ trường hợp tìm theo ngày hôm nay có thể truyền shift rõ từ client).
 */
const findBusyStaffIds = async ({ date, shift } = {}) => {
  if (!date || typeof StaffSchedule.find !== 'function') return [];

  if (shift) {
    const docs = await StaffSchedule.find({ date, shift }).select('staffId').lean();
    return Array.isArray(docs) ? docs.map((d) => String(d.staffId)) : [];
  }

  // Không truyền shift -> chỉ ẩn người đã báo bận đủ cả 3 ca trong ngày date
  const docs = await StaffSchedule.find({ date }).select('staffId shift').lean();
  if (!Array.isArray(docs) || docs.length === 0) return [];

  const shiftsByStaff = new Map();
  for (const doc of docs) {
    const key = String(doc.staffId);
    if (!shiftsByStaff.has(key)) shiftsByStaff.set(key, new Set());
    shiftsByStaff.get(key).add(doc.shift);
  }

  const fullDayBusyIds = [];
  for (const [staffId, shiftSet] of shiftsByStaff.entries()) {
    if (SHIFT_VALUES.every((s) => shiftSet.has(s))) {
      fullDayBusyIds.push(staffId);
    }
  }
  return fullDayBusyIds;
};

/**
 * Kiểm tra 1 nhân sự cụ thể có đang báo bận ở ngày/ca tương ứng hay không.
 */
const findStaffBusyBlock = async ({ staffId, date, shift }) => {
  if (!staffId || !date || !shift || typeof StaffSchedule.findOne !== 'function') return null;
  return StaffSchedule.findOne({ staffId, date, shift }).lean();
};

/**
 * Báo bận theo cơ chế Blacklist (Ngày x Ca).
 * - Bác sĩ / Groomer tự báo bận cho chính mình.
 * - Lễ tân / Admin có thể báo bận hộ nhân sự qua staffId.
 * - Cảnh báo ngay nếu nhân sự đó đang có dịch vụ Waiting hoặc InProgress trong ca/ngày bị báo bận.
 */
const createBusySchedule = async ({ currentUser, staffId, date, shift, reason }) => {
  const isStaffSelf = CLINICAL_STAFF_ROLES.includes(currentUser.role);
  let targetStaffId = staffId;

  if (isStaffSelf) {
    if (staffId && String(staffId) !== String(currentUser.id)) {
      throw createError(403, 'Bạn chỉ có thể tự báo bận cho chính mình');
    }
    targetStaffId = currentUser.id;
  }

  if (date < todayVN()) {
    throw createError(400, 'Không thể báo bận cho ngày trong quá khứ');
  }

  const targetStaff = await User.findById(targetStaffId).select('code fullName role status').lean();
  if (!targetStaff) {
    throw createError(404, 'Không tìm thấy nhân sự');
  }
  if (!CLINICAL_STAFF_ROLES.includes(targetStaff.role)) {
    throw createError(400, 'Chỉ áp dụng báo bận cho Bác sĩ thú y (Veterinarian) hoặc Groomer');
  }
  if (targetStaff.status !== 'Active') {
    throw createError(400, 'Nhân sự này hiện không ở trạng thái hoạt động (Active)');
  }

  let created;
  try {
    created = await StaffSchedule.create({
      staffId: targetStaffId,
      date,
      shift,
      reason: reason || '',
      createdBy: currentUser.id,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Chỉ báo trùng lịch (409) khi đúng là trùng khóa (staffId, date, shift); tránh che giấu lỗi index thừa khác
      const isScheduleKey =
        !err.keyPattern || (err.keyPattern.staffId && err.keyPattern.date && err.keyPattern.shift);
      if (isScheduleKey) {
        throw createError(
          409,
          `Nhân sự "${targetStaff.fullName}" đã có lịch báo bận ${SHIFT_LABELS[shift] || shift} ngày ${date}`
        );
      }
    }
    throw err;
  }

  // Kiểm tra các ca Waiting / InProgress hiện có của nhân sự trong ngày báo bận để cảnh báo
  const ordersOnDate = await AppointmentOrder.find({
    date,
    derivedStatus: { $in: ['CheckedIn', 'InProgress'] },
  })
    .select('_id code slotStart')
    .lean();

  let conflictingServices = [];
  if (ordersOnDate.length > 0) {
    const orderMap = new Map(ordersOnDate.map((o) => [String(o._id), o]));
    const activeServices = await AppointmentService.find({
      orderId: { $in: ordersOnDate.map((o) => o._id) },
      assignedStaffId: targetStaffId,
      status: { $in: ['Waiting', 'InProgress'] },
    })
      .populate('serviceId', 'name')
      .lean();

    conflictingServices = activeServices
      .filter((svc) => {
        const order = orderMap.get(String(svc.orderId));
        const timeRef = svc.scheduledStart || order?.slotStart;
        if (!timeRef) return true; // Walk-in / đơn chưa gắn khung giờ cụ thể vẫn cảnh báo để lễ tân xử lý
        return getShiftFromTime(timeRef) === shift;
      })
      .map((svc) => {
        const order = orderMap.get(String(svc.orderId));
        return {
          appointmentServiceId: svc._id,
          orderId: svc.orderId,
          orderCode: order?.code || '',
          serviceName: svc.serviceId?.name || '',
          status: svc.status,
          scheduledStart: svc.scheduledStart || order?.slotStart || null,
        };
      });
  }

  const populated = await StaffSchedule.findById(created._id)
    .populate('staffId', 'code fullName role status')
    .populate('createdBy', 'code fullName role')
    .lean();

  let warning = null;
  if (conflictingServices.length > 0) {
    warning =
      `Cảnh báo: ${targetStaff.fullName} hiện đang có ${conflictingServices.length} ca đang chờ/đang thực hiện ` +
      `(Waiting/InProgress) trong ngày ${date}. Vui lòng điều phối lại nhân sự cho các ca này.`;
  }

  return {
    message: 'Đăng ký báo bận thành công',
    data: populated,
    warning,
    conflictingServices,
  };
};

/**
 * Xem danh sách lịch báo bận (Blacklist) theo bộ lọc Ngày / Khoảng ngày / Ca / Nhân sự.
 */
const listBusySchedules = async ({ currentUser, staffId, date, from, to, shift } = {}) => {
  const filter = {};
  const isStaffSelf = CLINICAL_STAFF_ROLES.includes(currentUser.role);

  if (isStaffSelf) {
    if (staffId && String(staffId) !== String(currentUser.id)) {
      throw createError(403, 'Bạn chỉ có thể xem lịch báo bận của chính mình');
    }
    filter.staffId = currentUser.id;
  } else if (staffId) {
    filter.staffId = staffId;
  }

  if (date) {
    filter.date = date;
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  if (shift) {
    filter.shift = shift;
  }

  const items = await StaffSchedule.find(filter)
    .populate('staffId', 'code fullName role status')
    .populate('createdBy', 'code fullName role')
    .sort({ date: 1, shift: 1, createdAt: -1 })
    .lean();

  return {
    message: 'Lấy danh sách lịch báo bận thành công',
    data: items,
  };
};

/**
 * Hủy lịch báo bận (xóa bản ghi khỏi Blacklist để nhân sự xuất hiện lại trên danh sách điều phối).
 */
const deleteBusySchedule = async ({ currentUser, scheduleId }) => {
  if (!scheduleId || !mongoose.Types.ObjectId.isValid(scheduleId)) {
    throw createError(400, 'ID lịch báo bận không hợp lệ');
  }

  const existing = await StaffSchedule.findById(scheduleId).lean();
  if (!existing) {
    throw createError(404, 'Không tìm thấy bản ghi báo bận');
  }

  const isStaffSelf = CLINICAL_STAFF_ROLES.includes(currentUser.role);
  if (isStaffSelf && String(existing.staffId) !== String(currentUser.id)) {
    throw createError(403, 'Bạn chỉ có thể hủy lịch báo bận của chính mình');
  }

  await StaffSchedule.deleteOne({ _id: scheduleId });

  return {
    message: 'Hủy lịch báo bận thành công',
  };
};

module.exports = {
  SHIFT_VALUES,
  SHIFT_LABELS,
  todayVN,
  currentTimeVN,
  getShiftFromTime,
  findBusyStaffIds,
  findStaffBusyBlock,
  createBusySchedule,
  listBusySchedules,
  deleteBusySchedule,
};

