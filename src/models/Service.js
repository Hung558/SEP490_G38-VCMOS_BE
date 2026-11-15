const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'],
      required: true,
    },
    // Quy định vai trò nhân sự được phép thực hiện dịch vụ khi điều phối / giao subtask
    requiredRole: {
      type: String,
      enum: ['Veterinarian', 'Groomer'],
      default: function defaultRequiredRole() {
        return this.category === 'Grooming' ? 'Groomer' : 'Veterinarian';
      },
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
