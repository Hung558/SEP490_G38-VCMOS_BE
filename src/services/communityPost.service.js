const CommunityPost = require('../models/CommunityPost');
const Pet = require('../models/Pet');
const cloudinary = require('../config/cloudinary');

// PetOwner chỉ được sửa / xoá bài của chính mình khi còn chờ duyệt.
// Sau khi Admin/Receptionist xử lý (Published/Hidden/Removed) bài bị khoá, owner không sửa/xoá được nữa.
const MANAGEABLE_STATUS = 'PendingReview';
const DELETED_STATUS = 'Removed'; // xoá mềm: chuyển sang Removed, không xoá khỏi DB

const CLOUDINARY_FOLDER = 'vcmos/community-posts';
const PET_POPULATE = { path: 'petId', select: 'code name species photoUrl' };

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

/**
 * Đẩy một ảnh (buffer từ multer memoryStorage) lên Cloudinary.
 * @returns {Promise<string>} secure URL (https) của ảnh
 */
const uploadImageBuffer = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          return reject(httpError(502, 'Không thể tải ảnh lên, vui lòng thử lại sau'));
        }
        return resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });

// Thú cưng gắn vào bài phải thuộc về chính người đăng và chưa bị xoá
const ensureOwnedPet = async (petId, ownerId) => {
  if (!petId) return;
  const exists = await Pet.exists({ _id: petId, ownerId, status: 'Active' });
  if (!exists) {
    throw httpError(400, 'Dữ liệu không hợp lệ', {
      petId: 'Không tìm thấy thú cưng của bạn',
    });
  }
};

// Phân biệt "không tồn tại / không phải của mình" (404) với "không còn ở trạng thái chờ duyệt" (409)
const throwNotManageable = async (postId, authorId) => {
  const owned = await CommunityPost.exists({ _id: postId, authorId });
  if (!owned) throw httpError(404, 'Không tìm thấy bài viết');
  throw httpError(409, 'Chỉ có thể thao tác với bài viết đang chờ duyệt');
};

// Lấy bài đang chờ duyệt của chính mình (kèm ảnh hiện có để cho phép giữ lại khi cập nhật)
const getManageablePost = async (postId, authorId) => {
  const post = await CommunityPost.findOne({
    _id: postId,
    authorId,
    status: MANAGEABLE_STATUS,
  })
    .select('imageUrl timelineItems')
    .lean();

  if (!post) await throwNotManageable(postId, authorId);
  return post;
};

/**
 * Xử lý ảnh của bài viết. Mọi ảnh mới đều phải tải lên (multipart) và được đưa lên Cloudinary.
 * - `image` là ảnh chính; mốc timeline dùng `timelineImages[imageIndex]`. Chỉ tải những ảnh thực sự được dùng.
 * - `imageUrl` (bài hoặc mốc) chỉ được dùng để GIỮ LẠI ảnh đang có của chính bài này khi cập nhật,
 *   nên phải trùng URL đang lưu; URL tuỳ ý bên ngoài bị từ chối. Không có ảnh = ảnh bị gỡ.
 */
const attachUploadedImages = async (data, { image, timelineImages = [] } = {}, existingPost = null) => {
  const keepable = new Set(
    existingPost
      ? [existingPost.imageUrl, ...(existingPost.timelineItems || []).map((item) => item.imageUrl)].filter(Boolean)
      : []
  );

  const errors = {};
  const message = 'Chỉ có thể giữ lại ảnh đang có của bài viết, ảnh mới phải được tải lên';
  if (!image && data.imageUrl && !keepable.has(data.imageUrl)) {
    errors.imageUrl = message;
  }
  const invalidTimeline = data.timelineItems.some(
    (item) => item.imageIndex === undefined && item.imageUrl && !keepable.has(item.imageUrl)
  );
  if (invalidTimeline) {
    errors.timelineItems = message;
  }
  if (Object.keys(errors).length > 0) {
    throw httpError(400, 'Dữ liệu không hợp lệ', errors);
  }

  const timelineUploads = new Map(); // imageIndex → Promise<url>, một ảnh dùng cho nhiều mốc chỉ tải 1 lần
  const uploadTimelineImage = (index) => {
    if (!timelineUploads.has(index)) {
      timelineUploads.set(index, uploadImageBuffer(timelineImages[index].buffer));
    }
    return timelineUploads.get(index);
  };

  const [imageUrl, timelineItems] = await Promise.all([
    image ? uploadImageBuffer(image.buffer) : data.imageUrl,
    Promise.all(
      data.timelineItems.map(async ({ imageIndex, ...item }) => {
        if (imageIndex === undefined) return item;
        return { ...item, imageUrl: await uploadTimelineImage(imageIndex) };
      })
    ),
  ]);

  return { ...data, imageUrl, timelineItems };
};

const createPost = async (authorId, data, files) => {
  await ensureOwnedPet(data.petId, authorId);
  const payload = await attachUploadedImages(data, files);

  const post = await CommunityPost.create({
    ...payload,
    authorId,
    status: MANAGEABLE_STATUS, // luôn ép PendingReview, không tin client
  });

  return post.populate(PET_POPULATE);
};

// status không truyền = tất cả trạng thái
const listMyPosts = async (authorId, { page, limit, postType, status }) => {
  const filter = { authorId };
  if (postType) filter.postType = postType;
  if (status) filter.status = status;

  const [posts, total] = await Promise.all([
    CommunityPost.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(PET_POPULATE)
      .lean(),
    CommunityPost.countDocuments(filter),
  ]);

  return {
    posts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const getMyPost = async (postId, authorId) => {
  const post = await CommunityPost.findOne({ _id: postId, authorId })
    .populate(PET_POPULATE)
    .lean();

  if (!post) throw httpError(404, 'Không tìm thấy bài viết');
  return post;
};

const updateMyPost = async (postId, authorId, data, files) => {
  await ensureOwnedPet(data.petId, authorId);
  // Kiểm tra trước khi tải ảnh để không tốn upload cho bài không còn sửa được
  const existingPost = await getManageablePost(postId, authorId);
  const payload = await attachUploadedImages(data, files, existingPost);

  // Điều kiện status nằm trong filter của update để tránh race với lúc moderator duyệt bài
  const post = await CommunityPost.findOneAndUpdate(
    { _id: postId, authorId, status: MANAGEABLE_STATUS },
    { $set: payload },
    { new: true, runValidators: true }
  ).populate(PET_POPULATE);

  if (!post) await throwNotManageable(postId, authorId);
  return post;
};

// Xoá mềm: đổi status sang Removed
const deleteMyPost = async (postId, authorId) => {
  const post = await CommunityPost.findOneAndUpdate(
    { _id: postId, authorId, status: MANAGEABLE_STATUS },
    { $set: { status: DELETED_STATUS } },
    { new: true }
  );

  if (!post) await throwNotManageable(postId, authorId);
};

// ===== Public feed (Guest + PetOwner): chỉ bài đã duyệt =====
const PUBLISHED_STATUS = 'Published';
// moderationNote là ghi chú nội bộ của người duyệt → không trả ra ngoài
const PUBLIC_POST_FIELDS = '-moderationNote';
// Chỉ lộ tên hiển thị của tác giả, tuyệt đối không trả phone/email/code
const PUBLIC_AUTHOR_POPULATE = { path: 'authorId', select: 'fullName' };
// Không lộ code của thú cưng; nếu thú cưng đã bị xoá thì petId trả về null
const PUBLIC_PET_POPULATE = {
  path: 'petId',
  select: 'name species breed photoUrl',
  match: { status: 'Active' },
};

const listPublishedPosts = async ({ page, limit, postType }) => {
  const filter = { status: PUBLISHED_STATUS };
  if (postType) filter.postType = postType;

  const [posts, total] = await Promise.all([
    CommunityPost.find(filter)
      .select(PUBLIC_POST_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(PUBLIC_AUTHOR_POPULATE)
      .populate(PUBLIC_PET_POPULATE)
      .lean(),
    CommunityPost.countDocuments(filter),
  ]);

  return {
    posts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// Bài không tồn tại và bài chưa/không còn Published đều trả 404 để không lộ sự tồn tại của bài bị ẩn
const getPublishedPost = async (postId) => {
  const post = await CommunityPost.findOne({ _id: postId, status: PUBLISHED_STATUS })
    .select(PUBLIC_POST_FIELDS)
    .populate(PUBLIC_AUTHOR_POPULATE)
    .populate(PUBLIC_PET_POPULATE)
    .lean();

  if (!post) throw httpError(404, 'Không tìm thấy bài viết');
  return post;
};

module.exports = {
  createPost,
  listMyPosts,
  getMyPost,
  updateMyPost,
  deleteMyPost,
  listPublishedPosts,
  getPublishedPost,
};