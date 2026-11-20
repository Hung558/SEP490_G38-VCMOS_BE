const communityPostService = require('../services/communityPost.service');
const {
  validatePostPayload,
  validateListQuery,
  validatePublicListQuery,
  validateObjectIdParam,
} = require('../validators/communityPost.validator');

// Ảnh tải lên từ multer (nếu request là multipart): { image?: [file], timelineImages?: [file, ...] }
const extractFiles = (req) => {
  const files = req.files || {};
  return {
    image: files.image ? files.image[0] : undefined,
    timelineImages: files.timelineImages || [],
  };
};

const sendValidationError = (res, errors) =>
  res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });

// POST /api/community-posts
const create = async (req, res, next) => {
  try {
    const files = extractFiles(req);
    const { errors, value } = validatePostPayload(req.body, {
      timelineImageCount: files.timelineImages.length,
    });
    if (errors) return sendValidationError(res, errors);

    const post = await communityPostService.createPost(req.user.id, value, files);
    return res.status(201).json({
      message: 'Đã gửi bài viết, vui lòng chờ duyệt',
      post,
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts
const list = async (req, res, next) => {
  try {
    const { errors, value } = validateListQuery(req.query);
    if (errors) return sendValidationError(res, errors);

    const result = await communityPostService.listMyPosts(req.user.id, value);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts/:id
const getById = async (req, res, next) => {
  try {
    const idError = validateObjectIdParam(req.params.id);
    if (idError) return sendValidationError(res, { id: idError });

    const post = await communityPostService.getMyPost(req.params.id, req.user.id);
    return res.status(200).json({ post });
  } catch (err) {
    return next(err);
  }
};

// PUT /api/community-posts/:id
const update = async (req, res, next) => {
  try {
    const idError = validateObjectIdParam(req.params.id);
    if (idError) return sendValidationError(res, { id: idError });

    const files = extractFiles(req);
    const { errors, value } = validatePostPayload(req.body, {
      timelineImageCount: files.timelineImages.length,
    });
    if (errors) return sendValidationError(res, errors);

    const post = await communityPostService.updateMyPost(req.params.id, req.user.id, value, files);
    return res.status(200).json({ message: 'Cập nhật bài viết thành công', post });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/community-posts/:id
const remove = async (req, res, next) => {
  try {
    const idError = validateObjectIdParam(req.params.id);
    if (idError) return sendValidationError(res, { id: idError });

    await communityPostService.deleteMyPost(req.params.id, req.user.id);
    return res.status(200).json({ message: 'Đã xoá bài viết' });
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts/public (Guest + PetOwner, không cần đăng nhập)
const listPublished = async (req, res, next) => {
  try {
    const { errors, value } = validatePublicListQuery(req.query);
    if (errors) return sendValidationError(res, errors);

    const result = await communityPostService.listPublishedPosts(value);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
};

// GET /api/community-posts/public/:id (Guest + PetOwner, không cần đăng nhập)
const getPublishedById = async (req, res, next) => {
  try {
    const idError = validateObjectIdParam(req.params.id);
    if (idError) return sendValidationError(res, { id: idError });

    const post = await communityPostService.getPublishedPost(req.params.id);
    return res.status(200).json({ post });
  } catch (err) {
    return next(err);
  }
};

module.exports = { create, list, getById, update, remove, listPublished, getPublishedById };