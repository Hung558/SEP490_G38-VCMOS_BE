const mongoose = require('mongoose');

const subtaskRequestSchema = new mongoose.Schema(
  {
    appointmentServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentService', required: true },
    requestedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taskType: String,
    instructions: String,
    resultText: String,
    resultImageUrl: String,
    status: { type: String, enum: ['Pending', 'InProgress', 'Completed'], default: 'Pending' },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

subtaskRequestSchema.index({ assignedStaffId: 1, status: 1 });
subtaskRequestSchema.index({ appointmentServiceId: 1 });

module.exports = mongoose.model('SubtaskRequest', subtaskRequestSchema, 'subtask_requests');
