const mongoose = require('mongoose');

const timelineItemSchema = new mongoose.Schema({
  date: String,
  title: String,
  imageUrl: String,
});

const communityPostSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    petId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', default: null },
    postType: { type: String, enum: ['TimelineShare', 'Discussion'], required: true },
    content: String,
    imageUrl: String,
    moderationNote: String,
    timelineItems: { type: [timelineItemSchema], default: [] },
    status: {
      type: String,
      enum: ['PendingReview', 'Published', 'Hidden', 'Removed'],
      default: 'PendingReview',
    },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

communityPostSchema.index({ status: 1, createdAt: -1 });
communityPostSchema.index({ authorId: 1 });

module.exports = mongoose.model('CommunityPost', communityPostSchema, 'community_posts');
