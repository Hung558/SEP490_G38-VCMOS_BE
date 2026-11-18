const crypto = require('crypto');
const PdfPrinter = require('pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');
const Invoice = require('../models/Invoice');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');
const MedicalRecord = require('../models/MedicalRecord');
const InpatientRecord = require('../models/InpatientRecord');
const Service = require('../models/Service');
const Product = require('../models/Product');
const Pet = require('../models/Pet');
const Cage = require('../models/Cage');
const CageAssignment = require('../models/CageAssignment');
const { runWithTransaction } = require('../utils/transaction');
const { buildVnpayPaymentUrl, verifyVnpaySignature } = require('../utils/vnpay');
const {
  hasPayosConfig,
  createPayosPaymentLink,
  getPayosPaymentInfo,
  verifyPayosWebhookSignature,
} = require('../utils/payos');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_CODE_RETRIES = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, Việt Nam không có DST

const pdfPrinter = new PdfPrinter({
  Roboto: {
    normal: Buffer.from(vfsFonts.pdfMake.vfs['Roboto-Regular.ttf'], 'base64'),
    bold: Buffer.from(vfsFonts.pdfMake.vfs['Roboto-Medium.ttf'], 'base64'),
    italics: Buffer.from(vfsFonts.pdfMake.vfs['Roboto-Italic.ttf'], 'base64'),
    bolditalics: Buffer.from(vfsFonts.pdfMake.vfs['Roboto-MediumItalic.ttf'], 'base64'),
  },
});

const httpError = (statusCode, message, errors) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (errors) err.errors = errors;
  return err;
};

const generateInvoiceCode = () => {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return `INV-${suffix}`;
};

const isDuplicateFieldError = (err, fieldName) =>
  err &&
  err.code === 11000 &&
  Boolean(err.keyPattern?.[fieldName] || String(err.message).includes(fieldName));

const INVOICE_POPULATE = [
  {
    path: 'orderId',
    select: 'code date derivedStatus petId ownerId',
    populate: [
      { path: 'petId', select: 'code name species breed weight' },
      { path: 'ownerId', select: 'code fullName phone email' },
    ],
  },
  {
    path: 'inpatientRecordId',
    select: 'petId orderId cageId admittedAt dischargedAt status initialDiagnosis',
    populate: [
      {
        path: 'petId',
        select: 'code name species breed weight ownerId',
        populate: { path: 'ownerId', select: 'code fullName phone email' },
      },
      { path: 'cageId', select: 'label size zone' },
    ],
  },
  { path: 'issuedById', select: 'code fullName role' },
];

const formatProductSnapshotName = (product) =>
  product.unit ? `${product.name} (${product.unit})` : product.name;

const formatCurrencyVND = (amount) => `${(Number(amount) || 0).toLocaleString('vi-VN')} đ`;

const formatDateTimeVN = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
};

/**
 * Cộng dồn số lượng cho các phần tử trùng productId
 */
const mergeProductQuantities = (items = []) => {
  const merged = new Map();
  for (const item of items) {
    const key = String(item.productId);
    merged.set(key, (merged.get(key) || 0) + item.quantity);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
};

/**
 * Tải sản phẩm và kiểm tra trạng thái Active trước khi đưa vào hóa đơn bán lẻ (BR-16 / MSG27)
 */
const buildRetailSnapshotItems = async (retailItems = []) => {
  const mergedItems = mergeProductQuantities(retailItems);
  if (mergedItems.length === 0) return [];

  const productIds = mergedItems.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const snapshotLines = [];
  for (const item of mergedItems) {
    const product = productMap.get(String(item.productId));
    if (!product) {
      throw httpError(404, 'Không tìm thấy sản phẩm trong danh mục');
    }
    if (product.status !== 'Active') {
      throw httpError(
        400,
        `Sản phẩm "${product.name}" hiện đang ngừng kinh doanh hoặc hết hàng (Inactive), không thể bán`
      );
    }

    const unitPrice = Number(product.unitPrice) || 0;
    snapshotLines.push({
      type: 'Product',
      refId: product._id,
      itemNameSnapshot: formatProductSnapshotName(product),
      unitPriceSnapshot: unitPrice,
      quantity: item.quantity,
      subtotal: unitPrice * item.quantity,
    });
  }

  return snapshotLines;
};

/**
 * Kiểm tra quyền sở hữu hóa đơn đối với khách hàng PetOwner (BR-23 - chống IDOR)
 */
const resolveInvoiceOwnerId = async (invoice) => {
  const orderOwnerId = invoice.orderId?.ownerId?._id || invoice.orderId?.ownerId;
  if (orderOwnerId) return String(orderOwnerId);

  const inpatientOwnerId =
    invoice.inpatientRecordId?.petId?.ownerId?._id || invoice.inpatientRecordId?.petId?.ownerId;
  if (inpatientOwnerId) return String(inpatientOwnerId);

  const petId =
    invoice.orderId?.petId?._id ||
    invoice.orderId?.petId ||
    invoice.inpatientRecordId?.petId?._id ||
    invoice.inpatientRecordId?.petId;
  if (petId) {
    const pet = await Pet.findById(petId).select('ownerId').lean();
    if (pet?.ownerId) return String(pet.ownerId);
  }
  return null;
};

const assertCanAccessInvoice = async (currentUser, invoice) => {
  if (!currentUser || currentUser.role !== 'PetOwner') return;
  const ownerId = await resolveInvoiceOwnerId(invoice);
  if (!ownerId || String(ownerId) !== String(currentUser.id)) {
    throw httpError(403, 'Bạn không có quyền truy cập hóa đơn này');
  }
};

/**
 * 1. Lễ tân lập hóa đơn tổng hợp (POST /api/invoices — UC-45, BR-16, BR-24)
 * - Tự động gom dịch vụ đã Done, đơn thuốc trong MedicalRecord, số ngày nội trú Discharged và sản phẩm bán lẻ.
 * - Lưu snapshot tên & đơn giá tại thời điểm lập hóa đơn.
 */
const createInvoice = async (receptionistId, payload) => {
  const {
    orderId,
    inpatientRecordId,
    retailItems = [],
    prescriptionQuantities = [],
    inpatientDailyRate,
  } = payload;

  let inpatientRecord = null;
  if (inpatientRecordId) {
    inpatientRecord = await InpatientRecord.findById(inpatientRecordId).lean();
    if (!inpatientRecord) {
      throw httpError(404, 'Không tìm thấy hồ sơ điều trị nội trú');
    }
  } else if (orderId) {
    inpatientRecord = await InpatientRecord.findOne({ orderId }).lean();
  }

  if (inpatientRecord && orderId && String(inpatientRecord.orderId) !== String(orderId)) {
    throw httpError(400, 'Hồ sơ nội trú không thuộc đơn lịch hẹn đã chọn');
  }

  if (inpatientRecord && inpatientRecord.status === 'Admitted') {
    throw httpError(409, 'Thú cưng đang trong đợt điều trị nội trú, cần xuất viện trước khi lập hóa đơn');
  }

  const effectiveOrderId = orderId || (inpatientRecord ? String(inpatientRecord.orderId) : null);
  let order = null;
  if (effectiveOrderId) {
    order = await AppointmentOrder.findById(effectiveOrderId).lean();
    if (!order) {
      throw httpError(404, 'Không tìm thấy đơn lịch hẹn');
    }
    if (order.derivedStatus === 'Cancelled') {
      throw httpError(409, 'Không thể lập hóa đơn cho lịch hẹn đã bị hủy');
    }
    if (order.derivedStatus === 'Done') {
      throw httpError(409, 'Lịch hẹn này đã hoàn tất thanh toán trước đó');
    }
    if (!inpatientRecord && order.derivedStatus !== 'WaitOwner') {
      throw httpError(
        409,
        `Chỉ có thể lập hóa đơn khi các dịch vụ đã hoàn tất (WaitOwner), hiện tại là "${order.derivedStatus}"`
      );
    }
  }

  // Kiểm tra trùng hóa đơn trước khi tạo (BR-16)
  const duplicateQuery = [];
  if (effectiveOrderId) duplicateQuery.push({ orderId: effectiveOrderId });
  if (inpatientRecord) duplicateQuery.push({ inpatientRecordId: inpatientRecord._id });
  if (duplicateQuery.length > 0) {
    const existingInvoice = await Invoice.exists({ $or: duplicateQuery });
    if (existingInvoice) {
      throw httpError(409, 'Đơn khám hoặc hồ sơ nội trú này đã được lập hóa đơn trước đó');
    }
  }

  const items = [];
  let orderInpatientService = null;

  // 1. Gom các dịch vụ đã Done và thuốc kê đơn trong MedicalRecord
  if (order) {
    const doneServices = await AppointmentService.find({
      orderId: order._id,
      status: 'Done',
    })
      .populate('serviceId', 'name category basePrice')
      .sort({ sequenceNo: 1 })
      .lean();

    for (const apptSvc of doneServices) {
      const svc = apptSvc.serviceId;
      if (!svc) continue;

      // Nếu là dịch vụ nội trú và đã có InpatientRecord -> tính theo số ngày nội trú (InpatientDay) để tránh tính trùng
      if (inpatientRecord && svc.category === 'Inpatient') {
        orderInpatientService = svc;
        continue;
      }

      const unitPrice = Number(svc.basePrice) || 0;
      items.push({
        type: 'Service',
        refId: svc._id,
        itemNameSnapshot: svc.name,
        unitPriceSnapshot: unitPrice,
        quantity: 1,
        subtotal: unitPrice,
      });
    }

    const doneServiceIds = doneServices.map((s) => s._id);
    if (doneServiceIds.length > 0) {
      const medicalRecords = await MedicalRecord.find({
        appointmentServiceId: { $in: doneServiceIds },
      }).lean();

      const allPrescriptions = medicalRecords.flatMap((mr) => mr.prescriptions || []);
      if (allPrescriptions.length > 0) {
        const overrideQtyMap = new Map(
          mergeProductQuantities(prescriptionQuantities).map((i) => [String(i.productId), i.quantity])
        );
        const rxProductIds = [...new Set(allPrescriptions.map((rx) => String(rx.productId)))];
        const rxProducts = await Product.find({ _id: { $in: rxProductIds } }).lean();
        const rxProductMap = new Map(rxProducts.map((p) => [String(p._id), p]));

        for (const rx of allPrescriptions) {
          const product = rxProductMap.get(String(rx.productId));
          const unitPrice = product ? Number(product.unitPrice) || 0 : 0;
          const qty = overrideQtyMap.get(String(rx.productId)) || 1;
          const displayName = product
            ? formatProductSnapshotName(product)
            : rx.unitSnapshot
              ? `${rx.productNameSnapshot || 'Thuốc kê đơn'} (${rx.unitSnapshot})`
              : rx.productNameSnapshot || 'Thuốc kê đơn';

          items.push({
            type: 'Product',
            refId: rx.productId,
            itemNameSnapshot: displayName,
            unitPriceSnapshot: unitPrice,
            quantity: qty,
            subtotal: unitPrice * qty,
          });
        }
      }
    }
  }

  // 2. Gom phí ngày nằm viện nếu có đợt điều trị nội trú đã xuất viện
  if (inpatientRecord) {
    const admittedAt = new Date(inpatientRecord.admittedAt).getTime();
    const dischargedAt = new Date(inpatientRecord.dischargedAt || Date.now()).getTime();
    const days = Math.max(1, Math.ceil((dischargedAt - admittedAt) / MS_PER_DAY));

    let refId = inpatientRecord._id;
    let nameSnapshot = 'Phí điều trị nội trú theo ngày';
    let dailyRate = 0;

    if (orderInpatientService) {
      refId = orderInpatientService._id;
      nameSnapshot = `${orderInpatientService.name} (theo ngày)`;
      dailyRate = Number(orderInpatientService.basePrice) || 0;
    } else if (inpatientDailyRate !== undefined) {
      dailyRate = inpatientDailyRate;
    } else {
      const catalogInpatientService = await Service.findOne({
        category: 'Inpatient',
        status: 'Active',
      })
        .select('name basePrice')
        .lean();
      if (catalogInpatientService) {
        refId = catalogInpatientService._id;
        nameSnapshot = `${catalogInpatientService.name} (theo ngày)`;
        dailyRate = Number(catalogInpatientService.basePrice) || 0;
      }
    }

    items.push({
      type: 'InpatientDay',
      refId,
      itemNameSnapshot: nameSnapshot,
      unitPriceSnapshot: dailyRate,
      quantity: days,
      subtotal: dailyRate * days,
    });
  }

  // 3. Gom thêm các sản phẩm bán lẻ tại quầy (kiểm tra Active theo BR-16)
  const retailLines = await buildRetailSnapshotItems(retailItems);
  items.push(...retailLines);

  if (items.length === 0) {
    throw httpError(400, 'Không có dịch vụ, ngày nội trú hoặc sản phẩm nào để lập hóa đơn');
  }

  const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

  for (let attempt = 1; attempt <= MAX_CODE_RETRIES; attempt++) {
    try {
      const created = await Invoice.create({
        code: generateInvoiceCode(),
        orderId: effectiveOrderId || null,
        inpatientRecordId: inpatientRecord ? inpatientRecord._id : null,
        issuedById: receptionistId,
        items,
        totalAmount,
        paymentMethod: null,
        paymentStatus: 'Unpaid',
        issuedAt: new Date(),
      });

      const populated = await Invoice.findById(created._id).populate(INVOICE_POPULATE).lean();
      return {
        message: 'Lập hóa đơn thành công',
        data: populated,
      };
    } catch (err) {
      if (isDuplicateFieldError(err, 'code')) continue;
      if (err.code === 11000) {
        throw httpError(409, 'Đơn khám hoặc hồ sơ nội trú này đã được lập hóa đơn trước đó');
      }
      throw err;
    }
  }

  throw httpError(500, 'Không thể tạo mã hóa đơn, vui lòng thử lại');
};

/**
 * 2. Thêm / bớt sản phẩm bán lẻ trước khi thanh toán (PATCH /api/invoices/:id/items — UC-45 Alt Flow 5a)
 */
const updateInvoiceRetailItems = async (invoiceId, { addItems = [], removeItemIds = [] }) => {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }
  if (invoice.paymentStatus !== 'Unpaid') {
    throw httpError(409, `Không thể chỉnh sửa hóa đơn đang ở trạng thái "${invoice.paymentStatus}"`);
  }

  let nextItems = [...(invoice.items || [])];

  if (removeItemIds.length > 0) {
    const removeSet = new Set(removeItemIds.map(String));
    const currentItemMap = new Map(nextItems.map((it) => [String(it._id), it]));

    for (const targetId of removeSet) {
      const target = currentItemMap.get(targetId);
      if (!target) {
        throw httpError(404, `Không tìm thấy dòng hóa đơn có ID "${targetId}"`);
      }
      if (target.type !== 'Product') {
        throw httpError(400, 'Chỉ được phép gỡ bỏ dòng sản phẩm/thuốc, không thể xóa dịch vụ đã hoàn thành');
      }
    }

    nextItems = nextItems.filter((it) => !removeSet.has(String(it._id)));
  }

  if (addItems.length > 0) {
    const addedSnapshots = await buildRetailSnapshotItems(addItems);
    nextItems.push(...addedSnapshots);
  }

  if (nextItems.length === 0) {
    throw httpError(400, 'Hóa đơn phải có ít nhất một khoản mục');
  }

  const nextTotal = nextItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);

  const updated = await Invoice.findOneAndUpdate(
    { _id: invoiceId, paymentStatus: 'Unpaid' },
    { $set: { items: nextItems, totalAmount: nextTotal } },
    { returnDocument: 'after' }
  )
    .populate(INVOICE_POPULATE)
    .lean();

  if (!updated) {
    throw httpError(409, 'Hóa đơn đã được thanh toán hoặc thay đổi trạng thái');
  }

  return {
    message: 'Cập nhật sản phẩm hóa đơn thành công',
    data: updated,
  };
};

/**
 * Hoàn tất đồng bộ hồ sơ sau khi hóa đơn chuyển Paid (UC-46, UC-47, BR-14, UC-31):
 * - Đổi AppointmentOrder sang Done.
 * - Khóa vĩnh viễn toàn bộ MedicalRecord của đơn sang Finalized.
 * - Đóng các CageAssignment đang mở của đơn và trả chuồng về Available.
 */
const finalizeAfterPayment = async (invoice, paidAt, session = null) => {
  const sessionOpt = session ? { session } : undefined;
  let targetOrderId = invoice.orderId?._id || invoice.orderId || null;
  let inpatientCageId = null;

  if (invoice.inpatientRecordId) {
    const inpQuery = InpatientRecord.findById(invoice.inpatientRecordId).select('orderId cageId');
    const inp = session ? await inpQuery.session(session).lean() : await inpQuery.lean();
    if (inp) {
      if (!targetOrderId && inp.orderId) targetOrderId = inp.orderId;
      if (inp.cageId) inpatientCageId = inp.cageId;
    }
  }

  // Snapshot trạng thái trước để hoàn tác thủ công khi chạy MongoDB standalone không có Transaction
  let previousOrderStatus = null;
  let draftedRecordIds = [];
  let closedAssignmentIds = [];
  let releasedCageIds = [];

  try {
    if (targetOrderId) {
      const orderQuery = AppointmentOrder.findById(targetOrderId).select('derivedStatus');
      const existingOrder = session ? await orderQuery.session(session).lean() : await orderQuery.lean();
      if (existingOrder && existingOrder.derivedStatus !== 'Done') {
        previousOrderStatus = existingOrder.derivedStatus;
        await AppointmentOrder.updateOne(
          { _id: targetOrderId },
          { $set: { derivedStatus: 'Done' } },
          sessionOpt
        );
      }

      const svcQuery = AppointmentService.find({ orderId: targetOrderId }).select('_id');
      const services = session ? await svcQuery.session(session).lean() : await svcQuery.lean();
      const serviceIds = services.map((s) => s._id);

      if (serviceIds.length > 0) {
        const mrQuery = MedicalRecord.find({
          appointmentServiceId: { $in: serviceIds },
          status: 'Draft',
        }).select('_id');
        const draftRecords = session ? await mrQuery.session(session).lean() : await mrQuery.lean();
        draftedRecordIds = draftRecords.map((r) => r._id);

        if (draftedRecordIds.length > 0) {
          await MedicalRecord.updateMany(
            { _id: { $in: draftedRecordIds } },
            { $set: { status: 'Finalized' } },
            sessionOpt
          );
        }
      }

      const openAssignQuery = CageAssignment.find({
        orderId: targetOrderId,
        releasedAt: null,
      }).select('_id cageId');
      const openAssignments = session
        ? await openAssignQuery.session(session).lean()
        : await openAssignQuery.lean();

      if (openAssignments.length > 0) {
        closedAssignmentIds = openAssignments.map((a) => a._id);
        releasedCageIds = [...new Set(openAssignments.map((a) => String(a.cageId)))];

        await CageAssignment.updateMany(
          { _id: { $in: closedAssignmentIds }, releasedAt: null },
          { $set: { releasedAt: paidAt } },
          sessionOpt
        );

        await Cage.updateMany(
          { _id: { $in: releasedCageIds } },
          { $set: { status: 'Available' } },
          sessionOpt
        );
      }
    }

    if (inpatientCageId && !releasedCageIds.includes(String(inpatientCageId))) {
      const stillOpenQuery = CageAssignment.exists({ cageId: inpatientCageId, releasedAt: null });
      const stillOpen = session ? await stillOpenQuery.session(session) : await stillOpenQuery;
      if (!stillOpen) {
        await Cage.updateOne({ _id: inpatientCageId }, { $set: { status: 'Available' } }, sessionOpt);
      }
    }
  } catch (err) {
    if (!session) {
      await Promise.allSettled([
        previousOrderStatus
          ? AppointmentOrder.updateOne({ _id: targetOrderId }, { $set: { derivedStatus: previousOrderStatus } })
          : Promise.resolve(),
        draftedRecordIds.length > 0
          ? MedicalRecord.updateMany({ _id: { $in: draftedRecordIds } }, { $set: { status: 'Draft' } })
          : Promise.resolve(),
        closedAssignmentIds.length > 0
          ? CageAssignment.updateMany({ _id: { $in: closedAssignmentIds } }, { $set: { releasedAt: null } })
          : Promise.resolve(),
        releasedCageIds.length > 0
          ? Cage.updateMany({ _id: { $in: releasedCageIds } }, { $set: { status: 'Occupied' } })
          : Promise.resolve(),
      ]);
    }
    throw err;
  }
};

/**
 * Chuyển trạng thái hóa đơn Unpaid -> Paid (theo paymentMethod) và đồng bộ đóng đơn / khóa SOAP / nhả chuồng trong Transaction
 */
const markInvoicePaidAndFinalize = async (invoiceId, paymentMethod, paidAt = new Date()) => {
  return runWithTransaction(async (session) => {
    const updateOpts = session ? { returnDocument: 'after', session } : { returnDocument: 'after' };
    const paidDoc = await Invoice.findOneAndUpdate(
      { _id: invoiceId, paymentStatus: 'Unpaid' },
      { $set: { paymentMethod, paymentStatus: 'Paid', paidAt } },
      updateOpts
    ).lean();

    if (!paidDoc) return null;

    try {
      await finalizeAfterPayment(paidDoc, paidAt, session);
    } catch (err) {
      if (!session) {
        await Invoice.updateOne(
          { _id: invoiceId },
          { $set: { paymentMethod: null, paymentStatus: 'Unpaid', paidAt: null } }
        );
      }
      throw err;
    }

    return paidDoc;
  });
};

/**
 * 3. Thanh toán Tiền mặt (PATCH /api/invoices/:id/pay-cash — UC-46)
 */
const payInvoiceByCash = async (invoiceId, { cashReceived } = {}) => {
  const existing = await Invoice.findById(invoiceId).select('paymentStatus totalAmount').lean();
  if (!existing) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }
  if (existing.paymentStatus !== 'Unpaid') {
    throw httpError(409, `Hóa đơn này đã ở trạng thái "${existing.paymentStatus}", không thể thanh toán lại`);
  }

  if (cashReceived !== undefined && cashReceived < existing.totalAmount) {
    throw httpError(400, 'Số tiền khách đưa phải lớn hơn hoặc bằng tổng tiền hóa đơn', {
      cashReceived: `Số tiền tối thiểu cần thu là ${existing.totalAmount}`,
    });
  }

  const paidAt = new Date();
  const updatedInvoice = await markInvoicePaidAndFinalize(invoiceId, 'Cash', paidAt);
  if (!updatedInvoice) {
    throw httpError(409, 'Hóa đơn này đã được thanh toán trước đó');
  }

  const populated = await Invoice.findById(updatedInvoice._id).populate(INVOICE_POPULATE).lean();
  const changeAmount =
    cashReceived !== undefined ? Math.max(0, cashReceived - (populated?.totalAmount || 0)) : 0;

  return {
    message: 'Thanh toán tiền mặt thành công',
    data: populated,
    cashReceived: cashReceived !== undefined ? cashReceived : populated?.totalAmount || 0,
    changeAmount,
  };
};

/**
 * 4. Tạo link / QR thanh toán VNPay Sandbox (POST /api/invoices/:id/vnpay-url — UC-47, API-02)
 */
const createVnpayPaymentUrlForInvoice = async (invoiceId, clientIp) => {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }
  if (invoice.paymentStatus !== 'Unpaid') {
    throw httpError(409, `Hóa đơn đang ở trạng thái "${invoice.paymentStatus}", không thể tạo mã thanh toán`);
  }
  if (!invoice.totalAmount || invoice.totalAmount <= 0) {
    throw httpError(400, 'Tổng tiền hóa đơn bằng 0đ, vui lòng xác nhận thanh toán tiền mặt thay cho VNPay');
  }

  const vnpayTxnRef = `${invoice.code.replace(/[^A-Z0-9]/g, '')}${Date.now().toString().slice(-8)}`;
  const { paymentUrl, expiresAt } = buildVnpayPaymentUrl({
    vnpayTxnRef,
    amount: invoice.totalAmount,
    orderInfo: `Thanh toan hoa don ${invoice.code}`,
    ipAddr: clientIp,
  });

  await Invoice.updateOne({ _id: invoice._id, paymentStatus: 'Unpaid' }, { $set: { vnpayTxnRef } });

  return {
    message: 'Tạo liên kết thanh toán VNPay thành công',
    data: {
      invoiceId: invoice._id,
      invoiceCode: invoice.code,
      vnpayTxnRef,
      amount: invoice.totalAmount,
      paymentUrl,
      expiresAt,
    },
  };
};

/**
 * 5. VNPay IPN Webhook (GET /api/invoices/vnpay-ipn — UC-47, API-03, BR-17)
 * - Nguồn duy nhất chuyển trạng thái hóa đơn VNPay -> Paid sau khi xác thực checksum & số tiền.
 */
const handleVnpayIpn = async (query = {}) => {
  if (!verifyVnpaySignature(query)) {
    return { RspCode: '97', Message: 'Invalid signature' };
  }

  const txnRef = query.vnp_TxnRef ? String(query.vnp_TxnRef) : '';
  const invoice = await Invoice.findOne({ vnpayTxnRef: txnRef }).lean();
  if (!invoice) {
    return { RspCode: '01', Message: 'Order not found' };
  }

  const vnpAmount = Number(query.vnp_Amount);
  if (!Number.isFinite(vnpAmount) || vnpAmount !== Math.round(invoice.totalAmount) * 100) {
    return { RspCode: '04', Message: 'Invalid amount' };
  }

  if (invoice.paymentStatus === 'Paid') {
    return { RspCode: '02', Message: 'Order already confirmed' };
  }

  const isSuccess =
    query.vnp_ResponseCode === '00' &&
    (!query.vnp_TransactionStatus || query.vnp_TransactionStatus === '00');

  if (!isSuccess) {
    return { RspCode: '00', Message: 'Confirm Success' };
  }

  await markInvoicePaidAndFinalize(invoice._id, 'VNPay', new Date());
  return { RspCode: '00', Message: 'Confirm Success' };
};

/**
 * 6. Tạo link & mã VietQR thanh toán PayOS thật (POST /api/invoices/:id/payos-url)
 */
const createPayosPaymentUrlForInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }
  if (invoice.paymentStatus !== 'Unpaid') {
    throw httpError(409, `Hóa đơn đang ở trạng thái "${invoice.paymentStatus}", không thể tạo mã thanh toán`);
  }
  if (!invoice.totalAmount || invoice.totalAmount < 1) {
    throw httpError(400, 'Tổng tiền hóa đơn bằng 0đ, vui lòng xác nhận thanh toán tiền mặt thay cho PayOS');
  }

  const orderCode = Number(`${Math.floor(Date.now() / 1000)}${crypto.randomInt(100, 999)}`);
  const description = invoice.code.replace(/[^A-Z0-9]/gi, '').slice(0, 25);

  const payosData = await createPayosPaymentLink({
    orderCode,
    amount: invoice.totalAmount,
    description,
  });

  await Invoice.updateOne(
    { _id: invoice._id, paymentStatus: 'Unpaid' },
    {
      $set: {
        payosOrderCode: orderCode,
        payosPaymentLinkId: payosData.paymentLinkId || null,
      },
    }
  );

  return {
    message: 'Tạo liên kết thanh toán PayOS thành công',
    data: {
      invoiceId: invoice._id,
      invoiceCode: invoice.code,
      orderCode,
      paymentLinkId: payosData.paymentLinkId || null,
      amount: invoice.totalAmount,
      checkoutUrl: payosData.checkoutUrl,
      paymentUrl: payosData.checkoutUrl,
      qrCode: payosData.qrCode,
      accountName: payosData.accountName || null,
      accountNumber: payosData.accountNumber || null,
      bin: payosData.bin || null,
      expiresAt: payosData.expiresAt,
    },
  };
};

/**
 * 6b. Webhook từ PayOS báo thanh toán thành công (POST /api/invoices/payos-webhook)
 */
const handlePayosWebhook = async (webhookBody = {}) => {
  if (!verifyPayosWebhookSignature(webhookBody)) {
    throw httpError(400, 'Chữ ký Webhook PayOS không hợp lệ');
  }

  const data = webhookBody.data || {};
  const orderCode = Number(data.orderCode);
  if (!Number.isFinite(orderCode)) {
    return { error: 0, message: 'Ok', data: null };
  }

  const invoice = await Invoice.findOne({ payosOrderCode: orderCode }).lean();
  if (!invoice) {
    // PayOS gửi request ping thử nghiệm (orderCode = 123) khi lưu Webhook URL trên dashboard
    return { error: 0, message: 'Ok', data: null };
  }

  if (Number(data.amount) < Math.round(invoice.totalAmount)) {
    throw httpError(400, 'Số tiền thanh toán PayOS không khớp với tổng tiền hóa đơn');
  }

  if (invoice.paymentStatus === 'Paid') {
    return { error: 0, message: 'Ok', data: null };
  }

  const isSuccess = webhookBody.success !== false && (!data.code || data.code === '00');
  if (isSuccess) {
    await markInvoicePaidAndFinalize(invoice._id, 'PayOS', new Date());
  }

  return { error: 0, message: 'Ok', data: null };
};

/**
 * 6c. Chủ động đồng bộ trạng thái thanh toán từ PayOS (GET /api/invoices/:id/payos-status)
 * Giúp luồng quét VietQR chốt Paid ngay cả khi chạy BE ở localhost không có ngrok webhook.
 */
const syncPayosInvoiceStatus = async (currentUser, invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).populate(INVOICE_POPULATE).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }

  await assertCanAccessInvoice(currentUser, invoice);

  if (invoice.paymentStatus === 'Paid') {
    return {
      message: 'Hóa đơn đã được thanh toán',
      data: invoice,
      payosStatus: 'PAID',
    };
  }

  if (!invoice.payosOrderCode) {
    throw httpError(400, 'Hóa đơn này chưa khởi tạo giao dịch thanh toán PayOS');
  }

  const payosInfo = await getPayosPaymentInfo(invoice.payosOrderCode);
  const paidAmount = Number(payosInfo?.amountPaid ?? payosInfo?.amount ?? 0);

  if (payosInfo?.status === 'PAID' && paidAmount >= Math.round(invoice.totalAmount)) {
    await markInvoicePaidAndFinalize(invoice._id, 'PayOS', new Date());
    const refreshed = await Invoice.findById(invoice._id).populate(INVOICE_POPULATE).lean();
    return {
      message: 'Thanh toán PayOS thành công',
      data: refreshed,
      payosStatus: 'PAID',
    };
  }

  return {
    message: 'Giao dịch PayOS chưa hoàn tất thanh toán',
    data: invoice,
    payosStatus: payosInfo?.status || 'PENDING',
  };
};

/**
 * 6. VNPay Return URL (GET /api/invoices/vnpay-return — API-04)
 * - Chỉ xác thực chữ ký và hiển thị kết quả cho người dùng; KHÔNG tự ý đổi trạng thái hóa đơn.
 */
const handleVnpayReturn = async (query = {}) => {
  const valid = verifyVnpaySignature(query);
  if (!valid) {
    throw httpError(400, 'Chữ ký VNPay trả về không hợp lệ');
  }

  const txnRef = query.vnp_TxnRef ? String(query.vnp_TxnRef) : '';
  const responseCode = query.vnp_ResponseCode ? String(query.vnp_ResponseCode) : '';
  const success =
    responseCode === '00' &&
    (!query.vnp_TransactionStatus || String(query.vnp_TransactionStatus) === '00');

  const invoice = txnRef
    ? await Invoice.findOne({ vnpayTxnRef: txnRef })
        .select('code totalAmount paymentMethod paymentStatus paidAt vnpayTxnRef')
        .lean()
    : null;

  return {
    valid: true,
    success,
    responseCode,
    vnpayTxnRef: txnRef,
    amount: query.vnp_Amount ? Number(query.vnp_Amount) / 100 : null,
    invoice,
    message: success
      ? 'Giao dịch VNPay thành công'
      : 'Giao dịch VNPay chưa thành công hoặc đã bị hủy',
  };
};

const buildInvoiceListFilter = async ({
  paymentStatus,
  paymentMethod,
  orderId,
  inpatientRecordId,
  petId,
  code,
  from,
  to,
}) => {
  const filter = {};
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (orderId) filter.orderId = orderId;
  if (inpatientRecordId) filter.inpatientRecordId = inpatientRecordId;
  if (code) filter.code = code;

  if (from || to) {
    filter.issuedAt = {};
    if (from) filter.issuedAt.$gte = new Date(`${from}T00:00:00.000+07:00`);
    if (to) filter.issuedAt.$lte = new Date(`${to}T23:59:59.999+07:00`);
  }

  if (petId) {
    const [petOrders, petInpatients] = await Promise.all([
      AppointmentOrder.find({ petId }).select('_id').lean(),
      InpatientRecord.find({ petId }).select('_id').lean(),
    ]);
    const petOrderIds = petOrders.map((o) => o._id);
    const petInpatientIds = petInpatients.map((i) => i._id);
    filter.$or = [
      { orderId: { $in: petOrderIds } },
      { inpatientRecordId: { $in: petInpatientIds } },
    ];
  }

  return filter;
};

/**
 * 7. Lễ tân / Admin xem danh sách hóa đơn (GET /api/invoices — SCR-20)
 */
const listInvoices = async (query = {}) => {
  const filter = await buildInvoiceListFilter(query);
  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate(INVOICE_POPULATE)
      .sort({ issuedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 8. Chủ nuôi xem lịch sử hóa đơn của các thú cưng thuộc sở hữu (GET /api/invoices/me — UC-48, SCR-15)
 */
const listMyInvoices = async (ownerId, query = {}) => {
  const myPets = await Pet.find({ ownerId }).select('_id').lean();
  const myPetIds = myPets.map((p) => p._id);

  if (query.petId && !myPetIds.some((id) => String(id) === String(query.petId))) {
    throw httpError(403, 'Bạn không có quyền xem hóa đơn của thú cưng này');
  }

  const targetPetIds = query.petId ? [query.petId] : myPetIds;
  const [myOrders, myInpatients] = await Promise.all([
    AppointmentOrder.find({ $or: [{ ownerId }, { petId: { $in: targetPetIds } }] })
      .select('_id')
      .lean(),
    InpatientRecord.find({ petId: { $in: targetPetIds } }).select('_id').lean(),
  ]);

  const ownerScopeFilter = {
    $or: [
      { orderId: { $in: myOrders.map((o) => o._id) } },
      { inpatientRecordId: { $in: myInpatients.map((i) => i._id) } },
    ],
  };

  const baseFilter = await buildInvoiceListFilter({ ...query, petId: undefined });
  const finalFilter =
    Object.keys(baseFilter).length > 0 ? { $and: [ownerScopeFilter, baseFilter] } : ownerScopeFilter;

  const { page = 1, limit = 20 } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Invoice.find(finalFilter)
      .populate(INVOICE_POPULATE)
      .sort({ issuedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(finalFilter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * 9. Xem chi tiết 1 hóa đơn (GET /api/invoices/:id — UC-48, BR-23)
 */
const getInvoiceById = async (currentUser, invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).populate(INVOICE_POPULATE).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }

  await assertCanAccessInvoice(currentUser, invoice);

  // Tự động kiểm tra PayOS khi FE poll GET /api/invoices/:id ở môi trường local (không có webhook)
  if (invoice.paymentStatus === 'Unpaid' && invoice.payosOrderCode && hasPayosConfig()) {
    try {
      const payosInfo = await getPayosPaymentInfo(invoice.payosOrderCode);
      const paidAmount = Number(payosInfo?.amountPaid ?? payosInfo?.amount ?? 0);
      if (payosInfo?.status === 'PAID' && paidAmount >= Math.round(invoice.totalAmount)) {
        await markInvoicePaidAndFinalize(invoice._id, 'PayOS', new Date());
        const refreshed = await Invoice.findById(invoice._id).populate(INVOICE_POPULATE).lean();
        return { data: refreshed || invoice };
      }
    } catch {
      // Bỏ qua lỗi mạng tạm thời tới PayOS để không làm gián đoạn việc xem chi tiết hóa đơn
    }
  }

  return { data: invoice };
};

const ITEM_TYPE_LABELS = {
  Service: 'Dịch vụ',
  Product: 'Thuốc / Sản phẩm',
  InpatientDay: 'Nội trú theo ngày',
};

const PAYMENT_STATUS_LABELS = {
  Unpaid: 'Chưa thanh toán',
  Paid: 'Đã thanh toán',
  Refunded: 'Đã hoàn tiền',
};

const PAYMENT_METHOD_LABELS = {
  Cash: 'Tiền mặt',
  VNPay: 'VNPay QR',
  PayOS: 'PayOS (VietQR)',
};

/**
 * 10. Xuất biên lai PDF hóa đơn (GET /api/invoices/:id/pdf — UC-48, SCR-15)
 */
const generateInvoicePdf = async (currentUser, invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).populate(INVOICE_POPULATE).lean();
  if (!invoice) {
    throw httpError(404, 'Không tìm thấy hóa đơn');
  }

  await assertCanAccessInvoice(currentUser, invoice);

  const pet = invoice.orderId?.petId || invoice.inpatientRecordId?.petId || null;
  const owner = invoice.orderId?.ownerId || invoice.inpatientRecordId?.petId?.ownerId || null;

  const itemRows = (invoice.items || []).map((item, idx) => [
    { text: String(idx + 1), alignment: 'center' },
    ITEM_TYPE_LABELS[item.type] || item.type,
    item.itemNameSnapshot || '—',
    { text: String(item.quantity || 1), alignment: 'center' },
    { text: formatCurrencyVND(item.unitPriceSnapshot), alignment: 'right' },
    { text: formatCurrencyVND(item.subtotal), alignment: 'right' },
  ]);

  const docDefinition = {
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35 },
    pageMargins: [36, 36, 36, 36],
    styles: {
      clinicName: { fontSize: 15, bold: true, color: '#0d9488' },
      docTitle: { fontSize: 12, bold: true, margin: [0, 4, 0, 12] },
      sectionTitle: { fontSize: 10.5, bold: true, color: '#0f172a', margin: [0, 8, 0, 4] },
      th: { bold: true, fillColor: '#e2e8f0', fontSize: 9.5 },
    },
    content: [
      { text: 'PHÒNG KHÁM THÚ Y VCMOS', style: 'clinicName', alignment: 'center' },
      { text: `HÓA ĐƠN & BIÊN LAI THANH TOÁN (${invoice.code})`, style: 'docTitle', alignment: 'center' },
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'THÔNG TIN KHÁCH HÀNG & THÚ CƯNG', style: 'sectionTitle' },
              { text: `Chủ nuôi: ${owner?.fullName || '—'}` },
              { text: `Số điện thoại: ${owner?.phone || '—'}` },
              { text: `Thú cưng: ${pet?.name || '—'} (${pet?.species || '—'})` },
              { text: `Mã đơn khám: ${invoice.orderId?.code || '—'}` },
            ],
          },
          {
            width: '50%',
            stack: [
              { text: 'THÔNG TIN HÓA ĐƠN', style: 'sectionTitle' },
              { text: `Mã hóa đơn: ${invoice.code}` },
              { text: `Ngày lập: ${formatDateTimeVN(invoice.issuedAt)}` },
              { text: `Người lập: ${invoice.issuedById?.fullName || '—'}` },
              {
                text: `Trạng thái: ${PAYMENT_STATUS_LABELS[invoice.paymentStatus] || invoice.paymentStatus}`,
              },
              {
                text: `Phương thức: ${
                  invoice.paymentMethod ? PAYMENT_METHOD_LABELS[invoice.paymentMethod] || invoice.paymentMethod : '—'
                }`,
              },
              { text: `Thanh toán lúc: ${formatDateTimeVN(invoice.paidAt)}` },
            ],
          },
        ],
        margin: [0, 0, 0, 14],
      },
      { text: 'CHI TIẾT KHOẢN MỤC (GIÁ TẠI THỜI ĐIỂM LẬP HÓA ĐƠN)', style: 'sectionTitle' },
      {
        table: {
          headerRows: 1,
          widths: [26, 86, '*', 34, 78, 84],
          body: [
            [
              { text: 'STT', style: 'th', alignment: 'center' },
              { text: 'Phân loại', style: 'th' },
              { text: 'Tên dịch vụ / sản phẩm', style: 'th' },
              { text: 'SL', style: 'th', alignment: 'center' },
              { text: 'Đơn giá', style: 'th', alignment: 'right' },
              { text: 'Thành tiền', style: 'th', alignment: 'right' },
            ],
            ...itemRows,
            [
              { text: 'TỔNG CỘNG', bold: true, colSpan: 5, alignment: 'right' },
              {},
              {},
              {},
              {},
              { text: formatCurrencyVND(invoice.totalAmount), bold: true, alignment: 'right' },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 2, 0, 16],
      },
      {
        text: 'Cảm ơn quý khách đã tin tưởng Phòng khám Thú y VCMOS!',
        alignment: 'center',
        italics: true,
        fontSize: 9,
        color: '#64748b',
      },
    ],
  };

  const pdfBuffer = await new Promise((resolve, reject) => {
    const pdfDoc = pdfPrinter.createPdfKitDocument(docDefinition);
    const chunks = [];
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });

  return {
    filename: `${invoice.code}.pdf`,
    buffer: pdfBuffer,
  };
};

/**
 * 10. Báo cáo sản phẩm bán chạy theo khoảng ngày [from, to] (giờ VN, gồm cả hai đầu)
 * (GET /api/invoices/reports/best-selling-products)
 *
 * - Chỉ tính hóa đơn Paid, theo thời điểm thanh toán (paidAt); Unpaid / Refunded bị loại.
 * - Gồm cả sản phẩm bán lẻ lẫn thuốc/vaccine kê đơn (đều là dòng type = 'Product').
 */
const getBestSellingProducts = async ({ from, to, category, sortBy = 'quantity', limit = 10 }) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const rangeStart = new Date(Date.UTC(fy, fm - 1, fd) - VN_OFFSET_MS);
  const rangeEnd = new Date(Date.UTC(ty, tm - 1, td) + MS_PER_DAY - VN_OFFSET_MS); // exclusive

  const pipeline = [
    { $match: { paymentStatus: 'Paid', paidAt: { $gte: rangeStart, $lt: rangeEnd } } },
    { $unwind: '$items' },
    { $match: { 'items.type': 'Product' } },
    {
      $group: {
        _id: '$items.refId',
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: '$items.subtotal' },
        invoiceIds: { $addToSet: '$_id' },
        nameSnapshot: { $first: '$items.itemNameSnapshot' },
      },
    },
    {
      $lookup: {
        from: Product.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  ];

  if (category) pipeline.push({ $match: { 'product.category': category } });

  const primarySort = sortBy === 'revenue' ? 'totalRevenue' : 'totalQuantity';
  const secondarySort = sortBy === 'revenue' ? 'totalQuantity' : 'totalRevenue';

  pipeline.push(
    {
      $project: {
        _id: 0,
        productId: '$_id',
        code: '$product.code',
        name: { $ifNull: ['$product.name', '$nameSnapshot'] },
        category: '$product.category',
        unit: '$product.unit',
        totalQuantity: 1,
        totalRevenue: 1,
        invoiceCount: { $size: '$invoiceIds' },
      },
    },
    { $sort: { [primarySort]: -1, [secondarySort]: -1, name: 1 } },
    { $limit: limit }
  );

  const rows = await Invoice.aggregate(pipeline);

  return {
    from,
    to,
    sortBy,
    category: category || null,
    items: rows.map((row, idx) => ({ rank: idx + 1, ...row })),
  };
};

module.exports = {
  createInvoice,
  updateInvoiceRetailItems,
  payInvoiceByCash,
  createVnpayPaymentUrlForInvoice,
  handleVnpayIpn,
  handleVnpayReturn,
  createPayosPaymentUrlForInvoice,
  handlePayosWebhook,
  syncPayosInvoiceStatus,
  listInvoices,
  listMyInvoices,
  getInvoiceById,
  generateInvoicePdf,
  getBestSellingProducts,
};