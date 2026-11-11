# Quy Trình Các Bước Test API Bác Sĩ & Groomer Tiếp Nhận Ca Khám & Giải Phóng Chuồng (SCR-22, SCR-26, SCR-24)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho luồng làm việc của **Bác sĩ thú y (`Veterinarian`)** và **Nhân viên Spa (`Groomer`)**:
1. **Xem hàng đợi dịch vụ / bệnh nhân được phân công cho mình** (`GET /api/appointment-services/my-queue`).
2. **Tra cứu vị trí chuồng lưu giữ của thú cưng theo đơn hẹn** (`GET /api/cage-assignments/order/:orderId`).
3. **Đón thú cưng và Giải phóng chuồng lưu giữ về trạng thái trống** (`PATCH /api/cage-assignments/:id/release`).

> **Chuẩn bị trước khi test:**
> - Chạy server tại thư mục `VCMOS_BE` (`npm run dev`).
> - Cần có **1 tài khoản `Veterinarian`** (hoặc `Groomer`) và **1 tài khoản `Receptionist`**.

---

## BƯỚC 1: Chuẩn bị dữ liệu (Tạo ca khám, phân công Bác sĩ và Xếp chuồng)

Để Bác sĩ có bệnh nhân trong hàng đợi và có chuồng để đón thú cưng, chúng ta cần chuẩn bị 1 ca khám đã được Lễ tân tiếp nhận và xếp chuồng:

1. **Đăng nhập tài khoản `Veterinarian` (Bác sĩ thú y)**:
   - `POST http://localhost:9999/api/auth/login`
   - Body: `{"identifier": "0901000003", "password": "password123"}` (hoặc tài khoản bác sĩ của phòng khám).
   - Copy `token` lưu lại làm **`<TOKEN_VET>`**, đồng thời copy `user._id` làm **`<VET_ID>`**.
2. **Đăng nhập tài khoản `Receptionist` (Lễ tân)**:
   - `POST http://localhost:9999/api/auth/login`
   - Body: `{"identifier": "0901000001", "password": "password123"}`.
   - Copy `token` lưu lại làm **`<TOKEN_RECEPTIONIST>`**.
3. **Lễ tân tạo 1 ca khám tại quầy (Walk-in), phân công Bác sĩ và gán chuồng**:
   - `POST http://localhost:9999/api/appointment-orders/walk-in`
   - Header: `Authorization: Bearer <TOKEN_RECEPTIONIST>`
   - Body (`JSON`):
     ```json
     {
       "phone": "0977888999",
       "fullName": "Nguyễn Văn Khách Test",
       "petInfo": {
         "name": "Bé Corgi Vàng",
         "species": "Chó",
         "breed": "Corgi",
         "weight": 8.5
       },
       "note": "Khách đưa bé đến khám da liễu",
       "services": [
         {
           "serviceId": "<id_dịch_vụ_khám>",
           "assignedStaffId": "<dán_VET_ID_của_Bác_sĩ>",
           "isEmergency": false
         }
       ],
       "cageId": "<id_chuồng_đang_Available>"
     }
     ```
   - **Bấm Send**: Ra `201 Created`.
   - 👉 **Lưu lại các thông tin trả về**:
     - `data.appointment._id` làm **`<ORDER_ID>`** (Mã đơn hẹn).
     - `data.cageAssignment._id` làm **`<ASSIGNMENT_ID>`** (Mã phân công chuồng).
     - Dịch vụ này đã có `"status": "Waiting"` và được cấp `"queueNo"`.

---

## BƯỚC 2: Bác sĩ xem hàng đợi làm việc của mình (`GET /api/appointment-services/my-queue`)

Bác sĩ đăng nhập vào hệ thống, mở màn hình **Hàng đợi khám bệnh (`SCR-22`)** để xem danh sách các ca bệnh đang chờ mình khám.

- **Method**: `GET`
- **URL**:
  ```
  http://localhost:9999/api/appointment-services/my-queue?status=Waiting
  ```
- **Authorization**: `Bearer Token` (dán **`<TOKEN_VET>`**)
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ — Xem các ca đang chờ `Waiting`)**:
     - Ra `200 OK` (`"message": "Lấy danh sách dịch vụ của nhân viên thành công"`).
     - Trong `data`: Danh sách các ca dịch vụ được phân công cho chính Bác sĩ này, được sắp xếp tự động theo số thứ tự hàng đợi (`queueNo`).
     - Mỗi phần tử hiển thị chi tiết:
       - `orderId`: Chứa thông tin đơn hẹn (`code: "APT-..."`, `derivedStatus: "CheckedIn"`), thông tin thú cưng và chủ nuôi.
       - `serviceId`: Tên dịch vụ khám, thời lượng dự kiến.
       - `queueNo`: Số thứ tự hàng đợi (1, 2, ...).
       - `isEmergency`: Cờ cấp cứu (`true`/`false`).
       - `status`: `"Waiting"`.
  2. **Lần 2 (Xem tất cả các trạng thái hoặc lọc theo trạng thái khác)**:
     - Thử bỏ `?status=...` (xem toàn bộ) hoặc đổi thành `?status=InProgress` / `?status=Done`.
  3. **Lần 3 (Truyền trạng thái không hợp lệ)**:
     - Thử `?status=InvalidStatus` → Ra `400 Bad Request` (`"status phải là một trong: Booked, Waiting, InProgress, Done, Cancelled, Overdue"`).
  4. **Lần 4 (Kiểm tra phân quyền)**:
     - Dùng `<TOKEN_RECEPTIONIST>` gọi vào API này → Ra `403 Forbidden` (`"Bạn không có quyền thực hiện chức năng này"` — chỉ `Veterinarian` hoặc `Groomer` mới có hàng đợi chuyên môn riêng).

---

## BƯỚC 3: Bác sĩ tra cứu vị trí chuồng của thú cưng theo đơn hẹn (`GET /api/cage-assignments/order/:orderId`)

Khi Bác sĩ chọn 1 ca khám từ hàng đợi, Bác sĩ cần biết bé thú cưng đó hiện đang nằm ở chuồng nào để đến đón vào phòng khám.

- **Method**: `GET`
- **URL**:
  ```
  http://localhost:9999/api/cage-assignments/order/<ORDER_ID>
  ```
- **Authorization**: `Bearer Token` (dán **`<TOKEN_VET>`**)
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Đơn hẹn có xếp chuồng lưu giữ)**:
     - Ra `200 OK` (`"message": "Lấy thông tin phân công chuồng của đơn hẹn thành công"`).
     - Trong `data`:
       - `_id`: ID của bản ghi phân công chuồng.
       - `cageId`: Chi tiết chuồng (`label: "A-101"`, `size: "M"`, `"status": "Occupied"`).
       - `releasedAt`: `null` (thú cưng vẫn đang nằm trong chuồng).
       - `assignedById`: Thông tin Lễ tân đã xếp chuồng.
     👉 Bác sĩ biết ngay bé đang ở chuồng nhãn nào để ra đón!
  2. **Lần 2 (Đơn hẹn KHÔNG xếp chuồng — khách bế thú cưng ngồi chờ ngoài sảnh)**:
     - Thử truyền ID của 1 đơn hẹn không gán chuồng → Ra `404 Not Found` (`"Đơn hẹn này chưa có phân công chuồng đang hoạt động"`).
  3. **Lần 3 (Truyền ID sai định dạng)**:
     - Thử `/order/12345` → Ra `400 Bad Request` (`"ID đơn hẹn không hợp lệ"`).

---

## BƯỚC 4: Bác sĩ đón thú cưng ra khám & Giải phóng chuồng (`PATCH /api/cage-assignments/:id/release`)

Sau khi Bác sĩ ra chuồng đón thú cưng vào phòng khám (hoặc khi kết thúc dịch vụ), Bác sĩ bấm **"Giải phóng chuồng"** để chuồng trở lại trạng thái trống (`Available`), sẵn sàng đón thú cưng khác.

- **Method**: `PATCH`
- **URL**:
  ```
  http://localhost:9999/api/cage-assignments/<ASSIGNMENT_ID>/release
  ```
- **Authorization**: `Bearer Token` (dán **`<TOKEN_VET>`**)
- **Body**: Không cần body (`none`)
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Giải phóng chuồng thành công)**:
     - Ra `200 OK` (`"message": "Giải phóng chuồng thành công"`).
     - Trong `data`:
       - `releasedAt`: Đã được cập nhật thời gian thực tế (`"2026-11-10T..."`).
       - `cageId.status`: Đã tự động chuyển về **`"Available"`** (trống).
  2. **Lần 2 (Chống giải phóng 2 lần)**:
     - Bấm Send lại một lần nữa vào đúng `<ASSIGNMENT_ID>` đó → Phải ra `409 Conflict` (`"Phân công chuồng này đã được giải phóng trước đó"`).
  3. **Lần 3 (Truyền ID không tồn tại)**:
     - Thử thay bằng 1 ObjectId ngẫu nhiên → Ra `404 Not Found` (`"Không tìm thấy phân công chuồng"`).

---

## BƯỚC 5: Bác sĩ bắt đầu ca khám, Ghi bệnh án chuẩn SOAP, Kê đơn thuốc & Hoàn tất ca khám (`/api/medical-records`)

Sau khi biết thú cưng đang ở chuồng nào, Bác sĩ có thể bấm **"Bắt đầu khám"** để hệ thống tự động giải phóng chuồng chờ, chuyển ca khám sang `InProgress` và mở màn hình ghi bệnh án chuẩn SOAP (`SCR-18`):

1. **Bắt đầu ca khám (`POST /api/medical-records/service/<SERVICE_ITEM_ID>/start`)**:
   - Header: `Authorization: Bearer <TOKEN_VET>`
   - Hệ thống kiểm tra thứ tự dịch vụ (`BR-12`), tự động giải phóng chuồng chờ của đơn hẹn (`BR-10`), chuyển dịch vụ sang `InProgress` và tạo bản nháp `MedicalRecord` (`Draft`).
2. **Xem tiền sử bệnh lý của thú cưng (`GET /api/medical-records/pet/<PET_ID>`)**:
   - Header: `Authorization: Bearer <TOKEN_VET>`
   - Mở ngăn kéo Lịch sử bệnh án (`UC-32`) để xem các lần khám trước của bé.
3. **Lưu nháp bệnh án SOAP, cập nhật cân nặng & kê đơn thuốc (`PUT /api/medical-records/service/<SERVICE_ITEM_ID>`)**:
   - Header: `Authorization: Bearer <TOKEN_VET>`
   - Body (`JSON`):
     ```json
     {
       "subjectiveNote": "Bỏ ăn 2 ngày, nôn khan buổi sáng",
       "objectiveNote": "Nhiệt độ 39.2 độ C, niêm mạc hồng nhạt",
       "assessment": "Viêm dạ dày ruột cấp nhẹ",
       "plan": "Uống kháng sinh 5 ngày, tái khám sau 1 tuần",
       "weight": 9.2,
       "prescriptions": [
         {
           "productId": "<id_thuốc_Active>",
           "dosage": "1 viên",
           "frequency": "2 lần/ngày sau ăn",
           "instructions": "Trộn thức ăn mềm",
           "durationDays": 5
         }
       ]
     }
     ```
   - Hệ thống tự động cập nhật cân nặng mới (`9.2 kg`) vào hồ sơ thú cưng (`Pet.weight`) và kiểm tra thuốc kê đơn phải đang Còn hàng (`Active` - `BR-16`).
4. **Hoàn tất bệnh án SOAP & Kết thúc ca khám (`POST /api/medical-records/service/<SERVICE_ITEM_ID>/complete`)**:
   - Trước khi bấm hoàn tất, Bác sĩ có thể gọi `GET /api/cages?status=Available` bằng `<TOKEN_VET>` để lấy danh sách chuồng trống hiển thị vào dropdown chọn chuồng chờ đón (`waitingCageId`).
   - Header: `Authorization: Bearer <TOKEN_VET>`
   - Body (`JSON`): `{ "waitingCageId": "<id_chuồng_chờ_đón_nếu_cần>" }`
   - Hệ thống kiểm tra đủ 4 trường **S - O - A - P** (`BR-13`), chặn nếu còn Sub-task cận lâm sàng chưa xong (`MSG26`), giữ bệnh án ở trạng thái **`Draft`** chờ thanh toán hóa đơn mới khóa `Finalized` (`BR-14`), chuyển dịch vụ sang **`Done`**, kiểm tra tải trọng chuồng chờ (`BR-11`), và tự động chuyển đơn hẹn sang **`WaitOwner`** (Chờ chủ đón) nếu tất cả dịch vụ trong đơn đã hoàn tất (`BR-09`).


