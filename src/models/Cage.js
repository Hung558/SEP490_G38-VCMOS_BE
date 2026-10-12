const mongoose = require('mongoose');

const cageSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['Available', 'Occupied'], default: 'Available' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cage', cageSchema, 'cages');
