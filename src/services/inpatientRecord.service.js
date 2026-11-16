const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const InpatientRecord = require('../models/InpatientRecord');
const User = require('../models/User');
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

const escapeHtml = (str = '') =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatVN = (date) =>
  new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

// Gửi email thông báo nhập viện cho chủ thú cưng. Cùng cách cấu hình và giao diện với sendOtpEmail
// trong user.service.js: nếu chưa cấu hình EMAIL_USER/EMAIL_PASS (dev/test) thì chỉ in ra console.
const sendAdmissionEmail = async (owner, record) => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const petName = record.petId.name;
  const subject = `[VCMOS] Thông báo nhập viện nội trú của ${petName}`;

  if (!emailUser || !emailPass || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[DEV EMAIL INPATIENT] Gửi tới ${owner.email} - ${subject}`);
    }
    return false;
  }

  const admittedAt = formatVN(record.admittedAt);
  const vetName = record.attendingVetId?.fullName || '';
  const cageLabel = record.cageId?.label || '';
  const diagnosis = record.initialDiagnosis || '';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass },
  });

  await transporter.sendMail({
    from: `"VCMOS Veterinary Clinic" <${emailUser}>`,
    to: owner.email,
    subject,
    text:
      `Xin chào ${owner.fullName}, thú cưng ${petName} của bạn đã được nhập viện nội trú tại VCMOS ` +
      `lúc ${admittedAt}. Bác sĩ phụ trách: ${vetName}. Lồng: ${cageLabel}.` +
      (diagnosis ? ` Chẩn đoán ban đầu: ${diagnosis}.` : ''),
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #f4f7f6; padding: 32px 16px;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <div style="background-color: #0d9488; padding: 24px; text-align: center; color: #ffffff;">
            <div style="font-size: 28px; margin-bottom: 4px;">🐾</div>
            <h2 style="margin: 0; font-size: 20px; letter-spacing: 0.5px;">PHÒNG KHÁM THÚ Y VCMOS</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Hệ thống Quản lý & Chăm sóc Thú cưng</p>
          </div>
          <div style="padding: 28px 24px; color: #1e293b; line-height: 1.6;">
            <p style="margin-top: 0;">Xin chào <strong>${escapeHtml(owner.fullName)}</strong>,</p>
            <p>Thú cưng <strong>${escapeHtml(petName)}</strong> của bạn đã được <strong>nhập viện nội trú</strong> tại <strong>Phòng khám Thú y VCMOS</strong>. Thông tin chi tiết như sau:</p>
            <div style="margin: 24px 0; padding: 18px; background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 10px;">
              <p style="margin: 0 0 6px;">🕒 <strong>Thời gian nhập viện:</strong> ${escapeHtml(admittedAt)}</p>
              <p style="margin: 0 0 6px;">👨‍⚕️ <strong>Bác sĩ phụ trách:</strong> ${escapeHtml(vetName)}</p>
              <p style="margin: 0${diagnosis ? ' 0 6px' : ''};">🏠 <strong>Lồng nội trú:</strong> ${escapeHtml(cageLabel)}</p>
              ${diagnosis ? `<p style="margin: 0;">📋 <strong>Chẩn đoán ban đầu:</strong> ${escapeHtml(diagnosis)}</p>` : ''}
            </div>
            <p style="font-size: 13.5px; color: #64748b; margin-bottom: 0;">
              Nếu cần thêm thông tin, vui lòng liên hệ trực tiếp với phòng khám.
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 14px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
            Đây là email tự động, vui lòng không trả lời.<br/>
            © VCMOS Veterinary Clinic Management System
          </div>
        </div>
      </div>
    `,
  });

  return true;
};

// Chỉ gửi tới chủ thú cưng có email ĐÃ XÁC THỰC (tránh gửi thông tin y tế tới địa chỉ chưa kiểm chứng)
const notifyOwnerAdmitted = async (record) => {
  const owner = await User.findById(record.petId.ownerId).select('fullName email isEmailVerified').lean();
  if (!owner || !owner.email || !owner.isEmailVerified) return false;
  return sendAdmissionEmail(owner, record);
};

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

  const result = await InpatientRecord.findById(record._id).populate(POPULATE).lean();

  // Gửi thông báo ở chế độ "bắn rồi quên": lỗi gửi mail không được làm hỏng việc nhập viện đã thành công
  notifyOwnerAdmitted(result).catch((err) =>
    console.error('Không gửi được email thông báo nhập viện:', err.message)
  );

  return result;
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

// Ngày theo giờ Việt Nam (UTC+7, không có DST) dạng YYYY-MM-DD
const toVNDate = (d) => new Date(new Date(d).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const LOG_POPULATE = { path: 'dailyLogs.recordedById', select: 'code fullName' };

/**
 * Thêm nhật ký hằng ngày vào hồ sơ nội trú đang Admitted.
 * recordedById luôn là bác sĩ đang đăng nhập; date mặc định là hôm nay (giờ VN).
 */
const createLog = async (recordId, vetId, data) => {
  const record = await InpatientRecord.findById(recordId).select('status admittedAt').lean();
  if (!record) throw new ServiceError(404, 'Không tìm thấy hồ sơ nội trú');
  if (record.status !== 'Admitted') {
    throw new ServiceError(400, 'Hồ sơ nội trú đã xuất viện, không thể thêm nhật ký');
  }

  const date = data.date || toVNDate(new Date());
  if (date > toVNDate(new Date())) throw new ServiceError(400, 'Không thể ghi nhật ký cho ngày trong tương lai');
  if (date < toVNDate(record.admittedAt)) {
    throw new ServiceError(400, 'Ngày ghi nhật ký không được trước ngày nhập viện');
  }

  // Tạo _id trước để lấy đúng log vừa thêm, kể cả khi có request khác ghi đồng thời
  const logId = new mongoose.Types.ObjectId();
  const updated = await InpatientRecord.findOneAndUpdate(
    { _id: recordId, status: 'Admitted' }, // chặn race với việc xuất viện
    {
      $push: {
        dailyLogs: {
          _id: logId,
          date,
          recordedById: vetId,
          observations: data.observations,
          notes: data.notes,
        },
      },
    },
    { new: true }
  )
    .select('dailyLogs')
    .populate(LOG_POPULATE)
    .lean();

  if (!updated) throw new ServiceError(400, 'Hồ sơ nội trú đã xuất viện, không thể thêm nhật ký');
  return updated.dailyLogs.find((l) => String(l._id) === String(logId));
};

// Danh sách nhật ký, mới nhất trước. Lọc theo date (đúng ngày) hoặc from/to (khoảng, gồm 2 đầu).
const listLogs = async (recordId, { date, from, to }) => {
  const record = await InpatientRecord.findById(recordId).select('dailyLogs').populate(LOG_POPULATE).lean();
  if (!record) throw new ServiceError(404, 'Không tìm thấy hồ sơ nội trú');

  const items = record.dailyLogs
    .filter((l) => (date ? l.date === date : true))
    .filter((l) => (from ? l.date >= from : true))
    .filter((l) => (to ? l.date <= to : true))
    .sort((a, b) => (a.date === b.date ? new Date(b.createdAt) - new Date(a.createdAt) : a.date < b.date ? 1 : -1));

  return { items, total: items.length };
};

module.exports = { create, list, getById, createLog, listLogs, ServiceError };