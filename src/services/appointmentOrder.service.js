const crypto = require('crypto');
const nodemailer = require('nodemailer');
const AppointmentOrder = require('../models/AppointmentOrder');
const Pet = require('../models/Pet');
const User = require('../models/User');
const Service = require('../models/Service');
const Cage = require('../models/Cage');
const CageAssignment = require('../models/CageAssignment');
const AppointmentService = require('../models/AppointmentService');
const { canCageAccommodatePet, getPreferredCageSizeOrder } = require('./cage.service');
const { createCageAssignment, releaseCageAssignment } = require('./cageAssignment.service');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;
const CANCELLATION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 giờ trước giờ hẹn (BR-07)
const CLINICAL_STAFF_ROLES = ['Veterinarian', 'Groomer'];
const BLOCKED_SERVICE_STATUSES = ['InProgress', 'Done', 'Cancelled', 'Overdue'];
const CAGE_PUBLIC_FIELDS = 'label size maxWeightKg zone isIsolated status';

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
      // Chỉ gửi thông báo cho lễ tân đã xác thực email để tránh gửi vào email ảo trong DB
      User.find({
        role: 'Receptionist',
        status: 'Active',
        isEmailVerified: true,
        email: { $type: 'string' },
      })
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
 * Tự động chọn 1 chuồng phù hợp cân nặng thú cưng cho đúng ngày hẹn (date) mà chưa có đơn nào giữ chỗ trong ngày đó.
 * Không đổi Cage.status sang 'Occupied' khi mới đặt lịch để không ảnh hưởng các ngày khác.
 */
const findAvailableReservedCageId = async ({ date, petWeight }) => {
  if (!date || typeof Cage.find !== 'function' || typeof AppointmentOrder.find !== 'function') {
    return null;
  }

  const cageQuery = Cage.find({ isIsolated: false });
  if (!cageQuery || typeof cageQuery.select !== 'function') {
    return null;
  }
  const candidateCages = await cageQuery.select(CAGE_PUBLIC_FIELDS).sort({ label: 1 }).lean();
  if (!Array.isArray(candidateCages) || candidateCages.length === 0) {
    return null;
  }

  const reservedOrdersQuery = AppointmentOrder.find({
    date,
    derivedStatus: { $nin: ['Cancelled', 'Done', 'Overdue'] },
    reservedCageId: { $ne: null },
  });
  if (!reservedOrdersQuery || typeof reservedOrdersQuery.select !== 'function') {
    return null;
  }
  const reservedOrders = await reservedOrdersQuery.select('reservedCageId').lean();
  const reservedCageIds = new Set(
    (Array.isArray(reservedOrders) ? reservedOrders : []).map((o) => String(o.reservedCageId))
  );

  // Nếu đặt lịch cho ngay hôm nay, loại thêm các chuồng đang có thú cưng nằm thực tế ở quầy
  const occupiedTodayIds = new Set();
  if (date === todayVN() && typeof CageAssignment.find === 'function') {
    const activeAssignQuery = CageAssignment.find({ releasedAt: null });
    if (activeAssignQuery && typeof activeAssignQuery.select === 'function') {
      const activeAssignments = await activeAssignQuery.select('cageId').lean();
      if (Array.isArray(activeAssignments)) {
        for (const a of activeAssignments) {
          occupiedTodayIds.add(String(a.cageId));
        }
      }
    }
  }

  const preferredSizes = getPreferredCageSizeOrder(petWeight);
  const eligibleCages = candidateCages.filter((cage) => {
    const cageIdStr = String(cage._id);
    if (reservedCageIds.has(cageIdStr) || occupiedTodayIds.has(cageIdStr)) return false;
    return canCageAccommodatePet(cage.size, petWeight, cage.isIsolated, false, cage.maxWeightKg).allowed;
  });

  if (eligibleCages.length === 0) {
    return null;
  }

  eligibleCages.sort((a, b) => {
    const zoneRankA = a.zone === 'Holding' ? 0 : 1;
    const zoneRankB = b.zone === 'Holding' ? 0 : 1;
    if (zoneRankA !== zoneRankB) return zoneRankA - zoneRankB;

    const sizeRankA = preferredSizes.indexOf(a.size);
    const sizeRankB = preferredSizes.indexOf(b.size);
    if (sizeRankA !== sizeRankB) return sizeRankA - sizeRankB;

    return String(a.label || '').localeCompare(String(b.label || ''));
  });

  return eligibleCages[0]._id;
};

/**
 * Chọn dịch vụ đại diện đang hoạt động của đơn: InProgress -> Waiting -> Booked -> Done cuối cùng.
 */
const pickCurrentService = (services = []) => {
  if (!Array.isArray(services) || services.length === 0) return null;
  const inProgress = services.find((s) => s.status === 'InProgress');
  if (inProgress) return inProgress;
  const waiting = services.find((s) => s.status === 'Waiting');
  if (waiting) return waiting;
  const booked = services.find((s) => s.status === 'Booked');
  if (booked) return booked;
  const doneServices = services.filter((s) => s.status === 'Done');
  return doneServices.length > 0 ? doneServices[doneServices.length - 1] : null;
};

/**
 * Gắn thêm thông tin chuồng (rõ label & size), danh sách dịch vụ và dịch vụ hiện tại kèm bác sĩ phụ trách cho danh sách đơn.
 * Dùng batch query ($in) để tránh N+1; tự bỏ qua an toàn nếu chạy trong unit test chưa mock đủ các model phụ.
 */
const enrichOrdersWithCageAndServices = async (orders) => {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const orderIds = orders.map((o) => o._id).filter(Boolean);
  if (orderIds.length === 0) return orders;

  let activeAssignmentMap = null;
  let latestAssignmentMap = null;
  if (typeof CageAssignment.find === 'function') {
    const assignQuery = CageAssignment.find({ orderId: { $in: orderIds } });
    if (assignQuery && typeof assignQuery.populate === 'function') {
      const assignments = await assignQuery
        .populate('cageId', CAGE_PUBLIC_FIELDS)
        .sort({ assignedAt: -1 })
        .lean();
      if (Array.isArray(assignments)) {
        activeAssignmentMap = new Map();
        latestAssignmentMap = new Map();
        for (const a of assignments) {
          const key = String(a.orderId);
          if (a.releasedAt == null && !activeAssignmentMap.has(key)) {
            activeAssignmentMap.set(key, a);
          }
          if (!latestAssignmentMap.has(key)) {
            latestAssignmentMap.set(key, a);
          }
        }
      }
    }
  }

  const isPopulatedCage = (val) =>
    Boolean(val && typeof val === 'object' && ('label' in val || 'size' in val));

  let reservedCageMap = null;
  const reservedCageIds = [
    ...new Set(
      orders
        .map((o) => (o.reservedCageId && !isPopulatedCage(o.reservedCageId) ? String(o.reservedCageId) : null))
        .filter(Boolean)
    ),
  ];
  if (reservedCageIds.length > 0 && typeof Cage.find === 'function') {
    const cageQuery = Cage.find({ _id: { $in: reservedCageIds } });
    if (cageQuery && typeof cageQuery.select === 'function') {
      const cages = await cageQuery.select(CAGE_PUBLIC_FIELDS).lean();
      if (Array.isArray(cages)) {
        reservedCageMap = new Map(cages.map((c) => [String(c._id), c]));
      }
    }
  }

  let servicesByOrder = null;
  if (typeof AppointmentService.find === 'function') {
    const svcQuery = AppointmentService.find({ orderId: { $in: orderIds } });
    if (svcQuery && typeof svcQuery.populate === 'function') {
      const orderServices = await svcQuery
        .populate('serviceId', 'code name category basePrice defaultDuration')
        .populate('assignedStaffId', 'code fullName role status')
        .sort({ sequenceNo: 1 })
        .lean();
      if (Array.isArray(orderServices)) {
        servicesByOrder = new Map();
        for (const svc of orderServices) {
          const key = String(svc.orderId);
          if (!servicesByOrder.has(key)) servicesByOrder.set(key, []);
          servicesByOrder.get(key).push(svc);
        }
      }
    }
  }

  // Nếu mọi query phụ đều không hoạt động (unit test mock tối giản), trả nguyên danh sách ban đầu
  if (!activeAssignmentMap && !reservedCageMap && !servicesByOrder) {
    return orders;
  }

  return orders.map((order) => {
    const key = String(order._id);
    const enriched = { ...order };

    let populatedReserved = isPopulatedCage(order.reservedCageId) ? order.reservedCageId : null;
    if (!populatedReserved && order.reservedCageId && reservedCageMap) {
      populatedReserved = reservedCageMap.get(String(order.reservedCageId)) || null;
    }
    if (populatedReserved) {
      enriched.reservedCageId = populatedReserved;
    }

    const activeAssign = activeAssignmentMap?.get(key);
    const latestAssign = latestAssignmentMap?.get(key);
    const resolvedCage = activeAssign?.cageId || latestAssign?.cageId || populatedReserved || null;
    if (resolvedCage !== null || activeAssignmentMap || reservedCageMap) {
      enriched.cage = resolvedCage;
    }

    if (servicesByOrder) {
      const orderServices = servicesByOrder.get(key) || [];
      enriched.services = orderServices;
      enriched.currentService = pickCurrentService(orderServices);
    }

    return enriched;
  });
};

/**
 * Create an online appointment for the logged-in owner.
 * ownerId comes from the token (never from the request body).
 */
const createOnlineAppointment = async (ownerId, { petId, date, note, slotStart, slotEnd }) => {
  // 1. The pet must exist, belong to the current user, and still be Active
  const pet = await Pet.findOne({ _id: petId, ownerId }).select('_id name status weight').lean();
  if (!pet) {
    throw createError(404, 'Không tìm thấy thú cưng');
  }
  if (pet.status === 'Deleted') {
    throw createError(400, 'Không thể đặt lịch cho thú cưng đã bị xóa khỏi hồ sơ');
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

  // 3. Tự động tìm và giữ chỗ 1 chuồng phù hợp cân nặng cho đúng ngày hẹn
  const reservedCageId = await findAvailableReservedCageId({ date, petWeight: pet.weight });

  // 4. Create with a random code; retry on the (rare) unique-code collision
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
      if (reservedCageId) doc.reservedCageId = reservedCageId;

      const appointment = await AppointmentOrder.create(doc);
      notifyReceptionistsOfNewAppointment(appointment, pet);

      if (reservedCageId && appointment?._id && typeof AppointmentOrder.findById === 'function') {
        const findQuery = AppointmentOrder.findById(appointment._id);
        if (findQuery && typeof findQuery.populate === 'function') {
          const populated = await findQuery.populate('reservedCageId', CAGE_PUBLIC_FIELDS).lean();
          if (populated) {
            return { ...populated, cage: populated.reservedCageId || null };
          }
        }
      }

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
  const [rawItems, total] = await Promise.all([
    AppointmentOrder.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    AppointmentOrder.countDocuments(filter),
  ]);

  const items = await enrichOrdersWithCageAndServices(rawItems);

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

  const result = { ...appointment, services };

  // Gắn thông tin chuồng (rõ label, size) nếu hệ thống có dữ liệu chuồng giữ chỗ / phân công chuồng
  let populatedReserved = null;
  if (appointment.reservedCageId && typeof Cage.findById === 'function') {
    const cageQuery = Cage.findById(appointment.reservedCageId);
    if (cageQuery && typeof cageQuery.select === 'function') {
      populatedReserved = await cageQuery.select(CAGE_PUBLIC_FIELDS).lean();
    }
  }
  if (populatedReserved) {
    result.reservedCageId = populatedReserved;
  }

  let activeCage = null;
  let cageLookupAttempted = false;
  if (typeof CageAssignment.findOne === 'function') {
    const assignQuery = CageAssignment.findOne({ orderId: appointment._id });
    if (assignQuery && typeof assignQuery.populate === 'function') {
      cageLookupAttempted = true;
      const latestAssignment = await assignQuery
        .populate('cageId', CAGE_PUBLIC_FIELDS)
        .sort({ assignedAt: -1 })
        .lean();
      activeCage = latestAssignment?.cageId || null;
    }
  }

  const resolvedCage = activeCage || populatedReserved;
  if (resolvedCage || cageLookupAttempted || populatedReserved) {
    result.cage = resolvedCage || null;
  }

  // Gắn dịch vụ hiện tại (kèm bác sĩ phụ trách) khi dịch vụ có dữ liệu status thật
  if (Array.isArray(services) && services.some((s) => typeof s.status === 'string')) {
    result.currentService = pickCurrentService(services);
  }

  return result;
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
  const [rawItems, total] = await Promise.all([
    AppointmentOrder.find(filter)
      .populate('petId', 'name')
      .populate('ownerId', 'fullName phone')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AppointmentOrder.countDocuments(filter),
  ]);

  const items = await enrichOrdersWithCageAndServices(rawItems);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const loadPetWeight = async (petId) => {
  if (!petId || typeof Pet.findById !== 'function') return undefined;
  const petQuery = Pet.findById(petId);
  const petDoc =
    petQuery && typeof petQuery.select === 'function'
      ? await petQuery.select('weight').lean()
      : await petQuery;
  return petDoc?.weight;
};

/**
 * Kiểm tra chuồng lưu giữ hợp lệ (tồn tại, còn trống Available, đạt tải trọng & cách ly BR-11)
 * trước khi thực hiện ghi DB lúc check-in để tránh trạng thái dở dang.
 */
const assertCageReadyForCheckIn = async ({ cageId, petId, requiresIsolation }) => {
  if (typeof Cage.findById !== 'function') return undefined;
  const cage = await Cage.findById(cageId).lean();
  if (!cage) {
    throw createError(404, 'Không tìm thấy chuồng');
  }
  if (cage.status !== 'Available') {
    throw createError(409, 'Chuồng không ở trạng thái trống (Available)');
  }

  const petWeight = await loadPetWeight(petId);
  const check = canCageAccommodatePet(
    cage.size,
    petWeight,
    cage.isIsolated,
    Boolean(requiresIsolation),
    cage.maxWeightKg
  );
  if (!check.allowed) {
    throw createError(400, check.reason);
  }
  return petWeight;
};

/**
 * Kiểm tra trước danh sách phân công bác sĩ / Groomer khi Lễ tân bấm Check-in.
 * Đảm bảo mọi nhân sự đều Active và đúng chuyên môn (Veterinarian / Groomer) trước khi ghi DB.
 */
const prepareServiceStaffAssignments = async ({ orderId, assignedStaffId, serviceAssignments }) => {
  const orderServices = await AppointmentService.find({ orderId }).lean();
  const orderServiceMap = new Map(orderServices.map((s) => [String(s._id), s]));

  const planned = [];
  if (assignedStaffId) {
    const bookedServices = orderServices.filter((s) => s.status === 'Booked');
    if (bookedServices.length === 0) {
      throw createError(409, 'Không có dịch vụ nào ở trạng thái chờ để phân công nhân sự');
    }
    for (const svc of bookedServices) {
      planned.push({ appointmentService: svc, assignedStaffId });
    }
  } else if (Array.isArray(serviceAssignments) && serviceAssignments.length > 0) {
    for (const item of serviceAssignments) {
      const targetSvc = orderServiceMap.get(String(item.appointmentServiceId));
      if (!targetSvc) {
        throw createError(404, 'Không tìm thấy dịch vụ trong lịch hẹn này');
      }
      if (BLOCKED_SERVICE_STATUSES.includes(targetSvc.status)) {
        throw createError(
          409,
          `Không thể phân công nhân sự cho dịch vụ đang ở trạng thái "${targetSvc.status}"`
        );
      }
      planned.push({ appointmentService: targetSvc, assignedStaffId: item.assignedStaffId });
    }
  }

  if (planned.length === 0) return [];

  const staffIds = [...new Set(planned.map((p) => String(p.assignedStaffId)))];
  const serviceIds = [
    ...new Set(planned.map((p) => p.appointmentService.serviceId && String(p.appointmentService.serviceId)).filter(Boolean)),
  ];

  const [staffDocs, serviceDocs] = await Promise.all([
    User.find({ _id: { $in: staffIds } }).select('fullName role status').lean(),
    serviceIds.length > 0 && typeof Service.find === 'function'
      ? Service.find({ _id: { $in: serviceIds } }).select('name category').lean()
      : Promise.resolve([]),
  ]);

  const staffMap = new Map((staffDocs || []).map((st) => [String(st._id), st]));
  const serviceCatalogMap = new Map((serviceDocs || []).map((sv) => [String(sv._id), sv]));

  for (const item of planned) {
    const staff = staffMap.get(String(item.assignedStaffId));
    if (!staff) {
      throw createError(404, 'Không tìm thấy nhân viên được phân công');
    }
    if (!CLINICAL_STAFF_ROLES.includes(staff.role)) {
      throw createError(400, 'Nhân sự được phân công phải có vai trò Veterinarian hoặc Groomer');
    }
    if (staff.status !== 'Active') {
      throw createError(400, 'Nhân sự được phân công hiện không ở trạng thái hoạt động (Active)');
    }

    const catalogSvc = serviceCatalogMap.get(String(item.appointmentService.serviceId));
    if (catalogSvc) {
      if (catalogSvc.category === 'Grooming' && staff.role !== 'Groomer') {
        throw createError(
          400,
          `Dịch vụ "${catalogSvc.name}" (Grooming) chỉ được phân công cho nhân viên Groomer`
        );
      }
      if (catalogSvc.category !== 'Grooming' && staff.role !== 'Veterinarian') {
        throw createError(
          400,
          `Dịch vụ "${catalogSvc.name}" (${catalogSvc.category}) chỉ được phân công cho Bác sĩ thú y (Veterinarian)`
        );
      }
    }
  }

  return planned;
};

/**
 * Only a 'Booked' appointment can be checked in. The status check and the update
 * happen in one atomic operation, so two concurrent check-ins can't both succeed.
 * Hỗ trợ gộp trong 1 lần Check-in: chọn/đổi chuồng (mặc định dùng reservedCageId nếu không đổi),
 * ghi nhận kê khai/note, và phân công bác sĩ/nhân sự + cấp queueNo -> Waiting (UC-22, BR-09, BR-11).
 */
const checkInAppointment = async (id, options = {}) => {
  const hasExplicitAssignments = Boolean(
    options &&
      (options.assignedStaffId ||
        (Array.isArray(options.serviceAssignments) && options.serviceAssignments.length > 0))
  );
  const mustPreloadOrder = Boolean(options && (options.cageId || hasExplicitAssignments));

  let preOrder = null;
  if (mustPreloadOrder) {
    preOrder = await AppointmentOrder.findById(id)
      .select('derivedStatus petId intake note reservedCageId')
      .lean();
    if (!preOrder) {
      throw createError(404, 'Không tìm thấy lịch hẹn');
    }
    if (preOrder.derivedStatus !== 'Booked') {
      throw createError(409, `Không thể check-in lịch hẹn đang ở trạng thái "${preOrder.derivedStatus}"`);
    }
  } else if (options && options.staffId && typeof AppointmentOrder.findById === 'function') {
    const preQuery = AppointmentOrder.findById(id);
    if (preQuery && typeof preQuery.select === 'function') {
      preOrder = await preQuery.select('derivedStatus petId intake note reservedCageId').lean();
      if (!preOrder) {
        throw createError(404, 'Không tìm thấy lịch hẹn');
      }
      if (preOrder.derivedStatus !== 'Booked') {
        throw createError(
          409,
          `Không thể check-in lịch hẹn đang ở trạng thái "${preOrder.derivedStatus}"`
        );
      }
    }
  }

  const effectiveCageId =
    (options && options.cageId) ||
    (options && options.staffId && preOrder && preOrder.reservedCageId ? String(preOrder.reservedCageId) : undefined);
  const shouldAssignCage = Boolean(effectiveCageId && options && options.staffId);
  const shouldRollbackOnFailure = Boolean(shouldAssignCage || hasExplicitAssignments);

  let precheckedPetWeight;
  const previousIntake = preOrder ? preOrder.intake || null : null;
  const previousNote = preOrder ? preOrder.note : undefined;
  const previousReservedCageId = preOrder ? preOrder.reservedCageId || null : null;

  if (shouldAssignCage && preOrder) {
    precheckedPetWeight = await assertCageReadyForCheckIn({
      cageId: effectiveCageId,
      petId: preOrder.petId,
      requiresIsolation: options.requiresIsolation,
    });
  }

  let plannedAssignments = [];
  if (hasExplicitAssignments) {
    plannedAssignments = await prepareServiceStaffAssignments({
      orderId: id,
      assignedStaffId: options.assignedStaffId,
      serviceAssignments: options.serviceAssignments,
    });
  }

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
  if (options && options.note !== undefined) {
    updateFields.note = options.note;
  }
  if (options && options.cageId) {
    updateFields.reservedCageId = options.cageId;
  }

  const appointment = await AppointmentOrder.findOneAndUpdate(
    { _id: id, derivedStatus: 'Booked' },
    { $set: updateFields },
    { new: true }
  ).lean();

  if (appointment) {
    const previousServiceSnapshots = [];

    const rollbackEverything = async () => {
      const rollbackOrder = {
        derivedStatus: 'Booked',
        checkedInAt: null,
      };
      if (options && options.intake) {
        rollbackOrder.intake = previousIntake;
      }
      if (options && options.note !== undefined) {
        rollbackOrder.note = previousNote;
      }
      if (options && options.cageId) {
        rollbackOrder.reservedCageId = previousReservedCageId;
      }

      await Promise.allSettled([
        AppointmentOrder.findByIdAndUpdate(id, { $set: rollbackOrder }),
        ...previousServiceSnapshots.map((snap) =>
          AppointmentService.findByIdAndUpdate(snap._id, {
            $set: {
              assignedStaffId: snap.assignedStaffId,
              queueNo: snap.queueNo,
              status: snap.status,
              enqueueAt: snap.enqueueAt,
            },
          })
        ),
      ]);
    };

    try {
      // 1. Phân công bác sĩ / Groomer ngay trong lúc Check-in (nếu có truyền từ modal Check-in)
      const enqueueTime = appointment.checkedInAt || checkedInAt;
      const assignedIdsHandled = new Set();

      if (plannedAssignments.length > 0) {
        const nextQueueByStaff = new Map();
        const uniqueStaffIds = [...new Set(plannedAssignments.map((p) => String(p.assignedStaffId)))];

        await Promise.all(
          uniqueStaffIds.map(async (staffKey) => {
            const lastQueued = await AppointmentService.findOne({
              assignedStaffId: staffKey,
              queueNo: { $ne: null },
            })
              .sort({ queueNo: -1 })
              .select('queueNo')
              .lean();
            const startNo = lastQueued && lastQueued.queueNo ? lastQueued.queueNo + 1 : 1;
            nextQueueByStaff.set(staffKey, startNo);
          })
        );

        for (const item of plannedAssignments) {
          const svc = item.appointmentService;
          previousServiceSnapshots.push({
            _id: svc._id,
            assignedStaffId: svc.assignedStaffId || null,
            queueNo: svc.queueNo ?? null,
            status: svc.status,
            enqueueAt: svc.enqueueAt || null,
          });

          const staffKey = String(item.assignedStaffId);
          const queueNo = nextQueueByStaff.get(staffKey);
          nextQueueByStaff.set(staffKey, queueNo + 1);

          await AppointmentService.findByIdAndUpdate(svc._id, {
            $set: {
              assignedStaffId: item.assignedStaffId,
              queueNo,
              status: 'Waiting',
              enqueueAt: enqueueTime,
            },
          });
          assignedIdsHandled.add(String(svc._id));
        }
      }

      // 2. Chuyển các dịch vụ khác đã có nhân sự từ trước (nếu có) từ Booked -> Waiting
      if (typeof AppointmentService.updateMany === 'function') {
        const filterOtherBooked = {
          orderId: id,
          status: 'Booked',
          assignedStaffId: { $ne: null },
        };
        if (assignedIdsHandled.size > 0) {
          filterOtherBooked._id = { $nin: [...assignedIdsHandled] };
        }

        if (shouldRollbackOnFailure && typeof AppointmentService.find === 'function') {
          const otherBookedServices = await AppointmentService.find(filterOtherBooked).lean();
          for (const svc of otherBookedServices) {
            previousServiceSnapshots.push({
              _id: svc._id,
              assignedStaffId: svc.assignedStaffId || null,
              queueNo: svc.queueNo ?? null,
              status: svc.status,
              enqueueAt: svc.enqueueAt || null,
            });
          }
        }

        await AppointmentService.updateMany(filterOtherBooked, {
          $set: { status: 'Waiting', enqueueAt: enqueueTime },
        });
      }

      // 3. Nếu có chuồng giữ chỗ hoặc Lễ tân chọn/đổi chuồng khi Check-in, gán chuồng thực tế (Available -> Occupied)
      let cageAssignment = null;
      if (shouldAssignCage) {
        const petWeight =
          precheckedPetWeight !== undefined ? precheckedPetWeight : await loadPetWeight(appointment.petId);

        cageAssignment = await createCageAssignment({
          cageId: effectiveCageId,
          orderId: String(id),
          assignedById: String(options.staffId),
          petWeight,
          requiresIsolation: Boolean(options.requiresIsolation),
        });
      }

      if (!shouldAssignCage && !hasExplicitAssignments) {
        return appointment;
      }

      const [enrichedOrder] = await enrichOrdersWithCageAndServices([appointment]);
      const responseData = { ...(enrichedOrder || appointment) };
      if (cageAssignment) {
        responseData.cageAssignment = cageAssignment;
      }
      return responseData;
    } catch (err) {
      if (shouldRollbackOnFailure) {
        await rollbackEverything();
      }
      throw err;
    }
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

  // 6. Nếu đơn đã gán chuồng chờ lúc Check-in, tự động giải phóng chuồng về Available (tránh kẹt chuồng Occupied)
  if (typeof CageAssignment.findOne === 'function') {
    const openAssignment = await CageAssignment.findOne({
      orderId: id,
      releasedAt: null,
    })
      .select('_id')
      .lean();
    if (openAssignment) {
      await releaseCageAssignment(String(openAssignment._id));
    }
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