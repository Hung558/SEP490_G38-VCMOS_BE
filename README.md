# VCMOS Backend (Veterinary Clinic Management & Operations System)

Hệ thống Backend cho đồ án **SEP490 - Nhóm G38**: Quản lý & Vận hành Phòng khám Thú y VCMOS.

---

## 1. Công nghệ sử dụng (Tech Stack)

| Nhóm công nghệ | Thư viện / Công cụ | Vai trò trong dự án |
| :--- | :--- | :--- |
| **Runtime & Framework** | **Node.js** + **Express 5** (`CommonJS`) | Xây dựng RESTful API xử lý request/response |
| **Cơ sở dữ liệu** | **MongoDB** + **Mongoose 9** | Lưu trữ dữ liệu, định nghĩa Schema và quản lý Unique Index |
| **Xác thực & Bảo mật** | **JSON Web Token (`jsonwebtoken`)** + **`bcryptjs`** | Cấp phát/kiểm tra token đăng nhập (JWT) và băm mật khẩu/mã OTP |
| **Lưu trữ tệp & Ảnh** | **`multer`** + **Cloudinary (`cloudinary`)** | Nhận file upload từ client và lưu trữ ảnh đám mây (ảnh thú cưng...) |
| **Gửi Email** | **Nodemailer (`nodemailer`)** | Gửi mã xác thực OTP qua email (xác minh tài khoản, quên/đổi mật khẩu) |
| **Tiện ích & Báo cáo** | **`moment`**, **`node-cron`**, **`exceljs`**, **`pdfmake`** | Xử lý thời gian, tác vụ định kỳ, xuất báo cáo Excel và hóa đơn PDF |
| **Kiểm thử (Testing)** | **Jest 30** + **Supertest** | Viết Unit / Integration Test tự động cho các endpoint API |

---

## 2. Cấu trúc thư mục dự án (Project Structure)

Dự án tuân theo kiến trúc phân tầng **`Routes → Controllers → Services`** kết hợp với **`Validators`** và **`Middlewares`** để tách biệt rõ ràng từng nhiệm vụ:

```text
VCMOS_BE/
├── api/                          # Tài liệu đặc tả API & hướng dẫn test Postman
│   ├── auth/                     # Tài liệu API Đăng ký / Đăng nhập
│   ├── users/                    # Tài liệu API Hồ sơ cá nhân & OTP
│   ├── pets/                     # Tài liệu API Quản lý thú cưng
│   ├── admin/                    # Tài liệu API Quản trị tài khoản (Role Admin)
│   ├── quy-trinh-cac-buoc-test/  # Hướng dẫn từng bước test API trên Postman
│   └── BE_api.md                 # Tổng hợp nhanh các API để test
│
├── src/
│   ├── config/                   # Cấu hình kết nối bên thứ 3
│   │   ├── db.js                 # Kết nối MongoDB
│   │   └── cloudinary.js         # Cấu hình Cloudinary lưu ảnh
│   │
│   ├── models/                   # Định nghĩa Mongoose Schema (tương ứng các bảng trong DB)
│   │   ├── User.js               # Người dùng & Nhân sự (PetOwner, Receptionist, Veterinarian, Groomer, Admin)
│   │   ├── Pet.js                # Hồ sơ thú cưng
│   │   ├── Service.js            # Danh mục dịch vụ khám & chăm sóc
│   │   ├── Product.js            # Thuốc & Sản phẩm vật tư
│   │   ├── StaffSchedule.js      # Lịch phân ca nhân viên
│   │   ├── AppointmentOrder.js   # Đơn đặt lịch hẹn
│   │   ├── ServiceTicket.js      # Phiếu dịch vụ
│   │   ├── MedicalRecord.js      # Bệnh án điện tử
│   │   ├── Prescription.js       # Đơn thuốc
│   │   ├── Invoice.js            # Hóa đơn
│   │   └── PaymentTransaction.js # Giao dịch thanh toán
│   │
│   ├── middlewares/              # Middleware chạy trước Controller
│   │   ├── auth.middleware.js    # Kiểm tra đăng nhập (protect) và phân quyền theo role (authorize)
│   │   └── upload.middleware.js  # Xử lý đọc file ảnh upload (multer)
│   │
│   ├── validators/               # Kiểm tra tính hợp lệ dữ liệu đầu vào (trả lỗi 400)
│   │   ├── auth.validator.js
│   │   ├── user.validator.js
│   │   ├── pet.validator.js
│   │   └── admin.validator.js
│   │
│   ├── controllers/              # Nhận Request từ Route, gọi Validator & Service, trả Response HTTP
│   │   ├── auth.controller.js
│   │   ├── user.controller.js
│   │   ├── pet.controller.js
│   │   └── admin.controller.js
│   │
│   ├── services/                 # Chứa toàn bộ logic nghiệp vụ và truy vấn Database
│   │   ├── auth.service.js
│   │   ├── user.service.js
│   │   ├── pet.service.js
│   │   └── admin.service.js
│   │
│   ├── routes/                   # Định nghĩa đường dẫn URL và gắn Middleware phân quyền
│   │   ├── auth.routes.js        # /api/auth
│   │   ├── user.routes.js        # /api/users
│   │   ├── pet.routes.js         # /api/pets
│   │   └── admin.routes.js       # /api/admin/users
│   │
│   └── seeds/
│       └── seed.js               # Script khởi tạo dữ liệu mẫu ban đầu
│
├── tests/                        # Bộ test tự động (Jest + Supertest trên DB local vcmos_test)
│   ├── auth.test.js
│   ├── user.test.js
│   ├── authorize.test.js
│   └── admin.test.js
│
├── .env.example                  # Mẫu cấu hình biến môi trường
├── package.json                  # Khai báo thư viện và các câu lệnh scripts
└── server.js                     # Điểm khởi chạy ứng dụng (Entry Point)
```

---

## 3. Luồng hoạt động của 1 Request

Khi Client (Frontend hoặc Postman) gọi một API bất kỳ, dữ liệu sẽ đi tuần tự qua 4 bước:

1. **Route (`src/routes/`)**: Định tuyến URL (ví dụ `POST /api/admin/users`) và chạy qua middleware [`protect`](src/middlewares/auth.middleware.js) (kiểm tra JWT token) → [`authorize`](src/middlewares/auth.middleware.js) (kiểm tra đúng `role`).
2. **Controller (`src/controllers/`)**: Nhận `req.body` / `req.params` / `req.query`, gọi **Validator** để kiểm tra dữ liệu.
3. **Validator (`src/validators/`)**: Nếu dữ liệu thiếu hoặc sai định dạng, lập tức trả về mã lỗi `400 Bad Request` kèm chi tiết từng trường lỗi.
4. **Service (`src/services/`)**: Thực hiện nghiệp vụ chính (kiểm tra trùng lặp, băm mật khẩu, sinh mã định danh, đọc/ghi MongoDB qua **Model**) và trả kết quả về cho Controller gửi lại Client.

---

## 4. Các câu lệnh thường dùng

```bash
# Chạy server ở chế độ phát triển (tự khởi động lại khi sửa code)
npm run dev

# Chạy server ở chế độ thường
npm start

# Chạy bộ kiểm thử tự động (yêu cầu bật MongoDB local)
npm test

# Tạo dữ liệu mẫu (chỉ chạy khi DB đang trống)
npm run seed
```

