const mongoose = require('mongoose');

const dailyLogSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, // YYYY-MM-DD
  recordedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  observations: String,
  notes: String,
  createdAt: { type: Date, default: Date.now },
});

const inpatientRecordSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentOrder', required: true },
    attendingVetId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    cageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cage', required: true },
    initialDiagnosis: String,
    treatmentPlan: String,
    admittedAt: { type: Date, default: Date.now },
    dischargedAt: { type: Date, default: null },
    status: { type: String, enum: ['Admitted', 'Discharged'], default: 'Admitted' },
    dailyLogs: { type: [dailyLogSchema], default: [] },
  },
  { timestamps: true }
);

// mỗi pet chỉ có 1 đợt nội trú đang Admitted
inpatientRecordSchema.index(
  { petId: 1 },
  { unique: true, partialFilterExpression: { status: 'Admitted' } }
);

module.exports = mongoose.model('InpatientRecord', inpatientRecordSchema, 'inpatient_records');
