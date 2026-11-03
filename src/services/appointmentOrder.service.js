const crypto = require('crypto');
const AppointmentOrder = require('../models/AppointmentOrder');
const Pet = require('../models/Pet');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ 0/O/1/I để tránh nhìn nhầm
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;

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

/**
 * Create an online appointment for the logged-in owner.
 * ownerId comes from the token (never from the request body).
 */
const createOnlineAppointment = async (ownerId, { petId, date, note }) => {
  // 1. The pet must exist and belong to the current user
  const pet = await Pet.findOne({ _id: petId, ownerId }).select('_id').lean();
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
      return await AppointmentOrder.create({
        code: generateAppointmentCode(),
        petId,
        ownerId,
        date,
        note,
        isOnline: true,
        checkedInAt: null,
        // derivedStatus falls back to the schema default: 'Booked'
      });
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
  return appointment;
};

module.exports = {
  createOnlineAppointment,
  listMyOnlineAppointments,
  getMyOnlineAppointment
};