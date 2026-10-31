# Quy Trình Các Bước Test API Quản Lý Danh Mục Dịch Vụ (SCR-29 & SCR-02)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho **Module 2: Quản lý danh mục dịch vụ & Xem bảng giá dịch vụ công khai** (`/api/services` — `UC-66`, `UC-01`, `BR-24`, `BR-16`).

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

> **Lưu ý về phân quyền (Permission Matrix)**:
> - Các API **thêm mới (`POST`)**, **cập nhật (`PUT`)**, **đổi trạng thái (`PATCH`)**, **xóa (`DELETE`)** bắt buộc phải gắn **Bearer Token** của `Admin`.
> - Các API **xem danh sách (`GET /api/services`)** và **xem chi tiết (`GET /api/services/:id`)** là **Công khai (Public)** — không cần gắn token vẫn gọi được bình thường (dùng cho cả màn hình khách vãng lai `SCR-02`, đặt lịch `SCR-12` và trang Admin `SCR-29`).

---

## BƯỚC 2: Tạo thử 1 dịch vụ mới (`UC-66` & `BR-24`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/services`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "name": "Khám tổng quát chuyên sâu",
    "category": "Examination",
    "defaultDuration": 30,
    "basePrice": 150000,
    "description": "Khám lâm sàng toàn diện, đo thân nhiệt, nghe tim phổi cho thú cưng"
  }
  ```
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ)**: Ra `201 Created`. Kiểm tra kết quả sẽ thấy hệ thống tự sinh mã `"code": "SRV-..."` (6 ký tự chữ hoa & số theo `BR-24`), `"status": "Active"`.
     👉 **Hãy copy lại giá trị `"_id"` của dịch vụ vừa tạo** để dùng cho Bước 4, 5, 6, 7.
  2. **Lần 2 (Trùng tên trong cùng danh mục)**: Bấm Send lần 2 giữ nguyên body (hoặc đổi chữ hoa/thường như `"khám tổng quát chuyên sâu"`) → Phải ra `409 Conflict` (`"Tên dịch vụ đã tồn tại trong danh mục này"`).
  3. **Lần 3 (Sai thời lượng `defaultDuration`)**: Thử đổi `"defaultDuration": 600` (vượt quá 480 phút) hoặc `"defaultDuration": 2` (nhỏ hơn 5 phút) rồi bấm Send → Phải ra `400 Bad Request` (`"Thời lượng thực hiện phải là số nguyên từ 5 đến 480 phút"`).
  4. **Lần 4 (Sai danh mục `category`)**: Thử đổi `"category": "Spa"` rồi bấm Send → Phải ra `400 Bad Request` (`"Danh mục dịch vụ không hợp lệ"`).
     *(Lưu ý: Hệ thống chỉ nhận 5 danh mục chuẩn trong SRS: `Examination`, `Vaccination`, `Grooming`, `Paraclinical`, `Inpatient`)*.

---

## BƯỚC 3: Xem danh sách, lọc & tìm kiếm dịch vụ (`UC-01` & `UC-66`)

- **Method**: `GET`
- **Authorization**: Chọn **No Auth** (test quyền khách vãng lai xem bảng giá `SCR-02`) hoặc để nguyên `Bearer Token` đều được.
- **Thử lần lượt các URL sau**:
  1. **Xem tất cả dịch vụ (dùng cho bảng quản trị Admin `SCR-29`)**:
     ```
     http://localhost:9999/api/services
     ```
     → Ra `200 OK` kèm mảng `services` (sắp xếp dịch vụ mới tạo lên đầu).
  2. **Lọc theo danh mục và chỉ lấy dịch vụ đang hoạt động (dùng cho khách hàng đặt lịch `SCR-02` / `SCR-12`)**:
     ```
     http://localhost:9999/api/services?category=Examination&status=Active
     ```
     → Chỉ hiện các dịch vụ thuộc nhóm `Examination` và có `"status": "Active"`.
  3. **Tìm kiếm theo tên dịch vụ, mã `SRV-` hoặc mô tả**:
     ```
     http://localhost:9999/api/services?search=chuyên sâu
     ```
     → Ra đúng dịch vụ `"Khám tổng quát chuyên sâu"` vừa tạo.

---

## BƯỚC 4: Xem chi tiết 1 dịch vụ theo ID

- **Method**: `GET`
- **URL**: `http://localhost:9999/api/services/<dán_id_dịch_vụ_vừa_tạo>`
- **Authorization**: `No Auth` (hoặc `Bearer Token`)
- **Bấm Send**:
  - Ra `200 OK` và object `service` chứa đầy đủ thông tin chi tiết của dịch vụ đó.

---

## BƯỚC 5: Cập nhật thông tin dịch vụ (`UC-66` & `SCR-29`)

- **Method**: `PUT`
- **URL**: `http://localhost:9999/api/services/<dán_id_dịch_vụ_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "name": "Khám tổng quát chuyên sâu (Gói tiêu chuẩn)",
    "category": "Examination",
    "defaultDuration": 45,
    "basePrice": 180000,
    "description": "Cập nhật thời lượng 45 phút và giá niêm yết mới"
  }
  ```
- **Bấm Send**:
  - Ra `200 OK`. Tên dịch vụ, thời lượng (`45`), giá cơ bản (`180000`) và mô tả đã được cập nhật, trong khi mã `"code": "SRV-..."` được giữ nguyên bất biến.

---

## BƯỚC 6: Tạm ngưng (`Inactive`) và Kích hoạt lại (`Active`) dịch vụ (`UC-66`)

- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/services/<dán_id_dịch_vụ_vừa_tạo>/status`
- **Authorization**: `Bearer Token` (dán token Admin)

### 1. Test Tạm ngưng dịch vụ (`Inactive`)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "status": "Inactive"
  }
  ```
- **Bấm Send** → Ra `200 OK`, `"status": "Inactive"`.
- **Kiểm chứng thực tế**: Quay lại tab `GET http://localhost:9999/api/services?status=Active` (API khách hàng xem để đặt lịch) → Dịch vụ vừa tạm ngưng sẽ biến mất khỏi danh sách đặt lịch mới, nhưng gọi `GET http://localhost:9999/api/services` (không lọc `status`) ở trang Admin vẫn thấy dịch vụ đó với trạng thái `Inactive`.

### 2. Test Kích hoạt lại dịch vụ (`Active`)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "status": "Active"
  }
  ```
- **Bấm Send** → Ra `200 OK`, `"status": "Active"`. Dịch vụ xuất hiện trở lại trên danh sách `status=Active`.

### 3. Test truyền trạng thái không hợp lệ
- Thử gửi `{"status": "Deleted"}` → Phải ra `400 Bad Request` (`"Trạng thái dịch vụ chỉ được là Active hoặc Inactive"`).

---

## BƯỚC 7: Kiểm tra quy tắc cấm xóa vật lý dịch vụ (`SCR-29` & `BR-16`)

- **Method**: `DELETE`
- **URL**: `http://localhost:9999/api/services/<dán_id_dịch_vụ_vừa_tạo>`
- **Authorization**: `Bearer Token` (dán token Admin)
- **Bấm Send**:
  - Phải ra `403 Forbidden` với thông báo:
    ```json
    {
      "message": "Không được phép xóa vật lý dịch vụ để bảo toàn lịch sử đơn hẹn và hóa đơn. Vui lòng chuyển trạng thái sang Inactive"
    }
    ```
  - Kiểm tra lại Bước 4 (`GET /api/services/:id`) vẫn thấy dịch vụ còn nguyên trong Database.

