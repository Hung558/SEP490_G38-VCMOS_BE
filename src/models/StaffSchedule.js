const mongoose = require('mongoose');

const staffScheduleSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    shiftStart: { type: String, default: '08:00', match: /^\d{2}:\d{2}$/ },
    shiftEnd: { type: String, default: '17:00', match: /^\d{2}:\d{2}$/ },
    notes: String,
  },
  { timestamps: true }
);

staffScheduleSchema.index({ staffId: 1, workDate: 1 }, { unique: true });

module.exports = mongoose.model('StaffSchedule', staffScheduleSchema, 'staff_schedules');
