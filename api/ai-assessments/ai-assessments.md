# API Trợ Lý AI Đánh Giá Sức Khỏe Thú Cưng Tham Khảo (`UC-14`, `SCR-10`, `API-01`, `BR-20`)

> **Tài liệu tích hợp dành cho Frontend (`SCR-10` — `AiAssessmentSection.tsx`)**
> - **Phân quyền:** Toàn bộ 3 API dưới đây **CHỈ dành cho `PetOwner`** (và chỉ thao tác trên thú cưng thuộc sở hữu của chính mình). Các vai trò khác (`Veterinarian`, `Groomer`, `Receptionist`, `Admin`) đều bị chặn `403 Forbidden`.
> - **Quy tắc y khoa (`BR-20` & AAHA/AVMA Veterinary Teletriage Guidelines):**
>   - Kết quả AI chỉ mang tính **sàng lọc tham khảo ban đầu** (phân tầng `Routine` / `Monitor` / `Urgent`), luôn đi kèm câu miễn trừ trách nhiệm **`MSG33`**.
>   - Lịch sử được lưu tại bảng riêng `ai_assessments`, **tuyệt đối không ghi đè** vào bệnh án `medical_records`.
>   - Backend tự động nạp ngữ cảnh hồ sơ thú cưng (`Pet`), tiền sử bệnh án `SOAP`, đơn thuốc cũ, cận lâm sàng, nội trú và danh mục dịch vụ `Active` của phòng khám VCMOS để tăng độ tin cậy của khuyến nghị.
>   - Hỗ trợ **xoay vòng đa key (`GEMINI_API_KEY_1..N` $\rightarrow$ `GROQ_API_KEY_1..N`)** với tổng timeout `<= 30 giây`.

---

## 1. Gửi yêu cầu đánh giá sức khỏe bằng AI (`POST /api/ai-assessments`)

| Mục | Chi tiết |
| :--- | :--- |
| **Method** | `POST` |
| **URL** | `http://localhost:9999/api/ai-assessments` |
| **Auth** | 🔒 `Authorization: Bearer <token>` — **Chỉ `PetOwner`** |
| **Timeout khuyến nghị phía FE** | Đặt Axios `timeout: 35000` (35s) để chờ đủ khung 30s của BE |
| **Content-Type** | `application/json` (khi gửi 0 ảnh) **hoặc** `multipart/form-data` (khi gửi 0–3 ảnh) |

### Request Body / FormData Fields

| Trường | Kiểu | Bắt buộc | Quy tắc kiểm tra |
| :--- | :--- | :---: | :--- |
| `petId` | `string` (ObjectId 24 hex) | **Có** | ID thú cưng `Active` thuộc sở hữu của `PetOwner` |
| `description` | `string` | **Có** | Mô tả chi tiết triệu chứng, `10 – 1000` ký tự (`MSG02` / `MSG03`) |
| `symptoms` | `string[]` / JSON string / CSV | Không | Hỗ trợ 7 mã triệu chứng chuẩn (`lethargy`, `vomiting`, `diarrhoea`, `loss_of_appetite`, `scratching`, `coughing`, `limping`) **và bất kỳ triệu chứng tự do nào người dùng tự gõ** (tối đa 20 mục, mỗi mục tối đa 100 ký tự). Khi gửi `FormData`, dùng `JSON.stringify(selectedSymptoms)`. |
| `photos` *(hoặc `photo`)* | `File[]` (`JPG`/`PNG`) | Không | Từ `0` đến `3` ảnh, mỗi ảnh `<= 5 MB`, kiểm tra magic bytes thật (`MSG35`) |

### Ví dụ gọi API từ FE (Axios + `FormData`)

```ts
const formData = new FormData();
formData.append('petId', selectedPetId);
formData.append('description', description.trim());
formData.append('symptoms', JSON.stringify(selectedSymptoms)); // gồm cả tag chọn sẵn + triệu chứng tự nhập
uploadedFiles.forEach((file) => {
  formData.append('photos', file); // tối đa 3 file JPG/PNG <= 5MB
});

const res = await axiosInstance.post('/api/ai-assessments', formData, {
  timeout: 35000,
  headers: { 'Content-Type': 'multipart/form-data' },
});
// res.data.assessment là kết quả vừa lưu
```

*(Nếu người dùng không đính kèm ảnh, FE có thể gửi `JSON` thuần `{ petId, symptoms, description }` hoặc gửi `FormData` không có `photos` đều được).*

### Response `201 Created`

```json
{
  "message": "Đánh giá sức khỏe tham khảo bằng AI thành công",
  "assessment": {
    "_id": "6741a2b3c4d5e6f708091011",
    "petId": "6741a2b3c4d5e6f708090001",
    "ownerId": "6741a2b3c4d5e6f708090002",
    "petSnapshot": {
      "code": "PET-K7M2QX",
      "name": "Milo",
      "species": "Dog",
      "breed": "Poodle",
      "coatColor": "Brown",
      "dob": "2024-05-01T00:00:00.000Z",
      "ageText": "2 tuổi 6 tháng",
      "weight": 5.5,
      "notes": "Dị ứng thịt gà và hải sản"
    },
    "symptoms": ["vomiting", "Chảy nước dãi nhiều"],
    "description": "Bé Milo sáng nay lỡ ăn vụng thịt gà nên bị nôn 2 lần và chảy nước dãi",
    "imageUrls": [
      "https://res.cloudinary.com/.../vcmos/ai-assessments/photo-1.png"
    ],
    "urgency": "Monitor",
    "recommendedTimeframe": "Đưa bé đi khám chuyên khoa trong vòng 24 giờ",
    "summary": "Bé Milo có dấu hiệu tái phát kích ứng tiêu hóa trên nền dị ứng thức ăn đã ghi nhận.",
    "redFlags": [
      "Nôn ra máu hoặc tiêu chảy phân đen",
      "Lừ đừ, suy kiệt hoặc niêm mạc nhợt nhạt"
    ],
    "visualFindings": [
      "Quan sát thấy vùng da quanh miệng hơi ửng đỏ từ ảnh đính kèm"
    ],
    "possibleCauses": [
      "Tái phát viêm dạ dày ruột do dị ứng thực phẩm",
      "Rối loạn tiêu hóa cấp tính"
    ],
    "advice": [
      "Ngưng toàn bộ thức ăn mới, chỉ cho uống nước sạch từng lượng nhỏ",
      "Theo dõi tần suất nôn và mức độ tỉnh táo trong 6–12 giờ tới"
    ],
    "contraindications": [
      "Tuyệt đối không tự ý cho thú cưng uống thuốc của người (như Paracetamol, Ibuprofen)"
    ],
    "recommendedServices": [
      {
        "serviceId": "6741a2b3c4d5e6f708090010",
        "code": "SRV-4B8N3P",
        "name": "Khám tổng quát lâm sàng",
        "category": "Examination",
        "basePrice": 150000,
        "reason": "Kiểm tra sinh hiệu và đánh giá tình trạng mất nước"
      }
    ],
    "clinicalContextSummary": {
      "recentVisitsCount": 1,
      "recentMedicalRecordsCount": 1,
      "recentInpatientStaysCount": 0,
      "hasActiveInpatient": false,
      "lastDiagnosis": "Viêm dạ dày ruột nhẹ do dị ứng thức ăn",
      "knownAllergiesOrNotes": "Dị ứng thịt gà và hải sản"
    },
    "bookingNoteDraft": "[Sàng lọc AI - Mức độ: Monitor] Triệu chứng: Nôn mửa (Vomiting), Chảy nước dãi nhiều. Mô tả: ...",
    "disclaimer": "Kết quả AI chỉ mang tính tham khảo và không thay thế chẩn đoán của bác sĩ thú y.",
    "aiProvider": "gemini",
    "aiModel": "gemini-3.5-flash-lite",
    "responseTimeMs": 2340,
    "createdAt": "2026-11-23T03:50:00.000Z",
    "updatedAt": "2026-11-23T03:50:00.000Z"
  }
}
```

### Ý nghĩa từng trường trả về để FE hiển thị lên `SCR-10`

| Trường | Kiểu | Gợi ý hiển thị trên UI (`SCR-10`) |
| :--- | :--- | :--- |
| `urgency` | `'Urgent' \| 'Monitor' \| 'Routine'` | Badge màu: Đỏ (`Urgent`), Vàng cam (`Monitor`), Xanh ngọc (`Routine`) |
| `recommendedTimeframe` | `string` | Hiển thị ngay dưới badge mức độ (VD: *"Khám trong vòng 24 giờ"*) |
| `summary` | `string` | Đoạn nhận định phân tầng lâm sàng sơ bộ |
| `redFlags` | `string[]` | Khối cảnh báo đỏ *"Dấu hiệu nguy hiểm cần đưa đi cấp cứu ngay"* |
| `visualFindings` | `string[]` | Khối *"Quan sát từ ảnh chụp"* (ẩn khối nếu mảng rỗng `[]`) |
| `possibleCauses` | `string[]` | Danh sách `<li>` *"Nguyên nhân khả dĩ tham khảo"* |
| `advice` | `string[]` | Danh sách `<li>` *"Hướng dẫn chăm sóc an toàn tại nhà"* |
| `contraindications` | `string[]` | Khối cảnh báo *"Tuyệt đối KHÔNG làm tại nhà"* |
| `recommendedServices` | `Array<...>` | Thẻ gợi ý dịch vụ thật của phòng khám (có sẵn `serviceId`, `name`, `basePrice` để FE truyền qua màn hình Đặt lịch `SCR-12`) |
| `bookingNoteDraft` | `string` | Truyền trực tiếp vào ô `note` khi bấm nút **"Đặt lịch khám ngay"** (`UC-14` Flow 6a) |
| `disclaimer` | `string` | Banner miễn trừ trách nhiệm y khoa bắt buộc (`MSG33` / `BR-20`) |
| `imageUrls` | `string[]` | Ảnh đã upload lên Cloudinary để xem lại trong lịch sử |
| `clinicalContextSummary` | `object` | Cho biết AI đã đối chiếu bao nhiêu bệnh án SOAP cũ / chẩn đoán gần nhất / dị ứng |

### Mã lỗi có thể trả về (`POST /api/ai-assessments`)

- **`400 Bad Request`** (lỗi validate input hoặc ảnh `MSG35`):
  ```json
  {
    "message": "Mô tả triệu chứng phải từ 10 đến 1000 ký tự",
    "errors": {
      "petId": "Mã thú cưng (petId) không hợp lệ",
      "description": "Mô tả triệu chứng phải từ 10 đến 1000 ký tự",
      "photos": "Chỉ chấp nhận ảnh định dạng JPG hoặc PNG (MSG35)"
    }
  }
  ```
- **`401 Unauthorized`**: `{ "message": "Chưa đăng nhập" }`
- **`403 Forbidden`**: Không phải `PetOwner`, hoặc gửi cho thú cưng của chủ nuôi khác.
- **`404 Not Found`**: `{ "message": "Không tìm thấy hồ sơ thú cưng" }`
- **`503 Service Unavailable` / `504 Gateway Timeout`** (`MSG34` — giữ nguyên form nhập của user để bấm thử lại, không lưu DB):
  ```json
  {
    "message": "Dịch vụ AI đang bận. Vui lòng thử lại sau."
  }
  ```

---

## 2. Xem danh sách lịch sử đánh giá AI (`GET /api/ai-assessments`)

| Mục | Chi tiết |
| :--- | :--- |
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/ai-assessments?petId=<petId>&urgency=&page=1&limit=20` |
| **Auth** | 🔒 **Chỉ `PetOwner`** (chỉ thấy thú cưng của mình; mọi vai trò khác trả `403`) |

### Query Parameters (Tất cả đều tùy chọn)

| Query | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :---: | :--- |
| `petId` | ObjectId | — | Lọc lịch sử theo 1 thú cưng cụ thể của chủ nuôi (bỏ trống để lấy lịch sử tất cả thú cưng của mình) |
| `urgency` | `'Routine' \| 'Monitor' \| 'Urgent'` | — | Lọc theo mức độ khẩn cấp |
| `page` | Integer (`>= 1`) | `1` | Trang hiện tại |
| `limit` | Integer (`1..50`) | `20` | Số bản ghi mỗi trang |

### Response `200 OK`

```json
{
  "items": [
    {
      "_id": "6741a2b3c4d5e6f708091011",
      "petId": {
        "_id": "6741a2b3c4d5e6f708090001",
        "code": "PET-K7M2QX",
        "name": "Milo",
        "species": "Dog",
        "breed": "Poodle",
        "weight": 5.5,
        "photoUrl": "https://res.cloudinary.com/.../milo.jpg"
      },
      "symptoms": ["vomiting", "Chảy nước dãi nhiều"],
      "description": "Bé Milo sáng nay lỡ ăn vụng thịt gà...",
      "imageUrls": ["https://res.cloudinary.com/.../photo-1.png"],
      "urgency": "Monitor",
      "recommendedTimeframe": "Đưa bé đi khám chuyên khoa trong vòng 24 giờ",
      "summary": "...",
      "redFlags": ["..."],
      "visualFindings": ["..."],
      "possibleCauses": ["..."],
      "advice": ["..."],
      "contraindications": ["..."],
      "recommendedServices": [...],
      "bookingNoteDraft": "...",
      "disclaimer": "Kết quả AI chỉ mang tính tham khảo và không thay thế chẩn đoán của bác sĩ thú y.",
      "aiProvider": "gemini",
      "aiModel": "gemini-3.5-flash-lite",
      "responseTimeMs": 2340,
      "createdAt": "2026-11-23T03:50:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

---

## 3. Xem chi tiết một bản ghi đánh giá AI (`GET /api/ai-assessments/:id`)

| Mục | Chi tiết |
| :--- | :--- |
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/ai-assessments/:id` |
| **Auth** | 🔒 **Chỉ `PetOwner`** sở hữu thú cưng (mọi vai trò khác hoặc chủ nuôi khác trả `403`) |

### Response `200 OK`
- Trả về `{ "assessment": { ... } }` (cấu trúc giống 1 phần tử trong `items` ở mục 2, trong đó `petId` đã được populate `{ _id, code, name, species, breed, weight, photoUrl }`).

### Mã lỗi
- `400 Bad Request`: `:id` không phải ObjectId 24 ký tự hex.
- `403 Forbidden`: Không phải `PetOwner` hoặc không phải chủ sở hữu bản ghi.
- `404 Not Found`: Không tìm thấy bản ghi đánh giá AI.

---

## 4. Tích hợp với Pet Timeline (`GET /api/pets/:petId/timeline`)

- Khi `PetOwner` gọi `GET /api/pets/:petId/timeline`, response trả thêm mảng **`aiAssessments`** (sắp xếp mới nhất lên đầu) ở cấp root bên cạnh `sharedPosts` và `timeline`.
- Với các vai trò khác (`Veterinarian`, `Groomer`, `Receptionist`, `Admin`), trường `aiAssessments` luôn trả về mảng rỗng `[]`.

---

## 5. TypeScript Interface tham khảo cho FE

```ts
export type AiUrgencyLevel = 'Routine' | 'Monitor' | 'Urgent';

export interface AiRecommendedService {
  serviceId: string | null;
  code: string | null;
  name: string;
  category: string | null;
  basePrice: number | null;
  reason: string;
}

export interface AiAssessment {
  _id: string;
  petId: string | {
    _id: string;
    code: string;
    name: string;
    species?: string;
    breed?: string;
    weight?: number;
    photoUrl?: string;
  };
  ownerId: string;
  petSnapshot: {
    code: string | null;
    name: string | null;
    species: string | null;
    breed: string | null;
    coatColor: string | null;
    dob: string | null;
    ageText: string | null;
    weight: number | null;
    notes: string | null;
  };
  symptoms: string[];
  description: string;
  imageUrls: string[];
  urgency: AiUrgencyLevel;
  recommendedTimeframe: string;
  summary: string;
  redFlags: string[];
  visualFindings: string[];
  possibleCauses: string[];
  advice: string[];
  contraindications: string[];
  recommendedServices: AiRecommendedService[];
  clinicalContextSummary: {
    recentVisitsCount: number;
    recentMedicalRecordsCount: number;
    recentInpatientStaysCount: number;
    hasActiveInpatient: boolean;
    lastDiagnosis: string | null;
    knownAllergiesOrNotes: string | null;
  };
  bookingNoteDraft: string;
  disclaimer: string;
  aiProvider: 'gemini' | 'groq';
  aiModel: string;
  responseTimeMs: number;
  createdAt: string;
  updatedAt?: string;
}
```
