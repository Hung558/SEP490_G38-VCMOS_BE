const CommunityPost = require('../models/CommunityPost');
const PostComment = require('../models/PostComment');
const ContentReport = require('../models/ContentReport');
const { syncPostCommentCount } = require('./communityInteraction.service');

const ADMIN_AUTHOR_POPULATE = { path: 'authorId', select: 'code fullName phone' };
const ADMIN_PET_POPULATE = { path: 'petId', select: 'code name species breed photoUrl' };

// Các mẫu từ khoá gợi ý phát hiện thông tin y tế/giá cả nhạy cảm để tô sáng cho Admin duyệt (T-53, UC-58)
const SENSITIVE_PATTERNS = [
  /\b\d[\d.,]*\s*(?:đ|vnđ|vnd|k|nghìn|ngàn|triệu)\b/gi,
  /(?:giá tiền|chi phí|hóa đơn|hoá đơn|thanh toán|tổng tiền)/gi,
  /(?:bệnh án|chẩn đoán|đơn thuốc|kê đơn|liều lượng|kháng sinh|tiêm tĩnh mạch|soap)/gi,
  /\b\d+(?:[.,]\d+)?\s*(?:mg|ml|viên\/ngày)\b/gi,
];

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

/**
 * Quét nhanh nội dung bài viết và tiêu đề các mốc timeline để cảnh báo từ khóa y tế/giá cả cho Admin (T-53).
 */
const detectSensitiveKeywords = (post) => {
  const texts = [
    post.content || '',
    ...(post.timelineItems || []).map((item) => item.title || ''),
  ];
  const combined = texts.join(' ');
  const found = new Set();

  for (const regex of SENSITIVE_PATTERNS) {
    const matches = combined.match(regex);
    if (matches) {
      for (const word of matches) {
        found.add(word.trim());
      }
    }
  }

  const sensitiveMatches = Array.from(found);
  return {
    hasSensitiveKeywords: sensitiveMatches.length > 0,
    sensitiveMatches,
  };
};

/**
 * 1. Hàng đợi kiểm duyệt bài viết & lịch sử duyệt cho Admin (GET /api/admin/community/posts — UC-57, SCR-33)
 */
const listPostsForModeration = async ({ page, limit, status, postType }) => {
  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (postType) filter.postType = postType;

  // Bài chờ duyệt xếp cũ -> mới (FIFO công bằng); lịch sử/khác xếp mới -> cũ
  const sortOrder = status === 'PendingReview' ? { createdAt: 1, _id: 1 } : { updatedAt: -1, _id: -1 };

  const [rawPosts, total] = await Promise.all([
    CommunityPost.find(filter)
      .sort(sortOrder)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(ADMIN_AUTHOR_POPULATE)
      .populate(ADMIN_PET_POPULATE)
      .lean(),
    CommunityPost.countDocuments(filter),
  ]);

  const posts = rawPosts.map((post) => ({
    ...post,
    ...detectSensitiveKeywords(post),
  }));

  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

/**
 * 2. Admin phê duyệt (Approve -> Published) hoặc từ chối (Reject -> Hidden + lý do) bài viết chờ duyệt (UC-58)
 */
const moderatePendingPost = async (postId, { decision, moderationNote }) => {
  const existing = await CommunityPost.findById(postId).select('_id status').lean();
  if (!existing) {
    throw httpError(404, 'Không tìm thấy bài viết');
  }
  if (existing.status !== 'PendingReview') {
    throw httpError(409, `Bài viết hiện ở trạng thái "${existing.status}", chỉ có thể kiểm duyệt bài đang chờ duyệt`);
  }

  const nextStatus = decision === 'Approve' ? 'Published' : 'Hidden';
  const updateData = {
    status: nextStatus,
    moderationNote: moderationNote || null,
  };

  const updated = await CommunityPost.findOneAndUpdate(
    { _id: postId, status: 'PendingReview' },
    { $set: updateData },
    { returnDocument: 'after' }
  )
    .populate(ADMIN_AUTHOR_POPULATE)
    .populate(ADMIN_PET_POPULATE)
    .lean();

  if (!updated) {
    throw httpError(409, 'Bài viết đã được xử lý trước đó');
  }

  return updated;
};

/**
 * 3. Danh sách báo cáo vi phạm cho Admin (GET /api/admin/community/reports — UC-59, SCR-33)
 * - Kèm ngữ cảnh nội dung bị báo cáo (bài viết hoặc bình luận + bài cha) và tổng số lượt báo cáo trên nội dung đó.
 */
const listContentReports = async ({ page, limit, status, targetType }) => {
  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (targetType) filter.targetType = targetType;

  const sortOrder = status === 'Pending' ? { createdAt: 1, _id: 1 } : { updatedAt: -1, _id: -1 };

  const [rawReports, total] = await Promise.all([
    ContentReport.find(filter)
      .sort(sortOrder)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('reporterId', 'code fullName')
      .populate('resolvedById', 'code fullName')
      .lean(),
    ContentReport.countDocuments(filter),
  ]);

  const postTargetIds = [];
  const commentTargetIds = [];
  for (const report of rawReports) {
    if (report.targetType === 'Post') postTargetIds.push(report.targetId);
    else if (report.targetType === 'Comment') commentTargetIds.push(report.targetId);
  }

  const allTargetIds = rawReports.map((r) => r.targetId);

  // Gom dữ liệu mục tiêu và đếm tổng số lượt báo cáo theo lô (tránh N+1 query)
  const [posts, comments, reportCountsAgg] = await Promise.all([
    postTargetIds.length > 0
      ? CommunityPost.find({ _id: { $in: postTargetIds } })
          .populate(ADMIN_AUTHOR_POPULATE)
          .populate(ADMIN_PET_POPULATE)
          .lean()
      : [],
    commentTargetIds.length > 0
      ? PostComment.find({ _id: { $in: commentTargetIds } })
          .populate(ADMIN_AUTHOR_POPULATE)
          .populate('postId', 'postType content status authorId')
          .lean()
      : [],
    allTargetIds.length > 0
      ? ContentReport.aggregate([
          { $match: { targetId: { $in: allTargetIds } } },
          { $group: { _id: { targetType: '$targetType', targetId: '$targetId' }, count: { $sum: 1 } } },
        ])
      : [],
  ]);

  const postMap = new Map(posts.map((p) => [String(p._id), p]));
  const commentMap = new Map(comments.map((c) => [String(c._id), c]));
  const countMap = new Map(
    reportCountsAgg.map((row) => [`${row._id.targetType}:${String(row._id.targetId)}`, row.count])
  );

  const reports = rawReports.map((report) => {
    const key = `${report.targetType}:${String(report.targetId)}`;
    const target =
      report.targetType === 'Post'
        ? postMap.get(String(report.targetId)) || null
        : commentMap.get(String(report.targetId)) || null;

    return {
      ...report,
      target,
      reportCount: countMap.get(key) || 1,
    };
  });

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

/**
 * 4. Admin xử lý báo cáo vi phạm (PATCH /api/admin/community/reports/:id/resolve — UC-59)
 * - Áp dụng quyết định Keep / Hide / Delete lên bài viết hoặc bình luận bị báo cáo.
 * - Đánh dấu Resolved cho toàn bộ báo cáo đang Pending của cùng 1 nội dung đó (đúng SRS UC-59).
 */
const resolveContentReport = async (reportId, adminId, { decision, note }) => {
  const report = await ContentReport.findById(reportId).lean();
  if (!report) {
    throw httpError(404, 'Không tìm thấy báo cáo vi phạm');
  }
  if (report.status === 'Resolved') {
    throw httpError(409, 'Báo cáo vi phạm này đã được xử lý trước đó');
  }

  let targetSummary = null;

  if (report.targetType === 'Post') {
    if (decision === 'Hide' || decision === 'Delete') {
      const nextStatus = decision === 'Hide' ? 'Hidden' : 'Removed';
      targetSummary = await CommunityPost.findByIdAndUpdate(
        report.targetId,
        { $set: { status: nextStatus, moderationNote: note } },
        { returnDocument: 'after' }
      )
        .select('_id status moderationNote')
        .lean();
    } else {
      targetSummary = await CommunityPost.findById(report.targetId)
        .select('_id status moderationNote')
        .lean();
    }
  } else if (report.targetType === 'Comment') {
    if (decision === 'Hide' || decision === 'Delete') {
      const nextStatus = decision === 'Hide' ? 'Hidden' : 'Deleted';
      targetSummary = await PostComment.findByIdAndUpdate(
        report.targetId,
        { $set: { status: nextStatus } },
        { returnDocument: 'after' }
      )
        .select('_id postId status')
        .lean();
      if (targetSummary?.postId) {
        await syncPostCommentCount(targetSummary.postId);
      }
    } else {
      targetSummary = await PostComment.findById(report.targetId)
        .select('_id postId status')
        .lean();
    }
  }

  // SRS UC-59: Đóng (Resolved) toàn bộ các báo cáo đang Pending cùng trỏ tới nội dung này
  const bulkResult = await ContentReport.updateMany(
    {
      targetType: report.targetType,
      targetId: report.targetId,
      status: 'Pending',
    },
    {
      $set: {
        status: 'Resolved',
        resolvedById: adminId,
      },
    }
  );

  const updatedReport = await ContentReport.findById(reportId)
    .populate('reporterId', 'code fullName')
    .populate('resolvedById', 'code fullName')
    .lean();

  return {
    decision,
    note: note || null,
    resolvedCount: bulkResult.modifiedCount || 1,
    target: targetSummary,
    report: updatedReport,
  };
};

module.exports = {
  detectSensitiveKeywords,
  listPostsForModeration,
  moderatePendingPost,
  listContentReports,
  resolveContentReport,
};
