const communityInteractionService = require('../services/communityInteraction.service');
const {
  validateObjectIdParam,
  validateCommentListQuery,
  validateCreateComment,
  validateCreateReport,
} = require('../validators/communityInteraction.validator');

const sendValidationError = (res, errors, message = 'Dữ liệu không hợp lệ') =>
  res.status(400).json({ message, errors });

// PATCH /api/community-posts/:id/withdraw (UC-50)
const withdrawPost = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const post = await communityInteractionService.withdrawMyPost(idCheck.value, req.user.id);
    return res.status(200).json({
      message: 'Đã thu hồi bài viết khỏi cộng đồng',
      post,
    });
  } catch (err) {
    return next(err);
  }
};

// POST /api/community-posts/:id/like (UC-53, BR-19)
const toggleLike = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const result = await communityInteractionService.toggleLikePost(idCheck.value, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts/:id/like-status
const getLikeStatus = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const result = await communityInteractionService.getMyLikeStatus(idCheck.value, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts/:id/comments (Public)
const listComments = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const queryCheck = validateCommentListQuery(req.query);
    if (!queryCheck.isValid) return sendValidationError(res, queryCheck.errors);

    const result = await communityInteractionService.listPostComments(idCheck.value, queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// POST /api/community-posts/:id/comments (UC-54, UC-55, BR-19)
const createComment = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID bài viết');
    if (!idCheck.isValid) return sendValidationError(res, { id: idCheck.message }, idCheck.message);

    const bodyCheck = validateCreateComment(req.body);
    if (!bodyCheck.isValid) return sendValidationError(res, bodyCheck.errors);

    const result = await communityInteractionService.createComment(
      idCheck.value,
      req.user.id,
      bodyCheck.value
    );
    return res.status(201).json({
      message: 'Đã gửi bình luận',
      ...result,
    });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/community-posts/comments/:commentId
const deleteComment = async (req, res, next) => {
  try {
    const idCheck = validateObjectIdParam(req.params.commentId, 'ID bình luận');
    if (!idCheck.isValid) return sendValidationError(res, { commentId: idCheck.message }, idCheck.message);

    const result = await communityInteractionService.deleteMyComment(idCheck.value, req.user.id);
    return res.status(200).json({
      message: 'Đã xoá bình luận',
      ...result,
    });
  } catch (err) {
    return next(err);
  }
};

// POST /api/community-posts/reports (UC-56)
const createReport = async (req, res, next) => {
  try {
    const bodyCheck = validateCreateReport(req.body);
    if (!bodyCheck.isValid) return sendValidationError(res, bodyCheck.errors);

    const report = await communityInteractionService.createContentReport(req.user.id, bodyCheck.value);
    return res.status(201).json({
      message: 'Cảm ơn bạn. Báo cáo đã được gửi đến quản trị viên',
      report,
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  withdrawPost,
  toggleLike,
  getLikeStatus,
  listComments,
  createComment,
  deleteComment,
  createReport,
};
