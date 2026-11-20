const POST_TYPES = ['TimelineShare', 'Discussion'];
const POST_STATUSES = ['PendingReview', 'Published', 'Hidden', 'Removed'];

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MAX_CONTENT_LENGTH = 5000;
const MAX_TITLE_LENGTH = 200;
const MAX_URL_LENGTH = 2048;
const MAX_TIMELINE_ITEMS = 50;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const isBlank = (value) => value === undefined || value === null || value === '';
const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_REGEX.test(value);

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

// YYYY-MM-DD và là ngày có thật (loại 2025-02-31)
const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

/**
 * Kiểm tra id trong path param.
 * @returns {string|null} thông báo lỗi, hoặc null nếu hợp lệ
 */
const validateObjectIdParam = (id) => (isObjectId(id) ? null : 'ID bài viết không hợp lệ');

/**
 * Kiểm tra + chuẩn hoá body cho tạo mới / cập nhật bài viết (PUT = thay toàn bộ các trường được phép sửa).
 * Chỉ trả về các trường client được phép gửi: status, authorId, moderationNote, likeCount, commentCount
 * bị bỏ qua hoàn toàn.
 *
 * Body luôn là multipart/form-data nên `timelineItems` là chuỗi JSON.
 * Mỗi mốc timeline có thể trỏ tới ảnh vừa tải lên bằng `imageIndex` (vị trí trong `timelineImages`).
 * `imageUrl` chỉ để giữ lại ảnh đang có khi cập nhật (service sẽ đối chiếu với dữ liệu đang lưu).
 *
 * @param {Object} body
 * @param {{ timelineImageCount?: number }} [options] số ảnh `timelineImages` đã được tải lên
 * @returns {{ errors: Object|null, value: Object }}
 */
const validatePostPayload = (body, { timelineImageCount = 0 } = {}) => {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {};

  // postType
  if (!POST_TYPES.includes(src.postType)) {
    errors.postType = `Loại bài viết phải là một trong: ${POST_TYPES.join(', ')}`;
  } else {
    value.postType = src.postType;
  }

  // content
  if (isBlank(src.content)) {
    value.content = '';
  } else if (typeof src.content !== 'string') {
    errors.content = 'Nội dung phải là chuỗi ký tự';
  } else {
    value.content = src.content.trim();
    if (value.content.length > MAX_CONTENT_LENGTH) {
      errors.content = `Nội dung tối đa ${MAX_CONTENT_LENGTH} ký tự`;
    }
  }

  // imageUrl
  if (isBlank(src.imageUrl)) {
    value.imageUrl = null;
  } else if (typeof src.imageUrl !== 'string' || src.imageUrl.length > MAX_URL_LENGTH || !isHttpUrl(src.imageUrl.trim())) {
    errors.imageUrl = 'Đường dẫn ảnh không hợp lệ';
  } else {
    value.imageUrl = src.imageUrl.trim();
  }

  // petId
  if (isBlank(src.petId)) {
    value.petId = null;
  } else if (!isObjectId(src.petId)) {
    errors.petId = 'ID thú cưng không hợp lệ';
  } else {
    value.petId = src.petId;
  }

  // timelineItems (multipart gửi dưới dạng chuỗi JSON)
  let rawTimeline = src.timelineItems;
  if (typeof rawTimeline === 'string') {
    if (rawTimeline.trim() === '') {
      rawTimeline = undefined;
    } else {
      try {
        rawTimeline = JSON.parse(rawTimeline);
      } catch {
        errors.timelineItems = 'Mốc thời gian phải là JSON hợp lệ';
        rawTimeline = undefined;
      }
    }
  }

  if (!errors.timelineItems) {
    if (isBlank(rawTimeline)) {
      value.timelineItems = [];
    } else if (!Array.isArray(rawTimeline)) {
      errors.timelineItems = 'Mốc thời gian phải là một mảng';
    } else if (rawTimeline.length > MAX_TIMELINE_ITEMS) {
      errors.timelineItems = `Tối đa ${MAX_TIMELINE_ITEMS} mốc thời gian`;
    } else {
      const items = [];
      const itemErrors = [];

      rawTimeline.forEach((raw, index) => {
        const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const err = {};
        const clean = {};

        if (!isValidDateString(item.date)) {
          err.date = 'Ngày phải có định dạng YYYY-MM-DD hợp lệ';
        } else {
          clean.date = item.date;
        }

        if (typeof item.title !== 'string' || !item.title.trim()) {
          err.title = 'Tiêu đề mốc thời gian là bắt buộc';
        } else if (item.title.trim().length > MAX_TITLE_LENGTH) {
          err.title = `Tiêu đề tối đa ${MAX_TITLE_LENGTH} ký tự`;
        } else {
          clean.title = item.title.trim();
        }

        if (!isBlank(item.imageUrl)) {
          if (typeof item.imageUrl !== 'string' || item.imageUrl.length > MAX_URL_LENGTH || !isHttpUrl(item.imageUrl.trim())) {
            err.imageUrl = 'Đường dẫn ảnh không hợp lệ';
          } else {
            clean.imageUrl = item.imageUrl.trim();
          }
        }

        // Ảnh tải lên cho mốc này (ưu tiên hơn imageUrl)
        if (!isBlank(item.imageIndex)) {
          if (
            !Number.isInteger(item.imageIndex) ||
            item.imageIndex < 0 ||
            item.imageIndex >= timelineImageCount
          ) {
            err.imageIndex = 'imageIndex không khớp với ảnh nào trong timelineImages';
          } else {
            clean.imageIndex = item.imageIndex;
          }
        }

        if (Object.keys(err).length > 0) itemErrors[index] = err;
        items.push(clean);
      });

      if (itemErrors.length > 0) {
        errors.timelineItems = Array.from(itemErrors, (e) => e || null);
      } else {
        value.timelineItems = items;
      }
    }
  }

  // Ràng buộc theo loại bài viết
  if (value.postType === 'Discussion') {
    if (!errors.content && !value.content) {
      errors.content = 'Nội dung thảo luận là bắt buộc';
    }
    value.timelineItems = []; // Discussion không có timeline
  }

  if (value.postType === 'TimelineShare') {
    if (!errors.petId && !value.petId) {
      errors.petId = 'Bài chia sẻ hành trình phải gắn với một thú cưng';
    }
    if (!errors.timelineItems && (!value.timelineItems || value.timelineItems.length === 0)) {
      errors.timelineItems = 'Bài chia sẻ hành trình cần ít nhất 1 mốc thời gian';
    }
  }

  return { errors: Object.keys(errors).length > 0 ? errors : null, value };
};

/**
 * Kiểm tra query khi liệt kê bài viết của chính mình.
 * @returns {{ errors: Object|null, value: { page: number, limit: number, postType?: string, status?: string } }}
 */
const validateListQuery = (query = {}) => {
  const errors = {};
  const value = { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT };

  if (!isBlank(query.page)) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) errors.page = 'page phải là số nguyên >= 1';
    else value.page = page;
  }

  if (!isBlank(query.limit)) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      errors.limit = `limit phải là số nguyên từ 1 đến ${MAX_LIMIT}`;
    } else {
      value.limit = limit;
    }
  }

  if (!isBlank(query.postType)) {
    if (!POST_TYPES.includes(query.postType)) {
      errors.postType = `Loại bài viết phải là một trong: ${POST_TYPES.join(', ')}`;
    } else {
      value.postType = query.postType;
    }
  }

  // Không truyền status = lấy tất cả trạng thái
  if (!isBlank(query.status)) {
    if (!POST_STATUSES.includes(query.status)) {
      errors.status = `Trạng thái phải là một trong: ${POST_STATUSES.join(', ')}`;
    } else {
      value.status = query.status;
    }
  }

  return { errors: Object.keys(errors).length > 0 ? errors : null, value };
};

/**
 * Kiểm tra query cho feed công khai (Guest + PetOwner): chỉ page, limit, postType.
 * `status` bị bỏ qua hoàn toàn vì feed công khai luôn chỉ trả bài Published.
 * @returns {{ errors: Object|null, value: { page: number, limit: number, postType?: string } }}
 */
const validatePublicListQuery = (query = {}) => {
  const { errors, value } = validateListQuery({ ...query, status: undefined });
  delete value.status;
  return { errors, value };
};

module.exports = {
  validatePostPayload,
  validateListQuery,
  validatePublicListQuery,
  validateObjectIdParam,
};