const walkInService = require('../services/walkIn.service');
const {
  validateLookupCustomer,
  validateCreateWalkInBooking,
} = require('../validators/walkIn.validator');

const handleError = (res, err) => {
  const statusCode = err.statusCode || err.status;
  if (statusCode) {
    return res.status(statusCode).json({ message: err.message });
  }
  console.error(err);
  return res.status(500).json({ message: 'Lỗi máy chủ' });
};

/**
 * GET /api/appointment-orders/walk-in/customer-lookup?phone=0988111222
 * Lễ tân / Admin tra cứu khách hàng theo SĐT kèm danh sách thú cưng (UC-20)
 */
const lookupCustomer = async (req, res) => {
  try {
    const { isValid, errors, value } = validateLookupCustomer(req.query);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu tra cứu không hợp lệ', errors });
    }

    const result = await walkInService.lookupCustomerByPhone(value.phone);
    const message = result.found
      ? 'Tìm thấy thông tin khách hàng'
      : 'Khách hàng mới chưa có hồ sơ trong hệ thống';

    return res.status(200).json({
      message,
      data: result,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * POST /api/appointment-orders/walk-in
 * Lễ tân tiếp nhận và đăng ký khách vãng lai tại quầy (UC-19, UC-21, BR-04, BR-06)
 */
const createWalkInBooking = async (req, res) => {
  try {
    const { isValid, errors, value } = validateCreateWalkInBooking(req.body);
    if (!isValid) {
      return res.status(400).json({ message: 'Dữ liệu đăng ký vãng lai không hợp lệ', errors });
    }

    const data = await walkInService.createWalkInBooking(req.user.id, value);
    return res.status(201).json({
      message: 'Đăng ký khám vãng lai tại quầy thành công',
      data,
    });
  } catch (err) {
    return handleError(res, err);
  }
};

module.exports = {
  lookupCustomer,
  createWalkInBooking,
};

