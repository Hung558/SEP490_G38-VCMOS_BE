const {
  scheduleFlagOverdueJob,
  runFlagOverdueWithRetry,
  getYesterdayStringVN,
} = require('./flagOverdueAppointments.job');

/**
 * Khởi chạy toàn bộ tiến trình ngầm (Background Jobs) khi server chạy trực tiếp.
 * - JOB-01: Chạy tự động lúc 23:59 hằng ngày (Asia/Ho_Chi_Minh) để đánh dấu Overdue các đơn Booked chưa check-in.
 * - Khi server vừa khởi động: quét bù các đơn từ ngày hôm qua trở về trước (date < hôm nay) để không bỏ sót
 *   nếu server từng tắt lúc 23:59, đồng thời tuyệt đối không đụng vào các đơn Booked của ngày hôm nay.
 */
const startBackgroundJobs = () => {
  const overdueTask = scheduleFlagOverdueJob();

  // Quét bù bất đồng bộ các ngày đã qua (< hôm nay) ngay sau khi DB kết nối
  runFlagOverdueWithRetry({
    targetDate: getYesterdayStringVN(),
    includePastDates: true,
    maxRetries: 2,
    retryDelayMs: 5000,
  }).catch(() => {
    // Lỗi đã được ghi log trong job, không làm gián đoạn quá trình khởi động server
  });

  return { overdueTask };
};

module.exports = {
  startBackgroundJobs,
};
