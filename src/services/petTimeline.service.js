const Pet = require('../models/Pet');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');
const MedicalRecord = require('../models/MedicalRecord');
const SubtaskRequest = require('../models/SubtaskRequest');
const InpatientRecord = require('../models/InpatientRecord');
const CageAssignment = require('../models/CageAssignment');
const Invoice = require('../models/Invoice');
const CommunityPost = require('../models/CommunityPost');

// Các trạng thái đơn đang hoạt động (chưa hoàn tất / chưa hủy / chưa quá hạn)
const ACTIVE_ORDER_STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner'];

// Vai trò được xem thông tin hóa đơn tài chính trên timeline (BR-23 & SRS SCR-08)
const INVOICE_VIEWER_ROLES = ['PetOwner', 'Receptionist', 'Admin'];

const ORDER_STATUS_LABELS = {
  Booked: 'Đã đặt lịch',
  CheckedIn: 'Đã tiếp đón',
  InProgress: 'Đang thực hiện',
  WaitOwner: 'Chờ chủ đón',
  Done: 'Hoàn tất',
  Overdue: 'Chưa đến - quá thời gian',
  Cancelled: 'Đã hủy',
};

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

/**
 * Tính nhãn hiển thị trạng thái theo thời gian thực của 1 mốc lịch hẹn (BR-09):
 * Khi đơn đang InProgress và có dịch vụ đang chạy -> hiển thị "Đang <tên dịch vụ>".
 */
const buildOrderStatusLabel = (order, orderServices) => {
  if (order.derivedStatus === 'InProgress') {
    const runningService = orderServices.find((item) => item.status === 'InProgress');
    const serviceName = runningService?.serviceId?.name;
    if (serviceName) {
      return `Đang ${serviceName}`;
    }
  }
  return ORDER_STATUS_LABELS[order.derivedStatus] || order.derivedStatus;
};

/**
 * Tính số ngày lưu trú của 1 đợt nội trú (tối thiểu 1 ngày nếu đã nhập viện).
 */
const computeInpatientDays = (admittedAt, dischargedAt) => {
  if (!admittedAt) return 0;
  const start = new Date(admittedAt).getTime();
  const end = dischargedAt ? new Date(dischargedAt).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
};

/**
 * Chuẩn hóa dữ liệu hóa đơn trả về trong mốc timeline (chỉ trả khi vai trò có quyền xem tài chính).
 */
const formatInvoiceSummary = (invoice) => {
  if (!invoice) return null;
  return {
    _id: invoice._id,
    code: invoice.code,
    totalAmount: invoice.totalAmount,
    paymentMethod: invoice.paymentMethod,
    paymentStatus: invoice.paymentStatus,
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
    vnpayTxnRef: invoice.vnpayTxnRef || null,
    payosOrderCode: invoice.payosOrderCode || null,
    issuedBy: invoice.issuedById || null,
    items: (invoice.items || []).map((item) => ({
      _id: item._id,
      type: item.type,
      refId: item.refId,
      itemNameSnapshot: item.itemNameSnapshot,
      unitPriceSnapshot: item.unitPriceSnapshot,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
  };
};

/**
 * Chuẩn hóa hồ sơ nội trú kèm nhật ký hằng ngày (sắp xếp mới nhất lên đầu theo SCR-11).
 */
const formatInpatientRecord = (record, invoiceByInpatientId, canViewInvoice) => {
  if (!record) return null;

  const sortedLogs = [...(record.dailyLogs || [])]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .map((log) => ({
      _id: log._id,
      date: log.date,
      recordedBy: log.recordedById || null,
      observations: log.observations || '',
      notes: log.notes || '',
      createdAt: log.createdAt,
    }));

  const inpatientInvoice = canViewInvoice
    ? formatInvoiceSummary(invoiceByInpatientId.get(String(record._id)) || null)
    : null;

  return {
    _id: record._id,
    orderId: record.orderId,
    status: record.status,
    initialDiagnosis: record.initialDiagnosis || '',
    treatmentPlan: record.treatmentPlan || '',
    admittedAt: record.admittedAt,
    dischargedAt: record.dischargedAt,
    daysAdmitted: computeInpatientDays(record.admittedAt, record.dischargedAt),
    attendingVet: record.attendingVetId || null,
    cage: record.cageId || null,
    dailyLogsCount: sortedLogs.length,
    dailyLogs: sortedLogs,
    invoice: inpatientInvoice,
  };
};

/**
 * Tổng hợp Dòng thời gian Thú cưng Hợp nhất (Unified Pet Timeline — UC-13, SCR-08, BR-23).
 *
 * - Kiểm tra quyền riêng tư y tế (BR-23): PetOwner chỉ xem được thú cưng thuộc sở hữu của mình;
 *   nhân sự phòng khám (Receptionist, Veterinarian, Groomer, Admin) xem được mọi thú cưng.
 * - Tách riêng quyền xem tài chính: chỉ PetOwner, Receptionist, Admin thấy hóa đơn;
 *   Veterinarian và Groomer nhận invoice = null.
 * - Truy vấn gom theo lô ($in + Map) để tránh N+1 query.
 */
const getPetTimeline = async (currentUser, petId, filters = {}) => {
  const pet = await Pet.findById(petId)
    .populate('ownerId', 'code fullName phone email')
    .lean();

  if (!pet) {
    throw httpError(404, 'Không tìm thấy hồ sơ thú cưng');
  }

  // BR-23: Chống IDOR — chủ nuôi chỉ được xem dòng thời gian của thú cưng thuộc sở hữu của mình
  const petOwnerId = pet.ownerId?._id || pet.ownerId;
  if (currentUser.role === 'PetOwner' && String(petOwnerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn không có quyền xem dòng thời gian của thú cưng này');
  }

  const canViewInvoice = INVOICE_VIEWER_ROLES.includes(currentUser.role);

  // 1. Lấy song song toàn bộ đơn hẹn, hồ sơ nội trú và bài chia sẻ cộng đồng của thú cưng
  const [orders, inpatientRecords, sharedPosts] = await Promise.all([
    AppointmentOrder.find({ petId })
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    InpatientRecord.find({ petId })
      .populate('attendingVetId', 'code fullName role')
      .populate('cageId', 'label zone size maxWeightKg isIsolated status')
      .populate('dailyLogs.recordedById', 'code fullName role')
      .sort({ admittedAt: -1 })
      .lean(),
    CommunityPost.find({
      petId,
      postType: 'TimelineShare',
      status: { $ne: 'Removed' },
    })
      .select('status content imageUrl timelineItems likeCount commentCount createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const orderIds = orders.map((order) => order._id);
  const inpatientIds = inpatientRecords.map((record) => record._id);

  // 2. Lấy gom theo lô dịch vụ con, chuồng đang gán và hóa đơn (không query trong vòng lặp)
  const invoiceQuery = [];
  if (orderIds.length > 0) invoiceQuery.push({ orderId: { $in: orderIds } });
  if (inpatientIds.length > 0) invoiceQuery.push({ inpatientRecordId: { $in: inpatientIds } });

  const [appointmentServices, cageAssignments, invoices] = await Promise.all([
    orderIds.length > 0
      ? AppointmentService.find({ orderId: { $in: orderIds } })
          .populate('serviceId', 'code name category defaultDuration basePrice')
          .populate('assignedStaffId', 'code fullName role')
          .sort({ sequenceNo: 1 })
          .lean()
      : [],
    orderIds.length > 0
      ? CageAssignment.find({ orderId: { $in: orderIds } })
          .populate('cageId', 'label zone size maxWeightKg isIsolated status')
          .sort({ assignedAt: -1 })
          .lean()
      : [],
    canViewInvoice && invoiceQuery.length > 0
      ? Invoice.find({ $or: invoiceQuery })
          .populate('issuedById', 'code fullName role')
          .lean()
      : [],
  ]);

  const appointmentServiceIds = appointmentServices.map((svc) => svc._id);

  // 3. Lấy gom bệnh án SOAP và các Sub-task cận lâm sàng gắn với dịch vụ của thú cưng
  const [medicalRecords, subtaskRequests] = await Promise.all([
    appointmentServiceIds.length > 0
      ? MedicalRecord.find({ appointmentServiceId: { $in: appointmentServiceIds } }).lean()
      : [],
    appointmentServiceIds.length > 0
      ? SubtaskRequest.find({ appointmentServiceId: { $in: appointmentServiceIds } })
          .populate('serviceId', 'code name category')
          .populate('requestedById', 'code fullName role')
          .populate('assignedStaffId', 'code fullName role')
          .sort({ createdAt: 1 })
          .lean()
      : [],
  ]);

  // 4. Lập chỉ mục bằng Map để ghép dữ liệu nhanh O(1)
  const servicesByOrderId = new Map();
  for (const svc of appointmentServices) {
    const key = String(svc.orderId);
    if (!servicesByOrderId.has(key)) servicesByOrderId.set(key, []);
    servicesByOrderId.get(key).push(svc);
  }

  const medicalRecordByServiceId = new Map();
  for (const record of medicalRecords) {
    medicalRecordByServiceId.set(String(record.appointmentServiceId), record);
  }

  const subtasksByServiceId = new Map();
  for (const subtask of subtaskRequests) {
    const key = String(subtask.appointmentServiceId);
    if (!subtasksByServiceId.has(key)) subtasksByServiceId.set(key, []);
    subtasksByServiceId.get(key).push({
      _id: subtask._id,
      taskType: subtask.taskType || null,
      instructions: subtask.instructions || '',
      resultText: subtask.resultText || null,
      resultImageUrl: subtask.resultImageUrl || null,
      status: subtask.status,
      completedAt: subtask.completedAt,
      service: subtask.serviceId || null,
      requestedBy: subtask.requestedById || null,
      assignedStaff: subtask.assignedStaffId || null,
      createdAt: subtask.createdAt,
    });
  }

  const activeCageByOrderId = new Map();
  for (const assignment of cageAssignments) {
    const key = String(assignment.orderId);
    // Chỉ giữ bản ghi chuồng đang mở (releasedAt === null) mới nhất của đơn
    if (!assignment.releasedAt && !activeCageByOrderId.has(key)) {
      activeCageByOrderId.set(key, {
        assignmentId: assignment._id,
        assignedAt: assignment.assignedAt,
        cage: assignment.cageId || null,
      });
    }
  }

  const invoiceByOrderId = new Map();
  const invoiceByInpatientId = new Map();
  for (const inv of invoices) {
    if (inv.orderId) invoiceByOrderId.set(String(inv.orderId), inv);
    if (inv.inpatientRecordId) invoiceByInpatientId.set(String(inv.inpatientRecordId), inv);
  }

  const inpatientByOrderId = new Map();
  for (const record of inpatientRecords) {
    const key = String(record.orderId);
    if (!inpatientByOrderId.has(key)) {
      inpatientByOrderId.set(key, formatInpatientRecord(record, invoiceByInpatientId, canViewInvoice));
    }
  }

  // 5. Dựng danh sách mốc sự kiện hợp nhất cho từng đơn khám/dịch vụ
  let totalGroomingNotes = 0;
  let completedVisits = 0;
  let activeVisits = 0;

  const allMilestones = orders.map((order) => {
    const orderKey = String(order._id);
    const rawServices = servicesByOrderId.get(orderKey) || [];
    const inpatient = inpatientByOrderId.get(orderKey) || null;

    if (order.derivedStatus === 'Done') completedVisits += 1;
    if (ACTIVE_ORDER_STATUSES.includes(order.derivedStatus)) activeVisits += 1;

    const categorySet = new Set();
    const formattedServices = rawServices.map((svc) => {
      const svcKey = String(svc._id);
      const serviceCategory = svc.serviceId?.category || null;
      if (serviceCategory) categorySet.add(serviceCategory);

      const medRecord = medicalRecordByServiceId.get(svcKey) || null;
      const groomingNote = svc.groomingNote || null;
      if (groomingNote) totalGroomingNotes += 1;

      return {
        _id: svc._id,
        sequenceNo: svc.sequenceNo,
        status: svc.status,
        isEmergency: Boolean(svc.isEmergency),
        scheduledStart: svc.scheduledStart,
        scheduledEnd: svc.scheduledEnd,
        queueNo: svc.queueNo,
        cancelReason: svc.cancelReason || null,
        service: svc.serviceId || null,
        assignedStaff: svc.assignedStaffId || null,
        medicalRecord: medRecord
          ? {
              _id: medRecord._id,
              status: medRecord.status,
              subjectiveNote: medRecord.subjectiveNote || '',
              objectiveNote: medRecord.objectiveNote || '',
              assessment: medRecord.assessment || '',
              plan: medRecord.plan || '',
              notes: medRecord.notes || '',
              prescriptions: medRecord.prescriptions || [],
              createdAt: medRecord.createdAt,
              updatedAt: medRecord.updatedAt,
            }
          : null,
        groomingNote,
        subtasks: subtasksByServiceId.get(svcKey) || [],
      };
    });

    if (inpatient) {
      categorySet.add('Inpatient');
    }

    const orderInvoice = canViewInvoice
      ? formatInvoiceSummary(invoiceByOrderId.get(orderKey) || null)
      : null;

    return {
      id: orderKey,
      orderId: order._id,
      code: order.code,
      date: order.date,
      slotStart: order.slotStart,
      slotEnd: order.slotEnd,
      isOnline: Boolean(order.isOnline),
      derivedStatus: order.derivedStatus,
      statusLabel: buildOrderStatusLabel(order, rawServices),
      checkedInAt: order.checkedInAt,
      note: order.note || null,
      intake: order.intake || null,
      cancelReason: order.cancelReason || null,
      cancelledAt: order.cancelledAt || null,
      categories: Array.from(categorySet),
      currentCage: activeCageByOrderId.get(orderKey) || null,
      services: formattedServices,
      inpatientRecord: inpatient,
      invoice: orderInvoice,
      // Chủ nuôi chỉ được chia sẻ hành trình từ các mốc đã hoàn tất (UC-49)
      canShareToCommunity: currentUser.role === 'PetOwner' && order.derivedStatus === 'Done',
      createdAt: order.createdAt,
    };
  });

  // 6. Áp dụng bộ lọc (type, status, from, to) theo SCR-08
  const { type = 'All', status, from, to, page = 1, limit = 20 } = filters;

  const filteredMilestones = allMilestones.filter((milestone) => {
    if (type !== 'All' && !milestone.categories.includes(type)) {
      return false;
    }
    if (status && milestone.derivedStatus !== status) {
      return false;
    }
    if (from && milestone.date < from) {
      return false;
    }
    if (to && milestone.date > to) {
      return false;
    }
    return true;
  });

  const total = filteredMilestones.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const paginatedTimeline = filteredMilestones.slice(startIndex, startIndex + limit);

  // Tìm đợt nội trú đang Admitted (nếu có) để FE hiển thị banner trên SCR-07 / SCR-08 / SCR-11
  const activeInpatientDoc = inpatientRecords.find((item) => item.status === 'Admitted') || null;
  const activeInpatient = activeInpatientDoc
    ? formatInpatientRecord(activeInpatientDoc, invoiceByInpatientId, canViewInvoice)
    : null;

  return {
    pet: {
      _id: pet._id,
      code: pet.code,
      name: pet.name,
      species: pet.species || null,
      breed: pet.breed || null,
      coatColor: pet.coatColor || null,
      photoUrl: pet.photoUrl || null,
      dob: pet.dob || null,
      weight: pet.weight ?? null,
      notes: pet.notes || null,
      status: pet.status,
      owner: pet.ownerId || null,
    },
    summary: {
      totalVisits: orders.length,
      completedVisits,
      activeVisits,
      totalMedicalRecords: medicalRecords.length,
      totalGroomingNotes,
      totalInpatientStays: inpatientRecords.length,
      hasActiveInpatient: Boolean(activeInpatient),
    },
    activeInpatient,
    sharedPosts,
    timeline: paginatedTimeline,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
};

// Trạng thái đơn được phép chia sẻ lên cộng đồng (UC-49)
const SHAREABLE_ORDER_STATUS = 'Done';

/**
 * Lấy nhanh lịch sử khám ĐỦ ĐIỀU KIỆN CHIA SẺ của một thú cưng (UC-49), phục vụ API chia sẻ hành trình.
 * Khác getPetTimeline: chỉ cần 3 truy vấn nhẹ và chỉ select các trường dùng để chia sẻ,
 * không đọc bệnh án SOAP, đơn thuốc, hóa đơn, sub-task, nội trú, chuồng, intake/note của đơn.
 *
 * - Giữ nguyên kiểm tra quyền riêng tư y tế (BR-23): chủ nuôi chỉ thao tác với thú cưng của mình.
 *   Chỉ PetOwner được chia sẻ (cùng quy tắc với cờ canShareToCommunity của getPetTimeline).
 * - Chỉ lấy đơn Done và chỉ các dịch vụ Done của đơn đó.
 *
 * @param {{ id: string, role: string }} currentUser
 * @param {string} petId
 * @param {Object} [options]
 * @param {string[]} [options.orderIds] chỉ lấy các đơn này (nếu có)
 * @param {number} [options.limit] số đơn tối đa (lấy các đơn mới nhất)
 * @returns {Promise<{
 *   pet: { _id, code, name, species, photoUrl },
 *   orders: Array<{ orderId, code, date, services: Array<{ name, beforePhotoUrl, afterPhotoUrl }> }>,
 *   totalEligible: number
 * }>} orders xếp mới → cũ; totalEligible = số đơn Done thỏa bộ lọc (trước khi áp dụng limit)
 */
const getShareablePetHistory = async (currentUser, petId, { orderIds, limit } = {}) => {
  // Không populate owner: chỉ cần ownerId để kiểm tra quyền, tránh lấy phone/email
  const pet = await Pet.findById(petId).select('code name species photoUrl status ownerId').lean();
  if (!pet) {
    throw httpError(404, 'Không tìm thấy hồ sơ thú cưng');
  }

  // BR-23: Chống IDOR — chủ nuôi chỉ được thao tác với thú cưng thuộc sở hữu của mình
  if (currentUser.role !== 'PetOwner' || String(pet.ownerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn không có quyền xem dòng thời gian của thú cưng này');
  }

  // Thú cưng đã xóa mềm thì không được chia sẻ
  if (pet.status !== 'Active') {
    throw httpError(404, 'Không tìm thấy thú cưng của bạn');
  }

  const filter = { petId: pet._id, derivedStatus: SHAREABLE_ORDER_STATUS };
  if (orderIds) filter._id = { $in: orderIds };

  let orderQuery = AppointmentOrder.find(filter)
    .select('code date') // tuyệt đối không lấy note / intake
    .sort({ date: -1, createdAt: -1 });
  if (limit) orderQuery = orderQuery.limit(limit);

  const [orders, totalEligible] = await Promise.all([
    orderQuery.lean(),
    AppointmentOrder.countDocuments(filter),
  ]);

  // Chỉ dịch vụ Done; chỉ tên dịch vụ + 2 ảnh grooming. Không giá, không ghi chú, không nhân sự.
  const appointmentServices =
    orders.length > 0
      ? await AppointmentService.find({
          orderId: { $in: orders.map((order) => order._id) },
          status: SHAREABLE_ORDER_STATUS,
        })
          .select('orderId sequenceNo serviceId groomingNote.beforePhotoUrl groomingNote.afterPhotoUrl')
          .populate('serviceId', 'name')
          .sort({ sequenceNo: 1 })
          .lean()
      : [];

  const servicesByOrderId = new Map();
  for (const svc of appointmentServices) {
    const key = String(svc.orderId);
    if (!servicesByOrderId.has(key)) servicesByOrderId.set(key, []);
    servicesByOrderId.get(key).push({
      name: svc.serviceId?.name || null,
      beforePhotoUrl: svc.groomingNote?.beforePhotoUrl || null,
      afterPhotoUrl: svc.groomingNote?.afterPhotoUrl || null,
    });
  }

  return {
    pet: {
      _id: pet._id,
      code: pet.code,
      name: pet.name,
      species: pet.species || null,
      photoUrl: pet.photoUrl || null,
    },
    orders: orders.map((order) => ({
      orderId: order._id,
      code: order.code,
      date: order.date,
      services: servicesByOrderId.get(String(order._id)) || [],
    })),
    totalEligible,
  };
};

module.exports = {
  getPetTimeline,
  getShareablePetHistory,
};