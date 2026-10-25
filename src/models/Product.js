const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ['Medicine', 'Vaccine', 'Retail'], required: true },
    unit: { type: String, required: true, trim: true },
    unitPrice: { type: Number, min: 0 },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

productSchema.index({ name: 1, unit: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema, 'products');
