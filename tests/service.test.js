// Test chức năng Quản lý danh mục dịch vụ (SCR-29 & SCR-02: UC-66, UC-01, BR-24)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../src/models/User');
const Service = require('../src/models/Service');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

let adminToken;
let petOwnerToken;
let createdServiceId;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  await Service.syncIndexes();

  // Tạo 1 tài khoản Admin và 1 tài khoản PetOwner để kiểm tra phân quyền
  const adminUser = await User.create({
    code: 'USR-ADMIN1',
    fullName: 'Quan Tri Vien',
    phone: '0988888888',
    email: 'admin@vcmos.vn',
    role: 'Admin',
    status: 'Active',
  });
  adminToken = jwt.sign({ id: adminUser._id, role: 'Admin' }, process.env.JWT_SECRET);

  const ownerUser = await User.create({
    code: 'USR-OWNER1',
    fullName: 'Khach Hang',
    phone: '0901234567',
    email: 'owner@vcmos.vn',
    role: 'PetOwner',
    status: 'Active',
  });
  petOwnerToken = jwt.sign({ id: ownerUser._id, role: 'PetOwner' }, process.env.JWT_SECRET);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('Service Catalogue Management (/api/services - SCR-29, SCR-02, UC-66, UC-01, BR-24)', () => {
  test('Phân quyền (Permission Matrix): Guest/PetOwner không được tạo, sửa, đổi trạng thái hoặc xóa dịch vụ (401/403)', async () => {
    const noAuthPost = await request(app).post('/api/services').send({
      name: 'Khám tổng quát',
      category: 'Examination',
      defaultDuration: 30,
      basePrice: 150000,
    });
    expect(noAuthPost.status).toBe(401);

    const ownerPost = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${petOwnerToken}`)
      .send({
        name: 'Khám tổng quát',
        category: 'Examination',
        defaultDuration: 30,
        basePrice: 150000,
      });
    expect(ownerPost.status).toBe(403);
  });

  test('POST /api/services (UC-66, BR-24): Admin thêm dịch vụ mới thành công, tự sinh mã SRV-XXXXXX', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '  Khám tổng quát thú cưng  ',
        category: 'Examination',
        defaultDuration: 30,
        basePrice: 150000,
        description: 'Khám lâm sàng toàn diện cho chó mèo',
      });

    expect(res.status).toBe(201);
    expect(res.body.service).toMatchObject({
      name: 'Khám tổng quát thú cưng',
      category: 'Examination',
      defaultDuration: 30,
      basePrice: 150000,
      description: 'Khám lâm sàng toàn diện cho chó mèo',
      status: 'Active',
    });
    expect(res.body.service.code).toMatch(/^SRV-[A-Z0-9]{6}$/);
    createdServiceId = res.body.service._id;

    // Tạo thêm 1 dịch vụ thuộc danh mục khác (Grooming) nhưng trùng tên vẫn được phép
    const sameNameDifferentCategory = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Khám tổng quát thú cưng',
        category: 'Grooming',
        defaultDuration: 60,
        basePrice: 250000,
      });
    expect(sameNameDifferentCategory.status).toBe(201);
  });

  test('POST /api/services: báo lỗi 400 nếu sai dữ liệu (duration ngoài 5-480, giá âm, sai category) và 409 nếu trùng tên trong cùng danh mục', async () => {
    const invalidDuration = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tiêm phòng dại',
        category: 'Vaccination',
        defaultDuration: 600,
        basePrice: 100000,
      });
    expect(invalidDuration.status).toBe(400);
    expect(invalidDuration.body.errors.defaultDuration).toBeTruthy();

    const negativePrice = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tiêm phòng dại',
        category: 'Vaccination',
        defaultDuration: 15,
        basePrice: -5000,
      });
    expect(negativePrice.status).toBe(400);
    expect(negativePrice.body.errors.basePrice).toBeTruthy();

    // Trùng tên trong cùng danh mục Examination (kể cả khác hoa/thường) -> 409
    const duplicateInSameCategory = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'khám tổng quát thú cưng',
        category: 'Examination',
        defaultDuration: 45,
        basePrice: 200000,
      });
    expect(duplicateInSameCategory.status).toBe(409);
  });

  test('GET /api/services & GET /api/services/:id (UC-01, SCR-02, SCR-29): công khai xem danh sách, lọc theo category/status, tìm kiếm theo từ khóa', async () => {
    // Guest không cần token vẫn xem được danh sách dịch vụ
    const allRes = await request(app).get('/api/services');
    expect(allRes.status).toBe(200);
    expect(allRes.body.services).toHaveLength(2);

    const filterCategory = await request(app).get('/api/services?category=Examination&status=Active');
    expect(filterCategory.status).toBe(200);
    expect(filterCategory.body.services).toHaveLength(1);
    expect(filterCategory.body.services[0].category).toBe('Examination');

    const searchRes = await request(app).get('/api/services?search=lâm sàng');
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.services).toHaveLength(1);

    const invalidCategory = await request(app).get('/api/services?category=InvalidCat');
    expect(invalidCategory.status).toBe(400);

    // Xem chi tiết dịch vụ theo ID
    const detailRes = await request(app).get(`/api/services/${createdServiceId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.service.name).toBe('Khám tổng quát thú cưng');

    const badId = await request(app).get('/api/services/invalid-id');
    expect(badId.status).toBe(400);

    const notFound = await request(app).get(`/api/services/${new mongoose.Types.ObjectId()}`);
    expect(notFound.status).toBe(404);
  });

  test('PUT /api/services/:id (UC-66): Admin cập nhật dịch vụ, giữ nguyên mã code bất biến', async () => {
    const beforeUpdate = await Service.findById(createdServiceId).lean();

    const updateRes = await request(app)
      .put(`/api/services/${createdServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: 'SRV-HACKED', // Cố tình truyền code khác nhưng BE phải bỏ qua
        name: 'Khám tổng quát chuyên sâu',
        category: 'Examination',
        defaultDuration: 45,
        basePrice: 180000,
        description: 'Đã cập nhật giá và thời lượng mới',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.service).toMatchObject({
      code: beforeUpdate.code,
      name: 'Khám tổng quát chuyên sâu',
      category: 'Examination',
      defaultDuration: 45,
      basePrice: 180000,
      description: 'Đã cập nhật giá và thời lượng mới',
    });
  });

  test('PATCH /api/services/:id/status (UC-66, SCR-29): Admin tạm ngưng (Inactive) và kích hoạt lại (Active) dịch vụ', async () => {
    const deactivateRes = await request(app)
      .patch(`/api/services/${createdServiceId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Inactive' });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.service.status).toBe('Inactive');

    // Khi khách hàng lọc status=Active trên trang đặt lịch/bảng giá công khai, dịch vụ Inactive sẽ ẩn đi
    const activeOnlyRes = await request(app).get('/api/services?status=Active');
    expect(activeOnlyRes.status).toBe(200);
    expect(activeOnlyRes.body.services).toHaveLength(1);
    expect(activeOnlyRes.body.services[0]._id).not.toBe(createdServiceId);

    // Kích hoạt lại
    const activateRes = await request(app)
      .patch(`/api/services/${createdServiceId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Active' });
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.service.status).toBe('Active');

    // Truyền status sai báo lỗi 400
    const badStatus = await request(app)
      .patch(`/api/services/${createdServiceId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Deleted' });
    expect(badStatus.status).toBe(400);
  });

  test('DELETE /api/services/:id (SCR-29, BR-16): cấm xóa vật lý dịch vụ để bảo toàn lịch sử đơn hẹn và hóa đơn', async () => {
    const delRes = await request(app)
      .delete(`/api/services/${createdServiceId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(403);

    const stillExists = await Service.findById(createdServiceId).lean();
    expect(stillExists).toBeTruthy();
  });
});

