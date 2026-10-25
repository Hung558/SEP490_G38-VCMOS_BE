const mongoose = require('mongoose');

const cageSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, unique: true, trim: true },
    size: { type: String, enum: ['S', 'M', 'L', 'XL'], required: true },
    isIsolated: { type: Boolean, default: false },
    status: { type: String, enum: ['Available', 'Occupied'], default: 'Available' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cage', cageSchema, 'cages');
