const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'],
      required: true,
    },
    defaultDuration: { type: Number, min: 0 },
    basePrice: { type: Number, min: 0 },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    description: String,
  },
  { timestamps: true }
);

serviceSchema.index({ category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Service', serviceSchema, 'services');
