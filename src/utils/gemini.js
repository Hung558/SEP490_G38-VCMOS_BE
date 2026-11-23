const AI_DISCLAIMER =
  'Kết quả AI chỉ mang tính tham khảo và không thay thế chẩn đoán của bác sĩ thú y.'; // MSG33
const AI_BUSY_MESSAGE = 'Dịch vụ AI đang bận. Vui lòng thử lại sau.'; // MSG34
const AI_TIMEOUT_MS = 30000;

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

const VALID_URGENCIES = ['Routine', 'Monitor', 'Urgent'];

const SYMPTOM_LABELS_VI = {
  lethargy: 'Ủ rũ / Mệt mỏi (Lethargy)',
  vomiting: 'Nôn mửa (Vomiting)',
  diarrhoea: 'Tiêu chảy (Diarrhoea)',
  loss_of_appetite: 'Chán ăn / Bỏ ăn (Loss of appetite)',
  scratching: 'Gãi nhiều / Ngứa da (Scratching)',
  coughing: 'Ho / Khò khè (Coughing)',
  limping: 'Đi khập khiễng (Limping)',
};

const DEFAULT_TIMEFRAME_BY_URGENCY = {
  Urgent: 'Đưa thú cưng đến phòng khám thú y cấp cứu ngay lập tức (trong vòng 1–2 giờ tới)',
  Monitor: 'Theo dõi sát các dấu hiệu sinh tồn và đặt lịch khám chuyên khoa trong vòng 24–48 giờ',
  Routine: 'Tiếp tục theo dõi tại nhà và đặt lịch kiểm tra sức khỏe định kỳ nếu triệu chứng kéo dài',
};

const createAiError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Tách chuỗi khóa API ngăn cách bởi dấu phẩy trong biến môi trường để hỗ trợ xoay vòng nhiều key.
 */
const parseApiKeys = (rawEnv) => {
  if (!rawEnv || typeof rawEnv !== 'string') return [];
  return rawEnv
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * Gom toàn bộ API key của một nhà cung cấp từ cả 2 kiểu khai báo trong .env:
 * - Kiểu gộp: GEMINI_API_KEY=key1,key2
 * - Kiểu đánh số: GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3... (sắp xếp theo thứ tự số)
 */
const collectProviderApiKeys = (baseEnvName, envObj = process.env) => {
  const keys = [];
  const seen = new Set();

  const addKeys = (rawValue) => {
    for (const key of parseApiKeys(rawValue)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  };

  addKeys(envObj[baseEnvName]);

  const numberedPattern = new RegExp(`^${baseEnvName}_(\\d+)$`);
  const numberedEntries = Object.keys(envObj)
    .map((envKey) => {
      const match = envKey.match(numberedPattern);
      return match ? { envKey, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);

  for (const entry of numberedEntries) {
    addKeys(envObj[entry.envKey]);
  }

  return keys;
};

const formatSymptomForPrompt = (symptom) => SYMPTOM_LABELS_VI[symptom] || symptom;

const toCleanStringList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const normalizeUrgency = (rawUrgency) => {
  if (typeof rawUrgency !== 'string') return 'Monitor';
  const normalized = rawUrgency.trim().toLowerCase();

  if (['urgent', 'red', 'emergency', 'critical', 'high', 'khẩn cấp'].includes(normalized)) {
    return 'Urgent';
  }
  if (['monitor', 'yellow', 'moderate', 'medium', 'cần theo dõi'].includes(normalized)) {
    return 'Monitor';
  }
  if (['routine', 'green', 'low', 'normal', 'thông thường'].includes(normalized)) {
    return 'Routine';
  }

  for (const valid of VALID_URGENCIES) {
    if (valid.toLowerCase() === normalized) return valid;
  }
  return 'Monitor';
};

/**
 * Dựng System Instruction + User Prompt theo chuẩn AAHA / AVMA Veterinary Teletriage Guidelines,
 * nhúng đầy đủ hồ sơ thú cưng, tiền sử SOAP/nội trú/cận lâm sàng và dịch vụ thật của phòng khám VCMOS.
 */
const buildVeterinaryTriagePrompt = ({
  petSnapshot = {},
  symptoms = [],
  description = '',
  clinicContext = {},
  hasImages = false,
}) => {
  const systemInstruction = [
    'Bạn là Trợ lý Sàng lọc Sức khỏe Thú y Tham khảo (Veterinary Teletriage Assistant) của Phòng khám Thú y VCMOS.',
    'Nhiệm vụ của bạn tuân thủ nghiêm ngặt Hướng dẫn Teletriage Lâm sàng Quốc tế của AAHA (American Animal Hospital Association) và AVMA (American Veterinary Medical Association):',
    '1. KHÔNG BAO GIỜ đưa ra chẩn đoán khẳng định thay thế bác sĩ thú y, và KHÔNG BAO GIỜ kê đơn thuốc bán theo toa hoặc liều lượng thuốc cụ thể (BR-20).',
    '2. Phân tầng mức độ khẩn cấp chính xác thành 1 trong 3 giá trị: "Urgent", "Monitor", hoặc "Routine":',
    '   - "Urgent" (Red / Cấp cứu ngay): Có dấu hiệu đe dọa tính mạng (AAHA Red Flags) như khó thở, thở há miệng ở mèo, tím tái niêm mạc, co giật liên tiếp, sụp đổ/bất tỉnh, chướng bụng cấp kèm nôn khan (nghi xoắn dạ dày GDV), bí tiểu ở mèo đực, xuất huyết ồ ạt, nghi ngờ trúng độc (sô-cô-la, nho, xylitol, paracetamol, thuốc diệt chuột...), chấn thương nặng, hoặc đẻ khó.',
    '   - "Monitor" (Yellow / Khám sớm trong 24–48 giờ): Triệu chứng thực thể rõ nhưng chưa sốc (nôn hoặc tiêu chảy lặp lại chưa có máu ồ ạt, bỏ ăn > 24 giờ, mệt mỏi/sốt, ho kéo dài, đi khập khiễng, viêm da/lở loét khu trú, hoặc thú cưng đang có bệnh nền/vừa xuất viện).',
    '   - "Routine" (Green / Thông thường): Biểu hiện nhẹ, thú cưng vẫn tỉnh táo ăn uống được, hoặc vấn đề chăm sóc/vệ sinh/dự phòng định kỳ.',
    '3. Kiểm tra kỹ dị ứng và tiền sử bệnh án (SOAP, thuốc từng dùng, nội trú, cận lâm sàng) được cung cấp để cảnh báo phù hợp.',
    '4. Luôn cung cấp phần "contraindications": những điều chủ nuôi TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM tại nhà để tránh gây hại thêm cho thú cưng (ví dụ: không tự cho uống Paracetamol/Ibuprofen của người, không ép ăn/uống khi đang nôn cấp).',
    '5. Khi gợi ý dịch vụ của phòng khám ("recommendedServiceCodes"), CHỈ ĐƯỢC chọn mã "code" từ danh sách dịch vụ Active có thật do hệ thống VCMOS cung cấp bên dưới.',
    '6. Trả về DUY NHẤT một JSON object hợp lệ bằng tiếng Việt (không kèm giải thích ngoài JSON) theo cấu trúc:',
    '{',
    '  "urgency": "Urgent" | "Monitor" | "Routine",',
    '  "recommendedTimeframe": "Chuỗi ngắn nêu rõ khung giờ nên đưa đi khám",',
    '  "summary": "Tóm tắt nhận định sàng lọc ban đầu 1-3 câu bằng tiếng Việt rõ ràng",',
    '  "redFlags": ["Danh sách các dấu hiệu cảnh báo nguy hiểm phát hiện được hoặc cần theo dõi sát ngay"],',
    '  "visualFindings": ["Mô tả khách quan những gì thấy trong ảnh chụp; để mảng rỗng [] nếu không có ảnh"],',
    '  "possibleCauses": ["2-4 nguyên nhân khả nghi mang tính tham khảo (không khẳng định chắc chắn)"],',
    '  "advice": ["2-4 hướng dẫn chăm sóc sơ bộ an toàn tại nhà trong lúc chờ khám"],',
    '  "contraindications": ["1-3 điều tuyệt đối KHÔNG làm tại nhà"],',
    '  "recommendedServices": [{ "code": "MÃ_DỊCH_VỤ_VCMOS", "reason": "Lý do nên thực hiện dịch vụ này" }]',
    '}',
  ].join('\n');

  const petLines = [
    `- Tên thú cưng: ${petSnapshot.name || 'Không rõ'} (${petSnapshot.code || '—'})`,
    `- Loài / Giống: ${petSnapshot.species || 'Chưa cập nhật'}${petSnapshot.breed ? ` / ${petSnapshot.breed}` : ''}`,
    `- Tuổi: ${petSnapshot.ageText || 'Chưa cập nhật'}`,
    `- Cân nặng: ${petSnapshot.weight != null ? `${petSnapshot.weight} kg` : 'Chưa cập nhật'}`,
    `- Lưu ý / Dị ứng ghi nhận trên hồ sơ: ${petSnapshot.notes || 'Không ghi nhận'}`,
  ];

  const medicalLines = (clinicContext.medicalRecords || []).map((rec) => {
    const meds = (rec.prescriptions || [])
      .map((p) => `${p.productNameSnapshot || 'Thuốc'} (${p.dosage || ''})`)
      .join(', ');
    return `- Ngày ${rec.date || '—'}: S="${rec.subjectiveNote || ''}" | O="${rec.objectiveNote || ''}" | Chẩn đoán(A)="${rec.assessment || ''}" | Hướng điều trị(P)="${rec.plan || ''}"${meds ? ` | Đơn cũ: ${meds}` : ''}`;
  });

  const subtaskLines = (clinicContext.subtasks || []).map(
    (sub) => `- [${sub.taskType || 'Cận lâm sàng'}] ${sub.resultText || 'Đã hoàn thành'}`
  );

  const groomingLines = (clinicContext.groomingNotes || []).map(
    (note) => `- Spa ngày ${note.date || '—'}: Trước="${note.beforeNote || ''}" | Sau="${note.afterNote || ''}" | Khuyến nghị="${note.recommendations || ''}"`
  );

  const inpatientLines = (clinicContext.inpatientRecords || []).map((inp) => {
    const latestLogs = (inp.dailyLogs || [])
      .slice(0, 3)
      .map((log) => `${log.date}: ${log.observations || ''} (${log.notes || ''})`)
      .join(' ; ');
    return `- Trạng thái: ${inp.status} | Chẩn đoán ban đầu: ${inp.initialDiagnosis || '—'} | Phác đồ: ${inp.treatmentPlan || '—'}${latestLogs ? ` | Nhật ký gần nhất: ${latestLogs}` : ''}`;
  });

  const activeServiceLines = (clinicContext.activeServices || []).map(
    (svc) =>
      `- [${svc.code}] ${svc.name} (Nhóm: ${svc.category}, Giá tham khảo: ${svc.basePrice ?? 0} VND${svc.description ? `, Mô tả: ${svc.description}` : ''})`
  );

  const formattedSymptoms = symptoms.length > 0
    ? symptoms.map(formatSymptomForPrompt).join(', ')
    : 'Không chọn thẻ triệu chứng sẵn';

  const capacityLine = clinicContext.capacitySummary
    ? `Chuồng chờ trống: ${clinicContext.capacitySummary.availableHoldingCages}, Chuồng nội trú trống: ${clinicContext.capacitySummary.availableInpatientCages}, Chuồng cách ly trống: ${clinicContext.capacitySummary.availableIsolatedCages}, Bác sĩ thú y đang hoạt động: ${clinicContext.capacitySummary.activeVetsCount}`
    : 'Không có thông tin công suất';

  const userPrompt = [
    '=== THÔNG TIN BỆNH NHÂN THÚ CƯNG ===',
    ...petLines,
    '',
    '=== TRIỆU CHỨNG CHỦ NUÔI BÁO CÁO HIỆN TẠI ===',
    `- Triệu chứng đánh dấu / tự nhập: ${formattedSymptoms}`,
    `- Mô tả chi tiết từ chủ nuôi: ${description}`,
    `- Hình ảnh đính kèm: ${hasImages ? 'Có ảnh chụp đính kèm để quan sát trực quan' : 'Không có ảnh đính kèm (để visualFindings = [])'}`,
    '',
    '=== TIỀN SỬ Y TẾ TỪ HỒ SƠ PHÒNG KHÁM VCMOS ===',
    medicalLines.length > 0 ? medicalLines.join('\n') : '- Chưa có bệnh án SOAP trước đây.',
    subtaskLines.length > 0 ? `Kết quả cận lâm sàng gần đây:\n${subtaskLines.join('\n')}` : '',
    groomingLines.length > 0 ? `Ghi chú da/lông từ Grooming gần đây:\n${groomingLines.join('\n')}` : '',
    inpatientLines.length > 0 ? `Lịch sử điều trị nội trú:\n${inpatientLines.join('\n')}` : '',
    '',
    '=== NĂNG LỰC & DANH MỤC DỊCH VỤ PHÒNG KHÁM VCMOS (ĐANG ACTIVE) ===',
    `- Tình trạng tiếp nhận: ${capacityLine}`,
    activeServiceLines.length > 0 ? activeServiceLines.join('\n') : '- Hiện chưa có dịch vụ Active trong danh mục.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { systemInstruction, userPrompt };
};

/**
 * Bóc tách JSON từ chuỗi phản hồi của LLM (chấp nhận cả JSON trần lẫn block ```json ... ```).
 */
const extractJsonObject = (rawText) => {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Phản hồi từ AI trống');
  }

  let cleaned = rawText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Thử cắt từ dấu '{' đầu tiên đến dấu '}' cuối cùng nếu AI lỡ kèm câu dẫn
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(sliced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }

  throw new Error('Không thể phân tích JSON từ phản hồi của AI');
};

/**
 * Chuẩn hóa kết quả JSON từ AI thành format lâm sàng đồng nhất, đối chiếu dịch vụ thật của phòng khám
 * và luôn gắn câu miễn trừ trách nhiệm MSG33 theo BR-20.
 */
const parseAndNormalizeAiJson = (
  rawText,
  { activeServices = [], petSnapshot = {}, symptoms = [], description = '' } = {}
) => {
  const parsed = extractJsonObject(rawText);

  const urgency = normalizeUrgency(parsed.urgency);
  const recommendedTimeframe =
    typeof parsed.recommendedTimeframe === 'string' && parsed.recommendedTimeframe.trim()
      ? parsed.recommendedTimeframe.trim()
      : DEFAULT_TIMEFRAME_BY_URGENCY[urgency];

  const petDisplayName = petSnapshot.name || 'thú cưng';
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : `Kết quả sàng lọc sơ bộ cho bé ${petDisplayName}: mức độ ưu tiên ${urgency}. Vui lòng theo dõi và tham khảo ý kiến bác sĩ thú y.`;

  const redFlags = toCleanStringList(parsed.redFlags);
  const visualFindings = toCleanStringList(parsed.visualFindings);

  let possibleCauses = toCleanStringList(parsed.possibleCauses);
  if (possibleCauses.length === 0) {
    possibleCauses = ['Cần bác sĩ thú y thăm khám trực tiếp để xác định nguyên nhân chính xác.'];
  }

  let advice = toCleanStringList(parsed.advice);
  if (advice.length === 0) {
    advice = [
      'Theo dõi nhịp thở, mức độ tỉnh táo, lượng nước uống và các triệu chứng mới phát sinh.',
      'Chuẩn bị sẵn thông tin triệu chứng và lịch sử ăn uống khi đưa bé đến phòng khám.',
    ];
  }

  let contraindications = toCleanStringList(parsed.contraindications);
  if (contraindications.length === 0) {
    contraindications = [
      'Tuyệt đối không tự ý cho thú cưng uống thuốc của người (như Paracetamol, Ibuprofen) hoặc dùng thuốc cũ khi chưa có chỉ định của bác sĩ thú y.',
    ];
  }

  // Đối chiếu mã/tên dịch vụ gợi ý với danh mục Active thật của phòng khám VCMOS
  const serviceByCode = new Map();
  const serviceByName = new Map();
  for (const svc of activeServices) {
    if (svc.code) serviceByCode.set(String(svc.code).trim().toUpperCase(), svc);
    if (svc.name) serviceByName.set(String(svc.name).trim().toLowerCase(), svc);
  }

  const rawSuggestedServices = Array.isArray(parsed.recommendedServices)
    ? parsed.recommendedServices
    : Array.isArray(parsed.recommendedServiceCodes)
      ? parsed.recommendedServiceCodes.map((code) => ({ code }))
      : [];

  const matchedServices = [];
  const seenServiceIds = new Set();
  for (const item of rawSuggestedServices) {
    const codeKey =
      typeof item === 'string'
        ? item.trim().toUpperCase()
        : typeof item?.code === 'string'
          ? item.code.trim().toUpperCase()
          : '';
    const nameKey =
      typeof item?.name === 'string' ? item.name.trim().toLowerCase() : '';

    const matched = (codeKey && serviceByCode.get(codeKey)) || (nameKey && serviceByName.get(nameKey));
    if (!matched) continue;

    const idStr = String(matched._id);
    if (seenServiceIds.has(idStr)) continue;
    seenServiceIds.add(idStr);

    matchedServices.push({
      serviceId: matched._id,
      code: matched.code,
      name: matched.name,
      category: matched.category || null,
      basePrice: matched.basePrice ?? null,
      reason: typeof item?.reason === 'string' ? item.reason.trim() : '',
    });

    if (matchedServices.length >= 3) break;
  }

  const formattedSymptomsText =
    symptoms.length > 0 ? symptoms.map(formatSymptomForPrompt).join(', ') : 'Không chọn thẻ sẵn';

  // Bản nháp ghi chú đặt lịch để FE copy thẳng sang AppointmentOrder.note (UC-14 Flow 6a)
  const bookingNoteDraft = `[Sàng lọc AI - Mức độ: ${urgency}] Triệu chứng: ${formattedSymptomsText}. Mô tả: ${String(description).trim()} | Ghi chú tham khảo: ${summary}`.slice(
    0,
    500
  );

  return {
    urgency,
    recommendedTimeframe,
    summary,
    redFlags,
    visualFindings,
    possibleCauses,
    advice,
    contraindications,
    recommendedServices: matchedServices,
    bookingNoteDraft,
    disclaimer: AI_DISCLAIMER,
  };
};

const isTimeoutError = (err) => err?.name === 'AbortError' || err?.isTimeout === true;

/**
 * Gọi Google Gemini API (v1beta generateContent), hỗ trợ Multimodal (Text + 0..3 ảnh base64) & timeout.
 */
const callGeminiGenerateContent = async ({
  apiKey,
  model,
  systemInstruction,
  userPrompt,
  files = [],
  timeoutMs = AI_TIMEOUT_MS,
}) => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [{ text: userPrompt }];
  for (const file of files) {
    if (file && Buffer.isBuffer(file.buffer)) {
      parts.push({
        inlineData: {
          mimeType: file.mimetype || 'image/jpeg',
          data: file.buffer.toString('base64'),
        },
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const apiMsg = json?.error?.message || `Gemini HTTP ${response.status}`;
      throw createAiError(apiMsg, response.status);
    }

    const candidateText = json?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();

    if (!candidateText) {
      throw createAiError('Gemini không trả về nội dung phản hồi', 502);
    }

    return candidateText;
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      const timeoutErr = createAiError('Kết nối Google Gemini quá thời gian chờ', 504);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Gọi Groq Chat Completions API (OpenAI-compatible), tự chuyển sang model Vision nếu có ảnh đính kèm.
 */
const callGroqChatCompletion = async ({
  apiKey,
  model,
  systemInstruction,
  userPrompt,
  files = [],
  timeoutMs = AI_TIMEOUT_MS,
}) => {
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  let userContent;
  if (files.length > 0) {
    userContent = [{ type: 'text', text: userPrompt }];
    for (const file of files) {
      if (file && Buffer.isBuffer(file.buffer)) {
        const mime = file.mimetype || 'image/jpeg';
        userContent.push({
          type: 'image_url',
          image_url: {
            url: `data:${mime};base64,${file.buffer.toString('base64')}`,
          },
        });
      }
    }
  } else {
    userContent = userPrompt;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      const apiMsg = json?.error?.message || `Groq HTTP ${response.status}`;
      throw createAiError(apiMsg, response.status);
    }

    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw createAiError('Groq không trả về nội dung phản hồi', 502);
    }

    return content.trim();
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      const timeoutErr = createAiError('Kết nối Groq API quá thời gian chờ', 504);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Xây dựng danh sách lượt gọi AI để xoay vòng nhiều key (cả kiểu gộp lẫn _1.._N) và tự động luân chuyển Gemini <-> Groq.
 */
const buildProviderAttempts = (hasImages) => {
  const geminiKeys = collectProviderApiKeys('GEMINI_API_KEY');
  const groqKeys = collectProviderApiKeys('GROQ_API_KEY');

  const geminiModel = (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  const groqModel = (
    hasImages
      ? process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL
      : process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL
  ).trim();

  const geminiAttempts = geminiKeys.map((apiKey, index) => ({
    provider: 'gemini',
    model: geminiModel,
    apiKey,
    keySlot: index + 1,
  }));

  const groqAttempts = groqKeys.map((apiKey, index) => ({
    provider: 'groq',
    model: groqModel,
    apiKey,
    keySlot: index + 1,
  }));

  const primaryProvider = String(process.env.AI_PRIMARY_PROVIDER || 'gemini').trim().toLowerCase();
  if (primaryProvider === 'groq') {
    return [...groqAttempts, ...geminiAttempts];
  }
  return [...geminiAttempts, ...groqAttempts];
};

/**
 * Thực thi phân tích sức khỏe thú cưng với cơ chế luân chuyển đa cổng AI (Gemini <-> Groq) và giới hạn <= 30s.
 * Nếu tất cả nhà cung cấp đều lỗi hoặc quá hạn, ném lỗi với MSG34 để không lưu bản ghi hỏng vào DB.
 */
const analyzePetHealthWithAi = async ({
  petSnapshot = {},
  symptoms = [],
  description = '',
  files = [],
  clinicContext = {},
  timeoutMs = AI_TIMEOUT_MS,
}) => {
  const hasImages = Array.isArray(files) && files.length > 0;
  const attempts = buildProviderAttempts(hasImages);

  if (attempts.length === 0) {
    throw createAiError(AI_BUSY_MESSAGE, 503);
  }

  const { systemInstruction, userPrompt } = buildVeterinaryTriagePrompt({
    petSnapshot,
    symptoms,
    description,
    clinicContext,
    hasImages,
  });

  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let sawTimeout = false;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      sawTimeout = true;
      break;
    }

    // Nếu còn nhà cung cấp/key dự phòng phía sau, chia đều quỹ thời gian (tối đa chia 3) để kịp luân chuyển trong <= 30s
    const remainingAttempts = attempts.length - i;
    const perAttemptTimeoutMs =
      remainingAttempts > 1
        ? Math.max(1, Math.min(remainingMs, Math.ceil(remainingMs / Math.min(remainingAttempts, 3))))
        : remainingMs;

    const attemptStart = Date.now();
    try {
      const rawText =
        attempt.provider === 'gemini'
          ? await callGeminiGenerateContent({
              apiKey: attempt.apiKey,
              model: attempt.model,
              systemInstruction,
              userPrompt,
              files,
              timeoutMs: perAttemptTimeoutMs,
            })
          : await callGroqChatCompletion({
              apiKey: attempt.apiKey,
              model: attempt.model,
              systemInstruction,
              userPrompt,
              files,
              timeoutMs: perAttemptTimeoutMs,
            });

      const normalized = parseAndNormalizeAiJson(rawText, {
        activeServices: clinicContext.activeServices || [],
        petSnapshot,
        symptoms,
        description,
      });

      const totalElapsedMs = Date.now() - startedAt;
      if (process.env.NODE_ENV !== 'test') {
        console.info(
          `[AI Assessment] pet=${petSnapshot.code || petSnapshot.name || 'unknown'} provider=${attempt.provider} key#${attempt.keySlot} model=${attempt.model} status=success time=${totalElapsedMs}ms`
        );
      }

      return {
        ...normalized,
        aiProvider: attempt.provider,
        aiModel: attempt.model,
        responseTimeMs: totalElapsedMs,
      };
    } catch (err) {
      if (isTimeoutError(err)) {
        sawTimeout = true;
      }
      const attemptElapsedMs = Date.now() - attemptStart;
      if (process.env.NODE_ENV !== 'test') {
        console.warn(
          `[AI Assessment] pet=${petSnapshot.code || petSnapshot.name || 'unknown'} provider=${attempt.provider} key#${attempt.keySlot} model=${attempt.model} status=failure time=${attemptElapsedMs}ms reason=${err.message}`
        );
      }
    }
  }

  throw createAiError(AI_BUSY_MESSAGE, sawTimeout ? 504 : 503);
};

module.exports = {
  AI_DISCLAIMER,
  AI_BUSY_MESSAGE,
  AI_TIMEOUT_MS,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_VISION_MODEL,
  SYMPTOM_LABELS_VI,
  parseApiKeys,
  collectProviderApiKeys,
  buildVeterinaryTriagePrompt,
  parseAndNormalizeAiJson,
  callGeminiGenerateContent,
  callGroqChatCompletion,
  analyzePetHealthWithAi,
};
