const CommunityPost = require('../models/CommunityPost');
const PostLike = require('../models/PostLike');
const PostComment = require('../models/PostComment');
const ContentReport = require('../models/ContentReport');

// Chỉ trả tên hiển thị của tác giả bình luận, tuyệt đối không lộ SĐT/email
const PUBLIC_AUTHOR_POPULATE = { path: 'authorId', select: 'fullName' };

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

// Đếm lại số like thật từ PostLike để không bao giờ bị lệch khi nhiều người bấm cùng lúc
const syncPostLikeCount = async (postId) => {
  const likeCount = await PostLike.countDocuments({ postId });
  await CommunityPost.updateOne({ _id: postId }, { $set: { likeCount } });
  return likeCount;
};

// Đếm lại số bình luận đang hiển thị (Published) trên bài viết
const syncPostCommentCount = async (postId) => {
  const commentCount = await PostComment.countDocuments({ postId, status: 'Published' });
  await CommunityPost.updateOne({ _id: postId }, { $set: { commentCount } });
  return commentCount;
};

// Kiểm tra bài viết có tồn tại và đang công khai (Published) để cho phép tương tác
const ensurePublishedPost = async (postId) => {
  const post = await CommunityPost.findOne({ _id: postId, status: 'Published' })
    .select('_id authorId status likeCount commentCount')
    .lean();
  if (!post) {
    throw httpError(404, 'Không tìm thấy bài viết');
  }
  return post;
};

/**
 * 1. Thu hồi bài viết / bài chia sẻ đã đăng (UC-50, SCR-08, SCR-14)
 * - Cho phép PetOwner tự gỡ bài của chính mình kể cả khi bài đã Published (hoặc đang PendingReview).
 * - Chuyển trạng thái sang Removed (xoá mềm), không xoá vật lý khỏi DB.
 * - Không cho tự thu hồi bài đang bị Admin ẩn do vi phạm (Hidden) hoặc đã gỡ sẵn (Removed).
 */
const withdrawMyPost = async (postId, authorId) => {
  const existing = await CommunityPost.findOne({ _id: postId, authorId })
    .select('_id status')
    .lean();

  if (!existing) {
    throw httpError(404, 'Không tìm thấy bài viết');
  }
  if (existing.status === 'Removed') {
    throw httpError(409, 'Bài viết đã được thu hồi trước đó');
  }
  if (existing.status === 'Hidden') {
    throw httpError(409, 'Bài viết đang bị quản trị viên ẩn, không thể tự thu hồi');
  }

  const updated = await CommunityPost.findOneAndUpdate(
    { _id: postId, authorId, status: { $in: ['PendingReview', 'Published'] } },
    { $set: { status: 'Removed' } },
    { returnDocument: 'after' }
  ).lean();

  if (!updated) {
    throw httpError(409, 'Không thể thu hồi bài viết ở trạng thái hiện tại');
  }

  return updated;
};

/**
 * 2. Thả tim / Bỏ thích bài viết Published (UC-53, BR-19)
 * - Dùng cơ chế toggle với unique index (postId, userId) trong PostLike: mỗi user thích tối đa 1 lần/bài.
 */
const toggleLikePost = async (postId, userId) => {
  await ensurePublishedPost(postId);

  const deleted = await PostLike.findOneAndDelete({ postId, userId }).lean();
  if (deleted) {
    const likeCount = await syncPostLikeCount(postId);
    return { liked: false, likeCount, message: 'Đã bỏ thích bài viết' };
  }

  try {
    await PostLike.create({ postId, userId });
  } catch (err) {
    // Nếu 2 request bấm thích cùng lúc chạm unique index 11000 -> vẫn tính là đã thích hợp lệ
    if (err.code !== 11000) throw err;
  }

  const likeCount = await syncPostLikeCount(postId);
  return { liked: true, likeCount, message: 'Đã thích bài viết' };
};

/**
 * 2b. Kiểm tra trạng thái đã thích của user hiện tại trên 1 bài Published
 */
const getMyLikeStatus = async (postId, userId) => {
  const post = await ensurePublishedPost(postId);
  const existing = await PostLike.exists({ postId, userId });
  return { liked: Boolean(existing), likeCount: post.likeCount || 0 };
};

/**
 * 3. Xem danh sách bình luận & trả lời cấp 1 của bài viết Published (UC-54, UC-55, BR-19)
 * - Mở công khai cho cả Guest và người dùng đã đăng nhập.
 * - Bình luận gốc xếp mới nhất lên đầu (hoặc theo phân trang), các câu trả lời xếp cũ -> mới để đọc đúng mạch.
 */
const listPostComments = async (postId, { page, limit }) => {
  await ensurePublishedPost(postId);

  const rootFilter = { postId, parentCommentId: null, status: 'Published' };

  const [rootComments, total] = await Promise.all([
    PostComment.find(rootFilter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(PUBLIC_AUTHOR_POPULATE)
      .lean(),
    PostComment.countDocuments(rootFilter),
  ]);

  const rootIds = rootComments.map((comment) => comment._id);

  // Gom toàn bộ reply cấp 1 của các bình luận gốc trong 1 truy vấn duy nhất (tránh N+1)
  const replies =
    rootIds.length > 0
      ? await PostComment.find({
          postId,
          parentCommentId: { $in: rootIds },
          status: 'Published',
        })
          .sort({ createdAt: 1, _id: 1 })
          .populate(PUBLIC_AUTHOR_POPULATE)
          .lean()
      : [];

  const repliesByParentId = new Map();
  for (const reply of replies) {
    const key = String(reply.parentCommentId);
    if (!repliesByParentId.has(key)) repliesByParentId.set(key, []);
    repliesByParentId.get(key).push(reply);
  }

  const comments = rootComments.map((comment) => ({
    ...comment,
    replies: repliesByParentId.get(String(comment._id)) || [],
  }));

  return {
    comments,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

/**
 * 4. Tạo bình luận mới hoặc trả lời bình luận 1 cấp (UC-54, UC-55, BR-19)
 * - Chặn trả lời lồng quá 1 cấp (nếu bình luận cha đã có parentCommentId != null -> 400).
 */
const createComment = async (postId, authorId, { content, parentCommentId }) => {
  await ensurePublishedPost(postId);

  if (parentCommentId) {
    const parentComment = await PostComment.findOne({
      _id: parentCommentId,
      postId,
      status: 'Published',
    })
      .select('_id parentCommentId')
      .lean();

    if (!parentComment) {
      throw httpError(404, 'Không tìm thấy bình luận gốc để trả lời');
    }

    // BR-19: Chỉ cho phép lồng tối đa 1 cấp dưới bình luận gốc
    if (parentComment.parentCommentId) {
      throw httpError(400, 'Chỉ hỗ trợ trả lời bình luận tối đa 1 cấp (BR-19)', {
        parentCommentId: 'Không thể trả lời tiếp một bình luận đã là câu trả lời',
      });
    }
  }

  const created = await PostComment.create({
    postId,
    authorId,
    parentCommentId: parentCommentId || null,
    content,
    status: 'Published',
  });

  const [populated, commentCount] = await Promise.all([
    created.populate(PUBLIC_AUTHOR_POPULATE),
    syncPostCommentCount(postId),
  ]);

  return { comment: populated.toObject(), commentCount };
};

/**
 * 5. Tác giả tự xoá mềm bình luận của chính mình (chuyển status -> Deleted)
 */
const deleteMyComment = async (commentId, userId) => {
  const existing = await PostComment.findById(commentId)
    .select('_id postId authorId status')
    .lean();

  if (!existing) {
    throw httpError(404, 'Không tìm thấy bình luận');
  }
  if (String(existing.authorId) !== String(userId)) {
    throw httpError(403, 'Bạn chỉ có thể xoá bình luận của chính mình');
  }
  if (existing.status !== 'Published') {
    throw httpError(409, 'Bình luận này đã bị xoá hoặc bị ẩn trước đó');
  }

  await PostComment.updateOne({ _id: commentId }, { $set: { status: 'Deleted' } });
  const commentCount = await syncPostCommentCount(existing.postId);

  return { commentCount };
};

/**
 * 6. Gửi báo cáo vi phạm bài viết hoặc bình luận (UC-56)
 * - Chặn tự báo cáo nội dung của chính mình.
 * - Mỗi user chỉ báo cáo tối đa 1 lần cho cùng 1 đối tượng (unique index -> 409).
 */
const createContentReport = async (reporterId, { targetType, targetId, reason }) => {
  if (targetType === 'Post') {
    const post = await CommunityPost.findOne({ _id: targetId, status: 'Published' })
      .select('_id authorId')
      .lean();
    if (!post) {
      throw httpError(404, 'Không tìm thấy bài viết để báo cáo');
    }
    if (String(post.authorId) === String(reporterId)) {
      throw httpError(400, 'Bạn không thể tự báo cáo bài viết của chính mình');
    }
  } else {
    const comment = await PostComment.findOne({ _id: targetId, status: 'Published' })
      .select('_id authorId')
      .lean();
    if (!comment) {
      throw httpError(404, 'Không tìm thấy bình luận để báo cáo');
    }
    if (String(comment.authorId) === String(reporterId)) {
      throw httpError(400, 'Bạn không thể tự báo cáo bình luận của chính mình');
    }
  }

  try {
    const report = await ContentReport.create({
      reporterId,
      targetType,
      targetId,
      reason,
      status: 'Pending',
    });
    return report.toObject();
  } catch (err) {
    if (err.code === 11000) {
      throw httpError(409, 'Bạn đã báo cáo nội dung này trước đó');
    }
    throw err;
  }
};

module.exports = {
  syncPostCommentCount,
  withdrawMyPost,
  toggleLikePost,
  getMyLikeStatus,
  listPostComments,
  createComment,
  deleteMyComment,
  createContentReport,
};
