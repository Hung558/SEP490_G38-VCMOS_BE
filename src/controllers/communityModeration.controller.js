const communityModerationService = require('../services/communityModeration.service');
const {
  validateObjectIdParam,
  validateAdminPostListQuery,
  validateModeratePostBody,
  validateAdminReportListQuery,
  validateResolveReportBody,
} = require('../validators/communityModeration.validator');

const sendValidationError = (res, errors, message = 'Dữ liệu không hợp lệ') =>
  res.status(400).json({ message, errors });

// GET /api/admin/community/posts (UC-57, SCR-33)
const listPosts = async (req, res, next) => {
  try {
    const queryCheck = validateAdminPostListQuery(req.query);
    if (!queryCheck.isValid) return sendValidationError(res, queryCheck.errors);

    const result = await communityModerationService.listPostsForModeration(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/admin/community/posts/:id/moderate (UC-58, SCR-33)
const moderatePost = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const bodyCheck = validateModeratePostBody(req.body);
    if (!bodyCheck.isValid) return sendValidationError(res, bodyCheck.errors);

    const post = await communityModerationService.moderatePendingPost(idCheck.value, bodyCheck.value);
    const message =
      bodyCheck.value.decision === 'Approve'
        ? 'Đã phê duyệt và đăng công khai bài viết'
        : 'Đã từ chối và ẩn bài viết';

    return res.status(200).json({ message, post });
  } catch (err) {
    return next(err);
  }
};

// GET /api/admin/community/reports (UC-59, SCR-33)
const listReports = async (req, res, next) => {
  try {
    const queryCheck = validateAdminReportListQuery(req.query);
    if (!queryCheck.isValid) return sendValidationError(res, queryCheck.errors);

    const result = await communityModerationService.listContentReports(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/admin/community/reports/:id/resolve (UC-59, SCR-33)
const resolveReport = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID báo cáo');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const bodyCheck = validateResolveReportBody(req.body);
    if (!bodyCheck.isValid) return sendValidationError(res, bodyCheck.errors);

    const result = await communityModerationService.resolveContentReport(
      idCheck.value,
      req.user.id,
      bodyCheck.value
    );

    const decisionMessages = {
      Keep: 'Đã giữ lại nội dung và đóng báo cáo vi phạm',
      Hide: 'Đã ẩn nội dung vi phạm và đóng báo cáo',
      Delete: 'Đã xoá nội dung vi phạm và đóng báo cáo',
    };

    return res.status(200).json({
      message: decisionMessages[bodyCheck.value.decision],
      ...result,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listPosts,
  moderatePost,
  listReports,
  resolveReport,
};
