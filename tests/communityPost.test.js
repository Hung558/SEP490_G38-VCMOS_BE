// Test toàn bộ phân hệ Cộng đồng & Kiểm duyệt Admin (UC-49..UC-59, BR-18, BR-19, SCR-03, SCR-14, SCR-33)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');
const MedicalRecord = require('../src/models/MedicalRecord');
const Invoice = require('../src/models/Invoice');
const CommunityPost = require('../src/models/CommunityPost');
const PostLike = require('../src/models/PostLike');
const PostComment = require('../src/models/PostComment');
const ContentReport = require('../src/models/ContentReport');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

let owner1;
let owner2;
let owner3;
let admin;
let vet;

let owner1Token;
let owner2Token;
let owner3Token;
let adminToken;
let vetToken;

let pet1;
let doneOrder;
let approvedPostId;
let withdrawablePostId;

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  const passwordHash = await bcrypt.hash('Password123', 10);

  [owner1, owner2, owner3, admin, vet] = await User.create([
    { code: 'USR-CM0001', fullName: 'Nguyễn Minh A', phone: '0933333001', email: 'cma@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-CM0002', fullName: 'Trần Thảo B', phone: '0933333002', email: 'cmb@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-CM0003', fullName: 'Lê Hoàng C', phone: '0933333003', email: 'cmc@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-CM0004', fullName: 'Admin Duyệt', phone: '0933333004', email: 'cmadmin@test.vn', passwordHash, role: 'Admin', status: 'Active' },
    { code: 'USR-CM0005', fullName: 'BS Thú Y', phone: '0933333005', email: 'cmvet@test.vn', passwordHash, role: 'Veterinarian', status: 'Active' },
  ]);

  owner1Token = signToken(owner1);
  owner2Token = signToken(owner2);
  owner3Token = signToken(owner3);
  adminToken = signToken(admin);
  vetToken = signToken(vet);

  pet1 = await Pet.create({
    code: 'PET-CM0001',
    ownerId: owner1._id,
    name: 'Milo',
    species: 'Dog',
    breed: 'Poodle',
    weight: 5.5,
  });

  const groomingService = await Service.create({
    code: 'SRV-CM0001',
    name: 'Tắm & cắt tỉa Poodle',
    category: 'Grooming',
    defaultDuration: 60,
    basePrice: 250000,
    status: 'Active',
  });

  doneOrder = await AppointmentOrder.create({
    code: 'APT-CM0001',
    petId: pet1._id,
    ownerId: owner1._id,
    date: '2026-11-15',
    note: 'Ghi chú nhạy cảm riêng tư 999k',
    isOnline: true,
    derivedStatus: 'Done',
  });

  const doneSvc = await AppointmentService.create({
    orderId: doneOrder._id,
    serviceId: groomingService._id,
    sequenceNo: 1,
    assignedStaffId: vet._id,
    status: 'Done',
    groomingNote: {
      beforeNote: 'Lông bết',
      afterNote: 'Lông sạch đẹp',
      beforePhotoUrl: 'https://res.cloudinary.com/demo/image/upload/before.jpg',
      afterPhotoUrl: 'https://res.cloudinary.com/demo/image/upload/after.jpg',
    },
  });

  // Dữ liệu nhạy cảm (SOAP + Invoice) gắn với đơn khám để kiểm chứng BR-18 không làm lọt ra ngoài
  await MedicalRecord.create({
    appointmentServiceId: doneSvc._id,
    petId: pet1._id,
    subjectiveNote: 'Bí mật SOAP S',
    objectiveNote: 'Bí mật SOAP O',
    assessment: 'Bí mật chẩn đoán',
    plan: 'Bí mật phác đồ',
    status: 'Finalized',
  });

  await Invoice.create({
    code: 'INV-CM0001',
    orderId: doneOrder._id,
    issuedById: admin._id,
    items: [{ type: 'Service', refId: groomingService._id, itemNameSnapshot: 'Tắm & cắt tỉa Poodle', unitPriceSnapshot: 250000, quantity: 1, subtotal: 250000 }],
    totalAmount: 250000,
    paymentMethod: 'Cash',
    paymentStatus: 'Paid',
    paidAt: new Date(),
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Module Cộng đồng & Admin Kiểm duyệt (UC-49..UC-59, BR-18, BR-19)', () => {
  test('1. UC-49 & BR-18: Xem trước & tạo bài TimelineShare từ lịch sử khám Done — cắt bỏ sạch SOAP, giá tiền, ghi chú', async () => {
    const previewRes = await request(app)
      .get('/api/community-posts/timeline-share/preview')
      .query({ petId: String(pet1._id) })
      .set('Authorization', `Bearer ${owner1Token}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.milestones).toHaveLength(1);
    expect(previewRes.body.milestones[0].title).toBe('Tắm & cắt tỉa Poodle');
    expect(previewRes.body.milestones[0].imageUrl).toContain('after.jpg');
    expect(JSON.stringify(previewRes.body)).not.toContain('Bí mật SOAP');
    expect(JSON.stringify(previewRes.body)).not.toContain('250000');

    const shareRes = await request(app)
      .post('/api/community-posts/timeline-share')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        petId: String(pet1._id),
        orderIds: [String(doneOrder._id)],
        content: 'Hành trình làm đẹp của Milo rất vui!',
      });

    expect(shareRes.status).toBe(201);
    expect(shareRes.body.post.status).toBe('PendingReview');
    expect(shareRes.body.post.postType).toBe('TimelineShare');
    withdrawablePostId = shareRes.body.post._id;
  });

  test('2. UC-57 & UC-58: Admin xem hàng đợi chờ duyệt (có cảnh báo từ khóa nhạy cảm), duyệt Approve & từ chối Reject bắt buộc lý do', async () => {
    // Tạo 1 bài Discussion có chứa từ khóa giá tiền/y tế để kiểm tra bộ phát hiện nhạy cảm
    const discussionRes = await request(app)
      .post('/api/community-posts')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('postType', 'Discussion')
      .field('content', 'Hôm nay bé đi khám hết 250k tiền hóa đơn và uống kháng sinh 50mg');
    expect(discussionRes.status).toBe(201);
    const sensitivePostId = discussionRes.body.post._id;

    // Tạo 1 bài Discussion sạch để duyệt Published và dùng cho test Like/Comment/Report
    const cleanRes = await request(app)
      .post('/api/community-posts')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('postType', 'Discussion')
      .field('content', 'Chia sẻ kinh nghiệm chải lông hằng ngày cho Poodle không bị rối');
    expect(cleanRes.status).toBe(201);
    approvedPostId = cleanRes.body.post._id;

    // Non-Admin bị chặn 403 khi truy cập hàng đợi kiểm duyệt
    const forbiddenRes = await request(app)
      .get('/api/admin/community/posts')
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(forbiddenRes.status).toBe(403);

    // Admin xem hàng đợi PendingReview
    const queueRes = await request(app)
      .get('/api/admin/community/posts')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(queueRes.status).toBe(200);
    expect(queueRes.body.posts.length).toBeGreaterThanOrEqual(3);

    const flagged = queueRes.body.posts.find((p) => String(p._id) === String(sensitivePostId));
    expect(flagged.hasSensitiveKeywords).toBe(true);
    expect(flagged.sensitiveMatches.length).toBeGreaterThan(0);

    // Reject thiếu lý do moderationNote -> 400 (MSG22)
    const badReject = await request(app)
      .patch(`/api/admin/community/posts/${sensitivePostId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Reject', moderationNote: '' });
    expect(badReject.status).toBe(400);
    expect(badReject.body.errors.moderationNote).toBeDefined();

    // Reject có lý do -> Hidden
    const rejectRes = await request(app)
      .patch(`/api/admin/community/posts/${sensitivePostId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Reject', moderationNote: 'Bài viết chứa thông tin giá tiền và đơn thuốc' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.post.status).toBe('Hidden');
    expect(rejectRes.body.post.moderationNote).toContain('giá tiền');

    // Approve 2 bài hợp lệ -> Published
    const approve1 = await request(app)
      .patch(`/api/admin/community/posts/${approvedPostId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Approve' });
    expect(approve1.status).toBe(200);
    expect(approve1.body.post.status).toBe('Published');

    const approve2 = await request(app)
      .patch(`/api/admin/community/posts/${withdrawablePostId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Approve' });
    expect(approve2.status).toBe(200);

    // Kiểm duyệt lại bài đã Published -> 409
    const reModerate = await request(app)
      .patch(`/api/admin/community/posts/${approvedPostId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Approve' });
    expect(reModerate.status).toBe(409);

    // Public feed chỉ hiện bài Published, không lộ moderationNote hay SĐT tác giả
    const publicFeed = await request(app).get('/api/community-posts/public');
    expect(publicFeed.status).toBe(200);
    expect(publicFeed.body.posts).toHaveLength(2);
    expect(publicFeed.body.posts[0].moderationNote).toBeUndefined();
    expect(publicFeed.body.posts[0].authorId.phone).toBeUndefined();
  });

  test('3. UC-50: Chủ nuôi thu hồi bài chia sẻ đã Published (Withdraw -> Removed) và biến mất khỏi feed công khai', async () => {
    // Người khác không thể thu hồi bài của owner1 -> 404
    const notOwned = await request(app)
      .patch(`/api/community-posts/${withdrawablePostId}/withdraw`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(notOwned.status).toBe(404);

    // Chính chủ thu hồi bài đã Published -> 200 (Removed)
    const withdrawRes = await request(app)
      .patch(`/api/community-posts/${withdrawablePostId}/withdraw`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.body.post.status).toBe('Removed');

    // Thu hồi lần 2 -> 409
    const withdrawAgain = await request(app)
      .patch(`/api/community-posts/${withdrawablePostId}/withdraw`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(withdrawAgain.status).toBe(409);

    // Feed công khai không còn hiển thị bài đã thu hồi
    const publicDetail = await request(app).get(`/api/community-posts/public/${withdrawablePostId}`);
    expect(publicDetail.status).toBe(404);
  });

  test('4. UC-53 & BR-19: Toggle Like (mỗi user tối đa 1 like/bài) và đồng bộ likeCount chính xác', async () => {
    // Guest không được like (401); Vet không được like (403)
    expect((await request(app).post(`/api/community-posts/${approvedPostId}/like`)).status).toBe(401);
    expect((await request(app).post(`/api/community-posts/${approvedPostId}/like`).set('Authorization', `Bearer ${vetToken}`)).status).toBe(403);

    // owner2 bấm thích -> liked = true, likeCount = 1
    const like1 = await request(app)
      .post(`/api/community-posts/${approvedPostId}/like`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(like1.status).toBe(200);
    expect(like1.body.liked).toBe(true);
    expect(like1.body.likeCount).toBe(1);

    // Kiểm tra like-status
    const statusRes = await request(app)
      .get(`/api/community-posts/${approvedPostId}/like-status`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toEqual({ liked: true, likeCount: 1 });

    // owner3 cùng bấm thích -> likeCount = 2
    const like2 = await request(app)
      .post(`/api/community-posts/${approvedPostId}/like`)
      .set('Authorization', `Bearer ${owner3Token}`);
    expect(like2.body.likeCount).toBe(2);

    // owner2 bấm lại lần nữa -> bỏ thích, likeCount = 1
    const unlike = await request(app)
      .post(`/api/community-posts/${approvedPostId}/like`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(unlike.status).toBe(200);
    expect(unlike.body.liked).toBe(false);
    expect(unlike.body.likeCount).toBe(1);

    const dbLikeCount = await PostLike.countDocuments({ postId: approvedPostId });
    expect(dbLikeCount).toBe(1);
  });

  test('5. UC-54, UC-55 & BR-19: Bình luận, trả lời 1 cấp, chặn lồng quá 1 cấp & xoá mềm bình luận', async () => {
    // Tạo bình luận gốc
    const rootRes = await request(app)
      .post(`/api/community-posts/${approvedPostId}/comments`)
      .set('Authorization', `Bearer ${owner2Token}`)
      .send({ content: 'Cảm ơn bạn đã chia sẻ mẹo rất hữu ích!' });
    expect(rootRes.status).toBe(201);
    expect(rootRes.body.commentCount).toBe(1);
    const rootCommentId = rootRes.body.comment._id;

    // Trả lời bình luận gốc (cấp 1) -> hợp lệ
    const replyRes = await request(app)
      .post(`/api/community-posts/${approvedPostId}/comments`)
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({ content: 'Không có gì ạ, chúc bé nhà bạn luôn khoẻ!', parentCommentId: rootCommentId });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.commentCount).toBe(2);
    const replyCommentId = replyRes.body.comment._id;

    // BR-19: Cố gắng trả lời tiếp bình luận cấp 1 (lồng cấp 2) -> bị chặn 400
    const nestedLevel2 = await request(app)
      .post(`/api/community-posts/${approvedPostId}/comments`)
      .set('Authorization', `Bearer ${owner3Token}`)
      .send({ content: 'Trả lời lồng cấp 2', parentCommentId: replyCommentId });
    expect(nestedLevel2.status).toBe(400);
    expect(nestedLevel2.body.errors.parentCommentId).toBeDefined();

    // Guest xem danh sách bình luận công khai (gồm bình luận gốc + mảng replies cấp 1)
    const listRes = await request(app).get(`/api/community-posts/${approvedPostId}/comments`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.comments).toHaveLength(1);
    expect(listRes.body.comments[0].replies).toHaveLength(1);
    expect(listRes.body.comments[0].authorId.fullName).toBe('Trần Thảo B');

    // Người khác cố xoá bình luận của owner1 -> 403
    const forbidDel = await request(app)
      .delete(`/api/community-posts/comments/${replyCommentId}`)
      .set('Authorization', `Bearer ${owner3Token}`);
    expect(forbidDel.status).toBe(403);

    // Chính chủ xoá mềm reply của mình -> 200, commentCount về 1
    const delRes = await request(app)
      .delete(`/api/community-posts/comments/${replyCommentId}`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.commentCount).toBe(1);

    const deletedDoc = await PostComment.findById(replyCommentId).lean();
    expect(deletedDoc.status).toBe('Deleted');
  });

  test('6. UC-56 & UC-59: Báo cáo vi phạm (chặn tự report & report trùng) và Admin xử lý Keep / Hide / Delete đóng tất cả report cùng nội dung', async () => {
    // owner1 tự report bài của mình -> 400
    const selfReport = await request(app)
      .post('/api/community-posts/reports')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({ targetType: 'Post', targetId: approvedPostId, reason: 'Tự báo cáo' });
    expect(selfReport.status).toBe(400);

    // owner2 report bài viết -> 201
    const rep1 = await request(app)
      .post('/api/community-posts/reports')
      .set('Authorization', `Bearer ${owner2Token}`)
      .send({ targetType: 'Post', targetId: approvedPostId, reason: 'Spam quảng cáo' });
    expect(rep1.status).toBe(201);

    // owner2 report trùng cùng 1 bài -> 409
    const repDup = await request(app)
      .post('/api/community-posts/reports')
      .set('Authorization', `Bearer ${owner2Token}`)
      .send({ targetType: 'Post', targetId: approvedPostId, reason: 'Báo cáo lại' });
    expect(repDup.status).toBe(409);

    // owner3 cũng report cùng bài viết đó -> reportCount = 2
    const rep2 = await request(app)
      .post('/api/community-posts/reports')
      .set('Authorization', `Bearer ${owner3Token}`)
      .send({ targetType: 'Post', targetId: approvedPostId, reason: 'Nội dung sai lệch' });
    expect(rep2.status).toBe(201);

    // Admin xem danh sách báo cáo Pending kèm ngữ cảnh target và reportCount = 2
    const listRep = await request(app)
      .get('/api/admin/community/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRep.status).toBe(200);
    expect(listRep.body.reports).toHaveLength(2);
    expect(listRep.body.reports[0].reportCount).toBe(2);
    expect(listRep.body.reports[0].target.content).toContain('chải lông');

    // Admin chọn Hide nhưng thiếu note -> 400 (MSG22)
    const badResolve = await request(app)
      .patch(`/api/admin/community/reports/${rep1.body.report._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Hide', note: '' });
    expect(badResolve.status).toBe(400);

    // Admin xử lý Hide có lý do -> ẩn bài viết và tự động Resolved cả 2 báo cáo trên cùng bài viết
    const resolveRes = await request(app)
      .patch(`/api/admin/community/reports/${rep1.body.report._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Hide', note: 'Vi phạm quy định cộng đồng' });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.resolvedCount).toBe(2);
    expect(resolveRes.body.target.status).toBe('Hidden');

    const pendingLeft = await ContentReport.countDocuments({ status: 'Pending' });
    expect(pendingLeft).toBe(0);

    const hiddenPost = await CommunityPost.findById(approvedPostId).lean();
    expect(hiddenPost.status).toBe('Hidden');
    expect(hiddenPost.moderationNote).toBe('Vi phạm quy định cộng đồng');

    // Báo cáo bình luận + Admin xử lý Delete bình luận -> cập nhật commentCount về 0
    const rootComment = await PostComment.findOne({ postId: approvedPostId, status: 'Published' }).lean();
    const commentRep = await request(app)
      .post('/api/community-posts/reports')
      .set('Authorization', `Bearer ${owner3Token}`)
      .send({ targetType: 'Comment', targetId: String(rootComment._id), reason: 'Ngôn từ không phù hợp' });
    expect(commentRep.status).toBe(201);

    const resolveCommentRep = await request(app)
      .patch(`/api/admin/community/reports/${commentRep.body.report._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'Delete', note: 'Xoá bình luận không phù hợp' });
    expect(resolveCommentRep.status).toBe(200);
    expect(resolveCommentRep.body.target.status).toBe('Deleted');

    const postAfterCommentDel = await CommunityPost.findById(approvedPostId).lean();
    expect(postAfterCommentDel.commentCount).toBe(0);
  });
});
