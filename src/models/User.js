const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    isEmailVerified: { type: Boolean, default: false },
    emailOtpHash: { type: String, default: null, select: false },
    emailOtpExpiresAt: { type: Date, default: null, select: false },
    passwordHash: { type: String, default: null, select: false },
    role: {
      type: String,
      enum: ['PetOwner', 'Receptionist', 'Veterinarian', 'Groomer', 'Admin'],
      default: 'PetOwner',
    },
    status: { type: String, enum: ['Active', 'Inactive', 'Locked'], default: 'Active' },
  },
  { timestamps: true }
);

// unique khi có email (sparse vẫn đụng nhau nếu email bị set null, nên dùng partial)
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });

module.exports = mongoose.model('User', userSchema, 'users');
