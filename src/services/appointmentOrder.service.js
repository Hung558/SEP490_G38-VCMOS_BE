const crypto = require('crypto');
const nodemailer = require('nodemailer');
const AppointmentOrder = require('../models/AppointmentOrder');
const Pet = require('../models/Pet');
const User = require('../models/User');
const AppointmentService = require('../models/AppointmentService');
const { createCageAssignment } = require('./cageAssignment.service');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;
const CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ trước giờ hẹn (BR-07)

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const generateAppointmentCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `APT-${suffix}`; // ví dụ: APT-K7M2QX
};

const isDuplicateCodeError = (err) =>
  err?.code === 11000 && (err.keyPattern?.code || err.message?.includes('code'));

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendNewAppointmentEmail = async (recipients, { appointment, ownerName, ownerPhone, petName }) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const subjectTitle = 'lịch hẹn online mới';

  if (!emailUser || !emailPass || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[DEV EMAIL APPOINTMENT - ${subjectTitle}] Gửi tới ${recipients.join(', ')} - Mã lịch hẹn: ${appointment.code}`
      );
    }
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass },
  });

  const row = (label, value) => `
    <tr>
      <td style="padding: 6px 0; color: #64748b; width: 120px;">${label}</td>
      <td style="padding: 6px 0; font-weight: bold; color: #0f766e;">${escapeHtml(value || '—')}</td>
    </tr>`;

  await transporter.sendMail({
    from: `"VCMOS Veterinary Clinic" <${emailUser}>`,
    to: emailUser,        // BCC all receptionists so their addresses aren't exposed to each other
    bcc: recipients,
    subject: `[VCMOS] Có ${subjectTitle} ${appointment.code}`,
    text:
      `Có ${subjectTitle} tại VCMOS. Mã: ${appointment.code}. Ngày hẹn: ${appointment.date}. ` +
      `Chủ nuôi: ${ownerName || '—'} (${ownerPhone || '—'}). Thú cưng: ${petName || '—'}. ` +
      `Ghi chú: ${appointment.note || '—'}.`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7f6; padding: 32px 16px;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background-color: #0d9488; padding: 24px; text-align: center; color: #ffffff;">
            <div style="font-size: 28px; margin-bottom: 4px;">🐾</div>
            <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">PHÒNG KHÁM THÚ Y VCMOS</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Hệ thống Quản lý & Chăm sóc Thú cưng</p>
          </div>
          <div style="padding: 28px 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Xin chào,</p>
            <p>Vừa có một <strong>${subjectTitle}</strong> được tạo tại <strong>Phòng khám Thú y VCMOS</strong>. Thông tin chi tiết như sau:</p>
            <div style="margin: 24px 0; padding: 18px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 10px; text-align: center;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #0f766e;">${escapeHtml(appointment.code)}</span>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              ${row('Ngày hẹn', appointment.date)}
              ${row('Chủ nuôi', ownerName)}
              ${row('Số điện thoại', ownerPhone)}
              ${row('Thú cưng', petName)}
              ${row('Ghi chú', appointment.note)}
            </table>
            <p style="font-size: 13.5px; color: #64748b; margin-bottom: 0; margin-top: 20px;">
              📋 Vui lòng kiểm tra và chuẩn bị tiếp nhận khi khách đến phòng khám.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Đây là email tự động từ hệ thống, vui lòng không trả lời.<br/>
            © VCMOS Veterinary Clinic Management System
          </div>
        </div>
      </div>
    `,
  });

  return true;
};

const notifyReceptionistsOfNewAppointment = async (appointment, pet) => {
  try {
    const [receptionists, owner] = await Promise.all([
      User.find({ role: 'Receptionist', status: 'Active', email: { $type: 'string' } })
        .select('email')
        .lean(),
      User.findById(appointment.ownerId).select('fullName phone').lean(),
    ]);

    const recipients = receptionists.map((r) => r.email);
    if (recipients.length === 0) return;

    await sendNewAppointmentEmail(recipients, {
      appointment,
      ownerName: owner?.fullName,
      ownerPhone: owner?.phone,
      petName: pet?.name,
    });
  } catch (err) {
    console.error('[Appointment] Gửi email thông báo cho lễ tân thất bại:', err.message);
  }
};

/**
 * Create an online appointment for the logged-in owner.
 * ownerId comes from the token (never from the request body).
 */
const createOnlineAppointment = async (ownerId, { petId, date, note, slotStart, slotEnd }) => {
  // 1. The pet must exist and belong to the current user
  const pet = await Pet.findOne({ _id: petId, ownerId }).select('_id name').lean();
  if (!pet) {
    throw createError(404, 'Không tìm thấy thú cưng');
  }

  // 2. Prevent double-booking the same pet on the same day
  const duplicated = await AppointmentOrder.exists({
    petId,
    date,
    derivedStatus: { $ne: 'Cancelled' },
  });
  if (duplicated) {
    throw createError(409, 'Thú cưng này đã có lịch hẹn trong ngày đã chọn');
  }

  // 3. Create with a random code; retry on the (rare) unique-code collision
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    try {
      const doc = {
        code: generateAppointmentCode(),
        petId,
        ownerId,
        date,
        note,
        isOnline: true,
        checkedInAt: null,
        // derivedStatus falls back to the schema default: 'Booked'
      };
      if (slotStart !== undefined) doc.slotStart = slotStart;
      if (slotEnd !== undefined) doc.slotEnd = slotEnd;

      const appointment = await AppointmentOrder.create(doc);
      notifyReceptionistsOfNewAppointment(appointment, pet);
      return appointment;
    } catch (err) {
      if (isDuplicateCodeError(err)) continue;
      throw err;
    }
  }

  throw createError(500, 'Không thể tạo mã lịch hẹn, vui lòng thử lại');
};

/**
 * List the current user's online appointments, newest date first.
 */
const listMyOnlineAppointments = async (ownerId, { status, from, to, page = 1, limit = 10 }) => {
  const filter = { ownerId, isOnline: true };
  if (status) filter.derivedStatus = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from; // YYYY-MM-DD strings compare correctly
    if (to) filter.date.$lte = to;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AppointmentOrder.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    AppointmentOrder.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getMyOnlineAppointment = async (ownerId, id) => {
  const appointment = await AppointmentOrder.findOne({ _id: id, ownerId, isOnline: true }).lean();
  if (!appointment) {
    throw createError(404, 'Không tìm thấy lịch hẹn');
  }

  // Ownership is already verified above, so it's safe to load the order's services
  const services = await AppointmentService.find({ orderId: appointment._id })
    .populate('serviceId')
    .populate('preferredStaffId', 'fullName')
    .populate('assignedStaffId', 'fullName')
    .sort({ sequenceNo: 1 })
    .lean();

  return { ...appointment, services };
};

/**
 * List all appointment orders (staff view, any owner, online and walk-in).
 * Supports optional filters and pagination; newest date first.
 */
const listAllAppointments = async ({
  status,
  isOnline,
  ownerId,
  petId,
  code,
  from,
  to,
  page = 1,
  limit = 10,
} = {}) => {
  page = Math.max(1, Number(page) || 1);
  limit = Math.min(100, Math.max(1, Number(limit) || 10));

  const filter = {};
  if (status) filter.derivedStatus = status;
  if (typeof isOnline === 'boolean') filter.isOnline = isOnline;
  if (ownerId) filter.ownerId = ownerId;
  if (petId) filter.petId = petId;
  if (code) filter.code = String(code).trim().toUpperCase();
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from; // YYYY-MM-DD strings compare correctly
    if (to) filter.date.$lte = to;
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AppointmentOrder.find(filter)
      .populate('petId', 'name')
      .populate('ownerId', 'fullName phone')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AppointmentOrder.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Only a 'Booked' appointment can be checked in. The status check and the update
 * happen in one atomic operation, so two concurrent check-ins can't both succeed.
 * Also transitions assigned services from 'Booked' to 'Waiting' and optionally assigns a holding cage (UC-22, BR-09, BR-11).
 */
const checkInAppointment = async (id, options = {}) => {
  const checkedInAt = new Date();
  const updateFields = { derivedStatus: 'CheckedIn', checkedInAt };

  // Chỉ ghi nhận phiếu kê khai ban đầu khi lễ tân truyền intake (tương thích ngược với các luồng cũ)
  if (options && options.intake) {
    updateFields.intake = {
      symptoms: options.intake.symptoms,
      initialCondition: options.intake.initialCondition,
      recordedBy: options.staffId || null,
      recordedAt: checkedInAt,
    };
  }

  const appointment = await AppointmentOrder.findOneAndUpdate(
    { _id: id, derivedStatus: 'Booked' },
    { $set: updateFields },
    { new: true }
  ).lean();

  if (appointment) {
    // 1. Khi khách đến Check-in, tự động chuyển các dịch vụ đã phân công nhân viên từ Booked -> Waiting
    if (typeof AppointmentService.updateMany === 'function') {
      await AppointmentService.updateMany(
        { orderId: id, status: 'Booked', assignedStaffId: { $ne: null } },
        { $set: { status: 'Waiting', enqueueAt: appointment.checkedInAt || new Date() } }
      );
    }

    // 2. Nếu Lễ tân chọn chuồng ngay khi Check-in (UC-22 & BR-09), kiểm tra cân nặng thú cưng (BR-11) và gán chuồng
    if (options && options.cageId && options.staffId) {
      let petWeight;
      if (appointment.petId && typeof Pet.findById === 'function') {
        const petQuery = Pet.findById(appointment.petId);
        const petDoc =
          petQuery && typeof petQuery.select === 'function'
            ? await petQuery.select('weight').lean()
            : await petQuery;
        petWeight = petDoc?.weight;
      }

      const cageAssignment = await createCageAssignment({
        cageId: options.cageId,
        orderId: String(id),
        assignedById: String(options.staffId),
        petWeight,
        requiresIsolation: Boolean(options.requiresIsolation),
      });

      return { ...appointment, cageAssignment };
    }

    return appointment;
  }

  // Nothing updated: either it doesn't exist, or it isn't in 'Booked' status
  const existing = await AppointmentOrder.findById(id).select('derivedStatus').lean();
  if (!existing) {
    throw createError(404, 'Không tìm thấy lịch hẹn');
  }
  throw createError(
    409,
    `Không thể check-in lịch hẹn đang ở trạng thái "${existing.derivedStatus}"`
  );
};

/**
 * UC-18, BR-07: Hủy toàn bộ đơn lịch hẹn (do PetOwner tự hủy trước Check-in & trước giờ hẹn >= 2h,
 * hoặc do Receptionist hủy theo yêu cầu của khách khi chưa có dịch vụ nào bắt đầu).
 */
const cancelAppointment = async (id, { userId, role, reason } = {}) => {
  // 1. Tìm lịch hẹn cần hủy
  const order = await AppointmentOrder.findById(id)
    .select('code ownerId petId date slotStart derivedStatus')
    .lean();
  if (!order) {
    throw createError(404, 'Không tìm thấy lịch hẹn');
  }

  // 2. Kiểm tra quyền sở hữu: PetOwner chỉ được hủy lịch hẹn của chính mình (chống IDOR)
  if (role === 'PetOwner' && String(order.ownerId) !== String(userId)) {
    throw createError(403, 'Bạn chỉ có thể hủy lịch hẹn của chính mình');
  }

  // 3. Kiểm tra trạng thái lịch hẹn và điều kiện thời gian (BR-07, UC-18)
  if (order.derivedStatus === 'Cancelled') {
    throw createError(409, 'Lịch hẹn này đã bị hủy trước đó');
  }

  if (role === 'PetOwner') {
    // PetOwner chỉ được tự hủy trực tuyến khi đơn đang ở trạng thái Booked (chưa Check-in)
    if (order.derivedStatus !== 'Booked') {
      throw createError(
        409,
        'Lịch hẹn này không thể tự hủy trực tuyến sau khi đã check-in. Vui lòng liên hệ phòng khám để được hỗ trợ'
      );
    }

    // Kiểm tra mốc 2 giờ trước giờ hẹn (BR-07)
    if (order.slotStart) {
      const scheduledStartMs = new Date(`${order.date}T${order.slotStart}:00+07:00`).getTime();
      if (!Number.isNaN(scheduledStartMs) && scheduledStartMs - Date.now() < CANCELLATION_WINDOW_MS) {
        throw createError(
          409,
          'Không thể tự hủy lịch hẹn trong vòng 2 giờ trước giờ hẹn. Vui lòng liên hệ phòng khám để được hỗ trợ'
        );
      }
    } else if (order.date && order.date < todayVN()) {
      throw createError(
        409,
        'Không thể tự hủy lịch hẹn đã qua ngày hẹn. Vui lòng liên hệ phòng khám để được hỗ trợ'
      );
    }
  } else {
    // Lễ tân chỉ được hủy đơn khi đơn đang là Booked, hoặc CheckedIn nhưng chưa có dịch vụ nào bắt đầu
    if (!['Booked', 'CheckedIn'].includes(order.derivedStatus)) {
      throw createError(
        409,
        `Không thể hủy lịch hẹn đang ở trạng thái "${order.derivedStatus}"`
      );
    }

    if (order.derivedStatus === 'CheckedIn' && typeof AppointmentService.exists === 'function') {
      const hasStartedService = await AppointmentService.exists({
        orderId: id,
        status: { $in: ['InProgress', 'Done'] },
      });
      if (hasStartedService) {
        throw createError(
          409,
          'Không thể hủy toàn bộ lịch hẹn khi đã có dịch vụ đang thực hiện hoặc hoàn tất'
        );
      }
    }
  }

  // 4. Cập nhật trạng thái đơn hẹn sang Cancelled
  const now = new Date();
  const updatedOrder = await AppointmentOrder.findOneAndUpdate(
    { _id: id, derivedStatus: order.derivedStatus },
    {
      $set: {
        derivedStatus: 'Cancelled',
        cancelReason: reason,
        cancelledAt: now,
        cancelledBy: userId,
      },
    },
    { new: true }
  ).lean();

  if (!updatedOrder) {
    throw createError(409, 'Trạng thái lịch hẹn đã thay đổi, vui lòng thử lại');
  }

  // 5. Hủy toàn bộ các dịch vụ chưa bắt đầu trong đơn và giải phóng khỏi hàng đợi nhân sự
  if (typeof AppointmentService.updateMany === 'function') {
    await AppointmentService.updateMany(
      { orderId: id, status: { $in: ['Booked', 'Waiting'] } },
      {
        $set: {
          status: 'Cancelled',
          cancelReason: reason,
          cancelledAt: now,
          cancelledBy: userId,
          queueNo: null,
          enqueueAt: null,
        },
      }
    );
  }

  return updatedOrder;
};

module.exports = {
  createOnlineAppointment,
  listMyOnlineAppointments,
  getMyOnlineAppointment,
  listAllAppointments,
  checkInAppointment,
  cancelAppointment,
};