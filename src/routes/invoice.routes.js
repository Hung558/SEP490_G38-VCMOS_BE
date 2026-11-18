const express = require('express');
const { protect, authorize } = require('../middlewares/auth.middleware');
const controller = require('../controllers/invoice.controller');

const router = express.Router();

// Callback từ cổng thanh toán VNPay / PayOS (xác thực bằng chữ ký HMAC, đặt trước /:id)
router.get('/vnpay-ipn', controller.vnpayIpn);
router.get('/vnpay-return', controller.vnpayReturn);
router.post('/payos-webhook', controller.payosWebhook);

// Chủ nuôi xem lịch sử hóa đơn của thú cưng của mình (UC-48, SCR-15)
router.get('/me', protect, authorize('PetOwner'), controller.listMyInvoices);

// Báo cáo sản phẩm bán chạy theo ngày / tuần / tháng (đặt trước /:id)
router.get(
  '/reports/best-selling-products',
  protect,
  authorize('Admin'),
  controller.getBestSellingProducts
);

// Lễ tân lập hóa đơn tổng hợp & quản lý danh sách hóa đơn (UC-45, SCR-20)
router.post('/', protect, authorize('Receptionist'), controller.createInvoice);
router.get('/', protect, authorize('Receptionist', 'Admin'), controller.listInvoices);

// Chỉnh sửa sản phẩm bán lẻ khi hóa đơn còn Unpaid & Thanh toán (UC-45, UC-46, UC-47)
router.patch('/:id/items', protect, authorize('Receptionist'), controller.updateInvoiceRetailItems);
router.patch('/:id/pay-cash', protect, authorize('Receptionist'), controller.payCash);
router.post('/:id/vnpay-url', protect, authorize('Receptionist'), controller.createVnpayUrl);
router.post('/:id/payos-url', protect, authorize('Receptionist'), controller.createPayosUrl);
router.get('/:id/payos-status', protect, authorize('Receptionist', 'Admin', 'PetOwner'), controller.getPayosStatus);

// Xem chi tiết & Xuất biên lai PDF (BR-23: kiểm tra quyền sở hữu đối với PetOwner)
router.get('/:id/pdf', protect, authorize('Receptionist', 'Admin', 'PetOwner'), controller.getInvoicePdf);
router.get('/:id', protect, authorize('Receptionist', 'Admin', 'PetOwner'), controller.getInvoiceById);

// Chặn xóa vật lý hóa đơn (BR-22)
router.delete('/:id', protect, authorize('Receptionist', 'Admin'), controller.blockDeleteInvoice);

module.exports = router;