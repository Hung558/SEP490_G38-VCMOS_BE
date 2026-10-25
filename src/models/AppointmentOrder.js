const mongoose = require('mongoose');

const appointmentOrderSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
    note: String,
    isOnline: { type: Boolean, default: false },
    derivedStatus: {
      type: String,
      enum: ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Cancelled', 'Overdue'],
      default: 'Booked',
    },
    checkedInAt: { type: Date, default: null },
  },
  { timestamps: true }
);

appointmentOrderSchema.index({ petId: 1, date: 1 });
appointmentOrderSchema.index({ ownerId: 1, date: 1 });
appointmentOrderSchema.index({ date: 1, derivedStatus: 1 });

module.exports = mongoose.model('AppointmentOrder', appointmentOrderSchema, 'appointment_orders');
