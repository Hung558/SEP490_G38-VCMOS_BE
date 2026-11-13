const SubtaskRequest = require('../models/SubtaskRequest');
const AppointmentService = require('../models/AppointmentService');
const AppointmentOrder = require('../models/AppointmentOrder');
const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');

const SUBTASK_STAFF_ROLES = ['Veterinarian', 'Groomer'];
const SUBTASK_CLOUDINARY_FOLDER = 'subtask-results';

const SUBTASK_POPULATE = [
  { path: 'requestedById', select: 'code fullName role' },
  { path: 'assignedStaffId', select: 'code fullName role' },
  {
    path: 'appointmentServiceId',
    select: 'orderId serviceId sequenceNo status isEmergency',
    populate: [
      { path: 'serviceId', select: 'code name category' },
      {
        path: 'orderId',
        select: 'code date derivedStatus petId ownerId note intake',
        populate: [
          { path: 'petId', select: 'code name species breed weight photoUrl' },
          { path: 'ownerId', select: 'code fullName phone' },
        ],
      },
    ],
  },
];

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

const uploadResultImageBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder, resource_type: 'image' }, (err, result) =>
        err ? reject(err) : resolve(result)
      )
      .end(buffer);
  });

const deleteCloudinaryImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.error(`Failed to delete Cloudinary subtask image "${publicId}":`, err.message);
  }
};

const findPopulatedSubtaskById = (subtaskId) =>
  SubtaskRequest.findById(subtaskId).populate(SUBTASK_POPULATE).lean();

/**
 * 1. Bác sĩ chính chỉ định yêu cầu cận lâm sàng / dịch vụ phụ (UC-33, POST /api/subtask-requests)
 * - Chỉ bác sĩ được phân công phụ trách ca khám chính (đang InProgress) mới được tạo yêu cầu.
 * - Nhân sự thực hiện phải đang Active và có vai trò Veterinarian hoặc Groomer.
 */
const createSubtaskRequest = async (requesterId, payload) => {
  const { appointmentServiceId, assignedStaffId, taskType, instructions } = payload;

  const appointmentService = await AppointmentService.findById(appointmentServiceId)
    .select('orderId assignedStaffId status')
    .lean();

  if (!appointmentService) {
    throw httpError(404, 'Không tìm thấy dịch vụ lịch hẹn');
  }

  if (
    !appointmentService.assignedStaffId ||
    String(appointmentService.assignedStaffId) !== String(requesterId)
  ) {
    throw httpError(403, 'Bạn không phải là bác sĩ được phân công phụ trách ca khám này');
  }

  if (appointmentService.status !== 'InProgress') {
    throw httpError(
      409,
      'Chỉ có thể tạo yêu cầu cận lâm sàng / dịch vụ phụ khi ca khám chính đang thực hiện (InProgress)'
    );
  }

  const medicalRecord = await MedicalRecord.findOne({ appointmentServiceId })
    .select('status')
    .lean();
  if (medicalRecord && medicalRecord.status === 'Finalized') {
    throw httpError(409, 'Bệnh án của ca khám này đã được khóa (Finalized), không thể tạo thêm yêu cầu');
  }

  const assignedStaff = await User.findById(assignedStaffId).select('role status').lean();
  if (!assignedStaff) {
    throw httpError(404, 'Không tìm thấy nhân sự được phân công');
  }
  if (!SUBTASK_STAFF_ROLES.includes(assignedStaff.role)) {
    throw httpError(
      400,
      'Nhân sự thực hiện cận lâm sàng / dịch vụ phụ phải có vai trò Veterinarian hoặc Groomer'
    );
  }
  if (assignedStaff.status !== 'Active') {
    throw httpError(400, 'Nhân sự được phân công hiện không ở trạng thái hoạt động (Active)');
  }

  const created = await SubtaskRequest.create({
    appointmentServiceId,
    requestedById: requesterId,
    assignedStaffId,
    taskType,
    instructions,
    status: 'Pending',
    completedAt: null,
  });

  return findPopulatedSubtaskById(created._id);
};

/**
 * 2. Nhân sự được phân công xem hàng đợi cận lâm sàng / dịch vụ phụ của chính mình (SCR-24, UC-34)
 */
const getMySubtaskQueue = async (staffId, { status } = {}) => {
  const filter = { assignedStaffId: staffId };
  if (status) {
    filter.status = status;
  }

  // Lịch sử đã xong xếp mới nhất lên trước; hàng đợi đang chờ xếp theo thứ tự yêu cầu trước làm trước
  const sortOrder = status === 'Completed' ? { completedAt: -1, createdAt: -1 } : { createdAt: 1 };

  return SubtaskRequest.find(filter).populate(SUBTASK_POPULATE).sort(sortOrder).lean();
};

/**
 * 3. Xem danh sách Sub-task thuộc 1 ca khám (bác sĩ theo dõi kết quả, nhân sự phòng khám hoặc chủ nuôi hợp lệ theo BR-23)
 */
const getSubtasksByAppointmentServiceId = async (currentUser, appointmentServiceId) => {
  const appointmentService = await AppointmentService.findById(appointmentServiceId)
    .select('orderId')
    .lean();

  if (!appointmentService) {
    throw httpError(404, 'Không tìm thấy dịch vụ lịch hẹn');
  }

  // BR-23: Chủ nuôi chỉ được xem dữ liệu khám bệnh của thú cưng thuộc sở hữu của mình
  if (currentUser.role === 'PetOwner') {
    const order = await AppointmentOrder.findById(appointmentService.orderId)
      .select('ownerId')
      .lean();
    if (!order || String(order.ownerId) !== String(currentUser.id)) {
      throw httpError(403, 'Bạn không có quyền xem yêu cầu cận lâm sàng của ca khám này');
    }
  }

  return SubtaskRequest.find({ appointmentServiceId })
    .populate(SUBTASK_POPULATE)
    .sort({ createdAt: 1 })
    .lean();
};

/**
 * 4. Xem chi tiết 1 Sub-task (kiểm tra quyền chủ nuôi theo BR-23)
 */
const getSubtaskRequestById = async (currentUser, subtaskId) => {
  const subtask = await findPopulatedSubtaskById(subtaskId);
  if (!subtask) {
    throw httpError(404, 'Không tìm thấy yêu cầu cận lâm sàng / dịch vụ phụ');
  }

  if (currentUser.role === 'PetOwner') {
    const ownerRef = subtask.appointmentServiceId?.orderId?.ownerId;
    const ownerId = ownerRef?._id || ownerRef;
    if (!ownerId || String(ownerId) !== String(currentUser.id)) {
      throw httpError(403, 'Bạn không có quyền truy cập yêu cầu cận lâm sàng này');
    }
  }

  return subtask;
};

/**
 * 5. Nhân sự nhận thực hiện Sub-task: Pending -> InProgress (UC-34)
 */
const startSubtaskRequest = async (staffId, subtaskId) => {
  const subtask = await SubtaskRequest.findById(subtaskId).select('assignedStaffId status').lean();
  if (!subtask) {
    throw httpError(404, 'Không tìm thấy yêu cầu cận lâm sàng / dịch vụ phụ');
  }

  if (String(subtask.assignedStaffId) !== String(staffId)) {
    throw httpError(403, 'Bạn không phải là nhân sự được phân công thực hiện yêu cầu này');
  }

  if (subtask.status !== 'Pending') {
    throw httpError(
      409,
      `Chỉ có thể bắt đầu yêu cầu đang ở trạng thái Pending (hiện tại: "${subtask.status}")`
    );
  }

  // Cập nhật nguyên tử để tránh race condition khi nhiều request bấm bắt đầu cùng lúc
  const updated = await SubtaskRequest.findOneAndUpdate(
    { _id: subtaskId, assignedStaffId: staffId, status: 'Pending' },
    { $set: { status: 'InProgress' } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw httpError(409, 'Trạng thái yêu cầu vừa thay đổi, vui lòng thử lại');
  }

  return findPopulatedSubtaskById(subtaskId);
};

/**
 * 6. Nhân sự trả kết quả (chữ và/hoặc ảnh Cloudinary) & hoàn tất Sub-task -> Completed (UC-34)
 * Khi tất cả Sub-task của ca khám đã Completed, bác sĩ chính mới được hoàn tất ca khám chính (MSG26).
 */
const completeSubtaskRequest = async (staffId, subtaskId, { resultText, resultImageFile }) => {
  const subtask = await SubtaskRequest.findById(subtaskId).select('assignedStaffId status').lean();
  if (!subtask) {
    throw httpError(404, 'Không tìm thấy yêu cầu cận lâm sàng / dịch vụ phụ');
  }

  if (String(subtask.assignedStaffId) !== String(staffId)) {
    throw httpError(403, 'Bạn không phải là nhân sự được phân công thực hiện yêu cầu này');
  }

  if (subtask.status === 'Completed') {
    throw httpError(409, 'Yêu cầu cận lâm sàng / dịch vụ phụ này đã được hoàn tất trước đó');
  }

  if (!['Pending', 'InProgress'].includes(subtask.status)) {
    throw httpError(409, `Không thể hoàn tất yêu cầu đang ở trạng thái "${subtask.status}"`);
  }

  let uploadedImage = null;
  if (resultImageFile) {
    try {
      const folder = `${SUBTASK_CLOUDINARY_FOLDER}/${subtaskId}`;
      uploadedImage = await uploadResultImageBuffer(resultImageFile.buffer, folder);
    } catch (err) {
      throw httpError(502, 'Không thể tải ảnh kết quả lên, vui lòng thử lại sau');
    }
  }

  const updateFields = {
    status: 'Completed',
    completedAt: new Date(),
  };
  if (resultText !== undefined) {
    updateFields.resultText = resultText;
  }
  if (uploadedImage && uploadedImage.secure_url) {
    updateFields.resultImageUrl = uploadedImage.secure_url;
  }

  let updated;
  try {
    updated = await SubtaskRequest.findOneAndUpdate(
      { _id: subtaskId, assignedStaffId: staffId, status: { $in: ['Pending', 'InProgress'] } },
      { $set: updateFields },
      { returnDocument: 'after' }
    );
  } catch (err) {
    await deleteCloudinaryImage(uploadedImage?.public_id);
    throw err;
  }

  if (!updated) {
    await deleteCloudinaryImage(uploadedImage?.public_id);
    throw httpError(409, 'Yêu cầu cận lâm sàng / dịch vụ phụ này đã được hoàn tất trước đó');
  }

  return findPopulatedSubtaskById(subtaskId);
};

/**
 * 7. Bác sĩ đã tạo hủy yêu cầu Sub-task khi còn Pending (tránh kẹt chốt chặn MSG26 nếu lỡ chỉ định nhầm)
 */
const deletePendingSubtaskRequest = async (requesterId, subtaskId) => {
  const subtask = await SubtaskRequest.findById(subtaskId).select('requestedById status').lean();
  if (!subtask) {
    throw httpError(404, 'Không tìm thấy yêu cầu cận lâm sàng / dịch vụ phụ');
  }

  if (String(subtask.requestedById) !== String(requesterId)) {
    throw httpError(403, 'Chỉ bác sĩ đã tạo yêu cầu mới có quyền hủy yêu cầu này');
  }

  if (subtask.status !== 'Pending') {
    throw httpError(
      409,
      `Không thể hủy yêu cầu đang ở trạng thái "${subtask.status}"`
    );
  }

  const deleted = await SubtaskRequest.findOneAndDelete({
    _id: subtaskId,
    requestedById: requesterId,
    status: 'Pending',
  }).lean();

  if (!deleted) {
    throw httpError(409, 'Yêu cầu không còn ở trạng thái Pending để hủy');
  }

  return deleted;
};

module.exports = {
  createSubtaskRequest,
  getMySubtaskQueue,
  getSubtasksByAppointmentServiceId,
  getSubtaskRequestById,
  startSubtaskRequest,
  completeSubtaskRequest,
  deletePendingSubtaskRequest,
};

