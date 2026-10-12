const mongoose = require('mongoose');

const postLikeSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityPost', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

postLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('PostLike', postLikeSchema, 'post_likes');
