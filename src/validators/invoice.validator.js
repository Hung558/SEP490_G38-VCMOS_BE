const { isValidObjectId } = require('mongoose');

const PAYMENT_STATUSES = ['Unpaid', 'Paid', 'Refunded'];
const PAYMENT_METHODS = ['Cash', 'VNPay', 'PayOS'];
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_REPORT_RANGE_DAYS = 366;
const PRODUCT_CATEGORIES = ['Medicine', 'Vaccine', 'Retail'];
const BEST_SELLING_SORT_FIELDS = ['quantity', 'revenue'];
const MAX_RETAIL_QUANTITY = 99;
const MAX_PRESCRIPTION_QUANTITY = 999;

const isBlank = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const isRealDate = (str) => {
  if (typeof str !== 'string' || !DATE_REGEX.test(str)) return false;
  const parsed = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === str;
};

const validateObjectIdParam = (id, fieldLabel = 'ID') => {
  if (isBlank(id) || typeof id !== 'string' || !isValidObjectId(id.trim())) {
    return {
      isValid: false,
      errors: { id: `${fieldLabel} không hợp lệ` },
      value: null,
    };
  }
  return {
    isValid: true,
    errors: {},
    value: id.trim(),
  };
};

const sanitizeProductLineItems = (items, fieldName, maxQty, errors) => {
  if (items === undefined) return [];
  if (!Array.isArray(items)) {
    errors[fieldName] = `${fieldName} phải là một mảng`;
    return [];
  }

  const cleanItems = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `${fieldName}[${i}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors[prefix] = 'Phần tử sản phẩm không hợp lệ';
      continue;
    }

    let cleanProductId = null;
    if (isBlank(item.productId) || typeof item.productId !== 'string' || !isValidObjectId(item.productId.trim())) {
      errors[`${prefix}.productId`] = 'Mã sản phẩm (productId) không hợp lệ';
    } else {
      cleanProductId = item.productId.trim();
    }

    const rawQty = item.quantity === undefined ? 1 : item.quantity;
    const qty = typeof rawQty === 'string' ? Number(rawQty.trim()) : rawQty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > maxQty) {
      errors[`${prefix}.quantity`] = `Số lượng phải là số nguyên từ 1 đến ${maxQty}`;
    }

    if (cleanProductId && Number.isInteger(qty) && qty >= 1 && qty <= maxQty) {
      cleanItems.push({ productId: cleanProductId, quantity: qty });
    }
  }
  return cleanItems;
};

/**
 * Validate dữ liệu lập hóa đơn tổng hợp (UC-45, BR-16)
 */
const validateCreateInvoice = (body = {}) => {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu yêu cầu không hợp lệ' },
      value: null,
    };
  }

  const {
    orderId,
    inpatientRecordId,
    retailItems,
    prescriptionQuantities,
    inpatientDailyRate,
  } = body;

  let cleanOrderId = null;
  if (!isBlank(orderId)) {
    if (typeof orderId !== 'string' || !isValidObjectId(orderId.trim())) {
      errors.orderId = 'Mã đơn lịch hẹn (orderId) không hợp lệ';
    } else {
      cleanOrderId = orderId.trim();
    }
  }

  let cleanInpatientRecordId = null;
  if (!isBlank(inpatientRecordId)) {
    if (typeof inpatientRecordId !== 'string' || !isValidObjectId(inpatientRecordId.trim())) {
      errors.inpatientRecordId = 'Mã hồ sơ nội trú (inpatientRecordId) không hợp lệ';
    } else {
      cleanInpatientRecordId = inpatientRecordId.trim();
    }
  }

  if (!cleanOrderId && !cleanInpatientRecordId && !errors.orderId && !errors.inpatientRecordId) {
    errors.orderId = 'Vui lòng cung cấp orderId hoặc inpatientRecordId để lập hóa đơn';
  }

  const cleanRetailItems = sanitizeProductLineItems(
    retailItems,
    'retailItems',
    MAX_RETAIL_QUANTITY,
    errors
  );

  const cleanPrescriptionQuantities = sanitizeProductLineItems(
    prescriptionQuantities,
    'prescriptionQuantities',
    MAX_PRESCRIPTION_QUANTITY,
    errors
  );

  let cleanInpatientDailyRate;
  if (inpatientDailyRate !== undefined && inpatientDailyRate !== null && inpatientDailyRate !== '') {
    const rate =
      typeof inpatientDailyRate === 'string'
        ? Number(inpatientDailyRate.trim())
        : inpatientDailyRate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
      errors.inpatientDailyRate = 'Đơn giá ngày nội trú phải là số lớn hơn hoặc bằng 0';
    } else {
      cleanInpatientDailyRate = Math.round(rate);
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      orderId: cleanOrderId,
      inpatientRecordId: cleanInpatientRecordId,
      retailItems: cleanRetailItems,
      prescriptionQuantities: cleanPrescriptionQuantities,
      inpatientDailyRate: cleanInpatientDailyRate,
    },
  };
};

/**
 * Validate thêm / bớt sản phẩm bán lẻ trên hóa đơn đang Unpaid (UC-45 Alt Flow 5a, SCR-20)
 */
const validateUpdateInvoiceRetailItems = (body = {}) => {
  const errors = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu yêu cầu không hợp lệ' },
      value: null,
    };
  }

  const { addItems, removeItemIds } = body;
  const cleanAddItems = sanitizeProductLineItems(
    addItems,
    'addItems',
    MAX_RETAIL_QUANTITY,
    errors
  );

  const cleanRemoveIds = [];
  if (removeItemIds !== undefined) {
    if (!Array.isArray(removeItemIds)) {
      errors.removeItemIds = 'removeItemIds phải là một mảng ID dòng hóa đơn';
    } else {
      for (let i = 0; i < removeItemIds.length; i++) {
        const itemId = removeItemIds[i];
        if (typeof itemId !== 'string' || !isValidObjectId(itemId.trim())) {
          errors[`removeItemIds[${i}]`] = 'ID dòng hóa đơn cần xóa không hợp lệ';
        } else {
          cleanRemoveIds.push(itemId.trim());
        }
      }
    }
  }

  if (
    Object.keys(errors).length === 0 &&
    cleanAddItems.length === 0 &&
    cleanRemoveIds.length === 0
  ) {
    errors.items = 'Vui lòng cung cấp addItems hoặc removeItemIds để cập nhật hóa đơn';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      addItems: cleanAddItems,
      removeItemIds: cleanRemoveIds,
    },
  };
};

/**
 * Validate xác nhận thanh toán tiền mặt (UC-46)
 */
const validatePayCash = (body = {}) => {
  const errors = {};
  if (body && (typeof body !== 'object' || Array.isArray(body))) {
    return {
      isValid: false,
      errors: { body: 'Dữ liệu yêu cầu không hợp lệ' },
      value: null,
    };
  }

  let cleanCashReceived;
  if (body && body.cashReceived !== undefined && body.cashReceived !== null && body.cashReceived !== '') {
    const amount =
      typeof body.cashReceived === 'string'
        ? Number(body.cashReceived.trim())
        : body.cashReceived;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      errors.cashReceived = 'Số tiền khách đưa (cashReceived) phải là số không âm';
    } else {
      cleanCashReceived = amount;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: { cashReceived: cleanCashReceived },
  };
};

/**
 * Validate query lọc danh sách hóa đơn (SCR-15, SCR-20)
 */
const validateListInvoicesQuery = (query = {}) => {
  const errors = {};
  const { paymentStatus, paymentMethod, orderId, inpatientRecordId, petId, code, from, to } = query;

  if (!isBlank(paymentStatus) && !PAYMENT_STATUSES.includes(paymentStatus)) {
    errors.paymentStatus = `Trạng thái thanh toán phải là một trong: ${PAYMENT_STATUSES.join(', ')}`;
  }

  if (!isBlank(paymentMethod) && !PAYMENT_METHODS.includes(paymentMethod)) {
    errors.paymentMethod = `Phương thức thanh toán phải là một trong: ${PAYMENT_METHODS.join(', ')}`;
  }

  for (const [key, val] of [
    ['orderId', orderId],
    ['inpatientRecordId', inpatientRecordId],
    ['petId', petId],
  ]) {
    if (!isBlank(val) && (typeof val !== 'string' || !isValidObjectId(val.trim()))) {
      errors[key] = `${key} không hợp lệ`;
    }
  }

  if (!isBlank(from) && !isRealDate(from)) {
    errors.from = 'Ngày bắt đầu (from) phải đúng định dạng YYYY-MM-DD';
  }
  if (!isBlank(to) && !isRealDate(to)) {
    errors.to = 'Ngày kết thúc (to) phải đúng định dạng YYYY-MM-DD';
  }
  if (!errors.from && !errors.to && from && to && from > to) {
    errors.from = 'Ngày bắt đầu (from) không được sau ngày kết thúc (to)';
  }

  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      paymentStatus: !isBlank(paymentStatus) ? paymentStatus : undefined,
      paymentMethod: !isBlank(paymentMethod) ? paymentMethod : undefined,
      orderId: !isBlank(orderId) ? orderId.trim() : undefined,
      inpatientRecordId: !isBlank(inpatientRecordId) ? inpatientRecordId.trim() : undefined,
      petId: !isBlank(petId) ? petId.trim() : undefined,
      code: !isBlank(code) ? String(code).trim().toUpperCase() : undefined,
      from: !isBlank(from) ? from : undefined,
      to: !isBlank(to) ? to : undefined,
      page,
      limit,
    },
  };
};

/**
 * Validate query báo cáo sản phẩm bán chạy theo khoảng ngày [from, to]
 * Mặc định: to = hôm nay (giờ VN), from = to.
 */
const validateBestSellingProductsQuery = (query = {}) => {
  const errors = {};
  const { from, to, category, sortBy } = query;

  if (!isBlank(from) && !isRealDate(from)) {
    errors.from = 'Ngày bắt đầu (from) phải đúng định dạng YYYY-MM-DD';
  }
  if (!isBlank(to) && !isRealDate(to)) {
    errors.to = 'Ngày kết thúc (to) phải đúng định dạng YYYY-MM-DD';
  }

  const today = new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  const cleanTo = !isBlank(to) ? to : today;
  const cleanFrom = !isBlank(from) ? from : cleanTo;

  if (!errors.from && !errors.to) {
    if (cleanFrom > cleanTo) {
      errors.from = 'Ngày bắt đầu (from) không được sau ngày kết thúc (to)';
    } else {
      const days =
        (Date.parse(`${cleanTo}T00:00:00Z`) - Date.parse(`${cleanFrom}T00:00:00Z`)) / MS_PER_DAY + 1;
      if (days > MAX_REPORT_RANGE_DAYS) {
        errors.to = `Khoảng thời gian báo cáo tối đa ${MAX_REPORT_RANGE_DAYS} ngày`;
      }
    }
  }

  if (!isBlank(category) && !PRODUCT_CATEGORIES.includes(category)) {
    errors.category = `Danh mục sản phẩm phải là một trong: ${PRODUCT_CATEGORIES.join(', ')}`;
  }

  if (!isBlank(sortBy) && !BEST_SELLING_SORT_FIELDS.includes(sortBy)) {
    errors.sortBy = `Tiêu chí sắp xếp (sortBy) phải là một trong: ${BEST_SELLING_SORT_FIELDS.join(', ')}`;
  }

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    value: {
      from: cleanFrom,
      to: cleanTo,
      category: !isBlank(category) ? category : undefined,
      sortBy: !isBlank(sortBy) ? sortBy : 'quantity',
      limit,
    },
  };
};

module.exports = {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  validateObjectIdParam,
  validateCreateInvoice,
  validateUpdateInvoiceRetailItems,
  validatePayCash,
  validateListInvoicesQuery,
  validateBestSellingProductsQuery,
};