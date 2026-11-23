const mongoose = require('mongoose');

const petSnapshotSchema = new mongoose.Schema(
  {
    code: { type: String, default: null },
    name: { type: String, default: null },
    species: { type: String, default: null },
    breed: { type: String, default: null },
    coatColor: { type: String, default: null },
    dob: { type: Date, default: null },
    ageText: { type: String, default: null },
    weight: { type: Number, default: null },
    notes: { type: String, default: null },
  },
  { _id: false }
);

const recommendedServiceSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
    code: { type: String, default: null },
    name: { type: String, required: true },
    category: { type: String, default: null },
    basePrice: { type: Number, default: null },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const clinicalContextSummarySchema = new mongoose.Schema(
  {
    recentVisitsCount: { type: Number, default: 0 },
    recentMedicalRecordsCount: { type: Number, default: 0 },
    recentInpatientStaysCount: { type: Number, default: 0 },
    hasActiveInpatient: { type: Boolean, default: false },
    lastDiagnosis: { type: String, default: null },
    knownAllergiesOrNotes: { type: String, default: null },
  },
  { _id: false }
);

/**
 * Bảng lưu lịch sử đánh giá sức khỏe tham khảo bằng AI (UC-14, SCR-10).
 * Tách biệt hoàn toàn với bảng MedicalRecord theo quy tắc BR-20.
 */
const aiAssessmentSchema = new mongoose.Schema(
  {
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    petSnapshot: { type: petSnapshotSchema, default: () => ({}) },
    symptoms: { type: [String], default: [] },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    imageUrls: { type: [String], default: [] },
    urgency: {
      type: String,
      enum: ['Routine', 'Monitor', 'Urgent'],
      required: true,
    },
    recommendedTimeframe: { type: String, default: '' },
    summary: { type: String, required: true, trim: true },
    redFlags: { type: [String], default: [] },
    visualFindings: { type: [String], default: [] },
    possibleCauses: { type: [String], default: [] },
    advice: { type: [String], default: [] },
    contraindications: { type: [String], default: [] },
    recommendedServices: { type: [recommendedServiceSchema], default: [] },
    clinicalContextSummary: { type: clinicalContextSummarySchema, default: () => ({}) },
    bookingNoteDraft: { type: String, default: '' },
    disclaimer: { type: String, required: true },
    aiProvider: { type: String, enum: ['gemini', 'groq'], required: true },
    aiModel: { type: String, required: true },
    responseTimeMs: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

aiAssessmentSchema.index({ petId: 1, createdAt: -1 });
aiAssessmentSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = mongoose.model('AiAssessment', aiAssessmentSchema, 'ai_assessments');
