const cloudinary = require('../config/cloudinary');
const AiAssessment = require('../models/AiAssessment');
const Pet = require('../models/Pet');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');
const MedicalRecord = require('../models/MedicalRecord');
const SubtaskRequest = require('../models/SubtaskRequest');
const InpatientRecord = require('../models/InpatientRecord');
const Service = require('../models/Service');
const Cage = require('../models/Cage');
const User = require('../models/User');
const { analyzePetHealthWithAi } = require('../utils/gemini');

const CLOUDINARY_FOLDER = 'vcmos/ai-assessments';

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

/**
 * Tính chuỗi tuổi thú cưng dễ đọc từ ngày sinh (dob) để đính kèm vào ngữ cảnh gửi AI.
 */
const computePetAgeText = (dob) => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  const now = new Date();
  let totalMonths =
    (now.getFullYear() - birthDate.getFullYear()) * 12 +
    (now.getMonth() - birthDate.getMonth());
  if (now.getDate() < birthDate.getDate()) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) return null;
  if (totalMonths < 1) return 'Dưới 1 tháng tuổi';
  if (totalMonths < 12) return `${totalMonths} tháng tuổi`;

  const years = Math.floor(totalMonths / 12);
  const remainMonths = totalMonths % 12;
  if (remainMonths === 0) return `${years} tuổi`;
  return `${years} tuổi ${remainMonths} tháng`;
};

/**
 * Đẩy một ảnh (buffer từ Multer) lên Cloudinary.
 */
const uploadAiPhotoBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          return reject(
            httpError(502, 'Không thể tải ảnh đánh giá AI lên hệ thống, vui lòng thử lại sau')
          );
        }
        return resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

/**
 * Gom toàn bộ ngữ cảnh y tế thú cưng và năng lực tiếp nhận của phòng khám từ các dữ liệu đọc non-Admin:
 * hồ sơ khám SOAP, đơn thuốc cũ, cận lâm sàng, ghi chú Spa, nội trú, dịch vụ Active, chuồng & bác sĩ.
 */
const gatherPetAndClinicContext = async (pet) => {
  const [orders, medicalRecords, inpatientRecords, activeServices, cages, activeVetsCount] =
    await Promise.all([
      AppointmentOrder.find({ petId: pet._id })
        .select('code date derivedStatus note intake createdAt')
        .sort({ date: -1, createdAt: -1 })
        .limit(10)
        .lean(),
      MedicalRecord.find({ petId: pet._id })
        .select(
          'appointmentServiceId subjectiveNote objectiveNote assessment plan notes prescriptions status createdAt'
        )
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      InpatientRecord.find({ petId: pet._id })
        .select('status initialDiagnosis treatmentPlan admittedAt dischargedAt dailyLogs')
        .sort({ admittedAt: -1 })
        .limit(5)
        .lean(),
      Service.find({ status: 'Active' })
        .select('code name category defaultDuration basePrice requiredRole description')
        .sort({ category: 1, name: 1 })
        .lean(),
      Cage.find({}).select('zone isIsolated status').lean(),
      User.countDocuments({ role: 'Veterinarian', status: 'Active' }),
    ]);

  const orderIds = orders.map((order) => order._id);
  const appointmentServices =
    orderIds.length > 0
      ? await AppointmentService.find({ orderId: { $in: orderIds } })
          .select('orderId serviceId status groomingNote')
          .sort({ createdAt: -1 })
          .lean()
      : [];

  const serviceIds = appointmentServices.map((svc) => svc._id);
  const subtasks =
    serviceIds.length > 0
      ? await SubtaskRequest.find({
          appointmentServiceId: { $in: serviceIds },
          status: 'Completed',
        })
          .select('taskType resultText completedAt')
          .sort({ completedAt: -1 })
          .limit(10)
          .lean()
      : [];

  const orderDateById = new Map(orders.map((order) => [String(order._id), order.date]));
  const orderDateByApptServiceId = new Map();
  const groomingNotes = [];

  for (const svc of appointmentServices) {
    const orderDate = orderDateById.get(String(svc.orderId)) || null;
    orderDateByApptServiceId.set(String(svc._id), orderDate);

    if (svc.groomingNote && (svc.groomingNote.beforeNote || svc.groomingNote.afterNote)) {
      groomingNotes.push({
        date: orderDate,
        beforeNote: svc.groomingNote.beforeNote || '',
        afterNote: svc.groomingNote.afterNote || '',
        recommendations: svc.groomingNote.recommendations || '',
      });
    }
  }

  const formattedMedicalRecords = medicalRecords.map((rec) => ({
    date:
      orderDateByApptServiceId.get(String(rec.appointmentServiceId)) ||
      (rec.createdAt ? new Date(rec.createdAt).toISOString().slice(0, 10) : null),
    subjectiveNote: rec.subjectiveNote || '',
    objectiveNote: rec.objectiveNote || '',
    assessment: rec.assessment || '',
    plan: rec.plan || '',
    prescriptions: rec.prescriptions || [],
  }));

  const availableCages = cages.filter((cage) => cage.status === 'Available');
  const availableHoldingCages = availableCages.filter(
    (cage) => cage.zone === 'Holding' && !cage.isIsolated
  ).length;
  const availableInpatientCages = availableCages.filter(
    (cage) => cage.zone === 'InpatientWard' && !cage.isIsolated
  ).length;
  const availableIsolatedCages = availableCages.filter((cage) => cage.isIsolated).length;

  return {
    activeServices,
    medicalRecords: formattedMedicalRecords,
    subtasks,
    groomingNotes: groomingNotes.slice(0, 5),
    inpatientRecords,
    capacitySummary: {
      availableHoldingCages,
      availableInpatientCages,
      availableIsolatedCages,
      activeVetsCount,
    },
    summaryStats: {
      recentVisitsCount: orders.length,
      recentMedicalRecordsCount: medicalRecords.length,
      recentInpatientStaysCount: inpatientRecords.length,
      hasActiveInpatient: inpatientRecords.some((rec) => rec.status === 'Admitted'),
      lastDiagnosis: medicalRecords[0]?.assessment || null,
      knownAllergiesOrNotes: pet.notes || null,
    },
  };
};

/**
 * 1. Chủ nuôi gửi yêu cầu đánh giá sức khỏe tham khảo bằng AI (POST /api/ai-assessments — UC-14, BR-20).
 * - Chỉ PetOwner sở hữu thú cưng mới được gửi yêu cầu.
 * - Lưu kết quả ở bảng riêng AiAssessment; tuyệt đối không ghi đè vào MedicalRecord.
 * - Chỉ tải ảnh lên Cloudinary sau khi AI trả về kết quả hợp lệ để tránh rác khi lỗi/timeout.
 */
const createAiAssessment = async (currentUser, { petId, symptoms = [], description }, files = []) => {
  const pet = await Pet.findById(petId).lean();
  if (!pet || pet.status === 'Deleted') {
    throw httpError(404, 'Không tìm thấy hồ sơ thú cưng');
  }

  if (String(pet.ownerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn chỉ được gửi đánh giá AI cho thú cưng thuộc sở hữu của mình');
  }

  const petSnapshot = {
    code: pet.code || null,
    name: pet.name || null,
    species: pet.species || null,
    breed: pet.breed || null,
    coatColor: pet.coatColor || null,
    dob: pet.dob || null,
    ageText: computePetAgeText(pet.dob),
    weight: pet.weight ?? null,
    notes: pet.notes || null,
  };

  const clinicContext = await gatherPetAndClinicContext(pet);

  const aiResult = await analyzePetHealthWithAi({
    petSnapshot,
    symptoms,
    description,
    files,
    clinicContext,
  });

  let imageUrls = [];
  if (Array.isArray(files) && files.length > 0) {
    imageUrls = await Promise.all(files.map((file) => uploadAiPhotoBuffer(file.buffer)));
  }

  const created = await AiAssessment.create({
    petId: pet._id,
    ownerId: currentUser.id,
    petSnapshot,
    symptoms,
    description,
    imageUrls,
    urgency: aiResult.urgency,
    recommendedTimeframe: aiResult.recommendedTimeframe,
    summary: aiResult.summary,
    redFlags: aiResult.redFlags,
    visualFindings: aiResult.visualFindings,
    possibleCauses: aiResult.possibleCauses,
    advice: aiResult.advice,
    contraindications: aiResult.contraindications,
    recommendedServices: aiResult.recommendedServices,
    clinicalContextSummary: clinicContext.summaryStats,
    bookingNoteDraft: aiResult.bookingNoteDraft,
    disclaimer: aiResult.disclaimer,
    aiProvider: aiResult.aiProvider,
    aiModel: aiResult.aiModel,
    responseTimeMs: aiResult.responseTimeMs,
  });

  return created.toObject();
};

/**
 * 2. Xem danh sách lịch sử đánh giá AI (GET /api/ai-assessments — chỉ dành riêng cho PetOwner).
 * - Chỉ PetOwner mới được truy cập và chỉ xem được lịch sử các thú cưng thuộc sở hữu của chính mình.
 * - Mọi vai trò khác (Veterinarian, Groomer, Receptionist, Admin) đều bị từ chối 403.
 */
const listAiAssessments = async (currentUser, { petId, urgency, page = 1, limit = 20 } = {}) => {
  if (currentUser.role !== 'PetOwner') {
    throw httpError(403, 'Chỉ chủ nuôi mới có quyền xem lịch sử đánh giá AI');
  }

  const filter = { ownerId: currentUser.id };

  if (petId) {
    const pet = await Pet.findById(petId).select('_id ownerId status').lean();
    if (!pet || pet.status === 'Deleted') {
      throw httpError(404, 'Không tìm thấy hồ sơ thú cưng');
    }
    if (String(pet.ownerId) !== String(currentUser.id)) {
      throw httpError(403, 'Bạn không có quyền xem lịch sử đánh giá AI của thú cưng này');
    }
    filter.petId = pet._id;
  }

  if (urgency) {
    filter.urgency = urgency;
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AiAssessment.find(filter)
      .populate('petId', 'code name species breed weight photoUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AiAssessment.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

/**
 * 3. Xem chi tiết một lần đánh giá AI (GET /api/ai-assessments/:id — chỉ PetOwner sở hữu thú cưng).
 */
const getAiAssessmentById = async (currentUser, assessmentId) => {
  if (currentUser.role !== 'PetOwner') {
    throw httpError(403, 'Chỉ chủ nuôi mới có quyền xem kết quả đánh giá AI');
  }

  const assessment = await AiAssessment.findById(assessmentId)
    .populate('petId', 'code name species breed weight photoUrl')
    .lean();

  if (!assessment) {
    throw httpError(404, 'Không tìm thấy bản ghi đánh giá AI');
  }

  if (String(assessment.ownerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn không có quyền xem kết quả đánh giá AI của thú cưng này');
  }

  return assessment;
};

module.exports = {
  computePetAgeText,
  gatherPetAndClinicContext,
  createAiAssessment,
  listAiAssessments,
  getAiAssessmentById,
};
