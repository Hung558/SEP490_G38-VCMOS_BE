// Test Trợ lý AI Đánh giá Sức khỏe Tham khảo (PB-18: UC-14, SCR-10, API-01, BR-20, T-50)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

jest.setTimeout(15000);

const mockUploadStream = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue({ result: 'ok' });

jest.mock('../src/config/cloudinary', () => ({
  uploader: {
    upload_stream: (...args) => mockUploadStream(...args),
    destroy: (...args) => mockDestroy(...args),
  },
}));

const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../server');

const User = require('../src/models/User');
const Pet = require('../src/models/Pet');
const Service = require('../src/models/Service');
const Cage = require('../src/models/Cage');
const AppointmentOrder = require('../src/models/AppointmentOrder');
const AppointmentService = require('../src/models/AppointmentService');
const MedicalRecord = require('../src/models/MedicalRecord');
const SubtaskRequest = require('../src/models/SubtaskRequest');
const InpatientRecord = require('../src/models/InpatientRecord');
const AiAssessment = require('../src/models/AiAssessment');
const {
  AI_DISCLAIMER,
  AI_BUSY_MESSAGE,
  collectProviderApiKeys,
  parseAndNormalizeAiJson,
  analyzePetHealthWithAi,
} = require('../src/utils/gemini');

const TEST_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/vcmos_test';

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

// Buffer ảnh PNG & JPEG hợp lệ tối thiểu (đúng magic bytes thật)
const SAMPLE_PNG_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const SAMPLE_JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

const buildGeminiFetchResponse = (payloadObj) => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [{ text: typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj) }],
        },
      },
    ],
  }),
});

const buildGroqFetchResponse = (payloadObj) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [
      {
        message: {
          content: typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj),
        },
      },
    ],
  }),
});

let owner1;
let owner2;
let vet;
let groomer;
let receptionist;
let admin;

let owner1Token;
let owner2Token;
let vetToken;
let groomerToken;
let receptionistToken;
let adminToken;

let pet1;
let pet2;
let deletedPet;
let examService;
let labService;

let originalFetch;
let savedEnv;

const isAiEnvKey = (key) =>
  /^(GEMINI_API_KEY(_\d+)?|GROQ_API_KEY(_\d+)?|GEMINI_MODEL|GROQ_MODEL|GROQ_VISION_MODEL|AI_PRIMARY_PROVIDER)$/.test(
    key
  );

const clearAiEnv = () => {
  for (const key of Object.keys(process.env)) {
    if (isAiEnvKey(key)) delete process.env[key];
  }
};

beforeAll(async () => {
  originalFetch = global.fetch;
  savedEnv = {};
  for (const key of Object.keys(process.env)) {
    if (isAiEnvKey(key)) {
      savedEnv[key] = process.env[key];
    }
  }

  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  const passwordHash = await bcrypt.hash('Password123', 10);

  [owner1, owner2, vet, groomer, receptionist, admin] = await User.create([
    { code: 'USR-AI0001', fullName: 'Chủ nuôi AI 1', phone: '0955111001', email: 'aiowner1@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-AI0002', fullName: 'Chủ nuôi AI 2', phone: '0955111002', email: 'aiowner2@test.vn', passwordHash, role: 'PetOwner', status: 'Active' },
    { code: 'USR-AI0003', fullName: 'BS Thú Y AI', phone: '0955111003', email: 'aivet@test.vn', passwordHash, role: 'Veterinarian', status: 'Active' },
    { code: 'USR-AI0004', fullName: 'Groomer AI', phone: '0955111004', email: 'aigroom@test.vn', passwordHash, role: 'Groomer', status: 'Active' },
    { code: 'USR-AI0005', fullName: 'Lễ tân AI', phone: '0955111005', email: 'airecep@test.vn', passwordHash, role: 'Receptionist', status: 'Active' },
    { code: 'USR-AI0006', fullName: 'Admin AI', phone: '0955111006', email: 'aiadmin@test.vn', passwordHash, role: 'Admin', status: 'Active' },
  ]);

  owner1Token = signToken(owner1);
  owner2Token = signToken(owner2);
  vetToken = signToken(vet);
  groomerToken = signToken(groomer);
  receptionistToken = signToken(receptionist);
  adminToken = signToken(admin);

  [pet1, pet2, deletedPet] = await Pet.create([
    {
      code: 'PET-AI0001',
      ownerId: owner1._id,
      name: 'Milo',
      species: 'Dog',
      breed: 'Poodle',
      coatColor: 'Brown',
      dob: new Date('2024-05-01T00:00:00.000Z'),
      weight: 5.5,
      notes: 'Dị ứng thịt gà và hải sản',
      status: 'Active',
    },
    {
      code: 'PET-AI0002',
      ownerId: owner2._id,
      name: 'Miu',
      species: 'Cat',
      breed: 'ALN',
      weight: 3.4,
      status: 'Active',
    },
    {
      code: 'PET-AI0003',
      ownerId: owner1._id,
      name: 'OldPet',
      species: 'Dog',
      weight: 4.0,
      status: 'Deleted',
    },
  ]);

  [examService, labService] = await Service.create([
    {
      code: 'SRV-AI0001',
      name: 'Khám tổng quát lâm sàng',
      category: 'Examination',
      defaultDuration: 30,
      basePrice: 150000,
      status: 'Active',
      description: 'Khám sinh hiệu và chẩn đoán ban đầu',
    },
    {
      code: 'SRV-AI0002',
      name: 'Xét nghiệm công thức máu',
      category: 'Paraclinical',
      defaultDuration: 20,
      basePrice: 200000,
      status: 'Active',
      description: 'Đánh giá chỉ số bạch cầu, hồng cầu',
    },
  ]);

  const wardCage = await Cage.create({
    label: 'AI-W01',
    size: 'M',
    maxWeightKg: 15,
    zone: 'InpatientWard',
    isIsolated: false,
    status: 'Available',
  });

  // Dữ liệu bệnh án SOAP cũ + Sub-task + Nội trú của pet1 để kiểm tra AI nhận đủ ngữ cảnh non-Admin
  const pastOrder = await AppointmentOrder.create({
    code: 'APT-AI0001',
    petId: pet1._id,
    ownerId: owner1._id,
    date: '2026-11-10',
    isOnline: true,
    derivedStatus: 'Done',
  });

  const pastApptSvc = await AppointmentService.create({
    orderId: pastOrder._id,
    serviceId: examService._id,
    sequenceNo: 1,
    assignedStaffId: vet._id,
    status: 'Done',
    groomingNote: {
      beforeNote: 'Da bụng hơi đỏ',
      afterNote: 'Đã vệ sinh sạch sẽ',
      recommendations: 'Theo dõi kích ứng da',
    },
  });

  await MedicalRecord.create({
    appointmentServiceId: pastApptSvc._id,
    petId: pet1._id,
    subjectiveNote: 'Bé nôn nhẹ sau ăn thức ăn lạ',
    objectiveNote: 'Nhiệt độ 38.7°C, cân nặng 5.5kg',
    assessment: 'Viêm dạ dày ruột nhẹ do dị ứng thức ăn',
    plan: 'Kiêng thịt gà, ăn cháo loãng 3 ngày',
    status: 'Finalized',
  });

  await SubtaskRequest.create({
    appointmentServiceId: pastApptSvc._id,
    serviceId: labService._id,
    requestedById: vet._id,
    assignedStaffId: vet._id,
    taskType: 'Xét nghiệm máu',
    instructions: 'Kiểm tra chỉ số viêm',
    resultText: 'Bạch cầu tăng nhẹ',
    status: 'Completed',
    completedAt: new Date('2026-11-10T10:00:00.000Z'),
  });

  await InpatientRecord.create({
    petId: pet1._id,
    orderId: pastOrder._id,
    attendingVetId: vet._id,
    cageId: wardCage._id,
    initialDiagnosis: 'Theo dõi mất nước nhẹ',
    treatmentPlan: 'Truyền dịch điện giải',
    status: 'Discharged',
    dischargedAt: new Date('2026-11-11T10:00:00.000Z'),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  clearAiEnv();
  process.env.GEMINI_API_KEY_1 = 'test-gemini-key-1';
  process.env.GROQ_API_KEY_1 = 'test-groq-key-1';

  let uploadCounter = 0;
  mockUploadStream.mockImplementation((options, callback) => ({
    end: () => {
      uploadCounter += 1;
      callback(null, {
        secure_url: `https://res.cloudinary.com/demo/image/upload/v1/vcmos/ai-assessments/photo-${uploadCounter}.png`,
      });
    },
  }));
});

afterAll(async () => {
  global.fetch = originalFetch;
  clearAiEnv();
  for (const [key, val] of Object.entries(savedEnv)) {
    process.env[key] = val;
  }
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Unit Test — Chuẩn hóa JSON & Cơ chế luân chuyển AI (T-50)', () => {
  test('1. parseAndNormalizeAiJson bóc JSON trong khối markdown ```json```, chuẩn hóa urgency và map đúng dịch vụ thật của phòng khám', () => {
    const rawMarkdown = [
      'Dưới đây là kết quả phân tích:',
      '```json',
      JSON.stringify({
        urgency: 'urgent',
        recommendedTimeframe: 'Đưa đi cấp cứu trong 1 giờ tới',
        summary: 'Có dấu hiệu cảnh báo tiêu hóa cấp tính trên nền tiền sử viêm dạ dày.',
        redFlags: ['Nôn liên tục kèm suy kiệt'],
        visualFindings: ['Vùng bụng hơi căng'],
        possibleCauses: ['Viêm dạ dày ruột xuất huyết', 'Dị vật đường tiêu hóa'],
        advice: ['Giữ ấm cho bé và đưa đến phòng khám ngay'],
        contraindications: ['Tuyệt đối không tự cho uống thuốc giảm đau của người'],
        recommendedServices: [
          { code: 'SRV-AI0001', reason: 'Cần bác sĩ khám sinh hiệu ngay' },
          { code: 'SRV-FAKE99', reason: 'Dịch vụ không tồn tại phải bị loại bỏ' },
        ],
      }),
      '```',
    ].join('\n');

    const result = parseAndNormalizeAiJson(rawMarkdown, {
      activeServices: [examService.toObject(), labService.toObject()],
      petSnapshot: { name: 'Milo' },
      symptoms: ['vomiting', 'Chảy dãi nhiều'],
      description: 'Bé nôn 4 lần từ sáng và rất mệt',
    });

    expect(result.urgency).toBe('Urgent');
    expect(result.disclaimer).toBe(AI_DISCLAIMER);
    expect(result.recommendedServices).toHaveLength(1);
    expect(result.recommendedServices[0].code).toBe('SRV-AI0001');
    expect(result.recommendedServices[0].name).toBe('Khám tổng quát lâm sàng');
    expect(result.recommendedServices[0].basePrice).toBe(150000);
    expect(result.bookingNoteDraft).toContain('Mức độ: Urgent');
    expect(result.bookingNoteDraft).toContain('Chảy dãi nhiều');
  });

  test('2. analyzePetHealthWithAi tự động xoay vòng nhiều key đánh số GEMINI_API_KEY_1 -> GEMINI_API_KEY_2 -> GROQ_API_KEY_1 khi gặp 429', async () => {
    process.env.GEMINI_API_KEY_1 = 'test-gemini-key-1';
    process.env.GEMINI_API_KEY_2 = 'test-gemini-key-2';
    process.env.GROQ_API_KEY_1 = 'test-groq-key-1';

    expect(collectProviderApiKeys('GEMINI_API_KEY')).toEqual([
      'test-gemini-key-1',
      'test-gemini-key-2',
    ]);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Key 1 quota exhausted' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Key 2 quota exhausted' } }),
      })
      .mockResolvedValueOnce(
        buildGroqFetchResponse({
          urgency: 'Monitor',
          summary: 'Cần theo dõi thêm trong 24 giờ.',
          possibleCauses: ['Rối loạn tiêu hóa nhẹ'],
          advice: ['Cho uống nước từng ít một'],
          contraindications: ['Không tự ý dùng thuốc người'],
          recommendedServices: [{ code: 'SRV-AI0001', reason: 'Khám kiểm tra tổng quát' }],
        })
      );

    const result = await analyzePetHealthWithAi({
      petSnapshot: { code: 'PET-AI0001', name: 'Milo', species: 'Dog' },
      symptoms: ['vomiting'],
      description: 'Bé nôn 1 lần sáng nay, vẫn tỉnh táo',
      clinicContext: { activeServices: [examService.toObject()] },
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[0][0]).toContain('key=test-gemini-key-1');
    expect(global.fetch.mock.calls[1][0]).toContain('key=test-gemini-key-2');
    expect(global.fetch.mock.calls[2][0]).toContain('api.groq.com/openai/v1/chat/completions');
    expect(result.aiProvider).toBe('groq');
    expect(result.aiModel).toBe('openai/gpt-oss-120b');
    expect(result.urgency).toBe('Monitor');
    expect(result.disclaimer).toBe(AI_DISCLAIMER);
  });

  test('3. analyzePetHealthWithAi xử lý timeout trả lỗi 504 kèm MSG34 khi tất cả cổng AI quá hạn', async () => {
    global.fetch = jest.fn().mockImplementation((url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      });
    });

    await expect(
      analyzePetHealthWithAi({
        petSnapshot: { code: 'PET-AI0001', name: 'Milo' },
        description: 'Bé ho khan liên tục từ tối hôm qua',
        timeoutMs: 60,
      })
    ).rejects.toMatchObject({
      statusCode: 504,
      message: AI_BUSY_MESSAGE,
    });
  });
});

describe('API /api/ai-assessments — Integration, BR-20 & RBAC', () => {
  let createdAssessmentId;

  test('4. Từ chối 401 khi chưa đăng nhập và 403 khi nhân sự / Admin gọi POST', async () => {
    const noAuth = await request(app).post('/api/ai-assessments').send({
      petId: String(pet1._id),
      description: 'Bé bỏ ăn từ sáng nay và nằm một chỗ',
    });
    expect(noAuth.status).toBe(401);

    for (const token of [vetToken, groomerToken, receptionistToken, adminToken]) {
      const res = await request(app)
        .post('/api/ai-assessments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          petId: String(pet1._id),
          description: 'Bé bỏ ăn từ sáng nay và nằm một chỗ',
        });
      expect(res.status).toBe(403);
    }
  });

  test('5. Validate 400: sai petId, mô tả < 10 ký tự, file giả mạo ảnh (MSG35) và vượt quá 3 ảnh', async () => {
    const badBody = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({ petId: 'invalid-id', description: 'Quá ngắn' });
    expect(badBody.status).toBe(400);
    expect(badBody.body.errors.petId).toBeDefined();
    expect(badBody.body.errors.description).toBeDefined();

    // File giả mạo mimetype image/png nhưng nội dung là text thuần -> bị chặn bởi kiểm tra magic bytes (MSG35)
    const fakeImage = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('petId', String(pet1._id))
      .field('description', 'Bé bị nổi mẩn đỏ ở vùng tai phải')
      .attach('photos', Buffer.from('not-a-real-image'), {
        filename: 'fake.png',
        contentType: 'image/png',
      });
    expect(fakeImage.status).toBe(400);
    expect(fakeImage.body.errors.photos).toBeDefined();

    // Tải lên 4 ảnh (> tối đa 3 ảnh) -> trả 400
    const tooManyPhotos = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('petId', String(pet1._id))
      .field('description', 'Bé bị trầy xước ở chân trước bên trái')
      .attach('photos', SAMPLE_PNG_BUFFER, { filename: 'p1.png', contentType: 'image/png' })
      .attach('photos', SAMPLE_PNG_BUFFER, { filename: 'p2.png', contentType: 'image/png' })
      .attach('photos', SAMPLE_JPEG_BUFFER, { filename: 'p3.jpg', contentType: 'image/jpeg' })
      .attach('photos', SAMPLE_JPEG_BUFFER, { filename: 'p4.jpg', contentType: 'image/jpeg' });
    expect(tooManyPhotos.status).toBe(400);
  });

  test('6. Chặn PetOwner gửi đánh giá cho thú cưng của người khác (403) hoặc thú cưng đã xóa (404)', async () => {
    const otherPet = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        petId: String(pet2._id),
        description: 'Thử gửi đánh giá cho thú cưng của người khác',
      });
    expect(otherPet.status).toBe(403);

    const deletedRes = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        petId: String(deletedPet._id),
        description: 'Thử gửi đánh giá cho thú cưng đã xóa mềm',
      });
    expect(deletedRes.status).toBe(404);
  });

  test('7. POST /api/ai-assessments thành công với Gemini (2 ảnh JPG/PNG + triệu chứng tự viết), truyền đủ ngữ cảnh SOAP và KHÔNG ghi đè MedicalRecord (BR-20)', async () => {
    const medicalRecordsBefore = await MedicalRecord.countDocuments({ petId: pet1._id });

    global.fetch = jest.fn().mockResolvedValueOnce(
      buildGeminiFetchResponse({
        urgency: 'Monitor',
        recommendedTimeframe: 'Đưa bé đi khám trong vòng 24 giờ',
        summary: 'Bé Milo có dấu hiệu tái phát kích ứng tiêu hóa trên nền dị ứng thức ăn cũ.',
        redFlags: ['Nôn ra máu hoặc tiêu chảy phân đen', 'Suy kiệt, niêm mạc nhợt nhạt'],
        visualFindings: ['Quan sát thấy vùng da quanh miệng hơi ửng đỏ từ ảnh đính kèm'],
        possibleCauses: ['Tái phát viêm dạ dày ruột do dị ứng thực phẩm', 'Rối loạn tiêu hóa cấp'],
        advice: ['Ngưng toàn bộ thức ăn mới, chỉ cho uống nước sạch lượng nhỏ', 'Theo dõi tần suất nôn'],
        contraindications: ['Không tự ý cho uống thuốc chống nôn hoặc giảm đau của người'],
        recommendedServices: [
          { code: 'SRV-AI0001', reason: 'Kiểm tra sinh hiệu và vùng bụng' },
          { code: 'SRV-AI0002', reason: 'Kiểm tra lại chỉ số bạch cầu sau lần khám trước' },
        ],
      })
    );

    const res = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('petId', String(pet1._id))
      .field('symptoms', JSON.stringify(['vomiting', 'Chảy nước dãi nhiều']))
      .field('description', 'Bé Milo sáng nay lỡ ăn vụng thịt gà nên bị nôn 2 lần và chảy nước dãi')
      .attach('photos', SAMPLE_PNG_BUFFER, { filename: 'lesion1.png', contentType: 'image/png' })
      .attach('photos', SAMPLE_JPEG_BUFFER, { filename: 'lesion2.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.assessment).toBeDefined();

    const assessment = res.body.assessment;
    createdAssessmentId = assessment._id;

    expect(assessment.urgency).toBe('Monitor');
    expect(assessment.disclaimer).toBe(AI_DISCLAIMER);
    expect(assessment.aiProvider).toBe('gemini');
    expect(assessment.symptoms).toEqual(['vomiting', 'Chảy nước dãi nhiều']);
    expect(assessment.imageUrls).toHaveLength(2);
    expect(assessment.recommendedServices).toHaveLength(2);
    expect(assessment.clinicalContextSummary.recentMedicalRecordsCount).toBe(1);
    expect(assessment.clinicalContextSummary.lastDiagnosis).toBe(
      'Viêm dạ dày ruột nhẹ do dị ứng thức ăn'
    );

    // Xác nhận prompt gửi sang Gemini có nhúng dữ liệu hồ sơ SOAP, dị ứng, cận lâm sàng và 2 ảnh inlineData
    const fetchBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    const promptText = fetchBody.contents[0].parts[0].text;
    expect(promptText).toContain('Dị ứng thịt gà và hải sản');
    expect(promptText).toContain('Viêm dạ dày ruột nhẹ do dị ứng thức ăn');
    expect(promptText).toContain('Bạch cầu tăng nhẹ');
    expect(promptText).toContain('SRV-AI0001');
    expect(fetchBody.contents[0].parts).toHaveLength(3); // 1 text + 2 ảnh base64

    // BR-20: Đảm bảo bảng MedicalRecord hoàn toàn không bị thay đổi hay thêm mới
    const medicalRecordsAfter = await MedicalRecord.countDocuments({ petId: pet1._id });
    expect(medicalRecordsAfter).toBe(medicalRecordsBefore);
  });

  test('8. POST /api/ai-assessments không cần ảnh (0 ảnh, JSON thuần) và tự động failover Gemini -> Groq', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Quota exceeded' } }),
      })
      .mockResolvedValueOnce(
        buildGroqFetchResponse({
          urgency: 'Routine',
          summary: 'Biểu hiện nhẹ, bé vẫn ăn uống bình thường.',
          redFlags: ['Khó thở hoặc bỏ ăn hoàn toàn'],
          visualFindings: [],
          possibleCauses: ['Thay đổi thời tiết nhẹ'],
          advice: ['Giữ ấm và theo dõi thêm 1–2 ngày'],
          contraindications: ['Không tự ý cho uống thuốc cảm cúm của người'],
          recommendedServices: [{ code: 'SRV-AI0001', reason: 'Khám định kỳ nếu không giảm' }],
        })
      );

    const res = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        petId: String(pet1._id),
        symptoms: 'coughing, Hắt hơi nhẹ buổi sáng',
        description: 'Bé thỉnh thoảng hắt hơi nhẹ vào sáng sớm nhưng vẫn ăn chơi bình thường',
      });

    expect(res.status).toBe(201);
    expect(res.body.assessment.aiProvider).toBe('groq');
    expect(res.body.assessment.urgency).toBe('Routine');
    expect(res.body.assessment.imageUrls).toEqual([]);
    expect(res.body.assessment.symptoms).toEqual(['coughing', 'Hắt hơi nhẹ buổi sáng']);
    expect(mockUploadStream).not.toHaveBeenCalled();
  });

  test('9. Khi cả Gemini và Groq đều lỗi -> trả 503 kèm MSG34, KHÔNG upload Cloudinary và KHÔNG lưu DB', async () => {
    const countBefore = await AiAssessment.countDocuments();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Gemini unavailable' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'Groq internal error' } }),
      });

    const res = await request(app)
      .post('/api/ai-assessments')
      .set('Authorization', `Bearer ${owner1Token}`)
      .field('petId', String(pet1._id))
      .field('description', 'Bé bị sưng nhẹ ở bàn chân sau bên phải')
      .attach('photos', SAMPLE_PNG_BUFFER, { filename: 'paw.png', contentType: 'image/png' });

    expect(res.status).toBe(503);
    expect(res.body.message).toBe(AI_BUSY_MESSAGE);
    expect(mockUploadStream).not.toHaveBeenCalled();

    const countAfter = await AiAssessment.countDocuments();
    expect(countAfter).toBe(countBefore);
  });

  test('10. Phân quyền GET /api/ai-assessments & /:id — Chỉ PetOwner sở hữu thú cưng được xem, chặn mọi role khác (403)', async () => {
    // Owner1 xem danh sách của pet1 -> 2 bản ghi (mới nhất lên đầu)
    const owner1List = await request(app)
      .get('/api/ai-assessments')
      .query({ petId: String(pet1._id) })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(owner1List.status).toBe(200);
    expect(owner1List.body.items).toHaveLength(2);
    expect(owner1List.body.items[0].urgency).toBe('Routine');
    expect(owner1List.body.items[1].urgency).toBe('Monitor');

    // Owner1 xem chi tiết bản ghi của mình
    const owner1Detail = await request(app)
      .get(`/api/ai-assessments/${createdAssessmentId}`)
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(owner1Detail.status).toBe(200);
    expect(owner1Detail.body.assessment._id).toBe(createdAssessmentId);

    // Lọc theo urgency
    const monitorOnly = await request(app)
      .get('/api/ai-assessments')
      .query({ petId: String(pet1._id), urgency: 'Monitor' })
      .set('Authorization', `Bearer ${owner1Token}`);
    expect(monitorOnly.status).toBe(200);
    expect(monitorOnly.body.items).toHaveLength(1);

    // Owner2 bị chặn 403 khi xem lịch sử hoặc chi tiết của pet1
    const owner2List = await request(app)
      .get('/api/ai-assessments')
      .query({ petId: String(pet1._id) })
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(owner2List.status).toBe(403);

    const owner2Detail = await request(app)
      .get(`/api/ai-assessments/${createdAssessmentId}`)
      .set('Authorization', `Bearer ${owner2Token}`);
    expect(owner2Detail.status).toBe(403);

    // Mọi role khác (Receptionist, Veterinarian, Groomer, Admin) đều bị chặn 403 trên cả GET danh sách và GET chi tiết
    for (const token of [receptionistToken, vetToken, groomerToken, adminToken]) {
      const listRes = await request(app)
        .get('/api/ai-assessments')
        .query({ petId: String(pet1._id) })
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(403);

      const detailRes = await request(app)
        .get(`/api/ai-assessments/${createdAssessmentId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detailRes.status).toBe(403);
    }
  });

  test('11. Tích hợp Pet Timeline: Chỉ PetOwner sở hữu thấy aiAssessments, tất cả role khác nhận mảng rỗng', async () => {
    const [ownerTimeline, vetTimeline, groomerTimeline, recepTimeline, adminTimeline] =
      await Promise.all([
        request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${owner1Token}`),
        request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${vetToken}`),
        request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${groomerToken}`),
        request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${receptionistToken}`),
        request(app).get(`/api/pets/${pet1._id}/timeline`).set('Authorization', `Bearer ${adminToken}`),
      ]);

    expect(ownerTimeline.status).toBe(200);
    expect(ownerTimeline.body.aiAssessments).toHaveLength(2);

    for (const staffRes of [vetTimeline, groomerTimeline, recepTimeline, adminTimeline]) {
      expect(staffRes.status).toBe(200);
      expect(staffRes.body.aiAssessments).toEqual([]);
    }
  });
});
