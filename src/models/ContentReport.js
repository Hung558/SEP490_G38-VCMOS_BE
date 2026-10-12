const mongoose = require('mongoose');

// targetType → tên model để populate targetId
const TARGET_MODELS = { Post: 'CommunityPost', Comment: 'PostComment' };

const contentReportSchema = new mongoose.Schema(
  {
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: Object.keys(TARGET_MODELS), required: true },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: (doc) => TARGET_MODELS[doc.targetType],
    },
    reason: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Resolved'], default: 'Pending' },
    resolvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

contentReportSchema.index({ status: 1, createdAt: 1 });
contentReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('ContentReport', contentReportSchema, 'content_reports');
