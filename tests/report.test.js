// Test Thống kê Dashboard Doanh thu, Lịch hẹn, Công suất Chuồng & Quầy Lễ tân (UC-63, UC-64, SCR-28, SCR-16)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const Product = require('../src/models/Product');
const Cage = require('../src/models/Cage');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');
const Invoice = require('../src/models/Invoice');
const { getTodayVnString } = require('../src/validators/report.validator');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let admin;
let receptionist;
let vet;
let owner;

let adminToken;
let receptionistToken;
let vetToken;
let ownerToken;

let todayStr;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  todayStr = getTodayVnString();
  const passwordHash = await bcrypt.hash('Password123', 10);

  [admin, receptionist, vet, owner] = await User.create([
    { code: 'USR-RP0001', fullName: 'Admin Report', phone: '0922222001', email: 'adminrp@test.vn', passwordHash, role: 'Admin', status: 'Active' },
    { code: 'USR-RP0002', fullName: 'Lễ tân Report', phone: '0922222002', email: 'receprp@test.vn', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-RP0003', fullName: 'BS Report', phone: '0922222003', email: 'vetrp@test.vn', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-RP0004', fullName: 'Chủ nuôi Report', phone: '0922222004', email: 'ownerrp@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
  ]);

  adminToken = signToken(admin);
  receptionistToken = signToken(receptionist);
  vetToken = signToken(vet);
  ownerToken = signToken(owner);

  const [pet1] = await Pet.create([
    { code: 'PET-RP0001', ownerId: owner._id, name: 'Bông', species: 'Dog', breed: 'Corgi', weight: 8 },
  ]);

  const [examService, groomingService] = await Service.create([
    { code: 'SRV-RP0001', name: 'Khám tổng quát', category: 'Examination', defaultDuration: 30, basePrice: 200000, status: 'Active' },
    { code: 'SRV-RP0002', name: 'Tắm cắt tỉa', category: 'Grooming', defaultDuration: 60, basePrice: 300000, status: 'Active' },
  ]);

  const [activeProduct] = await Product.create([
    { code: 'PRD-RP0001', name: 'Sữa tắm thảo dược', category: 'Retail', unit: 'Chai', unitPrice: 100000, status: 'Active' },
    { code: 'PRD-RP0002', name: 'Thuốc tạm hết', category: 'Medicine', unit: 'Viên', unitPrice: 20000, status: 'Inactive' },
  ]);

  await Cage.create([
    { label: 'H-01', size: 'M', maxWeightKg: 15, zone: 'Holding', isIsolated: false, status: 'Occupied' },
    { label: 'H-02', size: 'M', maxWeightKg: 15, zone: 'Holding', isIsolated: false, status: 'Available' },
    { label: 'W-01', size: 'L', maxWeightKg: 30, zone: 'InpatientWard', isIsolated: false, status: 'Occupied' },
    { label: 'ISO-01', size: 'M', maxWeightKg: 15, zone: 'InpatientWard', isIsolated: true, status: 'Available' },
  ]);

  // --- Dữ liệu cố định trong khoảng 2026-11-10 .. 2026-11-12 (3 ngày) ---
  // Đơn 1: Online, Done (2026-11-10) — thời gian chờ từ Check-in -> Start = 15 phút
  const order1 = await AppointmentOrder.create({
    code: 'APT-RP0001',
    petId: pet1._id,
    ownerId: owner._id,
    date: '2026-11-10',
    isOnline: true,
    derivedStatus: 'Done',
    checkedInAt: new Date('2026-11-10T02:00:00.000Z'), // 09:00 VN
  });
  await AppointmentService.create([
    {
      orderId: order1._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
      dequeueAt: new Date('2026-11-10T02:15:00.000Z'), // chờ 15 phút
    },
    {
      orderId: order1._id,
      serviceId: groomingService._id,
      sequenceNo: 2,
      assignedStaffId: vet._id,
      status: 'Done',
      dequeueAt: new Date('2026-11-10T02:45:00.000Z'),
    },
  ]);

  // Đơn 2: Walk-in, Done (2026-11-12) — thời gian chờ = 25 phút (TB 2 đơn = 20 phút)
  const order2 = await AppointmentOrder.create({
    code: 'APT-RP0002',
    petId: pet1._id,
    ownerId: owner._id,
    date: '2026-11-12',
    isOnline: false,
    derivedStatus: 'Done',
    checkedInAt: new Date('2026-11-12T03:00:00.000Z'),
  });
  await AppointmentService.create([
    {
      orderId: order2._id,
      serviceId: examService._id,
      sequenceNo: 1,
      assignedStaffId: vet._id,
      status: 'Done',
      dequeueAt: new Date('2026-11-12T03:25:00.000Z'), // chờ 25 phút
    },
  ]);

  // Đơn 3: Online, Overdue (2026-11-11)
  const order3 = await AppointmentOrder.create({
    code: 'APT-RP0003',
    petId: pet1._id,
    ownerId: owner._id,
    date: '2026-11-11',
    isOnline: true,
    derivedStatus: 'Overdue',
  });
  await AppointmentService.create([
    { orderId: order3._id, serviceId: groomingService._id, sequenceNo: 1, status: 'Overdue' },
  ]);

  // Đơn 4: Online, Cancelled (2026-11-11) — dịch vụ Cancelled không tính vào servicesByCategory
  const order4 = await AppointmentOrder.create({
    code: 'APT-RP0004',
    petId: pet1._id,
    ownerId: owner._id,
    date: '2026-11-11',
    isOnline: true,
    derivedStatus: 'Cancelled',
  });
  await AppointmentService.create([
    { orderId: order4._id, serviceId: examService._id, sequenceNo: 1, status: 'Cancelled' },
  ]);

  // Các đơn sống của ngày hôm nay để kiểm tra todayCounters trên SCR-16
  await AppointmentOrder.create([
    { code: 'APT-TODAY01', petId: pet1._id, ownerId: owner._id, date: todayStr, isOnline: true, derivedStatus: 'Booked' },
    { code: 'APT-TODAY02', petId: pet1._id, ownerId: owner._id, date: todayStr, isOnline: false, derivedStatus: 'CheckedIn', checkedInAt: new Date() },
    { code: 'APT-TODAY03', petId: pet1._id, ownerId: owner._id, date: todayStr, isOnline: true, derivedStatus: 'InProgress', checkedInAt: new Date() },
    { code: 'APT-TODAY04', petId: pet1._id, ownerId: owner._id, date: todayStr, isOnline: true, derivedStatus: 'WaitOwner', checkedInAt: new Date() },
  ]);

  // --- Hóa đơn ---
  // 1) Hóa đơn Paid ngày 2026-11-10 (Cash): 200k Exam + 100k Product = 300k
  await Invoice.create({
    code: 'INV-RP0001',
    orderId: order1._id,
    issuedById: receptionist._id,
    items: [
      { type: 'Service', refId: examService._id, itemNameSnapshot: 'Khám tổng quát', unitPriceSnapshot: 200000, quantity: 1, subtotal: 200000 },
      { type: 'Product', refId: activeProduct._id, itemNameSnapshot: 'Sữa tắm thảo dược', unitPriceSnapshot: 100000, quantity: 1, subtotal: 100000 },
    ],
    totalAmount: 300000,
    paymentMethod: 'Cash',
    paymentStatus: 'Paid',
    issuedAt: new Date('2026-11-10T03:00:00.000Z'), // 10:00 VN ngày 10/11
    paidAt: new Date('2026-11-10T03:10:00.000Z'),
  });

  // 2) Hóa đơn Paid ngày 2026-11-12 (PayOS): 300k Grooming + 200k InpatientDay = 500k
  await Invoice.create({
    code: 'INV-RP0002',
    orderId: order2._id,
    issuedById: receptionist._id,
    items: [
      { type: 'Service', refId: groomingService._id, itemNameSnapshot: 'Tắm cắt tỉa', unitPriceSnapshot: 300000, quantity: 1, subtotal: 300000 },
      { type: 'InpatientDay', refId: new mongoose.Types.ObjectId(), itemNameSnapshot: 'Nội trú 1 ngày', unitPriceSnapshot: 200000, quantity: 1, subtotal: 200000 },
    ],
    totalAmount: 500000,
    paymentMethod: 'PayOS',
    paymentStatus: 'Paid',
    issuedAt: new Date('2026-11-12T04:00:00.000Z'), // 11:00 VN ngày 12/11
    paidAt: new Date('2026-11-12T04:05:00.000Z'),
  });

  // 3) Hóa đơn Unpaid & Refunded trong khoảng 2026-11-11 -> KHÔNG được tính vào doanh thu Paid
  await Invoice.create([
    {
      code: 'INV-RP0003',
      issuedById: receptionist._id,
      items: [{ type: 'Service', refId: examService._id, itemNameSnapshot: 'Khám tổng quát', unitPriceSnapshot: 200000, quantity: 1, subtotal: 200000 }],
      totalAmount: 200000,
      paymentMethod: null,
      paymentStatus: 'Unpaid',
      issuedAt: new Date('2026-11-11T05:00:00.000Z'),
    },
    {
      code: 'INV-RP0004',
      issuedById: receptionist._id,
      items: [{ type: 'Service', refId: examService._id, itemNameSnapshot: 'Khám tổng quát', unitPriceSnapshot: 200000, quantity: 1, subtotal: 200000 }],
      totalAmount: 200000,
      paymentMethod: 'VNPay',
      paymentStatus: 'Refunded',
      issuedAt: new Date('2026-11-11T06:00:00.000Z'),
      paidAt: new Date('2026-11-11T06:05:00.000Z'),
    },
  ]);

  // 4) Hóa đơn Paid của kỳ trước (2026-11-07..2026-11-09, 3 ngày liền trước 10..12/11): 400k (VNPay)
  // => Kỳ này 800k so với kỳ trước 400k = tăng +100%
  await Invoice.create({
    code: 'INV-RP-PREV',
    issuedById: receptionist._id,
    items: [{ type: 'Service', refId: examService._id, itemNameSnapshot: 'Khám tổng quát', unitPriceSnapshot: 400000, quantity: 1, subtotal: 400000 }],
    totalAmount: 400000,
    paymentMethod: 'VNPay',
    paymentStatus: 'Paid',
    issuedAt: new Date('2026-11-08T05:00:00.000Z'),
    paidAt: new Date('2026-11-08T05:10:00.000Z'),
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Module Thống kê Dashboard (/api/reports — UC-63, UC-64, SCR-28, SCR-16)', () => {
  test('1. Phân quyền RBAC: chặn chưa đăng nhập (401) và chặn sai vai trò (403)', async () => {
    expect((await request(app).get('/api/reports/revenue')).status).toBe(401);

    // PetOwner, Vet bị chặn ở cả 3 endpoint
    expect((await request(app).get('/api/reports/revenue').set('Authorization', `Bearer ${ownerToken}`)).status).toBe(403);
    expect((await request(app).get('/api/reports/operations').set('Authorization', `Bearer ${vetToken}`)).status).toBe(403);
    expect((await request(app).get('/api/reports/front-desk').set('Authorization', `Bearer ${vetToken}`)).status).toBe(403);

    // Receptionist bị chặn ở /revenue và /operations (chỉ Admin), nhưng được phép gọi /front-desk
    expect((await request(app).get('/api/reports/revenue').set('Authorization', `Bearer ${receptionistToken}`)).status).toBe(403);
    expect((await request(app).get('/api/reports/operations').set('Authorization', `Bearer ${receptionistToken}`)).status).toBe(403);
    expect((await request(app).get('/api/reports/front-desk').set('Authorization', `Bearer ${receptionistToken}`)).status).toBe(200);
  });

  test('2. Validate tham số truy vấn trả 400 rõ ràng', async () => {
    const badRange = await request(app)
      .get('/api/reports/revenue')
      .query({ from: '2026-11-20', to: '2026-11-10', groupBy: 'year' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(badRange.status).toBe(400);
    expect(badRange.body.errors.from).toBeDefined();
    expect(badRange.body.errors.groupBy).toBeDefined();

    const tooLong = await request(app)
      .get('/api/reports/operations')
      .query({ from: '2025-01-01', to: '2026-11-20' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.errors.to).toBeDefined();

    const customMissingDates = await request(app)
      .get('/api/reports/front-desk')
      .query({ period: 'custom' })
      .set('Authorization', `Bearer ${receptionistToken}`);
    expect(customMissingDates.status).toBe(400);
    expect(customMissingDates.body.errors.from).toBeDefined();
  });

  test('3. GET /api/reports/revenue tính đúng KPI, % tăng trưởng so kỳ trước, biểu đồ lấp ngày trống, phương thức & danh mục (UC-63)', async () => {
    const res = await request(app)
      .get('/api/reports/revenue')
      .query({ from: '2026-11-10', to: '2026-11-12', groupBy: 'day' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.from).toBe('2026-11-10');
    expect(res.body.to).toBe('2026-11-12');
    expect(res.body.groupBy).toBe('day');

    // Chỉ tính 2 hóa đơn Paid (300k + 500k = 800k), bỏ Unpaid & Refunded
    expect(res.body.kpis.totalRevenue).toBe(800000);
    expect(res.body.kpis.paidInvoiceCount).toBe(2);
    expect(res.body.kpis.averageInvoiceValue).toBe(400000);
    expect(res.body.kpis.previousPeriod).toEqual({
      from: '2026-11-07',
      to: '2026-11-09',
      totalRevenue: 400000,
      paidInvoiceCount: 1,
    });
    expect(res.body.kpis.revenueChangePercent).toBe(100);

    // Chuỗi biểu đồ đủ 3 ngày liên tiếp (ngày 11 trống được lấp 0)
    expect(res.body.revenueSeries).toEqual([
      { period: '2026-11-10', revenue: 300000, invoiceCount: 1 },
      { period: '2026-11-11', revenue: 0, invoiceCount: 0 },
      { period: '2026-11-12', revenue: 500000, invoiceCount: 1 },
    ]);

    // Phương thức thanh toán: Cash 300k (37.5%), VNPay 0, PayOS 500k (62.5%)
    const cash = res.body.byPaymentMethod.find((m) => m.paymentMethod === 'Cash');
    const payos = res.body.byPaymentMethod.find((m) => m.paymentMethod === 'PayOS');
    const vnpay = res.body.byPaymentMethod.find((m) => m.paymentMethod === 'VNPay');
    expect(cash).toEqual({ paymentMethod: 'Cash', revenue: 300000, invoiceCount: 1, percentage: 37.5 });
    expect(payos).toEqual({ paymentMethod: 'PayOS', revenue: 500000, invoiceCount: 1, percentage: 62.5 });
    expect(vnpay).toEqual({ paymentMethod: 'VNPay', revenue: 0, invoiceCount: 0, percentage: 0 });

    // Doanh thu theo nhóm dịch vụ (Examination 200k, Grooming 300k, Inpatient 200k từ InpatientDay)
    const examCat = res.body.byServiceCategory.find((c) => c.category === 'Examination');
    const groomCat = res.body.byServiceCategory.find((c) => c.category === 'Grooming');
    const inpatientCat = res.body.byServiceCategory.find((c) => c.category === 'Inpatient');
    expect(examCat.revenue).toBe(200000);
    expect(groomCat.revenue).toBe(300000);
    expect(inpatientCat.revenue).toBe(200000);

    // Doanh thu theo loại dòng hóa đơn (Service 500k, Product 100k, InpatientDay 200k)
    const prodType = res.body.byItemType.find((t) => t.type === 'Product');
    expect(prodType.revenue).toBe(100000);
  });

  test('4. GET /api/reports/revenue hỗ trợ gom theo tháng (groupBy=month)', async () => {
    const res = await request(app)
      .get('/api/reports/revenue')
      .query({ from: '2026-10-01', to: '2026-11-30', groupBy: 'month' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.groupBy).toBe('month');
    expect(res.body.revenueSeries).toEqual([
      { period: '2026-10', revenue: 0, invoiceCount: 0 },
      { period: '2026-11', revenue: 1200000, invoiceCount: 3 },
    ]);
  });

  test('5. GET /api/reports/operations trả đúng thống kê lịch hẹn, Online vs Walk-in, dịch vụ, công suất chuồng & tồn kho (UC-64)', async () => {
    const res = await request(app)
      .get('/api/reports/operations')
      .query({ from: '2026-11-10', to: '2026-11-12' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.appointments.total).toBe(4);
    expect(res.body.appointments.byStatus).toEqual({
      Booked: 0,
      CheckedIn: 0,
      InProgress: 0,
      WaitOwner: 0,
      Done: 2,
      Overdue: 1,
      Cancelled: 1,
    });
    expect(res.body.appointments.byChannel).toEqual({
      online: 3,
      walkIn: 1,
      onlineRate: 75,
      walkInRate: 25,
    });
    expect(res.body.appointments.completionRate).toBe(50);
    expect(res.body.appointments.overdueRate).toBe(25);
    expect(res.body.appointments.cancellationRate).toBe(25);

    // Lượt dịch vụ theo danh mục (đã loại 1 dịch vụ Cancelled)
    const examStat = res.body.servicesByCategory.find((s) => s.category === 'Examination');
    const groomStat = res.body.servicesByCategory.find((s) => s.category === 'Grooming');
    expect(examStat).toEqual({ category: 'Examination', totalCount: 2, doneCount: 2 });
    expect(groomStat).toEqual({ category: 'Grooming', totalCount: 2, doneCount: 1 });
    expect(res.body.topServices).toHaveLength(2);

    // Công suất chuồng (4 chuồng: 2 Occupied, 2 Available -> 50%)
    expect(res.body.cageOccupancy.total).toBe(4);
    expect(res.body.cageOccupancy.occupied).toBe(2);
    expect(res.body.cageOccupancy.available).toBe(2);
    expect(res.body.cageOccupancy.occupancyRate).toBe(50);
    expect(res.body.cageOccupancy.byZone.Holding.occupancyRate).toBe(50);
    expect(res.body.cageOccupancy.byZone.InpatientWard.occupancyRate).toBe(50);
    expect(res.body.cageOccupancy.isolatedCages).toEqual({ total: 1, occupied: 0, available: 1 });

    // Tổng quan nhanh
    expect(res.body.overview).toEqual({
      activeCustomersCount: 1,
      activePetsCount: 1,
      activeProductsCount: 1,
      inactiveProductsCount: 1,
    });
  });

  test('6. GET /api/reports/front-desk trả đúng bộ đếm hôm nay, thời gian chờ trung bình & số tiền thu theo phương thức (SCR-16)', async () => {
    const res = await request(app)
      .get('/api/reports/front-desk')
      .query({ from: '2026-11-10', to: '2026-11-12' })
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.today).toBe(todayStr);

    // Bộ đếm trực tiếp hôm nay
    expect(res.body.todayCounters).toEqual({
      expectedToday: 1,
      checkedInNow: 1,
      inProgressNow: 1,
      waitingForPickup: 1,
      cages: {
        available: 2,
        occupied: 2,
        total: 4,
        occupancyRate: 50,
      },
    });

    // Thống kê kỳ 2026-11-10..12: 2 đơn có thời gian chờ 15p & 25p => TB 20p
    expect(res.body.periodStats.totalAppointments).toBe(4);
    expect(res.body.periodStats.onlineCount).toBe(3);
    expect(res.body.periodStats.walkInCount).toBe(1);
    expect(res.body.periodStats.averageWaitMinutes).toBe(20);
    expect(res.body.periodStats.waitTimeSampleCount).toBe(2);

    // Hóa đơn lập trong kỳ: 4 (2 Paid, 1 Unpaid, 1 Refunded), tổng tiền thu = 800k
    expect(res.body.periodStats.invoices.issuedCount).toBe(4);
    expect(res.body.periodStats.invoices.paidCount).toBe(2);
    expect(res.body.periodStats.invoices.unpaidCount).toBe(1);
    expect(res.body.periodStats.invoices.totalCollected).toBe(800000);
  });
});
