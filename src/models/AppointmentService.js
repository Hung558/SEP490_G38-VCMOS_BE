const mongoose = require('mongoose');

const groomingNoteSchema = new mongoose.Schema(
  {
    beforeNote: String,
    afterNote: String,
    beforePhotoUrl: String,
    afterPhotoUrl: String,
    recommendations: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const appointmentServiceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentOrder', required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    sequenceNo: { type: Number, required: true },
    preferredStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['Booked', 'Waiting', 'InProgress', 'Done', 'Cancelled', 'Overdue'],
      default: 'Booked',
    },
    isEmergency: { type: Boolean, default: false },
    queueNo: { type: Number, default: null },
    enqueueAt: { type: Date, default: null },
    dequeueAt: { type: Date, default: null },
    groomingNote: { type: groomingNoteSchema, default: null },
  },
  { timestamps: true }
);

appointmentServiceSchema.index({ orderId: 1, sequenceNo: 1 }, { unique: true });
appointmentServiceSchema.index({ assignedStaffId: 1, status: 1, enqueueAt: 1 });
appointmentServiceSchema.index({ orderId: 1 });

module.exports = mongoose.model('AppointmentService', appointmentServiceSchema, 'appointment_services');
