const mongoose = require('mongoose');

// Phiếu kê khai / thăm khám ban đầu do lễ tân ghi nhận khi check-in hoặc tiếp nhận walk-in
const intakeSchema = new mongoose.Schema(
  {
    symptoms: { type: String, trim: true, default: '' },
    initialCondition: { type: String, trim: true, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recordedAt: { type: Date, default: null },
  },
  { _id: false }
);

const appointmentOrderSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    slotStart: { type: String, default: null },
    slotEnd: { type: String, default: null },
    note: String,
    intake: { type: intakeSchema, default: null },
    isOnline: { type: Boolean, default: false },
    derivedStatus: {
      type: String,
      enum: ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'],
      default: 'Booked',
    },
    checkedInAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

appointmentOrderSchema.index({ petId: 1, date: 1 });
appointmentOrderSchema.index({ ownerId: 1, date: 1 });
appointmentOrderSchema.index({ date: 1, derivedStatus: 1 });

module.exports = mongoose.model('AppointmentOrder', appointmentOrderSchema, 'appointment_orders');
