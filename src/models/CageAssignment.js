const mongoose = require('mongoose');

const cageAssignmentSchema = new mongoose.Schema(
  {
    cageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cage', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentOrder', required: true },
    assignedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// mỗi chuồng chỉ có 1 assignment đang mở (releasedAt = null)
cageAssignmentSchema.index(
  { cageId: 1 },
  { unique: true, partialFilterExpression: { releasedAt: { $type: 'null' } } }
);
cageAssignmentSchema.index({ orderId: 1 });

module.exports = mongoose.model('CageAssignment', cageAssignmentSchema, 'cage_assignments');
