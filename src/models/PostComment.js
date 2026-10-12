const mongoose = require('mongoose');

const postCommentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', default: null },
    content: { type: String, required: true },
    status: { type: String, enum: ['Published', 'Deleted', 'Hidden'], default: 'Published' },
  },
  { timestamps: true }
);

postCommentSchema.index({ postId: 1, createdAt: 1 });

module.exports = mongoose.model('PostComment', postCommentSchema, 'post_comments');
