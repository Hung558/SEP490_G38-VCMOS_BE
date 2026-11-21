const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const REPORT_TARGET_TYPES = ['Post', 'Comment'];

const MAX_COMMENT_LENGTH = 500;
const MAX_REPORT_REASON_LENGTH = 200;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_REGEX.test(value);

const validateObjectIdParam = (id, label = 'ID') => {
  if (!isObjectId(id)) {
    return { isValid: false, message: `${label} không hợp lệ` };
  }
  return { isValid: true, value: id };
};

/**
 * Kiểm tra query phân trang danh sách bình luận (GET /api/community-posts/:id/comments)
 */
const validateCommentListQuery = (query = {}) => {
  const errors = {};
  const value = { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT };

  if (!isBlank(query.page)) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      errors.page = 'Trang (page) phải là số nguyên >= 1';
    } else {
      value.page = page;
    }
  }

  if (!isBlank(query.limit)) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      errors.limit = `Số lượng mỗi trang (limit) phải là số nguyên từ 1 đến ${MAX_LIMIT}`;
    } else {
      value.limit = limit;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

/**
 * Kiểm tra body tạo bình luận / trả lời bình luận 1 cấp (UC-54, UC-55, BR-19)
 */
const validateCreateComment = (body = {}) => {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = { content: '', parentCommentId: null };

  if (isBlank(src.content) || typeof src.content !== 'string') {
    errors.content = 'Nội dung bình luận là bắt buộc';
  } else {
    const trimmed = src.content.trim();
    if (trimmed.length === 0) {
      errors.content = 'Nội dung bình luận là bắt buộc';
    } else if (trimmed.length > MAX_COMMENT_LENGTH) {
      errors.content = `Nội dung bình luận tối đa ${MAX_COMMENT_LENGTH} ký tự`;
    } else {
      value.content = trimmed;
    }
  }

  if (!isBlank(src.parentCommentId)) {
    if (!isObjectId(src.parentCommentId)) {
      errors.parentCommentId = 'ID bình luận cha không hợp lệ';
    } else {
      value.parentCommentId = src.parentCommentId;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

/**
 * Kiểm tra body gửi báo cáo vi phạm bài viết / bình luận (UC-56, SCR-14)
 */
const validateCreateReport = (body = {}) => {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = {};

  if (!REPORT_TARGET_TYPES.includes(src.targetType)) {
    errors.targetType = `Loại đối tượng báo cáo phải là một trong: ${REPORT_TARGET_TYPES.join(', ')}`;
  } else {
    value.targetType = src.targetType;
  }

  if (isBlank(src.targetId) || !isObjectId(src.targetId)) {
    errors.targetId = 'ID nội dung cần báo cáo không hợp lệ';
  } else {
    value.targetId = src.targetId;
  }

  if (isBlank(src.reason) || typeof src.reason !== 'string') {
    errors.reason = 'Vui lòng nhập lý do báo cáo vi phạm';
  } else {
    const trimmed = src.reason.trim();
    if (trimmed.length === 0) {
      errors.reason = 'Vui lòng nhập lý do báo cáo vi phạm';
    } else if (trimmed.length > MAX_REPORT_REASON_LENGTH) {
      errors.reason = `Lý do báo cáo tối đa ${MAX_REPORT_REASON_LENGTH} ký tự`;
    } else {
      value.reason = trimmed;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

module.exports = {
  REPORT_TARGET_TYPES,
  validateObjectIdParam,
  validateCommentListQuery,
  validateCreateComment,
  validateCreateReport,
};
