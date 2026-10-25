// Seed dữ liệu mẫu: mỗi collection 1 document (users có 2: 1 chủ pet + 1 bác sĩ).
// Chạy: npm run seed  (chỉ chạy khi DB trống)
//       npm run seed -- --force  (CẢNH BÁO: xoá sạch dữ liệu 17 collection rồi seed lại)
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const modelsDir = path.join(__dirname, '..', 'models');
fs.readdirSync(modelsDir).forEach((f) => require(path.join(modelsDir, f)));
const {
  User, Pet, StaffSchedule, Service, Product, AppointmentOrder, AppointmentService, Cage,
  CageAssignment, MedicalRecord, SubtaskRequest, InpatientRecord, Invoice, CommunityPost,
  PostComment, PostLike, ContentReport,
} = mongoose.models;

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected: ${mongoose.connection.name}`);

  const models = Object.values(mongoose.models);

  // Chốt an toàn: DB đã có dữ liệu thì không xoá, trừ khi chạy kèm --force
  const counts = await Promise.all(models.map((M) => M.countDocuments()));
  if (counts.some((n) => n > 0) && !process.argv.includes('--force')) {
    throw new Error(
      `DB "${mongoose.connection.name}" đã có dữ liệu → dừng để tránh mất dữ liệu. ` +
        'Nếu chắc chắn muốn XOÁ HẾT và seed lại: npm run seed -- --force'
    );
  }

  for (const M of models) {
    await M.deleteMany({});
    await M.syncIndexes();
  }

  const passwordHash = await bcrypt.hash('123456', 10);
  // Mã cố định cho dữ liệu mẫu. Mã sinh tự động khi đăng ký không chứa số 0/1
  // nên không bao giờ trùng với các mã này.
  const [owner, vet] = await User.create([
    { code: 'USR-000001', fullName: 'Nguyen Van A', phone: '0901000001', email: 'owner@vcmos.com', passwordHash, role: 'PetOwner' },
    { code: 'USR-000002', fullName: 'Tran Thi B', phone: '0901000002', email: 'vet@vcmos.com', passwordHash, role: 'Veterinarian' },
  ]);

  const pet = await Pet.create({
    code: 'PET-000001', ownerId: owner._id, name: 'Milo', species: 'Dog', breed: 'Poodle', coatColor: 'Brown',
    dob: new Date('2023-05-01'), weight: 5.2, notes: 'Dị ứng hải sản',
  });

  await StaffSchedule.create({ staffId: vet._id, workDate: TODAY, notes: 'Ca sáng' });

  const service = await Service.create({
    code: 'SRV-000001', name: 'Khám tổng quát', category: 'Examination', defaultDuration: 30, basePrice: 150000,
    description: 'Khám sức khoẻ tổng quát cho thú cưng',
  });

  const product = await Product.create({
    code: 'PRD-000001', name: 'Amoxicillin 250mg', category: 'Medicine', unit: 'viên', unitPrice: 5000,
  });

  const order = await AppointmentOrder.create({
    code: 'ORD-000001', petId: pet._id, ownerId: owner._id, date: TODAY, note: 'Bé bỏ ăn 2 ngày',
    isOnline: true, derivedStatus: 'InProgress', checkedInAt: new Date(),
  });

  const apptService = await AppointmentService.create({
    orderId: order._id, serviceId: service._id, sequenceNo: 1, preferredStaffId: vet._id,
    assignedStaffId: vet._id, status: 'Done', queueNo: 1, enqueueAt: new Date(), dequeueAt: new Date(),
  });

  const cage = await Cage.create({ label: 'C-01', size: 'M', isIsolated: false, status: 'Occupied' });

  await CageAssignment.create({ cageId: cage._id, orderId: order._id, assignedById: vet._id });

  await MedicalRecord.create({
    appointmentServiceId: apptService._id, petId: pet._id,
    subjectiveNote: 'Chủ báo bé bỏ ăn, nôn nhẹ', objectiveNote: 'Nhiệt độ 39.5°C',
    assessment: 'Viêm dạ dày ruột', plan: 'Nhập viện theo dõi, kháng sinh 5 ngày', status: 'Finalized',
    prescriptions: [{
      productId: product._id, productNameSnapshot: product.name, unitSnapshot: product.unit,
      dosage: '1 viên', frequency: '2 lần/ngày', instructions: 'Uống sau ăn', durationDays: 5,
    }],
  });

  await SubtaskRequest.create({
    appointmentServiceId: apptService._id, requestedById: vet._id, assignedStaffId: vet._id,
    taskType: 'Xét nghiệm máu', instructions: 'Công thức máu toàn phần',
    resultText: 'Bạch cầu tăng nhẹ', status: 'Completed', completedAt: new Date(),
  });

  await InpatientRecord.create({
    petId: pet._id, orderId: order._id, attendingVetId: vet._id, cageId: cage._id,
    initialDiagnosis: 'Viêm dạ dày ruột', treatmentPlan: 'Truyền dịch + kháng sinh',
    dailyLogs: [{ date: TODAY, recordedById: vet._id, observations: 'Ăn được chút cháo', notes: 'Ổn định' }],
  });

  await Invoice.create({
    code: 'INV-000001', orderId: order._id, issuedById: vet._id,
    items: [
      { type: 'Service', refId: service._id, itemNameSnapshot: service.name, unitPriceSnapshot: 150000, quantity: 1, subtotal: 150000 },
      { type: 'Product', refId: product._id, itemNameSnapshot: product.name, unitPriceSnapshot: 5000, quantity: 10, subtotal: 50000 },
    ],
    totalAmount: 200000, paymentMethod: 'Cash', paymentStatus: 'Paid', paidAt: new Date(),
  });

  const post = await CommunityPost.create({
    authorId: owner._id, petId: pet._id, postType: 'TimelineShare', content: 'Hành trình lớn lên của Milo',
    timelineItems: [{ date: '2023-05-01', title: 'Milo chào đời' }],
    status: 'Published', likeCount: 1, commentCount: 1,
  });

  const comment = await PostComment.create({ postId: post._id, authorId: vet._id, content: 'Bé dễ thương quá!' });

  await PostLike.create({ postId: post._id, userId: vet._id });

  await ContentReport.create({ reporterId: owner._id, targetType: 'Comment', targetId: comment._id, reason: 'Test báo cáo' });

  for (const M of models) console.log(`  ${M.collection.name}: ${await M.countDocuments()}`);
  console.log('Seed done. Login: 0901000001 / 123456 (PetOwner), 0901000002 / 123456 (Veterinarian)');
};

seed()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
