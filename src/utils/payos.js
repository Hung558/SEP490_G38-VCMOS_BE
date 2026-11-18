const crypto = require('crypto');

const PAYOS_API_BASE_URL = 'https://api-merchant.payos.vn/v2/payment-requests';
const PAYOS_EXPIRE_MINUTES = 15;
const REQUEST_TIMEOUT_MS = 15000;

const hasPayosConfig = () =>
  Boolean(process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY);

const getPayosConfig = () => {
  const clientId = process.env.PAYOS_CLIENT_ID;
  const apiKey = process.env.PAYOS_API_KEY;
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const returnUrl = process.env.PAYOS_RETURN_URL || `${frontendUrl}/clinic/invoices`;
  const cancelUrl = process.env.PAYOS_CANCEL_URL || `${frontendUrl}/clinic/invoices`;

  if (!clientId || !apiKey || !checksumKey) {
    const err = new Error(
      'Chưa cấu hình đầy đủ PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY trong .env'
    );
    err.statusCode = 500;
    throw err;
  }

  return { clientId, apiKey, checksumKey, returnUrl, cancelUrl };
};

// Sắp xếp các key của object theo alphabet (chuẩn tạo chữ ký Webhook của PayOS)
const sortObjectByKey = (obj) =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});

const convertObjectToQueryStr = (obj) =>
  Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .map((key) => {
      let value = obj[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(value.map((el) => (el && typeof el === 'object' ? sortObjectByKey(el) : el)));
      } else if ([null, undefined, 'undefined', 'null'].includes(value)) {
        value = '';
      }
      return `${key}=${value}`;
    })
    .join('&');

/**
 * Tạo chữ ký HMAC-SHA256 khi gọi API tạo link thanh toán PayOS (5 trường theo alphabet)
 */
const buildPayosCreateSignature = ({ amount, cancelUrl, description, orderCode, returnUrl }, checksumKey) => {
  const raw = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return crypto.createHmac('sha256', checksumKey).update(raw).digest('hex');
};

/**
 * Kiểm tra chữ ký HMAC-SHA256 của Webhook do PayOS gửi về
 */
const verifyPayosWebhookSignature = (webhookBody) => {
  const { checksumKey } = getPayosConfig();
  if (!webhookBody || typeof webhookBody !== 'object' || !webhookBody.data || !webhookBody.signature) {
    return false;
  }

  const receivedSig = String(webhookBody.signature).trim().toLowerCase();
  const sortedData = sortObjectByKey(webhookBody.data);
  const queryStr = convertObjectToQueryStr(sortedData);
  const expectedSig = crypto.createHmac('sha256', checksumKey).update(queryStr).digest('hex').toLowerCase();

  if (receivedSig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(receivedSig, 'utf-8'), Buffer.from(expectedSig, 'utf-8'));
};

const callPayosApi = async (url, options = {}) => {
  const { clientId, apiKey } = getPayosConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok || !json || json.code !== '00') {
      const msg = json?.desc || json?.message || `Lỗi kết nối cổng thanh toán PayOS (${response.status})`;
      const err = new Error(msg);
      err.statusCode = 502;
      throw err;
    }

    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Kết nối tới PayOS quá thời gian chờ, vui lòng thử lại');
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Gọi PayOS API v2 tạo link thanh toán & chuỗi VietQR thật (hiệu lực 15 phút)
 */
const createPayosPaymentLink = async ({ orderCode, amount, description, now = new Date() }) => {
  const { checksumKey, returnUrl, cancelUrl } = getPayosConfig();
  const cleanAmount = Math.round(amount);
  const cleanOrderCode = Number(orderCode);
  const cleanDesc = String(description || 'Thanh toan VCMOS').slice(0, 25);
  const expiredAtUnix = Math.floor(now.getTime() / 1000) + PAYOS_EXPIRE_MINUTES * 60;

  const signature = buildPayosCreateSignature(
    {
      amount: cleanAmount,
      cancelUrl,
      description: cleanDesc,
      orderCode: cleanOrderCode,
      returnUrl,
    },
    checksumKey
  );

  const data = await callPayosApi(PAYOS_API_BASE_URL, {
    method: 'POST',
    body: JSON.stringify({
      orderCode: cleanOrderCode,
      amount: cleanAmount,
      description: cleanDesc,
      returnUrl,
      cancelUrl,
      expiredAt: expiredAtUnix,
      signature,
    }),
  });

  return {
    ...data,
    expiresAt: new Date(expiredAtUnix * 1000),
  };
};

/**
 * Chủ động kiểm tra trạng thái thanh toán của đơn trên PayOS (dùng để chốt PAID ngay cả ở localhost)
 */
const getPayosPaymentInfo = async (orderCodeOrLinkId) => {
  return callPayosApi(`${PAYOS_API_BASE_URL}/${encodeURIComponent(String(orderCodeOrLinkId))}`, {
    method: 'GET',
  });
};

module.exports = {
  PAYOS_EXPIRE_MINUTES,
  hasPayosConfig,
  buildPayosCreateSignature,
  verifyPayosWebhookSignature,
  createPayosPaymentLink,
  getPayosPaymentInfo,
};

