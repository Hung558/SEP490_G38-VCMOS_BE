const Invoice = require('../models/Invoice');
const AppointmentOrder = require('../models/AppointmentOrder');
const AppointmentService = require('../models/AppointmentService');
const Service = require('../models/Service');
const Product = require('../models/Product');
const Cage = require('../models/Cage');
const Pet = require('../models/Pet');
const User = require('../models/User');
const {
  VN_OFFSET_MS,
  MS_PER_DAY,
  getTodayVnString,
  parseCalendarDate,
  formatUtcDate,
  countInclusiveDays,
} = require('../validators/report.validator');

const ORDER_STATUSES = ['Booked', 'CheckedIn', 'InProgress', 'WaitOwner', 'Done', 'Overdue', 'Cancelled'];
const PAYMENT_METHODS = ['Cash', 'VNPay', 'PayOS'];
const SERVICE_CATEGORIES = ['Examination', 'Vaccination', 'Grooming', 'Paraclinical', 'Inpatient'];
const ITEM_TYPES = ['Service', 'Product', 'InpatientDay'];

const round1 = (num) => Math.round(num * 10) / 10;

// Chuyển [from, to] (YYYY-MM-DD, giờ VN) sang cặp mốc Date UTC [start, endExclusive) để query paidAt / issuedAt
const toVnDateBounds = (from, to) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const rangeStart = new Date(Date.UTC(fy, fm - 1, fd) - VN_OFFSET_MS);
  const rangeEnd = new Date(Date.UTC(ty, tm - 1, td) + MS_PER_DAY - VN_OFFSET_MS);
  return { rangeStart, rangeEnd };
};

/**
 * Tính khoảng ngày của kỳ trước liền kề để so sánh % tăng trưởng doanh thu (SCR-28):
 * - Nếu kỳ hiện tại là 'month': kỳ trước là cả tháng dương lịch trước đó.
 * - Các trường hợp khác ('day', 'week', 'custom'): lùi lại đúng số ngày bằng độ dài kỳ hiện tại.
 */
const getPreviousPeriodRange = (period, from, to) => {
  const fromDate = parseCalendarDate(from);

  if (period === 'month') {
    const year = fromDate.getUTCFullYear();
    const monthIndex = fromDate.getUTCMonth();
    const prevFirst = new Date(Date.UTC(year, monthIndex - 1, 1));
    const prevLast = new Date(Date.UTC(year, monthIndex, 0));
    return { from: formatUtcDate(prevFirst), to: formatUtcDate(prevLast) };
  }

  const spanDays = countInclusiveDays(from, to);
  const prevEnd = new Date(fromDate.getTime() - MS_PER_DAY);
  const prevStart = new Date(fromDate.getTime() - spanDays * MS_PER_DAY);
  return { from: formatUtcDate(prevStart), to: formatUtcDate(prevEnd) };
};

// Tạo danh sách đầy đủ các nhãn ngày (YYYY-MM-DD) hoặc tháng (YYYY-MM) để biểu đồ không bị khuyết điểm
const buildSeriesBuckets = (from, to, groupBy) => {
  const buckets = [];
  const startDate = parseCalendarDate(from);
  const endDate = parseCalendarDate(to);

  if (groupBy === 'month') {
    let year = startDate.getUTCFullYear();
    let month = startDate.getUTCMonth();
    const endYear = endDate.getUTCFullYear();
    const endMonth = endDate.getUTCMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      buckets.push(`${year}-${String(month + 1).padStart(2, '0')}`);
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return buckets;
  }

  for (let ts = startDate.getTime(); ts <= endDate.getTime(); ts += MS_PER_DAY) {
    buckets.push(formatUtcDate(new Date(ts)));
  }
  return buckets;
};

// Gom trạng thái chuồng hiện tại theo khu vực Holding / InpatientWard và chuồng cách ly
const buildCageOccupancySnapshot = async () => {
  const cages = await Cage.find().select('zone status isIsolated').lean();

  const summary = {
    total: cages.length,
    occupied: 0,
    available: 0,
    occupancyRate: 0,
    byZone: {
      Holding: { total: 0, occupied: 0, available: 0, occupancyRate: 0 },
      InpatientWard: { total: 0, occupied: 0, available: 0, occupancyRate: 0 },
    },
    isolatedCages: { total: 0, occupied: 0, available: 0 },
  };

  for (const cage of cages) {
    const isOccupied = cage.status === 'Occupied';
    if (isOccupied) summary.occupied += 1;
    else summary.available += 1;

    const zoneBucket = summary.byZone[cage.zone];
    if (zoneBucket) {
      zoneBucket.total += 1;
      if (isOccupied) zoneBucket.occupied += 1;
      else zoneBucket.available += 1;
    }

    if (cage.isIsolated) {
      summary.isolatedCages.total += 1;
      if (isOccupied) summary.isolatedCages.occupied += 1;
      else summary.isolatedCages.available += 1;
    }
  }

  summary.occupancyRate = summary.total > 0 ? round1((summary.occupied / summary.total) * 100) : 0;
  for (const zone of ['Holding', 'InpatientWard']) {
    const bucket = summary.byZone[zone];
    bucket.occupancyRate = bucket.total > 0 ? round1((bucket.occupied / bucket.total) * 100) : 0;
  }

  return summary;
};

/**
 * 1. Thống kê Doanh thu cho Admin (GET /api/reports/revenue — UC-63, SCR-28)
 * - Chỉ tính hóa đơn Paid theo mốc paidAt (múi giờ UTC+7).
 * - Trả về: KPI tổng doanh thu + % tăng trưởng so kỳ trước, biểu đồ theo ngày/tháng,
 *   phân bổ theo phương thức thanh toán, theo nhóm dịch vụ (Service.category) và loại dòng hóa đơn.
 */
const getRevenueAnalytics = async ({ period, from, to, groupBy }) => {
  const { rangeStart, rangeEnd } = toVnDateBounds(from, to);
  const prevRange = getPreviousPeriodRange(period, from, to);
  const { rangeStart: prevStart, rangeEnd: prevEnd } = toVnDateBounds(prevRange.from, prevRange.to);

  const dateFormat = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const paidMatch = { paymentStatus: 'Paid', paidAt: { $gte: rangeStart, $lt: rangeEnd } };

  const [currentAgg, prevAgg, itemsByCategoryAgg, itemsByTypeAgg] = await Promise.all([
    // Chạy 1 lượt $facet cho tổng KPI, chuỗi biểu đồ theo ngày/tháng và phân bổ phương thức thanh toán
    Invoice.aggregate([
      { $match: paidMatch },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                paidInvoiceCount: { $sum: 1 },
              },
            },
          ],
          series: [
            {
              $group: {
                _id: { $dateToString: { format: dateFormat, date: '$paidAt', timezone: '+07:00' } },
                revenue: { $sum: '$totalAmount' },
                invoiceCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          byMethod: [
            {
              $group: {
                _id: '$paymentMethod',
                revenue: { $sum: '$totalAmount' },
                invoiceCount: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),

    // Tổng doanh thu kỳ trước để tính % tăng/giảm
    Invoice.aggregate([
      { $match: { paymentStatus: 'Paid', paidAt: { $gte: prevStart, $lt: prevEnd } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          paidInvoiceCount: { $sum: 1 },
        },
      },
    ]),

    // Doanh thu chia theo nhóm dịch vụ (Service.category + InpatientDay gom vào Inpatient)
    Invoice.aggregate([
      { $match: paidMatch },
      { $unwind: '$items' },
      { $match: { 'items.type': { $in: ['Service', 'InpatientDay'] } } },
      {
        $lookup: {
          from: Service.collection.name,
          localField: 'items.refId',
          foreignField: '_id',
          as: 'serviceDoc',
        },
      },
      { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          category: {
            $cond: [
              { $eq: ['$items.type', 'InpatientDay'] },
              'Inpatient',
              { $ifNull: ['$serviceDoc.category', 'Other'] },
            ],
          },
          subtotal: '$items.subtotal',
          quantity: '$items.quantity',
        },
      },
      {
        $group: {
          _id: '$category',
          revenue: { $sum: '$subtotal' },
          itemCount: { $sum: '$quantity' },
        },
      },
    ]),

    // Doanh thu chia theo loại dòng hóa đơn (Service / Product / InpatientDay)
    Invoice.aggregate([
      { $match: paidMatch },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.type',
          revenue: { $sum: '$items.subtotal' },
          itemCount: { $sum: '$items.quantity' },
        },
      },
    ]),
  ]);

  const facetResult = currentAgg[0] || { totals: [], series: [], byMethod: [] };
  const totalRevenue = facetResult.totals[0]?.totalRevenue || 0;
  const paidInvoiceCount = facetResult.totals[0]?.paidInvoiceCount || 0;
  const averageInvoiceValue = paidInvoiceCount > 0 ? Math.round(totalRevenue / paidInvoiceCount) : 0;

  const prevTotalRevenue = prevAgg[0]?.totalRevenue || 0;
  const prevPaidInvoiceCount = prevAgg[0]?.paidInvoiceCount || 0;
  let revenueChangePercent = 0;
  if (prevTotalRevenue > 0) {
    revenueChangePercent = round1(((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100);
  } else if (totalRevenue > 0) {
    // Kỳ trước bằng 0 nhưng kỳ này có doanh thu -> không chia cho 0
    revenueChangePercent = null;
  }

  // Lấp đầy các mốc ngày/tháng trống bằng 0 để biểu đồ FE liên tục
  const seriesMap = new Map(facetResult.series.map((row) => [row._id, row]));
  const revenueSeries = buildSeriesBuckets(from, to, groupBy).map((bucket) => {
    const found = seriesMap.get(bucket);
    return {
      period: bucket,
      revenue: found?.revenue || 0,
      invoiceCount: found?.invoiceCount || 0,
    };
  });

  // Phương thức thanh toán: luôn trả đủ Cash, VNPay, PayOS
  const methodMap = new Map(facetResult.byMethod.map((row) => [row._id, row]));
  const byPaymentMethod = PAYMENT_METHODS.map((method) => {
    const found = methodMap.get(method);
    const revenue = found?.revenue || 0;
    return {
      paymentMethod: method,
      revenue,
      invoiceCount: found?.invoiceCount || 0,
      percentage: totalRevenue > 0 ? round1((revenue / totalRevenue) * 100) : 0,
    };
  });

  // Doanh thu theo 5 nhóm dịch vụ chuẩn SRS
  const categoryMap = new Map(itemsByCategoryAgg.map((row) => [row._id, row]));
  const totalServiceRevenue = itemsByCategoryAgg.reduce((sum, row) => sum + (row.revenue || 0), 0);
  const byServiceCategory = SERVICE_CATEGORIES.map((category) => {
    const found = categoryMap.get(category);
    const revenue = found?.revenue || 0;
    return {
      category,
      revenue,
      itemCount: found?.itemCount || 0,
      percentage: totalServiceRevenue > 0 ? round1((revenue / totalServiceRevenue) * 100) : 0,
    };
  });

  // Doanh thu theo loại dòng hóa đơn (Service / Product / InpatientDay)
  const itemTypeMap = new Map(itemsByTypeAgg.map((row) => [row._id, row]));
  const byItemType = ITEM_TYPES.map((type) => {
    const found = itemTypeMap.get(type);
    const revenue = found?.revenue || 0;
    return {
      type,
      revenue,
      itemCount: found?.itemCount || 0,
      percentage: totalRevenue > 0 ? round1((revenue / totalRevenue) * 100) : 0,
    };
  });

  return {
    period,
    from,
    to,
    groupBy,
    kpis: {
      totalRevenue,
      paidInvoiceCount,
      averageInvoiceValue,
      revenueChangePercent,
      previousPeriod: {
        from: prevRange.from,
        to: prevRange.to,
        totalRevenue: prevTotalRevenue,
        paidInvoiceCount: prevPaidInvoiceCount,
      },
    },
    revenueSeries,
    byPaymentMethod,
    byServiceCategory,
    byItemType,
  };
};

/**
 * 2. Thống kê Lịch hẹn, Dịch vụ & Công suất Chuồng cho Admin (GET /api/reports/operations — UC-64, SCR-28)
 */
const getOperationalAnalytics = async ({ period, from, to }) => {
  const orderDateFilter = { date: { $gte: from, $lte: to } };

  const [
    orderFacetAgg,
    serviceUsageAgg,
    cageOccupancy,
    activeCustomersCount,
    activePetsCount,
    productStatsAgg,
  ] = await Promise.all([
    // Gom đơn hẹn theo trạng thái và nguồn đặt (Online vs Walk-in)
    AppointmentOrder.aggregate([
      { $match: orderDateFilter },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$derivedStatus', count: { $sum: 1 } } },
          ],
          byChannel: [
            { $group: { _id: '$isOnline', count: { $sum: 1 } } },
          ],
        },
      },
    ]),

    // Gom lượt sử dụng dịch vụ theo Service.category & Top 5 dịch vụ nổi bật (bỏ dịch vụ đã Cancelled)
    AppointmentOrder.aggregate([
      { $match: orderDateFilter },
      {
        $lookup: {
          from: AppointmentService.collection.name,
          localField: '_id',
          foreignField: 'orderId',
          as: 'services',
        },
      },
      { $unwind: '$services' },
      { $match: { 'services.status': { $ne: 'Cancelled' } } },
      {
        $lookup: {
          from: Service.collection.name,
          localField: 'services.serviceId',
          foreignField: '_id',
          as: 'serviceDoc',
        },
      },
      { $unwind: { path: '$serviceDoc', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          byCategory: [
            {
              $group: {
                _id: '$serviceDoc.category',
                totalCount: { $sum: 1 },
                doneCount: {
                  $sum: { $cond: [{ $eq: ['$services.status', 'Done'] }, 1, 0] },
                },
              },
            },
          ],
          topServices: [
            {
              $group: {
                _id: '$services.serviceId',
                code: { $first: '$serviceDoc.code' },
                name: { $first: '$serviceDoc.name' },
                category: { $first: '$serviceDoc.category' },
                count: { $sum: 1 },
                doneCount: {
                  $sum: { $cond: [{ $eq: ['$services.status', 'Done'] }, 1, 0] },
                },
              },
            },
            { $sort: { count: -1, name: 1 } },
            { $limit: 5 },
          ],
        },
      },
    ]),

    buildCageOccupancySnapshot(),
    User.countDocuments({ role: 'PetOwner', status: { $ne: 'Locked' } }),
    Pet.countDocuments({ status: 'Active' }),
    Product.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const orderFacet = orderFacetAgg[0] || { byStatus: [], byChannel: [] };
  const statusMap = new Map(orderFacet.byStatus.map((row) => [row._id, row.count]));
  const byStatus = {};
  let totalOrders = 0;
  for (const status of ORDER_STATUSES) {
    const count = statusMap.get(status) || 0;
    byStatus[status] = count;
    totalOrders += count;
  }

  let onlineCount = 0;
  let walkInCount = 0;
  for (const row of orderFacet.byChannel) {
    if (row._id === true) onlineCount += row.count;
    else walkInCount += row.count;
  }

  const serviceFacet = serviceUsageAgg[0] || { byCategory: [], topServices: [] };
  const svcCategoryMap = new Map(serviceFacet.byCategory.map((row) => [row._id, row]));
  const servicesByCategory = SERVICE_CATEGORIES.map((category) => {
    const found = svcCategoryMap.get(category);
    return {
      category,
      totalCount: found?.totalCount || 0,
      doneCount: found?.doneCount || 0,
    };
  });

  const topServices = serviceFacet.topServices.map((row, index) => ({
    rank: index + 1,
    serviceId: row._id,
    code: row.code || null,
    name: row.name || 'Dịch vụ không xác định',
    category: row.category || null,
    count: row.count,
    doneCount: row.doneCount,
  }));

  const productMap = new Map(productStatsAgg.map((row) => [row._id, row.count]));

  return {
    period,
    from,
    to,
    appointments: {
      total: totalOrders,
      byStatus,
      byChannel: {
        online: onlineCount,
        walkIn: walkInCount,
        onlineRate: totalOrders > 0 ? round1((onlineCount / totalOrders) * 100) : 0,
        walkInRate: totalOrders > 0 ? round1((walkInCount / totalOrders) * 100) : 0,
      },
      completionRate: totalOrders > 0 ? round1((byStatus.Done / totalOrders) * 100) : 0,
      overdueRate: totalOrders > 0 ? round1((byStatus.Overdue / totalOrders) * 100) : 0,
      cancellationRate: totalOrders > 0 ? round1((byStatus.Cancelled / totalOrders) * 100) : 0,
    },
    servicesByCategory,
    topServices,
    cageOccupancy,
    overview: {
      activeCustomersCount,
      activePetsCount,
      activeProductsCount: productMap.get('Active') || 0,
      inactiveProductsCount: productMap.get('Inactive') || 0,
    },
  };
};

/**
 * 3. Widget Thống kê nhanh tại Quầy Lễ tân (GET /api/reports/front-desk — SCR-16)
 * - Bộ đếm trực tiếp hôm nay: Expected today (Booked), CheckedIn, InProgress, WaitOwner, Available cages.
 * - Thống kê theo kỳ lọc (Today / This week / This month / Custom): đơn theo trạng thái, Online vs Walk-in,
 *   thời gian chờ trung bình từ Check-in đến khi bắt đầu dịch vụ đầu tiên, số hóa đơn & số tiền đã thu theo phương thức.
 */
const getFrontDeskStatistics = async ({ period, from, to }) => {
  const todayStr = getTodayVnString();
  const { rangeStart, rangeEnd } = toVnDateBounds(from, to);

  const [
    todayStatusAgg,
    liveActiveAgg,
    periodOrdersAgg,
    waitTimeAgg,
    issuedInvoiceAgg,
    paidInvoiceAgg,
    cageOccupancy,
  ] = await Promise.all([
    // Đơn hẹn có ngày hẹn là hôm nay (Booked hôm nay)
    AppointmentOrder.aggregate([
      { $match: { date: todayStr } },
      { $group: { _id: '$derivedStatus', count: { $sum: 1 } } },
    ]),

    // Các đơn đang thực sự ở tại phòng khám lúc này (CheckedIn / InProgress / WaitOwner, kể cả đơn hẹn ngày khác check-in hôm nay)
    AppointmentOrder.aggregate([
      { $match: { derivedStatus: { $in: ['CheckedIn', 'InProgress', 'WaitOwner'] } } },
      { $group: { _id: '$derivedStatus', count: { $sum: 1 } } },
    ]),

    // Đơn trong khoảng ngày lọc [from, to]
    AppointmentOrder.aggregate([
      { $match: { date: { $gte: from, $lte: to } } },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$derivedStatus', count: { $sum: 1 } } }],
          byChannel: [{ $group: { _id: '$isOnline', count: { $sum: 1 } } }],
        },
      },
    ]),

    // Thời gian chờ trung bình (phút): từ AppointmentOrder.checkedInAt đến AppointmentService.dequeueAt sớm nhất
    AppointmentOrder.aggregate([
      {
        $match: {
          date: { $gte: from, $lte: to },
          checkedInAt: { $ne: null },
        },
      },
      {
        $lookup: {
          from: AppointmentService.collection.name,
          localField: '_id',
          foreignField: 'orderId',
          as: 'services',
        },
      },
      { $unwind: '$services' },
      { $match: { 'services.dequeueAt': { $ne: null } } },
      {
        $group: {
          _id: '$_id',
          checkedInAt: { $first: '$checkedInAt' },
          firstDequeueAt: { $min: '$services.dequeueAt' },
        },
      },
      {
        $project: {
          waitMinutes: {
            $divide: [{ $subtract: ['$firstDequeueAt', '$checkedInAt'] }, 60000],
          },
        },
      },
      // Bỏ qua bản ghi sai lệch đồng hồ âm
      { $match: { waitMinutes: { $gte: 0 } } },
      {
        $group: {
          _id: null,
          averageWaitMinutes: { $avg: '$waitMinutes' },
          sampleCount: { $sum: 1 },
        },
      },
    ]),

    // Hóa đơn đã lập trong kỳ lọc (theo issuedAt)
    Invoice.aggregate([
      { $match: { issuedAt: { $gte: rangeStart, $lt: rangeEnd } } },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    ]),

    // Tiền đã thu trong kỳ lọc (hóa đơn Paid theo paidAt) chia theo phương thức
    Invoice.aggregate([
      { $match: { paymentStatus: 'Paid', paidAt: { $gte: rangeStart, $lt: rangeEnd } } },
      {
        $group: {
          _id: '$paymentMethod',
          revenue: { $sum: '$totalAmount' },
          invoiceCount: { $sum: 1 },
        },
      },
    ]),

    buildCageOccupancySnapshot(),
  ]);

  const todayMap = new Map(todayStatusAgg.map((row) => [row._id, row.count]));
  const liveMap = new Map(liveActiveAgg.map((row) => [row._id, row.count]));

  const periodFacet = periodOrdersAgg[0] || { byStatus: [], byChannel: [] };
  const periodStatusMap = new Map(periodFacet.byStatus.map((row) => [row._id, row.count]));
  const appointmentsByStatus = {};
  let totalAppointments = 0;
  for (const status of ORDER_STATUSES) {
    const count = periodStatusMap.get(status) || 0;
    appointmentsByStatus[status] = count;
    totalAppointments += count;
  }

  let onlineCount = 0;
  let walkInCount = 0;
  for (const row of periodFacet.byChannel) {
    if (row._id === true) onlineCount += row.count;
    else walkInCount += row.count;
  }

  const waitRow = waitTimeAgg[0];
  const averageWaitMinutes =
    waitRow && waitRow.sampleCount > 0 ? round1(waitRow.averageWaitMinutes) : null;

  const issuedMap = new Map(issuedInvoiceAgg.map((row) => [row._id, row.count]));
  const issuedCount =
    (issuedMap.get('Unpaid') || 0) + (issuedMap.get('Paid') || 0) + (issuedMap.get('Refunded') || 0);

  const paidMap = new Map(paidInvoiceAgg.map((row) => [row._id, row]));
  let totalCollected = 0;
  let paidCount = 0;
  const byPaymentMethod = PAYMENT_METHODS.map((method) => {
    const found = paidMap.get(method);
    const revenue = found?.revenue || 0;
    const invoiceCount = found?.invoiceCount || 0;
    totalCollected += revenue;
    paidCount += invoiceCount;
    return { paymentMethod: method, revenue, invoiceCount };
  });

  return {
    today: todayStr,
    period,
    from,
    to,
    todayCounters: {
      expectedToday: todayMap.get('Booked') || 0,
      checkedInNow: liveMap.get('CheckedIn') || 0,
      inProgressNow: liveMap.get('InProgress') || 0,
      waitingForPickup: liveMap.get('WaitOwner') || 0,
      cages: {
        available: cageOccupancy.available,
        occupied: cageOccupancy.occupied,
        total: cageOccupancy.total,
        occupancyRate: cageOccupancy.occupancyRate,
      },
    },
    periodStats: {
      totalAppointments,
      appointmentsByStatus,
      onlineCount,
      walkInCount,
      averageWaitMinutes,
      waitTimeSampleCount: waitRow?.sampleCount || 0,
      invoices: {
        issuedCount,
        paidCount,
        unpaidCount: issuedMap.get('Unpaid') || 0,
        totalCollected,
        byPaymentMethod,
      },
      cageOccupancy,
    },
  };
};

module.exports = {
  getRevenueAnalytics,
  getOperationalAnalytics,
  getFrontDeskStatistics,
};
