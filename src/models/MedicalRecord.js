const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productNameSnapshot: String,
  unitSnapshot: String,
  dosage: String,
  frequency: String,
  instructions: String,
  durationDays: { type: Number, min: 0 },
});

const medicalRecordSchema = new mongoose.Schema(
  {
    appointmentServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppointmentService',
      required: true,
      unique: true,
    },
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    subjectiveNote: String,
    objectiveNote: String,
    assessment: String,
    plan: String,
    notes: String,
    prescriptions: { type: [prescriptionSchema], default: [] },
    status: { type: String, enum: ['Draft', 'Finalized'], default: 'Draft' },
  },
  { timestamps: true }
);

medicalRecordSchema.index({ petId: 1, createdAt: -1 });

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema, 'medical_records');
