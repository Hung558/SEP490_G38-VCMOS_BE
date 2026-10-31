# Quy Trình Các Bước Test API Quản Trị Tài Khoản (Role Admin - SCR-32)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho **Module 1: Quản trị tài khoản nhân sự & người dùng** (`/api/admin/users` — `UC-60`, `UC-61`, `UC-62`, `BR-22`, `BR-24`).

> **Chuẩn bị trước khi test:**
> - Mở terminal tại thư mục `VCMOS_BE` và chạy server bằng lệnh `npm run dev` hoặc `npm start`.
> - Đảm bảo trong Database đã có sẵn 1 tài khoản mang `"role": "Admin"`.

---

## BƯỚC 1: Đăng nhập bằng tài khoản Admin có sẵn để lấy Token

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/login`
- **Body** (`raw` → `JSON`):
  ```json
  {
    "identifier": "<SĐT_hoặc_Email_Admin_của_bạn>",
    "password": "<Mật_khẩu_Admin_của_bạn>"
  }
  ```
- **Bấm Send**:
  - Kết quả trả về `200 OK`, trong đó `user.role` là `"Admin"`.
  - **Copy chuỗi `token`** trong phần response (không copy dấu ngoặc kép `"`).

> **Lưu ý cho mọi bước từ Bước 2 trở đi**: Ở mỗi tab request trên Postman, bạn vào mục **Authorization** → phần **Auth Type** chọn **Bearer Token** → dán chuỗi `token` vừa copy vào ô **Token**.

---

## BƯỚC 2: Tạo thử 1 tài khoản nhân sự mới (`UC-61` & `BR-24`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/admin/users`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "fullName": "BS Trần Minh",
    "phone": "0977111222",
    "email": "vet.minh@vcmos.vn",
    "password": "password123",
    "role": "Veterinarian"
  }
  ```
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ)**: Ra `201 Created`. Kiểm tra kết quả sẽ thấy hệ thống tự sinh mã `"code": "USR-..."`, `"status": "Active"`, và không có `passwordHash`.
     👉 **Hãy copy lại giá trị `"_id"` của nhân viên vừa tạo** để dùng cho Bước 4, 5, 6, 7.
  2. **Lần 2 (Trùng SĐT/Email)**: Bấm Send lần 2 giữ nguyên body → Phải ra `409 Conflict` (`"Số điện thoại đã được đăng ký"`).
  3. **Lần 3 (Sai vai trò nhân viên)**: Thử đổi `"role": "PetOwner"` rồi bấm Send → Phải ra `400 Bad Request` (`"Vai trò nhân viên chỉ được là Receptionist, Veterinarian hoặc Groomer"`).

---

## BƯỚC 3: Xem danh sách, lọc & tìm kiếm tài khoản (`UC-60`)

- **Method**: `GET`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Thử lần lượt các URL sau**:
  1. **Xem tất cả tài khoản**:
     ```
     http://localhost:9999/api/admin/users
     ```
     → Ra `200 OK` kèm mảng `users` (sắp xếp tài khoản mới nhất lên đầu).
  2. **Lọc theo vai trò Bác sĩ và đang hoạt động**:
     ```
     http://localhost:9999/api/admin/users?role=Veterinarian&status=Active
     ```
     → Chỉ hiện các bác sĩ đang `Active` (có BS Trần Minh vừa tạo).
  3. **Tìm kiếm theo SĐT, họ tên, email hoặc mã `USR-`**:
     ```
     http://localhost:9999/api/admin/users?search=0977111222
     ```
     → Ra đúng tài khoản BS Trần Minh.

---

## BƯỚC 4: Xem chi tiết 1 tài khoản (`SCR-32`)

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/admin/users/<dán_id_nhân_viên_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Bấm Send**:
  - Ra `200 OK` và thông tin chi tiết của nhân viên đó.
  - **Mẹo test thêm**: Nếu bạn lấy `_id` của một tài khoản `PetOwner` dán vào URL này, kết quả trả về sẽ có thêm mảng `"pets": [...]` chứa danh sách thú cưng của khách hàng đó.

---

## BƯỚC 5: Cập nhật thông tin & điều chuyển vai trò nhân sự (`SCR-32`)

- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/admin/users/<dán_id_nhân_viên_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "fullName": "Trần Minh (Chuyển sang Groomer)",
    "phone": "0977111222",
    "email": "minh.groomer@vcmos.vn",
    "role": "Groomer"
  }
  ```
- **Bấm Send**:
  - Ra `200 OK`, tên, email và `role` của nhân viên đã được cập nhật sang `"Groomer"`.

---

## BƯỚC 6: Khóa và Mở khóa tài khoản (`UC-62`)

- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/admin/users/<dán_id_nhân_viên_vừa_tạo>/status`
- **Authorization**: `Bearer Token` (dán token Admin)

### 1. Test Khóa tài khoản (`Locked`)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "status": "Locked"
  }
  ```
- **Bấm Send** → Ra `200 OK`, `"status": "Locked"`.
- **Kiểm chứng thực tế**: Quay lại tab Login (`POST http://localhost:9999/api/auth/login`), thử đăng nhập bằng SĐT `"0977111222"` và `"password": "password123"` → Hệ thống sẽ chặn ngay với lỗi `403 Forbidden` (`"Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên"`).

### 2. Test Mở khóa lại tài khoản (`Active`)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "status": "Active"
  }
  ```
- **Bấm Send** → Ra `200 OK`, `"status": "Active"`. Giờ tài khoản `0977111222` lại đăng nhập được bình thường.

### 3. Test chặn Admin tự khóa chính mình
- Thay `:id` trên URL bằng `_id` của chính tài khoản Admin đang đăng nhập, gửi `{"status": "Locked"}` → Phải ra `400 Bad Request` (`"Không thể tự khóa hoặc vô hiệu hóa tài khoản của chính mình"`).

---

## BƯỚC 7: Kiểm tra quy tắc cấm xóa vật lý (`BR-22`)

- **Method**: `DELETE`
- **URL**: `http://localhost:9999/api/admin/users/<dán_id_nhân_viên_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Bấm Send**:
  - Phải ra `403 Forbidden` với thông báo:
    ```json
    {
      "message": "Không được phép xóa vật lý tài khoản người dùng (BR-22). Vui lòng sử dụng chức năng khóa tài khoản"
    }
    ```
  - Kiểm tra lại Bước 4 (`GET /api/admin/users/:id`) vẫn thấy tài khoản còn nguyên trong Database.

