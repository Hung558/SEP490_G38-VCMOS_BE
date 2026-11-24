# VCMOS Backend (Veterinary Clinic Management & Operations System)

Hệ thống Backend cho đồ án **SEP490 - Nhóm G38**: Quản lý & Vận hành Phòng khám Thú y **VCMOS**.

Hệ thống hỗ trợ đầy đủ quy trình vận hành phòng khám thú y xuyên suốt **5 vai trò**:
- **`PetOwner`**: Quản lý hồ sơ thú cưng, đặt lịch khám/spa online, xem hành trình thú cưng (Unified Pet Timeline), tham khảo trợ lý AI sức khỏe thú cưng, tham gia cộng đồng chia sẻ.
- **`Receptionist`**: Tiếp nhận khách đặt online & khách vãng lai (Walk-in), Check-in, phân chuồng & đẩy hàng đợi, lập hóa đơn tổng hợp, thu tiền mặt / VNPay / PayOS, xuất hóa đơn PDF.
- **`Veterinarian`**: Tiếp nhận ca từ hàng đợi, khám lâm sàng, ghi bệnh án chuẩn SOAP, kê đơn thuốc, chỉ định Sub-task cận lâm sàng, quản lý điều trị nội trú và nhật ký hằng ngày.
- **`Groomer`**: Nhận ca chăm sóc/làm đẹp, ghi nhận ghi chú Grooming và tải ảnh trước/sau dịch vụ (Before/After).
- **`Admin`**: Quản trị tài khoản nhân sự/người dùng, quản lý danh mục dịch vụ, thuốc/sản phẩm, chuồng nuôi, lịch báo bận, kiểm duyệt cộng đồng và xem Dashboard thống kê doanh thu/vận hành.

---

## 1. Công nghệ sử dụng (Tech Stack)

| Nhóm công nghệ | Thư viện / Công cụ | Vai trò trong dự án |
| :--- | :--- | :--- |
| **Runtime & Framework** | **Node.js** + **Express 5** (`CommonJS`) | Xây dựng RESTful API xử lý request/response và Global Error Middleware |
| **Cơ sở dữ liệu** | **MongoDB** + **Mongoose 9** | Lưu trữ 18 collection, quản lý Schema, Compound Index, Unique Partial Index và Transaction |
| **Xác thực & Bảo mật** | **`jsonwebtoken` (JWT)** + **`bcryptjs`** | Xác thực Bearer Token, phân quyền theo vai trò (`RBAC`), băm mật khẩu/OTP, khóa tạm khi sai mật khẩu 5 lần (`BR-03`) |
| **Lưu trữ tệp & Ảnh** | **`multer`** + **Cloudinary** | Upload ảnh thú cưng, ảnh Before/After Grooming, kết quả cận lâm sàng, bài viết cộng đồng và ảnh đánh giá AI |
| **Thanh toán & Hóa đơn** | **VNPay**, **PayOS**, **`pdfmake`** | Thanh toán trực tuyến (IPN/Webhook có xác thực chữ ký), thanh toán tiền mặt và xuất hóa đơn PDF |
| **Trợ lý AI tham khảo** | **Google Gemini API** & **Groq API** | Đánh giá sức khỏe thú cưng tham khảo (hỗ trợ ảnh + văn bản), tự động chuyển dự phòng đa nhà cung cấp & nhiều API key |
| **Email & Tác vụ định kỳ** | **`nodemailer`** + **`node-cron`** | Gửi OTP xác thực/đặt lại mật khẩu, thông báo đặt lịch & nhập/xuất viện; Cron Job `JOB-01` tự động đánh dấu lịch quá hạn (`Overdue`) lúc `23:59` hằng ngày |
| **Kiểm thử (Testing)** | **Jest 30** + **Supertest** | 26 bộ kiểm thử tự động (742 test cases) chạy cô lập trên MongoDB local `vcmos_test` |

---

## 2. Các nhóm API chính

Toàn bộ đặc tả chi tiết kèm mẫu JSON test Postman xem tại [`api/BE_api.md`](api/BE_api.md).

| Tiền tố URL | Mô tả nghiệp vụ |
| :--- | :--- |
| `/api/auth` | Đăng ký (`PetOwner`), đăng nhập bằng SĐT/Email, đăng xuất |
| `/api/users` | Hồ sơ cá nhân, gửi/xác thực OTP email, đổi/quên mật khẩu, danh sách nhân sự |
| `/api/pets` | CRUD hồ sơ thú cưng, upload ảnh, Unified Pet Timeline (`/api/pets/:petId/timeline`) |
| `/api/admin/users` | Admin quản lý tài khoản người dùng & nhân sự, khóa/mở khóa tài khoản |
| `/api/services` | Quản lý danh mục dịch vụ khám, tiêm phòng, Grooming, cận lâm sàng, nội trú |
| `/api/products` | Quản lý danh mục thuốc, vật tư & sản phẩm bán lẻ |
| `/api/cages` | Quản lý danh sách chuồng nuôi (Khu chờ `Holding` & Khu nội trú `InpatientWard`) |
| `/api/cage-assignments` | Phân công chuồng, tra cứu chuồng đang dùng và giải phóng chuồng |
| `/api/staff-schedules` | Lịch báo bận nhân sự theo 3 ca (cơ chế Blacklist) |
| `/api/appointment-orders` | Đặt lịch Online, xem danh sách đơn, Check-in, hủy lịch, kích hoạt thủ công `JOB-01` |
| `/api/appointment-orders/walk-in` | Tiếp nhận khách vãng lai tại quầy (tạo nhanh khách, thú cưng, đơn, dịch vụ & chuồng) |
| `/api/appointment-services` | Hàng đợi làm việc của Bác sĩ/Groomer (`my-queue`), phân công nhân sự, Grooming Note & ảnh Before/After |
| `/api/medical-records` | Khám lâm sàng, lưu nháp/hoàn tất bệnh án chuẩn SOAP, kê đơn thuốc, xem tiền sử bệnh |
| `/api/subtask-requests` | Yêu cầu cận lâm sàng / dịch vụ phụ, nhận ca và trả kết quả kèm ảnh |
| `/api/inpatient-records` | Nhập viện nội trú, cập nhật nhật ký điều trị hằng ngày, xuất viện |
| `/api/invoices` | Lập hóa đơn tổng hợp, thanh toán Tiền mặt / VNPay / PayOS, xuất PDF, báo cáo sản phẩm bán chạy |
| `/api/reports` | Báo cáo doanh thu, báo cáo vận hành (`SCR-28`) và thống kê nhanh quầy lễ tân (`SCR-16`) |
| `/api/community-posts` | Bảng tin cộng đồng, chia sẻ hành trình ẩn thông tin nhạy cảm (`BR-18`), Like, Bình luận 1 cấp, Báo cáo vi phạm |
| `/api/admin/community` | Admin duyệt/từ chối bài viết (cảnh báo từ khóa nhạy cảm) và xử lý báo cáo vi phạm |
| `/api/ai-assessments` | Trợ lý AI đánh giá sức khỏe thú cưng tham khảo dành riêng cho `PetOwner` (`BR-20`) |

---

## 3. Cấu trúc thư mục dự án

Dự án tuân theo kiến trúc phân tầng nhất quán **`Routes → Controllers → Services`** kết hợp **`Validators`**, **`Middlewares`**, **`Utils`** và **`Jobs`**:

```text
VCMOS_BE/
├── api/                          # Đặc tả API chi tiết từng module & hướng dẫn test Postman
│   ├── BE_api.md                 # Tổng hợp toàn bộ endpoint kèm JSON mẫu
│   └── <module>/                 # Tài liệu chi tiết theo từng tính năng
│
├── docs/                         # Tài liệu nội bộ nhóm Backend
│   ├── BE_overview.md            # Tổng quan kiến trúc & nghiệp vụ BE
│   ├── BE_todo.md                # Danh sách hạng mục công việc & tiến độ
│   └── BE_tracking_changes.md    # Nhật ký thay đổi BE
│
├── src/
│   ├── config/                   # Cấu hình kết nối bên thứ 3
│   │   ├── db.js                 # Kết nối MongoDB
│   │   └── cloudinary.js         # Cấu hình Cloudinary lưu ảnh
│   │
│   ├── models/                   # 18 Mongoose Schema (collection đặt tên snake_case)
│   │   ├── User.js               # Tài khoản 5 vai trò
│   │   ├── Pet.js                # Hồ sơ thú cưng
│   │   ├── Service.js            # Danh mục dịch vụ
│   │   ├── Product.js            # Thuốc & sản phẩm bán lẻ
│   │   ├── StaffSchedule.js      # Lịch báo bận nhân sự theo ca
│   │   ├── Cage.js               # Danh mục chuồng
│   │   ├── CageAssignment.js     # Lịch sử gán/giải phóng chuồng
│   │   ├── AppointmentOrder.js   # Đơn đặt lịch hẹn (Online / Walk-in)
│   │   ├── AppointmentService.js # Từng dịch vụ trong đơn & hàng đợi
│   │   ├── MedicalRecord.js      # Bệnh án SOAP & đơn thuốc
│   │   ├── SubtaskRequest.js     # Yêu cầu cận lâm sàng / dịch vụ phụ
│   │   ├── InpatientRecord.js    # Hồ sơ điều trị nội trú & nhật ký ngày
│   │   ├── Invoice.js            # Hóa đơn tổng hợp & trạng thái thanh toán
│   │   ├── CommunityPost.js      # Bài viết & chia sẻ hành trình cộng đồng
│   │   ├── PostLike.js           # Lượt thích bài viết
│   │   ├── PostComment.js        # Bình luận & trả lời 1 cấp
│   │   ├── ContentReport.js      # Báo cáo vi phạm cộng đồng
│   │   └── AiAssessment.js       # Lịch sử đánh giá sức khỏe AI tham khảo
│   │
│   ├── middlewares/              # Middleware chạy trước Controller
│   │   ├── auth.middleware.js    # Kiểm tra JWT (protect) và phân quyền vai trò (authorize)
│   │   └── upload.middleware.js  # Xử lý multipart/form-data upload ảnh (multer)
│   │
│   ├── validators/               # Kiểm tra input (body/params/query), trả 400 kèm errors chi tiết
│   ├── controllers/              # Nhận Request, gọi Validator & Service, trả HTTP Response
│   ├── services/                 # Chứa toàn bộ logic nghiệp vụ và truy vấn MongoDB
│   ├── routes/                   # Khai báo đường dẫn RESTful và gắn middleware phân quyền
│   │
│   ├── utils/                    # Tiện ích tích hợp & hạ tầng dùng chung
│   │   ├── transaction.js        # Hỗ trợ MongoDB Transaction (tự fallback khi chạy standalone local)
│   │   ├── vnpay.js              # Ký & xác thực chữ ký VNPay
│   │   ├── payos.js              # Tạo link & xác thực Webhook PayOS
│   │   └── gemini.js             # Gọi Gemini / Groq API với cơ chế xoay key & failover
│   │
│   ├── jobs/                     # Tiến trình chạy ngầm (Background Jobs)
│   │   ├── index.js              # Khởi chạy cron jobs + quét bù khi server start
│   │   └── flagOverdueAppointments.job.js  # JOB-01: Tự động đánh dấu Overdue cuối ngày
│   │
│   └── seeds/
│       └── seed.js               # Script khởi tạo dữ liệu mẫu ban đầu
│
├── tests/                        # 26 file test tự động (Jest + Supertest trên DB vcmos_test)
│   ├── *.test.js                 # Integration test các endpoint API & background job
│   └── services/*.test.js        # Unit test tầng service
│
├── .env.example                  # Mẫu cấu hình biến môi trường
├── package.json                  # Khai báo thư viện và scripts
└── server.js                     # Entry point (export app cho test, listen khi chạy trực tiếp)
```

---

## 4. Luồng hoạt động của 1 Request

Khi Client (Frontend hoặc Postman) gọi một API bất kỳ, dữ liệu đi tuần tự qua 4 tầng:

1. **Route & Middleware (`src/routes/`, `src/middlewares/`)**: Định tuyến URL, xác thực JWT (`protect`), kiểm tra quyền (`authorize`), và xử lý file ảnh upload nếu có (`multer`).
2. **Controller (`src/controllers/`)**: Nhận `req.body` / `req.params` / `req.query` / `req.user`, gọi Validator và truyền dữ liệu sạch xuống Service.
3. **Validator (`src/validators/`)**: Kiểm tra tính hợp lệ đầu vào; nếu sai định dạng hoặc thiếu trường bắt buộc, trả ngay `400 Bad Request` theo mẫu `{ message, errors }`.
4. **Service & Model (`src/services/`, `src/models/`)**: Thực hiện nghiệp vụ chính (kiểm tra quyền sở hữu chống IDOR, chống trùng lặp qua Unique Index, chạy Transaction nếu cần, gọi dịch vụ bên thứ 3) và trả kết quả về Controller.

---

## 5. Cài đặt & Cấu hình môi trường

### Bước 1: Cài đặt thư viện
```bash
npm install
```

### Bước 2: Tạo file `.env`
Sao chép tệp [`.env.example`](.env.example) thành `.env` và điền các giá trị thực tế (không commit file `.env` lên Git):

- **Bắt buộc để chạy cơ bản:** `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_URL`.
- **Upload ảnh:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- **Gửi Email OTP / Thông báo:** `EMAIL_USER`, `EMAIL_PASS` (nếu bỏ trống ở môi trường dev, hệ thống sẽ in log OTP ra console).
- **Thanh toán trực tuyến:** `VNP_*` (VNPay sandbox/production) và `PAYOS_*` (PayOS).
- **Trợ lý AI:** `GEMINI_API_KEY_1`, `GEMINI_API_KEY_2`, `GROQ_API_KEY_1`, `GROQ_API_KEY_2` (hỗ trợ nhiều key đánh số tự động luân chuyển; các biến `GEMINI_MODEL`, `GROQ_MODEL`, `GROQ_VISION_MODEL`, `AI_PRIMARY_PROVIDER` là tùy chọn).
- **Cron Job quá hạn (`JOB-01`):** `OVERDUE_JOB_CRON` (tùy chọn, mặc định `59 23 * * *` theo giờ Việt Nam `Asia/Ho_Chi_Minh`).

---

## 6. Các câu lệnh thường dùng

```bash
# Chạy server ở chế độ phát triển (tự khởi động lại khi sửa code)
npm run dev

# Chạy server ở chế độ thường (mặc định http://localhost:9999)
npm start

# Chạy toàn bộ bộ kiểm thử tự động tuần tự (--runInBand)
# Yêu cầu MongoDB local đang chạy (dùng DB riêng vcmos_test, không đụng DB Atlas)
npm test

# Chạy riêng 1 file test
npx jest tests/flagOverdueJob.test.js

# Khởi tạo dữ liệu mẫu (chỉ chạy khi DB đang trống)
npm run seed
```

> **Lưu ý về Seed dữ liệu:**
> - Tài khoản mẫu sau khi seed: `0901000001 / 123456` (`PetOwner`) và `0901000002 / 123456` (`Veterinarian`).
> - Lệnh `npm run seed -- --force` sẽ **xóa sạch toàn bộ dữ liệu trong DB** rồi tạo lại. **Tuyệt đối không chạy `--force`** trên MongoDB Atlas dùng chung của nhóm khi chưa thống nhất.
