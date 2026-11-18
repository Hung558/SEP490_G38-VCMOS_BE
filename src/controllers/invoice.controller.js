const invoiceService = require('../services/invoice.service');
const {
  validateObjectIdParam,
  validateCreateInvoice,
  validateUpdateInvoiceRetailItems,
  validatePayCash,
  validateListInvoicesQuery,
  validateBestSellingProductsQuery,
} = require('../validators/invoice.validator');

const handleControllerError = (res, err) => {
  if (err && err.statusCode) {
    const response = { message: err.message };
    if (err.errors) response.errors = err.errors;
    return res.status(err.statusCode).json(response);
  }
  console.error('Invoice controller error:', err);
  return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý hóa đơn và thanh toán' });
};

/**
 * POST /api/invoices
 * Lễ tân lập hóa đơn tổng hợp từ đơn khám đã hoàn tất / hồ sơ nội trú đã xuất viện + sản phẩm bán lẻ (UC-45)
 */
const createInvoice = async (req, res) => {
  try {
    const check = validateCreateInvoice(req.body);
    if (!check.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu lập hóa đơn không hợp lệ',
        errors: check.errors,
      });
    }

    const result = await invoiceService.createInvoice(req.user.id, check.value);
    return res.status(201).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * PATCH /api/invoices/:id/items
 * Lễ tân thêm hoặc bớt sản phẩm bán lẻ trên hóa đơn khi còn ở trạng thái Unpaid (UC-45 Alt Flow 5a)
 */
const updateInvoiceRetailItems = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const bodyCheck = validateUpdateInvoiceRetailItems(req.body);
    if (!bodyCheck.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu cập nhật sản phẩm hóa đơn không hợp lệ',
        errors: bodyCheck.errors,
      });
    }

    const result = await invoiceService.updateInvoiceRetailItems(idCheck.value, bodyCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * PATCH /api/invoices/:id/pay-cash
 * Lễ tân xác nhận thanh toán tiền mặt -> Paid, Order -> Done, MedicalRecord -> Finalized, nhả chuồng (UC-46)
 */
const payCash = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const bodyCheck = validatePayCash(req.body);
    if (!bodyCheck.isValid) {
      return res.status(400).json({
        message: 'Dữ liệu thanh toán tiền mặt không hợp lệ',
        errors: bodyCheck.errors,
      });
    }

    const result = await invoiceService.payInvoiceByCash(idCheck.value, bodyCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * POST /api/invoices/:id/vnpay-url
 * Lễ tân khởi tạo đường dẫn thanh toán VNPay QR Sandbox (UC-47, API-02)
 */
const createVnpayUrl = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress;
    const result = await invoiceService.createVnpayPaymentUrlForInvoice(idCheck.value, clientIp);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/vnpay-ipn
 * Webhook IPN từ cổng VNPay xác thực chữ ký & số tiền -> chuyển hóa đơn Paid (API-03, BR-17)
 */
const vnpayIpn = async (req, res) => {
  try {
    const result = await invoiceService.handleVnpayIpn(req.query);
    return res.status(200).json(result);
  } catch (err) {
    console.error('VNPay IPN error:', err);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
};

/**
 * GET /api/invoices/vnpay-return
 * Trang/API trả về kết quả cho người dùng sau khi quét VNPay (API-04, chỉ kiểm tra chữ ký, không sửa trạng thái)
 */
const vnpayReturn = async (req, res) => {
  try {
    const result = await invoiceService.handleVnpayReturn(req.query);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * POST /api/invoices/:id/payos-url
 * Lễ tân khởi tạo link thanh toán & chuỗi VietQR thật qua PayOS
 */
const createPayosUrl = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const result = await invoiceService.createPayosPaymentUrlForInvoice(idCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * POST /api/invoices/payos-webhook
 * Webhook từ PayOS xác thực chữ ký HMAC-SHA256 -> chuyển hóa đơn Paid
 */
const payosWebhook = async (req, res) => {
  try {
    const result = await invoiceService.handlePayosWebhook(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/:id/payos-status
 * Chủ động kiểm tra và đồng bộ trạng thái thanh toán từ PayOS (hỗ trợ chạy localhost)
 */
const getPayosStatus = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const result = await invoiceService.syncPayosInvoiceStatus(req.user, idCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices
 * Lễ tân / Admin xem danh sách tất cả hóa đơn (SCR-20)
 */
const listInvoices = async (req, res) => {
  try {
    const queryCheck = validateListInvoicesQuery(req.query);
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số lọc danh sách hóa đơn không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await invoiceService.listInvoices(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/me
 * Chủ thú cưng (PetOwner) xem lịch sử hóa đơn của thú cưng mình (UC-48, SCR-15)
 */
const listMyInvoices = async (req, res) => {
  try {
    const queryCheck = validateListInvoicesQuery(req.query);
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số lọc lịch sử hóa đơn không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await invoiceService.listMyInvoices(req.user.id, queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/:id
 * Xem chi tiết 1 hóa đơn (BR-23: PetOwner chỉ xem được hóa đơn của thú cưng mình)
 */
const getInvoiceById = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const result = await invoiceService.getInvoiceById(req.user, idCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/:id/pdf
 * Xuất và tải biên lai PDF hóa đơn (UC-48, SCR-15)
 */
const getInvoicePdf = async (req, res) => {
  try {
    const idCheck = validateObjectIdParam(req.params.id, 'ID hóa đơn');
    if (!idCheck.isValid) {
      return res.status(400).json({ message: idCheck.errors.id, errors: idCheck.errors });
    }

    const { filename, buffer } = await invoiceService.generateInvoicePdf(req.user, idCheck.value);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * GET /api/invoices/reports/best-selling-products
 * Admin xem báo cáo sản phẩm bán chạy theo ngày / tuần / tháng
 */
const getBestSellingProducts = async (req, res) => {
  try {
    const queryCheck = validateBestSellingProductsQuery(req.query);
    if (!queryCheck.isValid) {
      return res.status(400).json({
        message: 'Tham số báo cáo sản phẩm bán chạy không hợp lệ',
        errors: queryCheck.errors,
      });
    }

    const result = await invoiceService.getBestSellingProducts(queryCheck.value);
    return res.status(200).json(result);
  } catch (err) {
    return handleControllerError(res, err);
  }
};

/**
 * DELETE /api/invoices/:id
 * Chặn xóa vật lý hóa đơn theo quy tắc BR-22
 */
const blockDeleteInvoice = (req, res) =>
  res.status(403).json({
    message: 'Không thể xóa vĩnh viễn hóa đơn theo quy định lưu trữ hồ sơ (BR-22)',
  });

module.exports = {
  createInvoice,
  updateInvoiceRetailItems,
  payCash,
  createVnpayUrl,
  vnpayIpn,
  vnpayReturn,
  createPayosUrl,
  payosWebhook,
  getPayosStatus,
  listInvoices,
  listMyInvoices,
  getInvoiceById,
  getInvoicePdf,
  getBestSellingProducts,
  blockDeleteInvoice,
};