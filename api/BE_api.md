# 🐾 Tổng Hợp Toàn Bộ API Backend — VCMOS (`http://localhost:9999`)

> **Mẹo sử dụng nhanh trên VS Code:**
> - Bấm **`Ctrl + Shift + V`** để mở chế độ **Markdown Preview** nhìn bảng biểu và khối JSON cực dễ đọc.
> - Di chuột vào góc phải mỗi khối JSON để bấm nút **Copy** dán thẳng vào Postman.
> - Với các API có ghi **🔒 Cần Bearer Token**: Vào tab **Authorization** trên Postman → chọn **Bearer Token** → dán chuỗi `token` lấy từ API Đăng nhập.

---

## 📌 Mục Lục Nhanh

1. [Xác Thực (`Auth` — `/api/auth`)](#1--xác-thực-auth--apiauth)
2. [Hồ Sơ Cá Nhân, OTP & Nhân Sự (`Users` — `/api/users`)](#2--hồ-sơ-cá-nhân-otp--nhân-sự-users--apiusers)
3. [Hồ Sơ Thú Cưng (`Pets` — `/api/pets`)](#3--hồ-sơ-thú-cưng-pets--apipets)
4. [Quản Trị Tài Khoản Nhân Sự & Người Dùng (`Admin` — `/api/admin/users`)](#4--quản-trị-tài-khoản-nhân-sự--người-dùng-admin--apiadminusers)
5. [Quản Lý Danh Mục Dịch Vụ & Bảng Giá (`Services` — `/api/services`)](#5--quản-lý-danh-mục-dịch-vụ--bảng-giá-services--apiservices)
6. [Quản Lý Sản Phẩm, Thuốc & Vật Tư (`Products` — `/api/products`)](#6--quản-lý-sản-phẩm-thuốc--vật-tư-products--apiproducts)
7. [Quản Lý Chuồng Nuôi & Phân Công Chuồng (`Cages` — `/api/cages` & `/api/cage-assignments`)](#7--quản-lý-chuồng-nuôi--phân-công-chuồng-cages--apicages--apicage-assignments)
8. [Đặt Lịch Hẹn Online & Lễ Tân Check-in (`Appointments` — `/api/appointment-orders` & `/api/appointment-services`)](#8--đặt-lịch-hẹn-online--lễ-tân-check-in-appointments)
9. [Bác Sĩ & Groomer Nhận Ca, Tra Cứu & Giải Phóng Chuồng (`Work Queue` — `/api/appointment-services/my-queue` & `/api/cage-assignments`)](#9--bác-sĩ--groomer-nhận-ca-tra-cứu--giải-phóng-chuồng-work-queue)
10. [Bác Sĩ Khám Lâm Sàng, Ghi Bệnh Án Chuẩn SOAP & Kê Đơn Thuốc (`Medical Records` — `/api/medical-records`)](#10--bác-sĩ-khám-lâm-sàng-ghi-bệnh-án-chuẩn-soap--kê-đơn-thuốc-medical-records--apimedical-records)

---

## 1. 🔐 Xác Thực (`Auth` — `/api/auth`)

### 1.1. Đăng ký tài khoản (`PetOwner`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/register`
- **Auth**: 🌐 Công khai (Không cần token)
- **Body (`JSON`)**:
  ```json
  {
    "fullName": "Test User",
    "phone": "0911111111",
    "email": "test@mail.com",
    "password": "12345678"
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tạo tài khoản `PetOwner` thành công (tự sinh mã `USR-XXXXXX`).
  - `409 Conflict`: Bấm Send lần 2 sẽ báo trùng số điện thoại hoặc email.

---

### 1.2. Đăng nhập (bằng SĐT hoặc Email)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/login`
- **Auth**: 🌐 Công khai (Không cần token)
- **Body (`JSON`)**:
  ```json
  {
    "identifier": "0911111111",
    "password": "12345678"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ token, user }`. 👉 **Copy chuỗi `token` này để dùng cho các API bên dưới.**
  - `401 Unauthorized`: Sai SĐT/email hoặc mật khẩu.
  - `403 Forbidden`: 
    - Tài khoản đang bị khóa (`Locked`) hoặc ngừng hoạt động (`Inactive`).
    - Nhập sai mật khẩu 5 lần liên tiếp sẽ bị tạm khóa 30 phút theo **`BR-03`** (`MSG12`).

---

### 1.3. Đăng xuất
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/logout`
- **Auth**: 🔒 Cần Bearer Token (Mọi role)
- **Body**: Không cần
- **Kết quả mong đợi**:
  - `200 OK`: Đăng xuất thành công.
  - `401 Unauthorized`: Chưa gắn token.

---

## 2. 👤 Hồ Sơ Cá Nhân, OTP & Nhân Sự (`Users` — `/api/users`)

### 2.1. Xem thông tin cá nhân của chính mình
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/users/me`
- **Auth**: 🔒 Cần Bearer Token (Mọi role)
- **Kết quả mong đợi**:
  - `200 OK`: Trả về thông tin `user` (`code`, `fullName`, `phone`, `email`, `isEmailVerified`, `role`, `status`, `createdAt`), không có `passwordHash`.

---

### 2.2. Cập nhật thông tin cá nhân của chính mình
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/users/me`
- **Auth**: 🔒 Cần Bearer Token (Mọi role)
- **Body (`JSON`)**:
  ```json
  {
    "fullName": "Test User Mới",
    "phone": "0911111111",
    "email": "test@mail.com"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Trả về thông tin `user` đã cập nhật (nếu đổi sang email mới thì `isEmailVerified` tự động về `false`).

---

### 2.3. Gửi mã OTP xác thực Email
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/users/me/email/send-otp`
- **Auth**: 🔒 Cần Bearer Token
- **Body**: Không cần
- **Kết quả mong đợi**:
  - `200 OK`: Gửi mã OTP 6 số về Gmail (hoặc trả kèm `devToken` khi chưa cấu hình SMTP).

---

### 2.4. Xác nhận mã OTP để xác thực Email
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/users/me/email/verify`
- **Auth**: 🔒 Cần Bearer Token
- **Body (`JSON`)**:
  ```json
  {
    "otp": "123456"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Xác thực email thành công (`user.isEmailVerified = true`).

---

### 2.5. Gửi mã OTP đổi mật khẩu (khi đang đăng nhập)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/users/me/password/send-otp`
- **Auth**: 🔒 Cần Bearer Token (Yêu cầu tài khoản đã xác thực email)
- **Body**: Không cần
- **Kết quả mong đợi**:
  - `200 OK`: Mã OTP đổi mật khẩu được gửi về Gmail.

---

### 2.6. Đổi mật khẩu bằng mã OTP (khi đang đăng nhập)
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/users/me/password`
- **Auth**: 🔒 Cần Bearer Token
- **Body (`JSON`)**:
  ```json
  {
    "otp": "123456",
    "currentPassword": "12345678",
    "newPassword": "newpassword123"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Đổi mật khẩu thành công.

---

### 2.7. Quên mật khẩu — Bước 1: Gửi mã OTP về Email đã xác thực
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/users/forgot-password`
- **Auth**: 🌐 Công khai
- **Body (`JSON`)**:
  ```json
  {
    "email": "test@mail.com"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Mã OTP khôi phục mật khẩu được gửi về Gmail (nếu email chưa xác thực sẽ trả `400`).

---

### 2.8. Quên mật khẩu — Bước 2: Đặt lại mật khẩu mới bằng OTP
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/users/reset-password`
- **Auth**: 🌐 Công khai
- **Body (`JSON`)**:
  ```json
  {
    "email": "test@mail.com",
    "token": "123456",
    "password": "resetpassword123"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Đặt lại mật khẩu thành công.

---

### 2.9. Xem danh sách Bác sĩ / Groomer (`GET /api/users/staff`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/users/staff?role=Veterinarian&status=Active&page=1&limit=10`
- **Auth**: 🔒 Cần Bearer Token (Mọi role đã đăng nhập)
- **Query tùy chọn**:
  - `role`: `Veterinarian` hoặc `Groomer`
  - `status`: `Active` (mặc định), `Inactive`, `Locked`
  - `search`: Tìm theo họ tên, mã `code`, SĐT
  - `workDate`: Lọc theo ngày làm việc (`YYYY-MM-DD`) chỉ lấy nhân sự có ca trực trong ngày đó
  - `page`, `limit`: Phân trang
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ items, pagination }`.

---

## 3. 🐶 Hồ Sơ Thú Cưng (`Pets` — `/api/pets`)

| Method | Endpoint | Quyền | Mô tả nhanh |
| :--- | :--- | :--- | :--- |
| `GET` | `http://localhost:9999/api/pets` | 🔒 `PetOwner` | Xem danh sách thú cưng của chính mình |
| `GET` | `http://localhost:9999/api/pets/:id` | 🔒 `PetOwner`, Nhân sự PK | Xem chi tiết 1 thú cưng (Chủ nuôi xem của mình, Nhân sự PK xem mọi thú cưng) |
| `POST` | `http://localhost:9999/api/pets` | 🔒 `PetOwner` | Thêm thú cưng mới (`multipart/form-data` hoặc `JSON`, tự sinh `PET-XXXXXX`) |
| `PUT` | `http://localhost:9999/api/pets/:id` | 🔒 `PetOwner` | Cập nhật thông tin / ảnh thú cưng của mình |
| `DELETE` | `http://localhost:9999/api/pets/:id` | 🔒 `PetOwner` | Xóa mềm thú cưng (`status: 'Deleted'`) |

**Body mẫu khi tạo/sửa thú cưng (`POST /api/pets`)**:
```json
{
  "name": "Milo",
  "species": "Dog",
  "breed": "Poodle",
  "coatColor": "Brown",
  "dob": "2023-05-01",
  "weight": 5.2,
  "notes": "Dị ứng hải sản"
}
```

---

## 4. 🛡️ Quản Trị Tài Khoản Nhân Sự & Người Dùng (`Admin` — `/api/admin/users`)
*(Tài liệu test từng bước: [admin-quan-tri-tai-khoan.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/admin-quan-tri-tai-khoan.md))*

### 4.1. Xem danh sách, lọc & tìm kiếm tài khoản (`UC-60`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/admin/users?role=Veterinarian&status=Active&search=0977111222`
- **Auth**: 🔒 Chỉ `Admin`
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ users: [...] }` (sắp xếp mới nhất lên đầu, không có `passwordHash`).

---

### 4.2. Xem chi tiết 1 tài khoản (`SCR-32`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/admin/users/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ user }` (Nếu tài khoản đó là `PetOwner` sẽ có thêm mảng `user.pets`).

---

### 4.3. Tạo tài khoản nhân sự mới (`UC-61` & `BR-24`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/admin/users`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "fullName": "BS Trần Minh",
    "phone": "0977111222",
    "email": "vet.minh@vcmos.vn",
    "password": "password123",
    "role": "Veterinarian"
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tự sinh mã `USR-XXXXXX`, `status: "Active"`. (`role` chỉ nhận `Receptionist`, `Veterinarian`, `Groomer`).
  - `409 Conflict`: Trùng SĐT hoặc email.

---

### 4.4. Cập nhật họ tên & điều chuyển vai trò nhân sự (`SCR-32`)
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/admin/users/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "fullName": "Trần Minh (Groomer)",
    "role": "Groomer"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Cập nhật họ tên và `role` nhân sự (SĐT và Email là định danh cá nhân nên không sửa qua API này).

---

### 4.5. Khóa / Mở khóa tài khoản (`UC-62`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/admin/users/:id/status`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "status": "Locked"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Nhận `"Active"` hoặc `"Locked"`. Tài khoản bị `Locked` sẽ bị chặn đăng nhập (`403`). Admin không thể tự khóa chính mình (`400`).

---

### 4.6. Xóa tài khoản (Kiểm tra quy tắc cấm xóa vật lý `BR-22`)
- **Method**: `DELETE`
- **URL**: `http://localhost:9999/api/admin/users/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Kết quả mong đợi**:
  - `403 Forbidden`: Chặn xóa vật lý theo `BR-22`, hướng dẫn sử dụng chức năng khóa tài khoản.

---

## 5. 🩺 Quản Lý Danh Mục Dịch Vụ & Bảng Giá (`Services` — `/api/services`)
*(Tài liệu test từng bước: [admin-quan-ly-dich-vu.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/admin-quan-ly-dich-vu.md))*

### 5.1. Xem danh sách, lọc & tìm kiếm dịch vụ (`UC-01` & `UC-66`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/services?category=Examination&status=Active&search=tổng quát`
- **Auth**: 🌐 Công khai (Không cần token)
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ services: [...] }`.
  - `category` nhận: `Examination`, `Vaccination`, `Grooming`, `Paraclinical`, `Inpatient`.
  - `status` nhận: `Active`, `Inactive`.

---

### 5.2. Xem chi tiết 1 dịch vụ theo ID
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/services/:id`
- **Auth**: 🌐 Công khai
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ service }`.

---

### 5.3. Admin tạo dịch vụ mới (`UC-66` & `BR-24`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/services`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "name": "Khám tổng quát chuyên sâu",
    "category": "Examination",
    "defaultDuration": 30,
    "basePrice": 150000,
    "description": "Khám lâm sàng toàn diện cho thú cưng"
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tự sinh mã `SRV-XXXXXX` bất biến, `status: "Active"`. (`defaultDuration` là số nguyên `5–480` phút; `basePrice >= 0`).
  - `409 Conflict`: Trùng tên dịch vụ trong cùng `category`.

---

### 5.4. Admin cập nhật thông tin dịch vụ (`UC-66`)
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/services/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "name": "Khám tổng quát chuyên sâu (Gói tiêu chuẩn)",
    "category": "Examination",
    "defaultDuration": 45,
    "basePrice": 180000,
    "description": "Cập nhật thời lượng 45 phút và giá niêm yết mới"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Cập nhật thành công, giữ nguyên mã `SRV-XXXXXX`.

---

### 5.5. Admin tạm ngưng / kích hoạt lại dịch vụ (`UC-66`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/services/:id/status`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "status": "Inactive"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Chuyển trạng thái giữa `"Active"` và `"Inactive"`.

---

### 5.6. Admin xóa dịch vụ (Kiểm tra quy tắc cấm xóa vật lý `SCR-29` & `BR-16`)
- **Method**: `DELETE`
- **URL**: `http://localhost:9999/api/services/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Kết quả mong đợi**:
  - `403 Forbidden`: Chặn xóa vật lý để bảo toàn đơn hẹn và hóa đơn cũ.

---

## 6. 💊 Quản Lý Sản Phẩm, Thuốc & Vật Tư (`Products` — `/api/products`)
*(Tài liệu test từng bước: [admin-quan-ly-san-pham.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/admin-quan-ly-san-pham.md))*

### 6.1. Xem danh sách, lọc, tìm kiếm & phân trang sản phẩm
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/products?category=Medicine&status=Active&search=Amoxicillin&page=1&limit=20`
- **Auth**: 🌐 Công khai (Không cần token)
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ success: true, data: { items, total, page, limit, totalPages } }`.
  - `category` nhận: `Medicine`, `Vaccine`, `Retail`.

---

### 6.2. Xem chi tiết 1 sản phẩm theo ID
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/products/:id`
- **Auth**: 🌐 Công khai
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ success: true, data: product }`.

---

### 6.3. Admin tạo sản phẩm mới (`UC-67` & `BR-24`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/products`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "name": "Amoxicillin 250mg",
    "category": "Medicine",
    "unit": "Viên",
    "unitPrice": 5000
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tự sinh mã `PRD-XXXXXX`, `status: "Active"`. *(Lưu ý: Không truyền `code` hoặc `status` vào body).*
  - `409 Conflict`: Trùng cặp `{ name, unit }`.

---

### 6.4. Admin cập nhật thông tin sản phẩm
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/products/:id`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "name": "Amoxicillin 250mg (Nhập khẩu)",
    "unitPrice": 6500
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Cập nhật thành công.

---

### 6.5. Admin tạm ngưng (`inactivate`) hoặc kích hoạt (`activate`) sản phẩm
- **Tạm ngưng (`Inactive`)**:
  - **Method**: `PATCH`
  - **URL**: `http://localhost:9999/api/products/:id/inactivate`
  - **Auth**: 🔒 Chỉ `Admin`
- **Kích hoạt lại (`Active`)**:
  - **Method**: `PATCH`
  - **URL**: `http://localhost:9999/api/products/:id/activate`
  - **Auth**: 🔒 Chỉ `Admin`

---

## 7. 🏠 Quản Lý Chuồng Nuôi & Phân Công Chuồng (`Cages` — `/api/cages` & `/api/cage-assignments`)
*(Tài liệu test từng bước: [quan-ly-chuong-va-phan-cong-chuong.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/quan-ly-chuong-va-phan-cong-chuong.md))*

### 7.1. Admin tạo chuồng nuôi mới (`SCR-30`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/cages`
- **Auth**: 🔒 Chỉ `Admin`
- **Body (`JSON`)**:
  ```json
  {
    "label": "A-101",
    "size": "M",
    "zone": "Holding",
    "isIsolated": false
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tạo chuồng với `status: "Available"`. (`size` nhận `S`, `M`, `L`, `XL`; `zone` nhận `Holding`, `InpatientWard`). Trùng `label` trả `409`.

---

### 7.2. Xem danh sách & lọc chuồng nuôi (`Admin`, `Receptionist`, `Veterinarian`, `Groomer`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/cages?status=Available&size=M&isIsolated=false&page=1&limit=20`
- **Auth**: 🔒 `Admin`, `Receptionist`, `Veterinarian` hoặc `Groomer`
- **Kết quả mong đợi**:
  - `200 OK`: Trả về danh sách chuồng có phân trang.

---

### 7.3. Xem chi tiết 1 chuồng & Cập nhật chuồng
- **Xem chi tiết (`Admin` / `Receptionist` / `Veterinarian` / `Groomer`)**:
  - `GET http://localhost:9999/api/cages/:id`
- **Cập nhật chuồng (Chỉ `Admin`)**:
  - `PATCH http://localhost:9999/api/cages/:id`
  - **Body (`JSON`)**:
    ```json
    {
      "size": "L",
      "isIsolated": true
    }
    ```

---

### 7.4. Xếp chuồng cho đơn lịch hẹn (`POST /api/cage-assignments` — `SCR-23`, `BR-10`, `UC-27`, `UC-29`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/cage-assignments`
- **Auth**: 🔒 `Receptionist`, `Veterinarian` hoặc `Groomer`
- **Body (`JSON`)**:
  ```json
  {
    "cageId": "<id_chuồng_đang_Available>",
    "orderId": "<id_đơn_lịch_hẹn>"
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Xếp chuồng thành công, chuồng tự động chuyển sang `"Occupied"`.
  - `400 Bad Request`: Kích thước chuồng không đủ tải trọng theo cân nặng thú cưng (S $\le$ 5kg, M $\le$ 15kg, L $\le$ 30kg, XL > 30kg) hoặc không khớp cờ cách ly (**`BR-11`**).
  - `409 Conflict`: Chuồng không ở trạng thái `Available` hoặc đã có phân công đang hoạt động.

---

### 7.5. Xem danh sách & chi tiết phân công chuồng
- **Xem danh sách**: `GET http://localhost:9999/api/cage-assignments?active=true` (🔒 `Receptionist`, `Veterinarian` hoặc `Groomer`)
- **Xem chi tiết**: `GET http://localhost:9999/api/cage-assignments/:id` (🔒 `Receptionist`, `Veterinarian` hoặc `Groomer`)

---

## 8. 📅 Đặt Lịch Hẹn Online & Lễ Tân Check-in (`Appointments`)
*(Tài liệu test từng bước: [dat-lich-online-va-le-tan-check-in.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/dat-lich-online-va-le-tan-check-in.md))*

### 8.1. `PetOwner` đặt lịch hẹn Online trọn gói kèm dịch vụ (Khuyên dùng — `SCR-12`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/appointment-services/online-booking`
- **Auth**: 🔒 Chỉ `PetOwner`
- **Body (`JSON`)**:
  ```json
  {
    "petId": "<id_thú_cưng_của_bạn>",
    "date": "2026-11-15",
    "slotStart": "09:00",
    "note": "Bé hơi nhát, nhờ bác sĩ khám nhẹ nhàng",
    "services": [
      {
        "serviceId": "<id_dịch_vụ_Active>"
      }
    ]
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`: Tạo đơn hẹn mã `APT-XXXXXX` (`derivedStatus: "Booked"`, `isOnline: true`), tạo danh sách dịch vụ đi kèm (`sequenceNo: 1, 2...`) và gửi email thông báo cho các Lễ tân đang `Active`.
    - Nếu có gửi `slotStart` (ví dụ `"09:00"`, nằm trong giờ làm việc `08:00` – `18:00`): BE tự động cộng nối tiếp thời lượng `defaultDuration` của từng dịch vụ (mặc định 30 phút nếu trống) để tính `scheduledStart`, `scheduledEnd` cho từng dịch vụ và `slotEnd` cho đơn tổng.
  - `400 Bad Request`: `slotStart` sai định dạng `HH:mm`, nằm ngoài khung giờ `08:00` – `18:00`, ở trong quá khứ (nếu đặt ngày hôm nay), hoặc tổng thời lượng dịch vụ vượt quá giờ đóng cửa `18:00`.
  - `409 Conflict`: Thú cưng đã có lịch hẹn trong ngày đã chọn.

*(Lưu ý: Nếu muốn tách rời 2 bước thì gọi `POST /api/appointment-orders/online` tạo đơn trước, sau đó gọi `POST /api/appointment-services/online` để thêm từng dịch vụ).*

---

### 8.2. `PetOwner` xem danh sách & chi tiết lịch hẹn Online của mình (`SCR-14`)
- **Xem danh sách lịch hẹn của tôi**:
  - **Method**: `GET`
  - **URL**: `http://localhost:9999/api/appointment-orders/me?status=Booked&from=2026-11-01&to=2026-11-30&page=1&limit=10`
  - **Auth**: 🔒 Chỉ `PetOwner`
- **Xem chi tiết 1 lịch hẹn (kèm mảng `services` đã đặt)**:
  - **Method**: `GET`
  - **URL**: `http://localhost:9999/api/appointment-orders/me/:id`
  - **Auth**: 🔒 Chỉ `PetOwner`

---

### 8.3. `Receptionist` / `Admin` xem toàn bộ danh sách lịch hẹn tại phòng khám (`SCR-16`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/appointment-orders?status=Booked&isOnline=true&from=2026-11-01&to=2026-11-30&page=1&limit=10`
- **Auth**: 🔒 `Receptionist` hoặc `Admin`
- **Query tùy chọn**: `status`, `isOnline`, `code`, `ownerId`, `petId`, `from`, `to`, `page`, `limit`.
- **Kết quả mong đợi**:
  - `200 OK`: Trả về danh sách đơn hẹn đã populate sẵn tên thú cưng (`petId.name`) và họ tên + SĐT chủ nuôi (`ownerId.fullName`, `ownerId.phone`).

---

### 8.4. `Receptionist` bấm Check-in khi khách đến phòng khám (`SCR-16`, `UC-22`, `BR-09`, `BR-11`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/appointment-orders/:id/check-in`
- **Auth**: 🔒 Chỉ `Receptionist`
- **Body (`JSON` tùy chọn)**:
  ```json
  {
    "cageId": "<id_chuồng_trống_nếu_muốn_gán_ngay>",
    "requiresIsolation": false
  }
  ```
  *(Nếu khách tự bế thú cưng ngồi chờ ở phòng khách thì gửi body rỗng `{}`)*.
- **Kết quả mong đợi**:
  - `200 OK`: 
    - Chuyển `derivedStatus` từ `"Booked"` sang **`"CheckedIn"`** và ghi nhận thời gian `checkedInAt`.
    - Tự động chuyển các dịch vụ đã phân công nhân sự sang **`"Waiting"`** để vào hàng đợi khám.
    - Nếu có truyền `cageId`: Kiểm tra tải trọng chuồng theo cân nặng thú cưng (`BR-11`: S $\le$ 5kg, M $\le$ 15kg, L $\le$ 30kg, XL > 30kg) và cờ cách ly, sau đó tự động gán chuồng sang `"Occupied"`.
  - `400 Bad Request`: Chuồng chọn không đủ kích cỡ chứa thú cưng hoặc không khớp cờ cách ly (`BR-11`).
  - `409 Conflict`: Nếu đơn hẹn đã check-in rồi hoặc đang ở trạng thái khác `"Booked"`.

---

### 8.5. `Receptionist` / `Admin` xem danh sách dịch vụ của 1 đơn hẹn (`GET /api/appointment-services`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/appointment-services?orderId=<id_đơn_lịch_hẹn>`
- **Auth**: 🔒 `Receptionist` hoặc `Admin`
- **Kết quả mong đợi**:
  - `200 OK`: Trả về danh sách các dịch vụ (`AppointmentService`) thuộc đơn hẹn đó, đã populate thông tin dịch vụ và nhân sự.

---

### 8.6. `Receptionist` phân công Bác sĩ / Groomer cho dịch vụ khám (`SCR-16`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/appointment-services/:id/assign-staff`
- **Auth**: 🔒 Chỉ `Receptionist`
- **Body (`JSON`)**:
  ```json
  {
    "assignedStaffId": "<id_Bác_sĩ_hoặc_Groomer_đang_Active>"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Gán `assignedStaffId` cho dịch vụ. Nếu đơn hẹn đã `CheckedIn`, dịch vụ tự động chuyển `status` sang **`"Waiting"`**, tự động cấp số thứ tự hàng đợi `queueNo` và ghi nhận thời điểm `enqueueAt`.
  - `400 Bad Request`: Nếu nhân sự không phải `Veterinarian` / `Groomer` hoặc không ở trạng thái `Active`.

---

### 8.7. `Receptionist` / `Admin` tra cứu khách hàng theo SĐT tại quầy (`UC-20` — `SCR-18`)
*(Tài liệu test từng bước: [le-tan-tiep-nhan-khach-vang-lai-walk-in.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/le-tan-tiep-nhan-khach-vang-lai-walk-in.md))*

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/appointment-orders/walk-in/customer-lookup?phone=0988777666`
- **Auth**: 🔒 `Receptionist` hoặc `Admin`
- **Kết quả mong đợi**:
  - `200 OK`:
    - Nếu SĐT đã tồn tại: trả về `{ found: true, customer, pets }` (gồm thông tin khách và danh sách thú cưng đang `Active`).
    - Nếu SĐT chưa có: trả về `{ found: false, customer: null, pets: [] }`.

---

### 8.8. `Receptionist` đăng ký khám vãng lai tại quầy (Walk-in — `UC-19`, `UC-21`, `BR-04`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/appointment-orders/walk-in`
- **Auth**: 🔒 Chỉ `Receptionist`
- **Body (`JSON`)**:
  ```json
  {
    "phone": "0988777666",
    "fullName": "Trần Thị Khách Vãng Lai",
    "petInfo": {
      "name": "Milo",
      "species": "Chó",
      "breed": "Poodle",
      "weight": 4.5,
      "coatColor": "Nâu đỏ"
    },
    "note": "Khách đưa bé đến khám trực tiếp tại quầy",
    "services": [
      {
        "serviceId": "<id_dịch_vụ_Active>",
        "assignedStaffId": "<id_Bác_sĩ_hoặc_Groomer_Active>",
        "isEmergency": false
      }
    ],
    "cageId": null
  }
  ```
- **Kết quả mong đợi**:
  - `201 Created`:
    - Nếu SĐT chưa có: tự động tạo tài khoản `PetOwner` ở trạng thái **`"Inactive"`** (`passwordHash: null`) theo **`BR-04`**.
    - Tạo thú cưng mới (`petInfo`) hoặc dùng lại thú cưng cũ (`petId`).
    - Tạo đơn hẹn `AppointmentOrder` với `isOnline: false`, **`derivedStatus: "CheckedIn"`** và `checkedInAt` ngay lập tức.
    - Dịch vụ có `assignedStaffId` tự động nhảy sang **`status: "Waiting"`** kèm `queueNo` và `enqueueAt`.

---

### 8.9. `PetOwner` / `Receptionist` hủy toàn bộ đơn lịch hẹn (`UC-18`, `BR-07`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/appointment-orders/:id/cancel`
- **Auth**: 🔒 `PetOwner` hoặc `Receptionist`
- **Body (`JSON`)**:
  ```json
  {
    "reason": "Bận việc đột xuất không đưa bé đi khám được"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Chuyển `derivedStatus` của đơn sang **`"Cancelled"`**, lưu `cancelReason`, `cancelledAt`, `cancelledBy` và tự động hủy tất cả dịch vụ chưa bắt đầu (`Booked`, `Waiting`) thuộc đơn đó (đồng thời rút khỏi hàng đợi nhân sự).
  - `400 Bad Request`: Không nhập lý do hủy hoặc lý do vượt quá 200 ký tự.
  - `403 Forbidden`: `PetOwner` cố hủy lịch hẹn của người khác.
  - `409 Conflict`: `PetOwner` tự hủy khi đã `CheckedIn` hoặc sát giờ hẹn `< 2 giờ` (`BR-07`), hoặc `Receptionist` hủy đơn đã có dịch vụ `InProgress` / `Done`.

---

### 8.10. `PetOwner` / `Receptionist` hủy lẻ 1 dịch vụ trong lịch hẹn (`UC-18`, `BR-07`, `BR-09`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/appointment-services/:id/cancel`
- **Auth**: 🔒 `PetOwner` hoặc `Receptionist`
- **Body (`JSON`)**:
  ```json
  {
    "reason": "Chỉ khám tổng quát, tạm hoãn dịch vụ tắm spa"
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`: Chuyển `status` của dịch vụ sang **`"Cancelled"`**, giải phóng `queueNo` / `enqueueAt`.
    - Nếu đơn vẫn còn dịch vụ khác chưa hủy: đơn giữ nguyên trạng thái `Booked` (hoặc chuyển sang `WaitOwner` nếu đơn đã `CheckedIn` và mọi dịch vụ còn lại đều đã `Done`).
    - Nếu toàn bộ dịch vụ trong đơn đều đã bị hủy: tự động chuyển `derivedStatus` của đơn sang **`"Cancelled"`**.
  - `400 Bad Request`: Không nhập lý do hủy hoặc vượt quá 200 ký tự.
  - `403 Forbidden`: `PetOwner` cố hủy dịch vụ trong đơn của người khác.
  - `409 Conflict`: Dịch vụ đã bắt đầu/hoàn tất hoặc vi phạm điều kiện thời gian `BR-07`.

---

## 9. 🩺 Bác Sĩ & Groomer Nhận Ca, Tra Cứu & Giải Phóng Chuồng (`Work Queue`)
*(Tài liệu test từng bước: [bac-si-va-groomer-nhan-ca-va-giai-phong-chuong.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/bac-si-va-groomer-nhan-ca-va-giai-phong-chuong.md))*

### 9.1. Bác sĩ / Groomer xem hàng đợi làm việc của mình (`GET /api/appointment-services/my-queue`)
*(Tài liệu chi tiết: [get-my-queue.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/appointment-services/get-my-queue.md))*

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/appointment-services/my-queue?status=Waiting`
- **Auth**: 🔒 `Veterinarian` hoặc `Groomer`
- **Query tùy chọn**: `status` (Một trong: `Booked`, `Waiting`, `InProgress`, `Done`, `Cancelled`, `Overdue`. Nếu không truyền thì lấy tất cả).
- **Kết quả mong đợi**:
  - `200 OK`: Trả về danh sách dịch vụ được phân công cho nhân viên đang đăng nhập, tự động ưu tiên ca cấp cứu lên đầu (`isEmergency: -1`), sau đó theo số thứ tự hàng đợi `queueNo` và thời điểm xếp hàng `enqueueAt` tăng dần. Đã populate chi tiết đơn hẹn `orderId` (kèm thú cưng và chủ nuôi) và dịch vụ `serviceId`.
  - `400 Bad Request`: `status` không hợp lệ.
  - `403 Forbidden`: Người dùng không có role `Veterinarian` hoặc `Groomer`.

---

### 9.2. Bác sĩ / Groomer tra cứu vị trí chuồng của thú cưng theo đơn hẹn (`GET /api/cage-assignments/order/:orderId`)
*(Tài liệu chi tiết: [get-cage-assignment-by-order.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/cage-assignments/get-cage-assignment-by-order.md))*

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/cage-assignments/order/:orderId`
- **Auth**: 🔒 `Veterinarian` hoặc `Groomer`
- **Kết quả mong đợi**:
  - `200 OK`: Trả về thông tin phân công chuồng đang mở (`releasedAt = null`) của đơn hẹn, populate thông tin chuồng `cageId` (đang ở trạng thái `Occupied`), nhãn chuồng `label` để bác sĩ đến đón bé vào phòng khám.
  - `404 Not Found`: Đơn hẹn này không xếp chuồng.

---

### 9.3. Bác sĩ / Groomer giải phóng chuồng lưu giữ (`PATCH /api/cage-assignments/:id/release`)
*(Tài liệu chi tiết: [release-cage-assignment.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/cage-assignments/release-cage-assignment.md))*

- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/cage-assignments/:id/release`
- **Auth**: 🔒 `Veterinarian` hoặc `Groomer`
- **Body**: Không cần body (`none`)
- **Kết quả mong đợi**:
  - `200 OK`: Ghi nhận `releasedAt` thành thời gian hiện tại và tự động chuyển chuồng `cageId.status` về trạng thái `"Available"` (trống).
  - `409 Conflict`: Chuồng này đã được giải phóng trước đó.

---

## 10. 📋 Bác Sĩ Khám Lâm Sàng, Ghi Bệnh Án Chuẩn SOAP & Kê Đơn Thuốc (`Medical Records` — `/api/medical-records`)
*(Tài liệu test từng bước: [bac-si-va-groomer-nhan-ca-va-giai-phong-chuong.md](file:///d:/FA_ki9_FU_Final/FINAL_GRADE/VCMOS_Project/VCMOS_BE/api/quy-trinh-cac-buoc-test/bac-si-va-groomer-nhan-ca-va-giai-phong-chuong.md))*

### 10.1. Bác sĩ bắt đầu ca khám (`POST /api/medical-records/service/:appointmentServiceId/start`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/medical-records/service/:appointmentServiceId/start`
- **Auth**: 🔒 Chỉ `Veterinarian` (đúng bác sĩ được phân công `assignedStaffId`)
- **Body**: Không cần (`none`)
- **Kết quả mong đợi**:
  - `200 OK`:
    - Kiểm tra thứ tự `sequenceNo` theo **`BR-12`** (nếu dịch vụ đứng trước trong cùng đơn hẹn chưa `Done` thì chặn `409`).
    - Tự động giải phóng chuồng chờ (nếu thú cưng đang nằm trong chuồng chờ lúc đợi khám) theo **`BR-10`**.
    - Chuyển dịch vụ khám sang **`InProgress`** (ghi nhận `dequeueAt`), chuyển đơn hẹn sang **`InProgress`**, và khởi tạo bản nháp (`Draft`) `MedicalRecord`.
  - `403 Forbidden`: Không phải bác sĩ được phân công phụ trách ca khám này.
  - `409 Conflict`: Khách chưa Check-in hoặc dịch vụ đứng trước chưa hoàn thành (`BR-12`).

---

### 10.2. Bác sĩ lưu nháp bệnh án chuẩn SOAP, cập nhật cân nặng & kê đơn thuốc (`PUT /api/medical-records/service/:appointmentServiceId`)
- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/medical-records/service/:appointmentServiceId`
- **Auth**: 🔒 Chỉ `Veterinarian` (đúng bác sĩ được phân công)
- **Body (`JSON`)**:
  ```json
  {
    "subjectiveNote": "Bỏ ăn 2 ngày, nôn khan buổi sáng",
    "objectiveNote": "Nhiệt độ 39.2 độ C, niêm mạc hồng nhạt",
    "assessment": "Viêm dạ dày ruột cấp nhẹ",
    "plan": "Uống kháng sinh 5 ngày, ăn thức ăn mềm, tái khám sau 7 ngày",
    "notes": "Theo dõi triệu chứng nôn tại nhà",
    "weight": 9.2,
    "prescriptions": [
      {
        "productId": "<id_thuốc_Active>",
        "dosage": "1 viên",
        "frequency": "2 lần/ngày sau ăn",
        "instructions": "Nghiền nhỏ trộn thức ăn mềm",
        "durationDays": 5
      }
    ]
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`:
    - Lưu bản nháp (`status: "Draft"`) bệnh án SOAP.
    - Nếu truyền `weight`: tự động cập nhật cân nặng mới nhất vào hồ sơ gốc của thú cưng (`Pet.weight`).
    - Kiểm tra danh sách thuốc kê đơn theo **`BR-16`** (chỉ cho phép thuốc đang `Active` / Còn hàng) và chụp snapshot `productNameSnapshot`, `unitSnapshot`.
  - `400 Bad Request`: Kê thuốc đang `Inactive` (hết hàng) hoặc dữ liệu sai định dạng.
  - `409 Conflict`: Bệnh án đã bị khóa (`Finalized` - **`BR-14`**).

---

### 10.3. Bác sĩ hoàn tất bệnh án SOAP & kết thúc ca khám (`POST /api/medical-records/service/:appointmentServiceId/complete`)
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/medical-records/service/:appointmentServiceId/complete`
- **Auth**: 🔒 Chỉ `Veterinarian` (đúng bác sĩ được phân công)
- **Body (`JSON`)** *(có thể gửi bổ sung các trường S-O-A-P còn thiếu so với bản nháp và tùy chọn `waitingCageId`)*:
  ```json
  {
    "subjectiveNote": "Bỏ ăn 2 ngày, nôn khan buổi sáng",
    "objectiveNote": "Nhiệt độ 39.2 độ C, niêm mạc hồng nhạt",
    "assessment": "Viêm dạ dày ruột cấp nhẹ",
    "plan": "Uống kháng sinh 5 ngày, ăn thức ăn mềm, tái khám sau 7 ngày",
    "notes": "Theo dõi triệu chứng nôn tại nhà",
    "waitingCageId": null
  }
  ```
- **Kết quả mong đợi**:
  - `200 OK`:
    - Bắt buộc đủ cả 4 trường **S - O - A - P** theo **`BR-13`**.
    - Chặn hoàn tất nếu vẫn còn chỉ định Cận lâm sàng (`SubtaskRequest`) ở trạng thái `Pending` hoặc `InProgress` (**`MSG26`**).
    - Theo **`BR-14`**: Giữ bệnh án ở trạng thái **`status: "Draft"`** khi bác sĩ vừa khám xong; chỉ khi Lễ tân thu tiền xong (`Invoice.paymentStatus = "Paid"`) thì bệnh án mới chuyển sang **`Finalized`** và khóa vĩnh viễn.
    - Chuyển trạng thái dịch vụ khám sang **`Done`**.
    - Nếu tất cả dịch vụ trong đơn hẹn đã hoàn tất: tự động chuyển `AppointmentOrder.derivedStatus` sang **`"WaitOwner"`** (Chờ chủ đón & thanh toán) theo **`BR-09`**.
    - Nếu truyền `waitingCageId`: tự động xếp thú cưng vào chuồng chờ đón theo **`BR-10`**.

---

### 10.4. Xem chi tiết bệnh án SOAP theo ca khám (`GET /api/medical-records/service/:appointmentServiceId`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/medical-records/service/:appointmentServiceId`
- **Auth**: 🔒 `Veterinarian`, `Groomer`, `Receptionist`, `Admin`, hoặc `PetOwner` (chỉ chủ sở hữu thú cưng đó theo **`BR-23`**)
- **Kết quả mong đợi**:
  - `200 OK`: Trả về chi tiết bệnh án SOAP kèm đơn thuốc và thông tin bác sĩ khám.
  - `403 Forbidden`: `PetOwner` cố xem bệnh án của thú cưng người khác (**`BR-23`**).

---

### 10.5. Xem tiền sử bệnh lý của thú cưng (`GET /api/medical-records/pet/:petId` — `UC-32`)
- **Method**: `GET`
- **URL**: `http://localhost:9999/api/medical-records/pet/:petId`
- **Auth**: 🔒 `Veterinarian`, `Groomer`, `Receptionist`, `Admin`, hoặc đúng `PetOwner` sở hữu thú cưng (**`BR-23`**)
- **Kết quả mong đợi**:
  - `200 OK`: Trả về `{ pet, records }` (danh sách lịch sử các lần khám trước của thú cưng, sắp xếp từ mới nhất đến cũ nhất để bác sĩ mở **Medical History Drawer** tra cứu nhanh).

