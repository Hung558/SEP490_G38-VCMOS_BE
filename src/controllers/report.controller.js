const reportService = require('../services/report.service');
const { validateReportDateRangeQuery } = require('../validators/report.validator');

const handleControllerError = (res, err) => {
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }
  console.error('Lỗi report.controller:', err);
  return res.status(500).json({ message: 'Lỗi máy chủ khi tổng hợp báo cáo thống kê' });
};

/**
 * GET /api/reports/revenue
 * Admin xem thống kê doanh thu (UC-63, SCR-28)
 */
const getRevenueAnalytics = async (req, res) => {
  try {
    const queryCheck = validateReportDateRangeQuery(req.query, {
      defaultPeriod: 'month',
      allowGroupBy: true,
    });
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số thống kê doanh thu không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await reportService.getRevenueAnalytics(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/reports/operations
 * Admin xem thống kê lịch hẹn, dịch vụ & công suất chuồng (UC-64, SCR-28)
 */
const getOperationalAnalytics = async (req, res) => {
  try {
    const queryCheck = validateReportDateRangeQuery(req.query, {
      defaultPeriod: 'month',
      allowGroupBy: false,
    });
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số thống kê vận hành không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await reportService.getOperationalAnalytics(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/reports/front-desk
 * Lễ tân & Admin xem thống kê nhanh tại quầy (SCR-16)
 */
const getFrontDeskStatistics = async (req, res) => {
  try {
    const queryCheck = validateReportDateRangeQuery(req.query, {
      defaultPeriod: 'day',
      allowGroupBy: false,
    });
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số thống kê quầy lễ tân không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await reportService.getFrontDeskStatistics(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

module.exports = {
  getRevenueAnalytics,
  getOperationalAnalytics,
  getFrontDeskStatistics,
};
