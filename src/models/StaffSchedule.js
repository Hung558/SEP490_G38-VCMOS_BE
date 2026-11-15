const mongoose = require('mongoose');

const SHIFT_VALUES = ['MORNING', 'AFTERNOON', 'EVENING'];

// Mô hình Blacklist: nhân sự mặc định sẵn sàng nhận ca, chỉ tạo bản ghi khi báo bận theo Ngày x Ca
const staffScheduleSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    shift: { type: String, enum: SHIFT_VALUES, required: true },
    reason: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

staffScheduleSchema.index({ staffId: 1, date: 1, shift: 1 }, { unique: true });
staffScheduleSchema.index({ date: 1, shift: 1 });

module.exports = mongoose.model('StaffSchedule', staffScheduleSchema, 'staff_schedules');
