# Quy Trình Các Bước Test API Quản Lý Chuồng & Phân Công Chuồng (SCR-30 & SCR-23)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho 2 luồng liên kết chặt chẽ với nhau:
1. **Admin quản lý danh mục chuồng nuôi** (`/api/cages` — `SCR-30`, `UC-68`).
2. **Lễ tân (`Receptionist`) xếp thú cưng vào chuồng trống** (`/api/cage-assignments` — `SCR-23`).

> **Chuẩn bị trước khi test:**
> - Chạy server tại thư mục `VCMOS_BE` (`npm run dev`).
> - Cần có **1 tài khoản `Admin`** (để tạo/sửa chuồng) và **1 tài khoản `Receptionist`** (để phân công chuồng).
> - Cần có sẵn **1 đơn lịch hẹn (`AppointmentOrder`)** để lấy `_id` gán vào chuồng.

---

## BƯỚC 1: Đăng nhập lấy Token của Admin và Receptionist

1. **Lấy Token Admin**:
   - `POST http://localhost:9999/api/auth/login` với tài khoản `Admin` → Copy `token` lưu lại làm **`<TOKEN_ADMIN>`**.
2. **Lấy Token Receptionist**:
   - `POST http://localhost:9999/api/auth/login` với tài khoản `Receptionist` (nếu chưa có thì dùng `<TOKEN_ADMIN>` gọi `POST /api/admin/users` tạo 1 Lễ tân) → Copy `token` lưu lại làm **`<TOKEN_RECEPTIONIST>`**.

---

## BƯỚC 2: Admin tạo chuồng nuôi mới (`POST /api/cages` — `SCR-30`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/cages`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_ADMIN>`**)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "label": "A-101",
    "size": "M",
    "isIsolated": false
  }
  ```
  *(Lưu ý: `size` nhận `S`, `M`, `L`, `XL`; `isIsolated` là `true`/`false`; `status` mặc định là `"Available"`).*
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ)**: Ra `201 Created` (`"message": "Tạo chuồng thành công"`, `"status": "Available"`).
     👉 **Hãy copy lại giá trị `"_id"` của chuồng vừa tạo** (gọi là **`<CAGE_ID>`**).
  2. **Lần 2 (Trùng nhãn chuồng `label`)**: Bấm Send lại giữ nguyên `"label": "A-101"` → Ra `409 Conflict` (`"Nhãn chuồng đã tồn tại"`).
  3. **Lần 3 (Sai kích thước)**: Đổi `"size": "XXL"` → Ra `400 Bad Request` (`"Kích thước chuồng phải là một trong: S, M, L, XL"`).

---

## BƯỚC 3: Xem danh sách & lọc chuồng (`GET /api/cages` — Admin hoặc Receptionist)

- **Method**: `GET`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_ADMIN>`** hoặc **`<TOKEN_RECEPTIONIST>`** đều được)
- **Thử lần lượt các URL sau**:
  1. **Xem tất cả chuồng**:
     ```
     http://localhost:9999/api/cages
     ```
  2. **Lễ tân lọc các chuồng đang trống (`Available`) cỡ `M` và không cách ly**:
     ```
     http://localhost:9999/api/cages?status=Available&size=M&isIsolated=false
     ```
  3. **Xem chi tiết 1 chuồng theo ID**:
     ```
     http://localhost:9999/api/cages/<CAGE_ID>
     ```

---

## BƯỚC 4: Admin cập nhật thông tin chuồng (`PATCH /api/cages/:id`)

- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/cages/<CAGE_ID>`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_ADMIN>`**)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "size": "L",
    "isIsolated": true
  }
  ```
- **Bấm Send**:
  - Ra `200 OK` (`"message": "Cập nhật chuồng thành công"`), kích thước chuồng đổi sang `"L"` và `"isIsolated": true`.

---

## BƯỚC 5: Lễ tân xếp chuồng cho đơn lịch hẹn (`POST /api/cage-assignments`)

> **Mục đích**: Khi thú cưng cần lưu chuồng / nội trú theo đơn hẹn (`orderId`), Lễ tân chọn 1 chuồng đang `Available` để gán cho đơn hẹn đó. Hệ thống sẽ tự động đổi trạng thái chuồng sang `Occupied`.

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/cage-assignments`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`** — lưu ý API này chỉ cho phép role `Receptionist`)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "cageId": "<dán_CAGE_ID_ở_Bước_2>",
    "orderId": "<dán_id_của_1_đơn_lịch_hẹn_AppointmentOrder>"
  }
  ```
  *(Trường `assignedById` tự động lấy từ token của Lễ tân đang đăng nhập).*
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Chuồng đang `Available`)**: Ra `201 Created` (`"message": "Phân công chuồng thành công"`). Kết quả trả về đã populate đầy đủ thông tin `cageId` (với `"status": "Occupied"`), `orderId` và `assignedById`.
     👉 **Hãy copy lại `"_id"` của bản ghi phân công chuồng** (gọi là **`<ASSIGNMENT_ID>`**).
  2. **Lần 2 (Gán tiếp vào chuồng đã có thú cưng `Occupied`)**: Bấm Send lần nữa với cùng `cageId` đó → Phải ra `409 Conflict` (`"Chuồng không ở trạng thái trống (Available)"`).

---

## BƯỚC 6: Lễ tân xem danh sách & chi tiết phân công chuồng (`GET /api/cage-assignments`)

- **Method**: `GET`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`**)
- **Thử lần lượt các URL sau**:
  1. **Xem tất cả lượt phân công chuồng**:
     ```
     http://localhost:9999/api/cage-assignments
     ```
  2. **Chỉ lọc các chuồng đang có thú nằm (`active=true`, tức `releasedAt = null`)**:
     ```
     http://localhost:9999/api/cage-assignments?active=true
     ```
  3. **Lọc theo mã chuồng hoặc mã đơn hẹn**:
     ```
     http://localhost:9999/api/cage-assignments?cageId=<CAGE_ID>
     ```
  4. **Xem chi tiết 1 lượt phân công chuồng**:
     ```
     http://localhost:9999/api/cage-assignments/<ASSIGNMENT_ID>
     ```

