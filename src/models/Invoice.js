const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  type: { type: String, enum: ['Service', 'Product', 'InpatientDay'], required: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemNameSnapshot: String,
  unitPriceSnapshot: { type: Number, min: 0 },
  quantity: { type: Number, min: 0, default: 1 },
  subtotal: { type: Number, min: 0 },
});

const invoiceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'AppointmentOrder', default: null },
    inpatientRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'InpatientRecord', default: null },
    issuedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [invoiceItemSchema], default: [] },
    totalAmount: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, enum: ['Cash', 'VNPay', null], default: null },
    paymentStatus: { type: String, enum: ['Unpaid', 'Paid', 'Refunded'], default: 'Unpaid' },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    vnpayTxnRef: { type: String, default: null },
  },
  { timestamps: true }
);

// "unique sparse": sparse vẫn index giá trị null → nhiều invoice có null sẽ bị trùng key,
// nên dùng partial theo $type để chỉ unique khi field có giá trị thật.
invoiceSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } }
);
invoiceSchema.index(
  { inpatientRecordId: 1 },
  { unique: true, partialFilterExpression: { inpatientRecordId: { $type: 'objectId' } } }
);
invoiceSchema.index(
  { vnpayTxnRef: 1 },
  { unique: true, partialFilterExpression: { vnpayTxnRef: { $type: 'string' } } }
);

module.exports = mongoose.model('Invoice', invoiceSchema, 'invoices');
