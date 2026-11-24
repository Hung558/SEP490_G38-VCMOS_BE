const cron = require('node-cron');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');

const DEFAULT_OVERDUE_CRON = '59 23 * * *'; // 23:59 hằng ngày (SRS JOB-01, UC-23, BR-08)
const CLINIC_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_MAX_RETRIES = 3; // SRS 6.1: thử lại tối đa 3 lần khi DB tạm gián đoạn
const DEFAULT_RETRY_DELAY_MS = 30000; // 30 giây giữa mỗi lần thử lại
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Trả về chuỗi ngày YYYY-MM-DD theo múi giờ phòng khám (Asia/Ho_Chi_Minh).
 */
const getDateStringVN = (dateObj = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE }).format(dateObj);

/**
 * Trả về chuỗi ngày hôm qua YYYY-MM-DD theo giờ Việt Nam (dùng để quét bù khi server khởi động).
 */
const getYesterdayStringVN = (now = new Date()) =>
  getDateStringVN(new Date(now.getTime() - 24 * 60 * 60 * 1000));

const isValidDateString = (value) => {
  if (typeof value !== 'string' || !DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * JOB-01 — Đánh dấu lịch hẹn quá hạn Overdue (UC-23, BR-08, SRS 6.1):
 * - Quét toàn bộ AppointmentOrder có trạng thái Booked và chưa Check-in (checkedInAt: null)
 *   trong ngày mục tiêu (hoặc các ngày trước đó nếu includePastDates = true).
 * - Cập nhật có điều kiện (atomic) để bỏ qua an toàn nếu Lễ tân vừa Check-in đúng lúc job chạy.
 * - Chỉ chuyển dịch vụ đầu tiên còn Booked (sequenceNo nhỏ nhất) sang Overdue; KHÔNG huỷ đơn.
 * - Các đơn đã CheckedIn (dù dịch vụ sau bị trễ) không bao giờ bị đánh dấu Overdue (UC-23 Alt Flow 1a).
 */
const flagOverdueAppointments = async ({
  targetDate = getDateStringVN(),
  includePastDates = true,
} = {}) => {
  if (!isValidDateString(targetDate)) {
    const err = new Error('Ngày mục tiêu (date) phải có định dạng YYYY-MM-DD hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const candidateFilter = {
    date: includePastDates ? { $lte: targetDate } : targetDate,
    derivedStatus: 'Booked',
    checkedInAt: null,
  };

  const candidates = await AppointmentOrder.find(candidateFilter)
    .select('_id code date')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  let flaggedCount = 0;
  let skippedCount = 0;
  const flaggedOrders = [];

  for (const order of candidates) {
    // Kiểm tra lại điều kiện Booked + chưa Check-in ngay lúc ghi để chống race condition với Lễ tân (SRS 6.1)
    const updatedOrder = await AppointmentOrder.findOneAndUpdate(
      { _id: order._id, derivedStatus: 'Booked', checkedInAt: null },
      { $set: { derivedStatus: 'Overdue' } },
      { returnDocument: 'after' }
    ).lean();

    if (!updatedOrder) {
      skippedCount += 1;
      continue;
    }

    // BR-08: Chỉ đánh dấu Overdue cho dịch vụ đầu tiên (sequenceNo nhỏ nhất) còn ở trạng thái Booked
    const updatedFirstService = await AppointmentService.findOneAndUpdate(
      { orderId: order._id, status: 'Booked' },
      { $set: { status: 'Overdue' } },
      { sort: { sequenceNo: 1 }, returnDocument: 'after' }
    ).lean();

    flaggedCount += 1;
    flaggedOrders.push({
      orderId: updatedOrder._id,
      code: updatedOrder.code,
      date: updatedOrder.date,
      firstServiceId: updatedFirstService ? updatedFirstService._id : null,
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.info(
      `[JOB-01 Overdue] targetDate=${targetDate} includePastDates=${includePastDates} scanned=${candidates.length} flagged=${flaggedCount} skipped=${skippedCount}`
    );
  }

  return {
    targetDate,
    includePastDates,
    scannedCount: candidates.length,
    flaggedCount,
    skippedCount,
    flaggedOrders,
  };
};

/**
 * Chạy JOB-01 kèm cơ chế thử lại tối đa 3 lần (mặc định cách nhau 30 giây) khi DB gián đoạn (SRS 6.1).
 */
const runFlagOverdueWithRetry = async ({
  targetDate = getDateStringVN(),
  includePastDates = true,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  runner = flagOverdueAppointments,
} = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await runner({ targetDate, includePastDates });
    } catch (err) {
      lastError = err;
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          `[JOB-01 Overdue] Lần thử ${attempt}/${maxRetries} thất bại: ${err.message}`
        );
      }
      if (attempt < maxRetries && retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
    }
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error(
      `[JOB-01 Overdue][CRITICAL] Thất bại sau ${maxRetries} lần thử: ${lastError?.message}`
    );
  }
  throw lastError;
};

/**
 * Đăng ký lịch chạy tự động JOB-01 lúc 23:59 hằng ngày theo giờ Việt Nam (Asia/Ho_Chi_Minh).
 */
const scheduleFlagOverdueJob = () => {
  const configuredCron = (process.env.OVERDUE_JOB_CRON || DEFAULT_OVERDUE_CRON).trim();
  const cronExpression = cron.validate(configuredCron) ? configuredCron : DEFAULT_OVERDUE_CRON;

  const task = cron.schedule(
    cronExpression,
    async () => {
      try {
        await runFlagOverdueWithRetry({
          targetDate: getDateStringVN(),
          includePastDates: true,
        });
      } catch {
        // Lỗi đã được ghi log CRITICAL trong runFlagOverdueWithRetry, không làm sập Express server
      }
    },
    { timezone: CLINIC_TIMEZONE }
  );

  if (process.env.NODE_ENV !== 'test') {
    console.info(
      `[JOB-01 Overdue] Đã đăng ký lịch chạy tự động (${cronExpression} - ${CLINIC_TIMEZONE})`
    );
  }

  return task;
};

module.exports = {
  DEFAULT_OVERDUE_CRON,
  CLINIC_TIMEZONE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  getDateStringVN,
  getYesterdayStringVN,
  isValidDateString,
  flagOverdueAppointments,
  runFlagOverdueWithRetry,
  scheduleFlagOverdueJob,
};
