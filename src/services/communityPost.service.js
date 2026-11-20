const CommunityPost = require('../models/CommunityPost');
const Pet = require('../models/Pet');
const cloudinary = require('../config/cloudinary');
const { getShareablePetHistory } = require('./petTimeline.service');

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

// ===== Chia sẻ hành trình từ lịch sử khám (tự động ẩn thông tin nhạy cảm) =====
// Dữ liệu lấy từ getShareablePetHistory (petTimeline.service): hàm nhẹ, đã kiểm tra quyền sở hữu (BR-23)
// và chỉ select đúng các trường dùng để chia sẻ (ngày đơn, tên dịch vụ Done, ảnh before/after). Nó không đọc
// MedicalRecord (SOAP, đơn thuốc), Invoice (giá tiền), intake/note của đơn... nên không có gì nhạy cảm để lọt.
// toShareableMilestone vẫn dựng object MỚI từ đầu (không spread) như một lớp bảo vệ thứ hai.
const MAX_TIMELINE_ITEMS = 50;
const MAX_TITLE_LENGTH = 200;
const FALLBACK_MILESTONE_TITLE = 'Lượt khám tại phòng khám';

const toSafePhotoUrl = (value) =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : undefined;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// Đơn Done (từ getShareablePetHistory) → mốc được phép công khai
const toShareableMilestone = (order) => {
  const services = [...new Set((order.services || []).map((svc) => svc.name).filter(Boolean))];

  // Ảnh đại diện: dịch vụ đầu tiên có ảnh (thường là Grooming); ưu tiên ảnh sau, không có thì ảnh trước
  const imageUrl = (order.services || [])
    .map((svc) => toSafePhotoUrl(svc.afterPhotoUrl) || toSafePhotoUrl(svc.beforePhotoUrl))
    .find(Boolean);

  return {
    orderId: order.orderId,
    orderCode: order.code,
    date: order.date,
    title: truncate(services.join(', ') || FALLBACK_MILESTONE_TITLE, MAX_TITLE_LENGTH),
    services,
    imageUrl,
  };
};

/**
 * Dựng các mốc hành trình (đã lọc dữ liệu nhạy cảm) từ các đơn khám Done của thú cưng.
 * @param {{ id: string, role: string }} currentUser  người gọi API (PetOwner)
 * @param {string} petId
 * @param {string[]} [orderIds]  chỉ lấy các đơn này; bỏ trống = tối đa 50 đơn Done gần nhất
 * @returns {Promise<{ pet: Object, milestones: Object[], totalEligible: number }>} milestones xếp cũ → mới
 */
const buildTimelineFromHistory = async (currentUser, petId, orderIds) => {
  // Ném 404 (không có hồ sơ / đã xóa) hoặc 403 (thú cưng của người khác) theo BR-23
  const { pet, orders, totalEligible } = await getShareablePetHistory(
    currentUser,
    petId,
    orderIds ? { orderIds } : { limit: MAX_TIMELINE_ITEMS }
  );

  if (orderIds && orders.length !== orderIds.length) {
    throw httpError(400, 'Dữ liệu không hợp lệ', {
      orderIds: 'Có đơn khám không tồn tại, không thuộc thú cưng này hoặc chưa hoàn thành',
    });
  }

  return {
    pet,
    milestones: [...orders].reverse().map(toShareableMilestone), // timeline đọc từ cũ → mới
    totalEligible,
  };
};

// Xem trước: đúng những gì sẽ được đăng, để chủ nuôi kiểm tra trước khi tạo bài
const previewTimelineFromHistory = async (currentUser, { petId }) => {
  const { pet, milestones, totalEligible } = await buildTimelineFromHistory(currentUser, petId);
  return { pet, milestones, totalEligible, truncated: totalEligible > milestones.length };
};

// Mốc (đã lọc) → timelineItem lưu trong bài (đúng 3 trường của schema: date, title, imageUrl)
const toTimelineItem = ({ date, title, imageUrl }) => ({ date, title, imageUrl });

const createTimelineShareFromHistory = async (currentUser, { petId, orderIds, content }) => {
  const { pet, milestones } = await buildTimelineFromHistory(currentUser, petId, orderIds);

  if (milestones.length === 0) {
    throw httpError(400, 'Dữ liệu không hợp lệ', {
      petId: 'Thú cưng chưa có lượt khám nào đã hoàn thành để chia sẻ',
    });
  }

  const post = await CommunityPost.create({
    authorId: currentUser.id,
    petId: pet._id,
    postType: 'TimelineShare',
    content,
    timelineItems: milestones.map(toTimelineItem),
    status: MANAGEABLE_STATUS, // luôn PendingReview, chờ Admin/Receptionist duyệt
  });

  return post.populate(PET_POPULATE);
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
  previewTimelineFromHistory,
  createTimelineShareFromHistory,
  createPost,
  listMyPosts,
  getMyPost,
  updateMyPost,
  deleteMyPost,
  listPublishedPosts,
  getPublishedPost,
};