const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const POST_STATUS_FILTERS = ['PendingReview', 'Published', 'Hidden', 'Removed', 'All'];
const POST_TYPES = ['TimelineShare', 'Discussion'];
const MODERATION_DECISIONS = ['Approve', 'Reject'];
const REPORT_STATUS_FILTERS = ['Pending', 'Resolved', 'All'];
const REPORT_TARGET_TYPES = ['Post', 'Comment'];
const REPORT_DECISIONS = ['Keep', 'Hide', 'Delete'];

const MAX_NOTE_LENGTH = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_REGEX.test(value);

const validateObjectIdParam = (id, label = 'ID') => {
  if (!isObjectId(id)) {
    return { isValid: false, message: `${label} không hợp lệ` };
  }
  return { isValid: true, value: id };
};

const parsePagination = (query, errors) => {
  let page = DEFAULT_PAGE;
  let limit = DEFAULT_LIMIT;

  if (!isBlank(query.page)) {
    const parsed = Number(query.page);
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.page = 'Trang (page) phải là số nguyên >= 1';
    } else {
      page = parsed;
    }
  }

  if (!isBlank(query.limit)) {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      errors.limit = `Số lượng mỗi trang (limit) phải là số nguyên từ 1 đến ${MAX_LIMIT}`;
    } else {
      limit = parsed;
    }
  }

  return { page, limit };
};

/**
 * Kiểm tra query danh sách bài viết kiểm duyệt (GET /api/admin/community/posts — UC-57, SCR-33)
 */
const validateAdminPostListQuery = (query = {}) => {
  const errors = {};
  const { page, limit } = parsePagination(query, errors);
  const value = {
    page,
    limit,
    status: 'PendingReview',
    postType: undefined,
  };

  if (!isBlank(query.status)) {
    const cleanStatus = String(query.status).trim();
    if (!POST_STATUS_FILTERS.includes(cleanStatus)) {
      errors.status = `Trạng thái bài viết phải là một trong: ${POST_STATUS_FILTERS.join(', ')}`;
    } else {
      value.status = cleanStatus;
    }
  }

  if (!isBlank(query.postType)) {
    const cleanType = String(query.postType).trim();
    if (!POST_TYPES.includes(cleanType)) {
      errors.postType = `Loại bài viết phải là một trong: ${POST_TYPES.join(', ')}`;
    } else {
      value.postType = cleanType;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

/**
 * Kiểm tra body duyệt / từ chối bài viết chờ duyệt (PATCH /api/admin/community/posts/:id/moderate — UC-58)
 * - Reject bắt buộc nhập lý do moderationNote (MSG22).
 */
const validateModeratePostBody = (body = {}) => {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = { decision: undefined, moderationNote: '' };

  if (!MODERATION_DECISIONS.includes(src.decision)) {
    errors.decision = `Quyết định kiểm duyệt phải là một trong: ${MODERATION_DECISIONS.join(', ')}`;
  } else {
    value.decision = src.decision;
  }

  if (!isBlank(src.moderationNote)) {
    if (typeof src.moderationNote !== 'string') {
      errors.moderationNote = 'Ghi chú kiểm duyệt phải là chuỗi ký tự';
    } else {
      const trimmed = src.moderationNote.trim();
      if (trimmed.length > MAX_NOTE_LENGTH) {
        errors.moderationNote = `Ghi chú kiểm duyệt tối đa ${MAX_NOTE_LENGTH} ký tự`;
      } else {
        value.moderationNote = trimmed;
      }
    }
  }

  if (value.decision === 'Reject' && !errors.moderationNote && !value.moderationNote) {
    errors.moderationNote = 'Vui lòng nhập lý do từ chối bài viết';
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

/**
 * Kiểm tra query danh sách báo cáo vi phạm (GET /api/admin/community/reports — UC-59, SCR-33)
 */
const validateAdminReportListQuery = (query = {}) => {
  const errors = {};
  const { page, limit } = parsePagination(query, errors);
  const value = {
    page,
    limit,
    status: 'Pending',
    targetType: undefined,
  };

  if (!isBlank(query.status)) {
    const cleanStatus = String(query.status).trim();
    if (!REPORT_STATUS_FILTERS.includes(cleanStatus)) {
      errors.status = `Trạng thái báo cáo phải là một trong: ${REPORT_STATUS_FILTERS.join(', ')}`;
    } else {
      value.status = cleanStatus;
    }
  }

  if (!isBlank(query.targetType)) {
    const cleanTarget = String(query.targetType).trim();
    if (!REPORT_TARGET_TYPES.includes(cleanTarget)) {
      errors.targetType = `Loại đối tượng phải là một trong: ${REPORT_TARGET_TYPES.join(', ')}`;
    } else {
      value.targetType = cleanTarget;
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

/**
 * Kiểm tra body xử lý báo cáo vi phạm (PATCH /api/admin/community/reports/:id/resolve — UC-59)
 * - Hide hoặc Delete bắt buộc nhập ghi chú note (MSG22).
 */
const validateResolveReportBody = (body = {}) => {
  const errors = {};
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const value = { decision: undefined, note: '' };

  if (!REPORT_DECISIONS.includes(src.decision)) {
    errors.decision = `Quyết định xử lý phải là một trong: ${REPORT_DECISIONS.join(', ')}`;
  } else {
    value.decision = src.decision;
  }

  if (!isBlank(src.note)) {
    if (typeof src.note !== 'string') {
      errors.note = 'Ghi chú xử lý phải là chuỗi ký tự';
    } else {
      const trimmed = src.note.trim();
      if (trimmed.length > MAX_NOTE_LENGTH) {
        errors.note = `Ghi chú xử lý tối đa ${MAX_NOTE_LENGTH} ký tự`;
      } else {
        value.note = trimmed;
      }
    }
  }

  if ((value.decision === 'Hide' || value.decision === 'Delete') && !errors.note && !value.note) {
    errors.note = 'Vui lòng nhập lý do khi ẩn hoặc xoá nội dung vi phạm';
  }

  return { isValid: Object.keys(errors).length === 0, errors, value };
};

module.exports = {
  validateObjectIdParam,
  validateAdminPostListQuery,
  validateModeratePostBody,
  validateAdminReportListQuery,
  validateResolveReportBody,
};
