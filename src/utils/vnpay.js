const crypto = require('crypto');
const qs = require('qs');

const DEFAULT_VNP_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const DEFAULT_VNP_RETURN_URL = 'http://localhost:9999/api/invoices/vnpay-return';
const VNPAY_EXPIRE_MINUTES = 15;

// Định dạng thời gian YYYYMMDDHHmmss theo giờ Việt Nam (UTC+7), không phụ thuộc TZ của máy chủ
const formatVnpayDateVN = (date) => {
  const vnDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (num) => String(num).padStart(2, '0');
  return (
    String(vnDate.getUTCFullYear()) +
    pad(vnDate.getUTCMonth() + 1) +
    pad(vnDate.getUTCDate()) +
    pad(vnDate.getUTCHours()) +
    pad(vnDate.getUTCMinutes()) +
    pad(vnDate.getUTCSeconds())
  );
};

// Chuẩn hóa IPv6 localhost / IPv4-mapped IPv6 về IPv4 để cổng VNPay chấp nhận
const normalizeClientIp = (rawIp) => {
  if (!rawIp || typeof rawIp !== 'string') return '127.0.0.1';
  const firstIp = rawIp.split(',')[0].trim();
  if (firstIp === '::1') return '127.0.0.1';
  if (firstIp.startsWith('::ffff:')) return firstIp.slice(7);
  return firstIp || '127.0.0.1';
};

// Sắp xếp tham số theo đúng chuẩn ký của VNPay v2.1.0 (encode URI + đổi khoảng trắng thành '+')
const sortAndEncodeVnpayParams = (params) => {
  const sortedKeys = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .map((key) => encodeURIComponent(key))
    .sort();

  const sorted = {};
  for (const encodedKey of sortedKeys) {
    const rawKey = decodeURIComponent(encodedKey);
    sorted[encodedKey] = encodeURIComponent(String(params[rawKey])).replace(/%20/g, '+');
  }
  return sorted;
};

const signVnpayData = (sortedEncodedParams, hashSecret) => {
  const signData = qs.stringify(sortedEncodedParams, { encode: false });
  return crypto
    .createHmac('sha512', hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
};

const getVnpayConfig = () => {
  const tmnCode = process.env.VNP_TMN_CODE;
  const hashSecret = process.env.VNP_HASH_SECRET;
  const paymentUrl = process.env.VNP_URL || DEFAULT_VNP_URL;
  const returnUrl = process.env.VNP_RETURN_URL || DEFAULT_VNP_RETURN_URL;

  if (!tmnCode || !hashSecret) {
    const err = new Error('Chưa cấu hình đầy đủ VNP_TMN_CODE và VNP_HASH_SECRET trong biến môi trường');
    err.statusCode = 500;
    throw err;
  }

  return { tmnCode, hashSecret, paymentUrl, returnUrl };
};

/**
 * Tạo đường dẫn thanh toán VNPay QR (hiệu lực 15 phút theo SRS JOB-04)
 */
const buildVnpayPaymentUrl = ({ vnpayTxnRef, amount, orderInfo, ipAddr, now = new Date() }) => {
  const { tmnCode, hashSecret, paymentUrl, returnUrl } = getVnpayConfig();

  const createDate = formatVnpayDateVN(now);
  const expireAt = new Date(now.getTime() + VNPAY_EXPIRE_MINUTES * 60 * 1000);
  const expireDate = formatVnpayDateVN(expireAt);

  const rawParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: String(vnpayTxnRef),
    vnp_OrderInfo: orderInfo || `Thanh toan hoa don ${vnpayTxnRef}`,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(amount) * 100,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: normalizeClientIp(ipAddr),
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };

  const sortedParams = sortAndEncodeVnpayParams(rawParams);
  sortedParams.vnp_SecureHash = signVnpayData(sortedParams, hashSecret);

  return {
    paymentUrl: `${paymentUrl}?${qs.stringify(sortedParams, { encode: false })}`,
    expiresAt: expireAt,
  };
};

/**
 * Kiểm tra chữ ký HMAC-SHA512 gửi về từ VNPay IPN / Return URL (BR-17)
 */
const verifyVnpaySignature = (query = {}) => {
  const { hashSecret } = getVnpayConfig();
  const receivedHash = typeof query.vnp_SecureHash === 'string' ? query.vnp_SecureHash.trim().toLowerCase() : '';
  if (!receivedHash) return false;

  const paramsToSign = { ...query };
  delete paramsToSign.vnp_SecureHash;
  delete paramsToSign.vnp_SecureHashType;

  const sortedParams = sortAndEncodeVnpayParams(paramsToSign);
  const expectedHash = signVnpayData(sortedParams, hashSecret).toLowerCase();

  if (receivedHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(receivedHash, 'utf-8'), Buffer.from(expectedHash, 'utf-8'));
};

module.exports = {
  VNPAY_EXPIRE_MINUTES,
  normalizeClientIp,
  formatVnpayDateVN,
  sortAndEncodeVnpayParams,
  signVnpayData,
  buildVnpayPaymentUrl,
  verifyVnpaySignature,
};

