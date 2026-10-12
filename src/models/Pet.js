const mongoose = require('mongoose');

const petSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    species: String,
    breed: String,
    coatColor: String,
    photoUrl: String,
    notes: String,
    dob: Date,
    weight: { type: Number, min: 0 },
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
  },
  { timestamps: true }
);

petSchema.index({ ownerId: 1 });

module.exports = mongoose.model('Pet', petSchema, 'pets');
