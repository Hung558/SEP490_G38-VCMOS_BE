# API Trợ Lý AI Đánh Giá Sức Khỏe Thú Cưng Tham Khảo (`UC-14`, `SCR-10`, `API-01`, `BR-20`)

> **Quy tắc y khoa (`BR-20` & AAHA/AVMA Veterinary Teletriage Guidelines):**
> - Kết quả AI chỉ mang tính **sàng lọc tham khảo ban đầu** (phân tầng `Routine` / `Monitor` / `Urgent`), luôn đi kèm thông báo miễn trừ trách nhiệm **`MSG33`**.
> - Kết quả được lưu ở bảng riêng `ai_assessments`, **tuyệt đối tách biệt** và không bao giờ ghi đè vào bảng bệnh án lâm sàng `medical_records`.
> - Hệ thống tự động nạp ngữ cảnh bệnh án SOAP, dị ứng, cận lâm sàng, nội trú và danh mục dịch vụ `Active` của phòng khám VCMOS (mọi dữ liệu đọc non-Admin) để tăng độ tin cậy của khuyến nghị.
> - Hỗ trợ **luân chuyển tự động đa cổng AI (`Gemini` $\leftrightarrow$ `Groq`)** và xoay vòng nhiều API key (ngăn cách bằng dấu phẩy trong `.env`) với tổng thời gian chờ tối đa `30 giây`.

---

## 1. Gửi yêu cầu đánh giá sức khỏe bằng AI (`POST /api/ai-assessments`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/ai-assessments`
- **Auth**: 🔒 `Authorization: Bearer <token>` — Chỉ **`PetOwner`** (chỉ cho thú cưng thuộc sở hữu của mình)
- **Content-Type**:
  - `application/json` (khi không đính kèm ảnh — `0` ảnh)
  - `multipart/form-data` (khi đính kèm từ `0` đến `3` ảnh `JPG`/`PNG`, tối đa `5 MB`/ảnh)

### Body / FormData Fields

| Trường | Kiểu | Bắt buộc | Mô tả |
| :--- | :--- | :---: | :--- |
| `petId` | ObjectId | Có | ID thú cưng `Active` của chủ nuôi hiện tại |
| `description` | String | Có | Mô tả chi tiết triệu chứng (`10–1000` ký tự) |
| `symptoms` | `string[]` / JSON string / CSV | Không | Danh sách triệu chứng chọn sẵn (`lethargy`, `vomiting`, `diarrhoea`, `loss_of_appetite`, `scratching`, `coughing`, `limping`) **hoặc triệu chứng tự do do người dùng tự nhập** |
| `photos` (hoặc `photo`) | File (`JPG`/`PNG`) | Không | Từ `0` đến `3` ảnh chụp vùng bệnh/biểu hiện, tối đa `5 MB`/ảnh (`MSG35`) |

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
    "aiModel": "gemini-2.5-flash",
    "responseTimeMs": 2340,
    "createdAt": "2026-11-23T03:50:00.000Z"
  }
}
```

### Mã lỗi có thể trả về
- `400 Bad Request`: Sai `petId`, `description` ngoài `10–1000` ký tự, file sai định dạng `JPG`/`PNG`, `> 5MB`, hoặc `> 3` ảnh (`MSG35`).
- `401 Unauthorized`: Chưa đăng nhập.
- `403 Forbidden`: Không phải `PetOwner`, hoặc `PetOwner` gửi cho thú cưng của người khác.
- `404 Not Found`: Không tìm thấy thú cưng (hoặc đã xoá mềm).
- `503 Service Unavailable` / `504 Gateway Timeout`: Cả Gemini và Groq đều lỗi / hết quota / quá `30 giây` — trả `MSG34`: `"Dịch vụ AI đang bận. Vui lòng thử lại sau."` và không lưu DB.

---

## 2. Xem danh sách lịch sử đánh giá AI (`GET /api/ai-assessments`)

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/ai-assessments?petId=<id>&urgency=Monitor&page=1&limit=20`
- **Auth**: 🔒 **Chỉ `PetOwner`** (chỉ xem được lịch sử của thú cưng thuộc sở hữu của chính mình; mọi role khác gồm `Veterinarian`, `Groomer`, `Receptionist`, `Admin` đều bị chặn `403`).
- **Query tùy chọn**: `petId`, `urgency` (`Routine` | `Monitor` | `Urgent`), `page` (`>= 1`), `limit` (`1..50`).
- **Response `200 OK`**: `{ items: [...], pagination: { page, limit, total, totalPages } }`.

---

## 3. Xem chi tiết một bản ghi đánh giá AI (`GET /api/ai-assessments/:id`)

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/ai-assessments/:id`
- **Auth**: 🔒 **Chỉ `PetOwner`** (chủ thú cưng; mọi role khác đều bị chặn `403`).
- **Response `200 OK`**: `{ assessment: { ... } }`.
