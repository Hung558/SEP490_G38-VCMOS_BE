# Quy Trình Các Bước Test API Quản Lý Sản Phẩm, Thuốc & Vật Tư (SCR-31 — Role Admin)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho **Module Quản lý danh mục sản phẩm, thuốc & vắc-xin** (`/api/products` — `SCR-31`, `UC-67`, `BR-24`).

> **Chuẩn bị trước khi test:**
> - Mở terminal tại thư mục `VCMOS_BE` và chạy server bằng lệnh `npm run dev` hoặc `npm start`.
> - Đảm bảo trong Database đã có sẵn 1 tài khoản mang `"role": "Admin"`.

---

## BƯỚC 1: Đăng nhập bằng tài khoản Admin để lấy Token

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
  - **Copy chuỗi `token`** trong phần response.

> **Lưu ý về phân quyền**:
> - Xem danh sách (`GET /api/products`) và xem chi tiết (`GET /api/products/:id`) là **Công khai (Public)** — không cần gắn token.
> - Thêm mới (`POST`), cập nhật (`PUT`), kích hoạt (`PATCH /:id/activate`), ngưng hoạt động (`PATCH /:id/inactivate`) bắt buộc gắn **Bearer Token** của `Admin`.

---

## BƯỚC 2: Tạo thử 1 sản phẩm / thuốc mới (`UC-67` & `BR-24`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/products`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "name": "Amoxicillin 250mg",
    "category": "Medicine",
    "unit": "Viên",
    "unitPrice": 5000
  }
  ```
  *(Lưu ý: Không được truyền `code` hoặc `status` vào body vì server tự sinh `code` và tự gán `status = "Active"`; nếu truyền vào sẽ bị báo lỗi `400`).*
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ)**: Ra `201 Created`. Kết quả trả về trong `data` có mã tự sinh `"code": "PRD-..."`, `"status": "Active"`.
     👉 **Hãy copy lại giá trị `"_id"` của sản phẩm vừa tạo** để dùng cho Bước 4, 5, 6.
  2. **Lần 2 (Trùng tên + đơn vị tính)**: Bấm Send lần 2 giữ nguyên `"name": "Amoxicillin 250mg"` và `"unit": "Viên"` → Phải ra `409 Conflict` (`"Sản phẩm với cùng tên và đơn vị tính đã tồn tại"`).
  3. **Lần 3 (Cùng tên nhưng khác đơn vị tính)**: Đổi `"unit": "Hộp"`, `"unitPrice": 90000` rồi bấm Send → Ra `201 Created` (Vì sản phẩm phân biệt theo cặp `{ name, unit }`).
  4. **Lần 4 (Sai danh mục `category`)**: Thử đổi `"category": "Food"` → Ra `400 Bad Request` (Danh mục chỉ nhận `Medicine`, `Vaccine`, `Retail`).

---

## BƯỚC 3: Xem danh sách, lọc, tìm kiếm & phân trang sản phẩm

- **Method**: `GET`
- **Authorization**: `No Auth` (hoặc `Bearer Token`)
- **Thử lần lượt các URL sau**:
  1. **Xem tất cả sản phẩm (có phân trang mặc định `page=1&limit=20`)**:
     ```
     http://localhost:9999/api/products
     ```
     → Ra `200 OK` kèm `data: { items, total, page, limit, totalPages }`.
  2. **Lọc theo loại sản phẩm và trạng thái**:
     ```
     http://localhost:9999/api/products?category=Medicine&status=Active
     ```
  3. **Tìm kiếm theo tên hoặc mã `PRD-`**:
     ```
     http://localhost:9999/api/products?search=Amoxicillin&page=1&limit=10
     ```

---

## BƯỚC 4: Xem chi tiết 1 sản phẩm theo ID

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/products/<dán_id_sản_phẩm_vừa_tạo>`
- **Authorization**: `No Auth`
- **Bấm Send**:
  - Ra `200 OK` và thông tin chi tiết sản phẩm trong `data`.

---

## BƯỚC 5: Cập nhật thông tin sản phẩm (`UC-67`)

- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/products/<dán_id_sản_phẩm_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON` — cho phép gửi 1 hoặc nhiều trường cần sửa):
  ```json
  {
    "name": "Amoxicillin 250mg (Nhập khẩu)",
    "unitPrice": 6500
  }
  ```
- **Bấm Send**:
  - Ra `200 OK`, tên và đơn giá đã được cập nhật, mã `PRD-XXXXXX` giữ nguyên.

---

## BƯỚC 6: Tạm ngưng (`inactivate`) và Kích hoạt lại (`activate`) sản phẩm

### 1. Tạm ngưng sản phẩm (`Inactive`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/products/<dán_id_sản_phẩm_vừa_tạo>/inactivate`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body**: Không cần
- **Bấm Send** → Ra `200 OK`, `data.status` chuyển thành `"Inactive"`.

### 2. Kích hoạt lại sản phẩm (`Active`)
- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/products/<dán_id_sản_phẩm_vừa_tạo>/activate`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body**: Không cần
- **Bấm Send** → Ra `200 OK`, `data.status` chuyển lại thành `"Active"`.

