const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_OPTIONS = ['day', 'week', 'month', 'custom'];
const GROUP_BY_OPTIONS = ['day', 'month'];

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Múi giờ Việt Nam UTC+7
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366; // Tối đa 12 tháng theo SRS SCR-28

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

// Kiểm tra chuỗi YYYY-MM-DD và phải là ngày có thật trên lịch (chặn 2026-02-31)
const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

// Định dạng đối tượng Date (đã dịch về mốc VN) thành YYYY-MM-DD
const formatUtcDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Lấy ngày hôm nay theo giờ Việt Nam (YYYY-MM-DD)
const getTodayVnString = () => {
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  return formatUtcDate(vnNow);
};

// Chuyển chuỗi YYYY-MM-DD thành Date UTC 00:00 để tính toán số ngày chính xác
const parseCalendarDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Tính số ngày bao gồm cả đầu và cuối của khoảng [from, to]
const countInclusiveDays = (fromStr, toStr) => {
  const start = parseCalendarDate(fromStr).getTime();
  const end = parseCalendarDate(toStr).getTime();
  return Math.round((end - start) / MS_PER_DAY) + 1;
};

/**
 * Tính khoảng ngày [from, to] mặc định theo kỳ (day / week / month) tại giờ Việt Nam:
 * - day: hôm nay -> hôm nay
 * - week: Thứ 2 -> Chủ nhật của tuần hiện tại
 * - month: ngày 01 -> ngày cuối cùng của tháng hiện tại
 */
const resolvePresetRange = (period) => {
  const todayStr = getTodayVnString();
  const todayDate = parseCalendarDate(todayStr);

  if (period === 'day') {
    return { from: todayStr, to: todayStr };
  }

  if (period === 'week') {
    // getUTCDay(): 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7 -> quy về khoảng cách tới Thứ 2
    const dayOfWeek = todayDate.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(todayDate.getTime() - diffToMonday * MS_PER_DAY);
    const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);
    return { from: formatUtcDate(monday), to: formatUtcDate(sunday) };
  }

  // Mặc định: month (cả tháng hiện tại)
  const year = todayDate.getUTCFullYear();
  const monthIndex = todayDate.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  return { from: formatUtcDate(firstDay), to: formatUtcDate(lastDay) };
};

/**
 * Kiểm tra & chuẩn hóa tham số lọc khoảng thời gian dùng chung cho các API báo cáo.
 * - Hỗ trợ lọc nhanh bằng `period` (day | week | month | custom) hoặc truyền trực tiếp `from` / `to`.
 * - Chặn khoảng thời gian vượt quá 366 ngày (12 tháng) theo yêu cầu SRS SCR-28.
 */
const validateReportDateRangeQuery = (query = {}, { defaultPeriod = 'month', allowGroupBy = false } = {}) => {
  const errors = {};
  const rawPeriod = isBlank(query.period) ? '' : String(query.period).trim();
  const rawFrom = isBlank(query.from) ? '' : String(query.from).trim();
  const rawTo = isBlank(query.to) ? '' : String(query.to).trim();
  const rawGroupBy = isBlank(query.groupBy) ? '' : String(query.groupBy).trim();

  if (rawPeriod && !PERIOD_OPTIONS.includes(rawPeriod)) {
    errors.period = `Kỳ thống kê (period) phải là một trong: ${PERIOD_OPTIONS.join(', ')}`;
  }

  if (rawFrom && !isValidDateString(rawFrom)) {
    errors.from = 'Ngày bắt đầu (from) phải có định dạng YYYY-MM-DD hợp lệ';
  }

  if (rawTo && !isValidDateString(rawTo)) {
    errors.to = 'Ngày kết thúc (to) phải có định dạng YYYY-MM-DD hợp lệ';
  }

  if (allowGroupBy && rawGroupBy && !GROUP_BY_OPTIONS.includes(rawGroupBy)) {
    errors.groupBy = `Kiểu gom nhóm biểu đồ (groupBy) phải là một trong: ${GROUP_BY_OPTIONS.join(', ')}`;
  }

  // Xác định khoảng ngày [from, to] và kỳ áp dụng
  let period = rawPeriod || (rawFrom || rawTo ? 'custom' : defaultPeriod);
  let from;
  let to;

  if (!errors.period && !errors.from && !errors.to) {
    if (rawFrom || rawTo) {
      period = rawPeriod || 'custom';
      const todayStr = getTodayVnString();
      if (rawFrom && rawTo) {
        from = rawFrom;
        to = rawTo;
      } else if (rawFrom) {
        from = rawFrom;
        to = todayStr;
      } else {
        from = rawTo;
        to = rawTo;
      }
    } else if (period === 'custom') {
      errors.from = 'Vui lòng truyền ngày bắt đầu (from) hoặc ngày kết thúc (to) khi chọn kỳ custom';
    } else {
      const preset = resolvePresetRange(period);
      from = preset.from;
      to = preset.to;
    }

    if (from && to) {
      if (from > to) {
        errors.from = 'Ngày bắt đầu (from) không được sau ngày kết thúc (to)';
      } else if (countInclusiveDays(from, to) > MAX_RANGE_DAYS) {
        errors.to = `Khoảng thời gian thống kê tối đa là ${MAX_RANGE_DAYS} ngày (12 tháng)`;
      }
    }
  }

  let groupBy;
  if (allowGroupBy && from && to && !errors.groupBy) {
    // Tự động chọn gom theo ngày khi <= 62 ngày, hoặc theo tháng cho khoảng dài hơn
    groupBy = rawGroupBy || (countInclusiveDays(from, to) > 62 ? 'month' : 'day');
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      period,
      from,
      to,
      ...(allowGroupBy && { groupBy }),
    },
  };
};

module.exports = {
  PERIOD_OPTIONS,
  GROUP_BY_OPTIONS,
  VN_OFFSET_MS,
  MS_PER_DAY,
  getTodayVnString,
  parseCalendarDate,
  formatUtcDate,
  countInclusiveDays,
  validateReportDateRangeQuery,
};
