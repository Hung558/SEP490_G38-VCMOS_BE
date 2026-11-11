const MedicalRecord = require('../models/MedicalRecord');
const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const SubtaskRequest = require('../models/SubtaskRequest');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const CageAssignment = require('../models/CageAssignment');
const { createCageAssignment, releaseCageAssignment } = require('./cageAssignment.service');
const { isBlank } = require('../validators/medicalRecord.validator');

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

/**
 * Kiểm tra danh sách thuốc kê đơn (UC-36, BR-16):
 * - Chỉ cho phép chọn thuốc/sản phẩm đang Active (Còn hàng).
 * - Chụp lại tên thuốc (productNameSnapshot) và đơn vị tính (unitSnapshot).
 */
const buildPrescriptionSnapshots = async (prescriptions) => {
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    return [];
  }

  const productIds = [...new Set(prescriptions.map((item) => String(item.productId)))];
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const snapshots = [];

  for (let i = 0; i < prescriptions.length; i++) {
    const item = prescriptions[i];
    const product = productMap.get(String(item.productId));

    if (!product) {
      throw httpError(404, `Không tìm thấy thuốc/sản phẩm tại dòng đơn thuốc thứ ${i + 1}`);
    }

    // BR-16: Chặn kê đơn nếu thuốc đã ngừng kinh doanh hoặc hết hàng (Inactive)
    if (product.status !== 'Active') {
      throw httpError(
        400,
        `Thuốc/sản phẩm "${product.name}" hiện đang hết hàng (Inactive), không thể kê đơn`
      );
    }

    snapshots.push({
      productId: product._id,
      productNameSnapshot: product.name,
      unitSnapshot: product.unit,
      dosage: item.dosage,
      frequency: item.frequency,
      instructions: item.instructions || '',
      durationDays: item.durationDays,
    });
  }

  return snapshots;
};

/**
 * Kiểm tra quyền của Bác sĩ phụ trách ca dịch vụ khám
 */
const loadAndVerifyAssignedService = async (staffId, appointmentServiceId) => {
  const appointmentService = await AppointmentService.findById(appointmentServiceId)
    .populate('serviceId')
    .lean();

  if (!appointmentService) {
    throw httpError(404, 'Không tìm thấy dịch vụ trong lịch hẹn');
  }

  if (
    !appointmentService.assignedStaffId ||
    String(appointmentService.assignedStaffId) !== String(staffId)
  ) {
    throw httpError(403, 'Bạn không phải là bác sĩ được phân công phụ trách ca khám này');
  }

  const order = await AppointmentOrder.findById(appointmentService.orderId).lean();
  if (!order) {
    throw httpError(404, 'Không tìm thấy đơn lịch hẹn của ca khám này');
  }

  return { appointmentService, order };
};

/**
 * 1. Bác sĩ bắt đầu ca khám (POST /api/medical-records/service/:appointmentServiceId/start)
 * - Kiểm tra thứ tự dịch vụ sequenceNo theo BR-12 (dịch vụ trước phải hoàn thành mới được làm dịch vụ sau).
 * - Tự động giải phóng chuồng chờ của đơn hẹn (nếu có) theo BR-10.
 * - Chuyển trạng thái dịch vụ từ Waiting -> InProgress, ghi nhận dequeueAt.
 * - Chuyển trạng thái đơn hẹn sang InProgress.
 * - Khởi tạo bản nháp (Draft) MedicalRecord nếu chưa có.
 */
const startMedicalConsultation = async (staffId, appointmentServiceId) => {
  const { appointmentService, order } = await loadAndVerifyAssignedService(
    staffId,
    appointmentServiceId
  );

  if (appointmentService.status === 'Booked') {
    throw httpError(409, 'Khách hàng chưa thực hiện Check-in tại quầy lễ tân');
  }

  if (['Done', 'Cancelled', 'Overdue'].includes(appointmentService.status)) {
    throw httpError(
      409,
      `Không thể bắt đầu ca khám đang ở trạng thái "${appointmentService.status}"`
    );
  }

  // BR-12: Kiểm tra trong cùng đơn hẹn có dịch vụ nào đứng trước (sequenceNo nhỏ hơn) mà chưa hoàn thành không
  const unfinishedPreviousService = await AppointmentService.findOne({
    orderId: order._id,
    sequenceNo: { $lt: appointmentService.sequenceNo },
    status: { $nin: ['Done', 'Cancelled'] },
  })
    .populate('serviceId', 'name')
    .lean();

  if (unfinishedPreviousService) {
    const prevName = unfinishedPreviousService.serviceId?.name || `#${unfinishedPreviousService.sequenceNo}`;
    throw httpError(
      409,
      `Không thể bắt đầu: Dịch vụ đứng trước "${prevName}" (thứ tự #${unfinishedPreviousService.sequenceNo}) chưa hoàn thành`
    );
  }

  // BR-10: Tự động giải phóng chuồng chờ (nếu thú cưng đang nằm trong chuồng chờ lúc đợi khám)
  let releasedCageAssignment = null;
  const openAssignment = await CageAssignment.findOne({
    orderId: order._id,
    releasedAt: null,
  }).lean();

  if (openAssignment) {
    releasedCageAssignment = await releaseCageAssignment(String(openAssignment._id));
  }

  // Chuyển dịch vụ sang InProgress và ghi nhận thời điểm bắt đầu khám (dequeueAt)
  const updatedService = await AppointmentService.findByIdAndUpdate(
    appointmentServiceId,
    {
      $set: {
        status: 'InProgress',
        dequeueAt: appointmentService.dequeueAt || new Date(),
      },
    },
    { returnDocument: 'after' }
  )
    .populate('serviceId')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  // Chuyển đơn lịch hẹn sang InProgress
  await AppointmentOrder.findByIdAndUpdate(order._id, {
    $set: { derivedStatus: 'InProgress' },
  });

  // Tạo sẵn bản nháp (Draft) MedicalRecord nếu chưa tồn tại
  let medicalRecord = await MedicalRecord.findOne({ appointmentServiceId }).lean();
  if (!medicalRecord) {
    const created = await MedicalRecord.create({
      appointmentServiceId,
      petId: order.petId,
      status: 'Draft',
    });
    medicalRecord = created.toObject();
  }

  return {
    appointmentService: updatedService,
    medicalRecord,
    releasedCageAssignment,
  };
};

/**
 * 2. Lưu nháp Bệnh án chuẩn SOAP & Kê đơn thuốc (PUT /api/medical-records/service/:appointmentServiceId)
 * - Chặn chỉnh sửa nếu bệnh án đã ở trạng thái Finalized (BR-14).
 * - Kiểm tra thuốc kê đơn phải đang Active / Còn hàng (BR-16).
 * - Tự động cập nhật cân nặng mới nhất vào hồ sơ thú cưng (Pet.weight) nếu bác sĩ nhập weight.
 */
const saveDraftMedicalRecord = async (staffId, appointmentServiceId, payload) => {
  const { appointmentService, order } = await loadAndVerifyAssignedService(
    staffId,
    appointmentServiceId
  );

  if (['Cancelled', 'Overdue'].includes(appointmentService.status)) {
    throw httpError(
      409,
      `Không thể ghi bệnh án cho dịch vụ đang ở trạng thái "${appointmentService.status}"`
    );
  }

  const existingRecord = await MedicalRecord.findOne({ appointmentServiceId });
  if (existingRecord && existingRecord.status === 'Finalized') {
    throw httpError(409, 'Bệnh án này đã được khóa (Finalized), không thể chỉnh sửa');
  }

  // Kiểm tra và tạo snapshot đơn thuốc nếu có truyền prescriptions (BR-16)
  let prescriptionSnapshots;
  if (payload.prescriptions !== undefined) {
    prescriptionSnapshots = await buildPrescriptionSnapshots(payload.prescriptions);
  }

  // Cập nhật cân nặng mới nhất của thú cưng từ chỉ số khám thực tế (Objective - O)
  if (payload.weight !== undefined) {
    await Pet.findByIdAndUpdate(order.petId, {
      $set: { weight: payload.weight },
    });
  }

  // Nếu dịch vụ đang ở Waiting mà bác sĩ lưu nháp luôn thì tự động chuyển sang InProgress
  if (appointmentService.status === 'Waiting') {
    await AppointmentService.findByIdAndUpdate(appointmentServiceId, {
      $set: { status: 'InProgress', dequeueAt: new Date() },
    });
    await AppointmentOrder.findByIdAndUpdate(order._id, {
      $set: { derivedStatus: 'InProgress' },
    });
  }

  const updateFields = {
    petId: order.petId,
    status: 'Draft',
  };

  if (payload.subjectiveNote !== undefined) updateFields.subjectiveNote = payload.subjectiveNote;
  if (payload.objectiveNote !== undefined) updateFields.objectiveNote = payload.objectiveNote;
  if (payload.assessment !== undefined) updateFields.assessment = payload.assessment;
  if (payload.plan !== undefined) updateFields.plan = payload.plan;
  if (payload.notes !== undefined) updateFields.notes = payload.notes;
  if (prescriptionSnapshots !== undefined) updateFields.prescriptions = prescriptionSnapshots;

  const savedRecord = await MedicalRecord.findOneAndUpdate(
    { appointmentServiceId },
    { $set: updateFields },
    { upsert: true, returnDocument: 'after' }
  )
    .populate('petId', 'code name species breed weight')
    .lean();

  return savedRecord;
};

/**
 * 3. Hoàn tất Bệnh án SOAP & Kết thúc ca khám (POST /api/medical-records/service/:appointmentServiceId/complete)
 * - Bắt buộc đủ 4 trường S - O - A - P theo BR-13.
 * - Chặn hoàn tất nếu còn chỉ định Cận lâm sàng (SubtaskRequest) ở trạng thái Pending/InProgress (MSG26).
 * - Theo BR-14: giữ bệnh án ở trạng thái Draft khi vừa khám xong; chỉ khi Lễ tân thu tiền xong (Invoice Paid) thì bệnh án mới chuyển sang Finalized.
 * - Chuyển trạng thái dịch vụ khám sang Done.
 * - Nếu tất cả dịch vụ trong đơn hẹn đã xong -> tự động chuyển đơn hẹn sang WaitOwner (BR-09).
 * - Nếu bác sĩ truyền waitingCageId -> tự động xếp thú cưng vào chuồng chờ đón (BR-10).
 */
const completeMedicalConsultation = async (staffId, appointmentServiceId, payload) => {
  const { appointmentService, order } = await loadAndVerifyAssignedService(
    staffId,
    appointmentServiceId
  );

  if (appointmentService.status === 'Done') {
    throw httpError(409, 'Ca khám này đã được hoàn tất trước đó');
  }

  if (!['Waiting', 'InProgress'].includes(appointmentService.status)) {
    throw httpError(
      409,
      `Không thể hoàn tất ca khám đang ở trạng thái "${appointmentService.status}"`
    );
  }

  // MSG26 (PB-10): Chặn hoàn tất ca khám chính khi vẫn còn Sub-task cận lâm sàng chưa Completed
  const unfinishedSubtask = await SubtaskRequest.exists({
    appointmentServiceId,
    status: { $in: ['Pending', 'InProgress'] },
  });
  if (unfinishedSubtask) {
    throw httpError(
      409,
      'Không thể hoàn tất ca khám khi vẫn còn chỉ định cận lâm sàng (Sub-task) chưa hoàn thành'
    );
  }

  const existingRecord = await MedicalRecord.findOne({ appointmentServiceId }).lean();
  if (existingRecord && existingRecord.status === 'Finalized') {
    throw httpError(409, 'Bệnh án này đã được chốt (Finalized) trước đó');
  }

  // Gộp dữ liệu gửi lên lần cuối với bản nháp đã lưu (nếu có)
  const finalSubjective =
    payload.subjectiveNote !== undefined ? payload.subjectiveNote : existingRecord?.subjectiveNote;
  const finalObjective =
    payload.objectiveNote !== undefined ? payload.objectiveNote : existingRecord?.objectiveNote;
  const finalAssessment =
    payload.assessment !== undefined ? payload.assessment : existingRecord?.assessment;
  const finalPlan =
    payload.plan !== undefined ? payload.plan : existingRecord?.plan;
  const finalNotes =
    payload.notes !== undefined ? payload.notes : existingRecord?.notes;

  // BR-13: Bắt buộc phải nhập đủ cả 4 trường S, O, A, P trước khi hoàn tất bệnh án
  const soapErrors = {};
  if (isBlank(finalSubjective)) {
    soapErrors.subjectiveNote = 'Bắt buộc nhập Triệu chứng chủ quan (Subjective - S) khi hoàn tất bệnh án';
  }
  if (isBlank(finalObjective)) {
    soapErrors.objectiveNote = 'Bắt buộc nhập Kết quả khám lâm sàng (Objective - O) khi hoàn tất bệnh án';
  }
  if (isBlank(finalAssessment)) {
    soapErrors.assessment = 'Bắt buộc nhập Chẩn đoán bệnh (Assessment - A) khi hoàn tất bệnh án';
  }
  if (isBlank(finalPlan)) {
    soapErrors.plan = 'Bắt buộc nhập Phác đồ điều trị (Plan - P) khi hoàn tất bệnh án';
  }

  if (Object.keys(soapErrors).length > 0) {
    throw httpError(
      400,
      'Vui lòng nhập đầy đủ 4 thông tin S - O - A - P trước khi hoàn tất bệnh án',
      soapErrors
    );
  }

  // Xử lý đơn thuốc (nếu có truyền mới thì kiểm tra BR-16, nếu không thì giữ nguyên đơn thuốc trong bản nháp)
  let finalPrescriptions = existingRecord?.prescriptions || [];
  if (payload.prescriptions !== undefined) {
    finalPrescriptions = await buildPrescriptionSnapshots(payload.prescriptions);
  }

  // Cập nhật cân nặng mới nhất của thú cưng vào bảng Pet
  let latestPetWeight = payload.weight;
  if (payload.weight !== undefined) {
    await Pet.findByIdAndUpdate(order.petId, {
      $set: { weight: payload.weight },
    });
  } else if (payload.waitingCageId) {
    const petDoc = await Pet.findById(order.petId).select('weight').lean();
    latestPetWeight = petDoc?.weight;
  }

  // BR-10 & BR-11: Nếu bác sĩ chọn chuồng chờ đón (waitingCageId) thì kiểm tra tải trọng và gán chuồng trước khi chốt trạng thái
  let waitingCageAssignment = null;
  if (payload.waitingCageId) {
    waitingCageAssignment = await createCageAssignment({
      cageId: payload.waitingCageId,
      orderId: String(order._id),
      assignedById: String(staffId),
      petWeight: latestPetWeight,
    });
  }

  // BR-14: Giữ bệnh án ở trạng thái Draft khi vừa hoàn tất khám; chỉ chuyển sang Finalized khi hóa đơn được thanh toán (Invoice Paid)
  const completedRecord = await MedicalRecord.findOneAndUpdate(
    { appointmentServiceId },
    {
      $set: {
        petId: order.petId,
        subjectiveNote: finalSubjective.trim(),
        objectiveNote: finalObjective.trim(),
        assessment: finalAssessment.trim(),
        plan: finalPlan.trim(),
        notes: finalNotes || '',
        prescriptions: finalPrescriptions,
        status: 'Draft',
      },
    },
    { upsert: true, returnDocument: 'after' }
  )
    .populate('petId', 'code name species breed weight')
    .lean();

  // Chuyển trạng thái dịch vụ sang Done
  const completedService = await AppointmentService.findByIdAndUpdate(
    appointmentServiceId,
    {
      $set: {
        status: 'Done',
        dequeueAt: appointmentService.dequeueAt || new Date(),
      },
    },
    { returnDocument: 'after' }
  )
    .populate('serviceId')
    .populate('assignedStaffId', 'code fullName role status')
    .lean();

  // BR-09: Kiểm tra xem trong đơn hẹn còn dịch vụ nào chưa hoàn tất không
  const remainingServicesCount = await AppointmentService.countDocuments({
    orderId: order._id,
    status: { $nin: ['Done', 'Cancelled'] },
  });

  const nextOrderStatus = remainingServicesCount === 0 ? 'WaitOwner' : 'InProgress';
  const updatedOrder = await AppointmentOrder.findByIdAndUpdate(
    order._id,
    { $set: { derivedStatus: nextOrderStatus } },
    { returnDocument: 'after' }
  ).lean();

  return {
    medicalRecord: completedRecord,
    appointmentService: completedService,
    appointmentOrder: updatedOrder,
    waitingCageAssignment,
  };
};

/**
 * 4. Xem chi tiết Bệnh án SOAP của 1 dịch vụ khám (GET /api/medical-records/service/:appointmentServiceId)
 * - Kiểm soát quyền riêng tư y tế theo BR-23: PetOwner chỉ được xem bệnh án của thú cưng mình sở hữu.
 */
const getMedicalRecordByServiceId = async (currentUser, appointmentServiceId) => {
  const record = await MedicalRecord.findOne({ appointmentServiceId })
    .populate('petId', 'code name species breed weight ownerId')
    .populate({
      path: 'appointmentServiceId',
      populate: [
        { path: 'serviceId', select: 'code name category basePrice' },
        { path: 'assignedStaffId', select: 'code fullName role' },
        { path: 'orderId', select: 'code date derivedStatus ownerId' },
      ],
    })
    .lean();

  if (!record) {
    throw httpError(404, 'Chưa có hồ sơ bệnh án cho dịch vụ khám này');
  }

  // BR-23: Chặn chủ nuôi xem bệnh án thú cưng của người khác (chống IDOR)
  if (
    currentUser.role === 'PetOwner' &&
    String(record.petId?.ownerId) !== String(currentUser.id)
  ) {
    throw httpError(403, 'Bạn không có quyền truy cập hồ sơ bệnh án của thú cưng này');
  }

  return record;
};

/**
 * 5. Xem Tiền sử bệnh lý của 1 thú cưng (Medical History Drawer - UC-32, GET /api/medical-records/pet/:petId)
 * - Kiểm soát quyền riêng tư y tế theo BR-23: chỉ chủ sở hữu thú cưng đó hoặc nhân sự phòng khám mới được xem.
 */
const getMedicalHistoryByPetId = async (currentUser, petId) => {
  const pet = await Pet.findById(petId).lean();
  if (!pet) {
    throw httpError(404, 'Không tìm thấy hồ sơ thú cưng');
  }

  // BR-23: Chủ nuôi chỉ được xem lịch sử bệnh án của thú cưng thuộc sở hữu của mình
  if (currentUser.role === 'PetOwner' && String(pet.ownerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn không có quyền xem lịch sử bệnh án của thú cưng này');
  }

  const records = await MedicalRecord.find({ petId })
    .populate({
      path: 'appointmentServiceId',
      populate: [
        { path: 'serviceId', select: 'code name category' },
        { path: 'assignedStaffId', select: 'code fullName role' },
        { path: 'orderId', select: 'code date derivedStatus' },
      ],
    })
    .sort({ createdAt: -1 })
    .lean();

  return {
    pet,
    records,
  };
};

module.exports = {
  startMedicalConsultation,
  saveDraftMedicalRecord,
  completeMedicalConsultation,
  getMedicalRecordByServiceId,
  getMedicalHistoryByPetId,
};

