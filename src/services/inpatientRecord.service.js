const InpatientRecord = require('../models/InpatientRecord');
const Pet = require('../models/Pet');
const AppointmentOrder = require('../models/AppointmentOrder');
const Cage = require('../models/Cage');
const CageAssignment = require('../models/CageAssignment');

class ServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const POPULATE = [
  { path: 'petId', select: 'code name species breed weight ownerId' },
  { path: 'attendingVetId', select: 'code fullName' },
  { path: 'cageId', select: 'label size zone isIsolated status' },
  { path: 'orderId', select: 'code date derivedStatus' },
  { path: 'dailyLogs.recordedById', select: 'code fullName' },
];

/**
 * Nhập viện: tạo hồ sơ nội trú, chiếm lồng, ghi lịch sử CageAssignment.
 * attendingVetId luôn là bác sĩ đang đăng nhập.
 */
const create = async (vetId, data) => {
  const [pet, order] = await Promise.all([
    Pet.findById(data.petId).select('status weight').lean(),
    AppointmentOrder.findById(data.orderId).select('petId derivedStatus').lean(),
  ]);

  if (!pet || pet.status !== 'Active') throw new ServiceError(404, 'Không tìm thấy thú cưng');
  if (!order) throw new ServiceError(404, 'Không tìm thấy lịch hẹn');
  if (String(order.petId) !== String(data.petId)) {
    throw new ServiceError(400, 'Lịch hẹn không thuộc thú cưng này');
  }
  if (order.derivedStatus === 'Cancelled') {
    throw new ServiceError(400, 'Lịch hẹn đã bị huỷ');
  }

  const existing = await InpatientRecord.exists({ petId: data.petId, status: 'Admitted' });
  if (existing) throw new ServiceError(409, 'Thú cưng đang trong đợt nội trú khác');

  const cage = await Cage.findById(data.cageId).select('zone maxWeightKg').lean();
  if (!cage) throw new ServiceError(404, 'Không tìm thấy lồng');
  if (cage.zone !== 'InpatientWard') throw new ServiceError(400, 'Lồng không thuộc khu nội trú');
  if (cage.maxWeightKg != null && pet.weight != null && pet.weight > cage.maxWeightKg) {
    throw new ServiceError(400, 'Cân nặng thú cưng vượt quá giới hạn của lồng');
  }

  // Chiếm lồng nguyên tử: chỉ thành công nếu lồng vẫn đang Available
  const claimed = await Cage.findOneAndUpdate(
    { _id: data.cageId, status: 'Available' },
    { status: 'Occupied' }
  );
  if (!claimed) throw new ServiceError(409, 'Lồng đã có thú cưng khác');

  let assignment;
  let record;
  let releasedHolding = null;
  try {
    // Nếu order đang giữ lồng chờ (Holding) → trả lồng đó khi chuyển sang nội trú
    releasedHolding = await CageAssignment.findOneAndUpdate(
      { orderId: data.orderId, releasedAt: null },
      { releasedAt: new Date() }
    );

    assignment = await CageAssignment.create({
      cageId: data.cageId,
      orderId: data.orderId,
      assignedById: vetId,
    });

    record = await InpatientRecord.create({
      petId: data.petId,
      orderId: data.orderId,
      attendingVetId: vetId,
      cageId: data.cageId,
      initialDiagnosis: data.initialDiagnosis,
      treatmentPlan: data.treatmentPlan,
    });

    if (releasedHolding) {
      await Cage.updateOne({ _id: releasedHolding.cageId }, { status: 'Available' });
    }
  } catch (err) {
    // Hoàn tác thủ công (không dùng transaction để chạy được trên MongoDB standalone)
    await Promise.allSettled([
      Cage.updateOne({ _id: data.cageId }, { status: 'Available' }),
      assignment && CageAssignment.deleteOne({ _id: assignment._id }),
      releasedHolding &&
        CageAssignment.updateOne({ _id: releasedHolding._id }, { releasedAt: null }),
    ]);
    if (err.code === 11000) throw new ServiceError(409, 'Thú cưng đang trong đợt nội trú khác');
    throw err;
  }

  return InpatientRecord.findById(record._id).populate(POPULATE).lean();
};

const list = async (vetId, { status, petId, attendingVetId, mine, page, limit }) => {
  const filter = {};
  if (status) filter.status = status;
  if (petId) filter.petId = petId;
  if (mine) filter.attendingVetId = vetId;
  else if (attendingVetId) filter.attendingVetId = attendingVetId;

  const [items, total] = await Promise.all([
    InpatientRecord.find(filter)
      .select('-dailyLogs') // danh sách không cần nhật ký; xem chi tiết để lấy
      .sort({ admittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE.slice(0, 4))
      .lean(),
    InpatientRecord.countDocuments(filter),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getById = async (id) => {
  const record = await InpatientRecord.findById(id).populate(POPULATE).lean();
  if (!record) throw new ServiceError(404, 'Không tìm thấy hồ sơ nội trú');
  return record;
};

module.exports = { create, list, getById, ServiceError };