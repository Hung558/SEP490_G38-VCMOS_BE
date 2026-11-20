const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const reportController = require('../controllers/report.controller');

const router = express.Router();

// Dashboard phân tích doanh thu & vận hành dành cho Admin (SCR-28: UC-63, UC-64)
router.get('/revenue', protect, authorize('Admin'), reportController.getRevenueAnalytics);
router.get('/operations', protect, authorize('Admin'), reportController.getOperationalAnalytics);

// Widget thống kê nhanh tại quầy cho Lễ tân & Admin (SCR-16)
router.get('/front-desk', protect, authorize('Receptionist', 'Admin'), reportController.getFrontDeskStatistics);

module.exports = router;
