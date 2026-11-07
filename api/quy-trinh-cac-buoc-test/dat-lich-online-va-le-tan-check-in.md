# Quy Trình Các Bước Test API Đặt Lịch Online & Lễ Tân Check-in (SCR-12, SCR-14, SCR-16)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho luồng cốt lõi từ lúc **Khách hàng (`PetOwner`) đặt lịch hẹn online** cho đến khi **Lễ tân (`Receptionist`) tiếp nhận và bấm Check-in tại phòng khám**.

> **Chuẩn bị trước khi test:**
> - Chạy server tại thư mục `VCMOS_BE` (`npm run dev`).
> - Cần có **1 tài khoản `PetOwner`** và **1 tài khoản `Receptionist`**.

---

## BƯỚC 1: Chuẩn bị dữ liệu (Token PetOwner, Pet ID và Service ID)

1. **Đăng nhập tài khoản `PetOwner`**:
   - `POST http://localhost:9999/api/auth/login` với tài khoản chủ thú cưng → Copy `token` làm **`<TOKEN_OWNER>`**.
2. **Lấy `_id` thú cưng của `PetOwner`**:
   - Gọi `GET http://localhost:9999/api/pets` (gắn Bearer `<TOKEN_OWNER>`).
   - Nếu chưa có thú cưng thì gọi `POST http://localhost:9999/api/pets` tạo 1 bé.
   - Copy `"_id"` của thú cưng làm **`<PET_ID>`**.
3. **Lấy `_id` của dịch vụ đang hoạt động (`Active`)**:
   - Gọi `GET http://localhost:9999/api/services?status=Active`.
   - Copy `"_id"` của 1 hoặc 2 dịch vụ làm **`<SERVICE_ID_1>`**, **`<SERVICE_ID_2>`**.
4. **(Tùy chọn) Xem danh sách Bác sĩ / Groomer đang hoạt động**:
   - Gọi `GET http://localhost:9999/api/users/staff?role=Veterinarian` (gắn Bearer `<TOKEN_OWNER>`).
   - Trả về `200 OK` gồm danh sách các bác sĩ đang `Active` để hiển thị trên màn hình chọn nhân viên.

---

## BƯỚC 2: Khách hàng (`PetOwner`) đặt lịch hẹn Online kèm danh sách dịch vụ (`SCR-12`)

> **Lưu ý**: Hệ thống hỗ trợ 2 cách đặt lịch:
> - **Cách khuyên dùng (Trọn gói 1 bước)**: Gọi `POST /api/appointment-services/online-booking` để tạo luôn cả đơn hẹn (`AppointmentOrder`) và các dịch vụ đi kèm (`AppointmentService`). Nếu có lỗi ở bất kỳ dịch vụ nào, hệ thống tự động xoá hoàn tác đơn hẹn để không bị dữ liệu rác.
> - **Cách tách 2 bước**: Gọi `POST /api/appointment-orders/online` tạo vỏ đơn hẹn trước, rồi gọi `POST /api/appointment-services/online` để thêm từng dịch vụ vào đơn.

### Test Cách 1 (Trọn gói — Khuyên dùng):
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/appointment-services/online-booking`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_OWNER>`**)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "petId": "<dán_PET_ID>",
    "date": "2026-11-15",
    "note": "Bé hơi nhát người lạ, nhờ bác sĩ khám nhẹ nhàng",
    "services": [
      {
        "serviceId": "<dán_SERVICE_ID_1>"
      }
    ]
  }
  ```
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ)**:
     - Ra `201 Created` (`"message": "Đặt lịch online thành công"`).
     - Trong `data.appointment`: Tự sinh mã `"code": "APT-..."`, `"isOnline": true`, `"derivedStatus": "Booked"`, `"checkedInAt": null`.
     - Trong `data.services`: Danh sách dịch vụ được đánh số thứ tự `"sequenceNo": 1`, `"status": "Booked"`.
     - *(Đồng thời hệ thống tự động gửi email thông báo có lịch hẹn mới tới tất cả Lễ tân đang Active)*.
     👉 **Hãy copy lại `data.appointment._id`** (gọi là **`<ORDER_ID>`**) để dùng cho các bước tiếp theo.
  2. **Lần 2 (Chống đặt trùng lịch cho cùng 1 thú cưng trong cùng 1 ngày)**:
     - Bấm Send lần nữa giữ nguyên `petId` và `date: "2026-11-15"` → Phải ra `409 Conflict` (`"Thú cưng này đã có lịch hẹn trong ngày đã chọn"`).
  3. **Lần 3 (Truyền ngày không tồn tại trên lịch)**:
     - Đổi `"date": "2026-02-30"` → Ra `400 Bad Request` (`"date phải có định dạng YYYY-MM-DD và là ngày hợp lệ"`).

---

## BƯỚC 3: Khách hàng (`PetOwner`) xem lại lịch hẹn Online của mình (`SCR-14`)

- **Method**: `GET`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_OWNER>`**)
- **Thử lần lượt 2 URL sau**:
  1. **Xem danh sách lịch hẹn của tôi (có lọc & phân trang)**:
     ```
     http://localhost:9999/api/appointment-orders/me?status=Booked&from=2026-11-01&to=2026-11-30&page=1&limit=10
     ```
     → Ra `200 OK` gồm `data` (danh sách đơn hẹn của chính chủ) và `pagination`.
  2. **Xem chi tiết 1 lịch hẹn kèm danh sách dịch vụ bên trong**:
     ```
     http://localhost:9999/api/appointment-orders/me/<ORDER_ID>
     ```
     → Ra `200 OK`, trả về thông tin đơn hẹn kèm mảng `"services": [...]` đã populate chi tiết tên dịch vụ, giá tiền.

---

## BƯỚC 4: Lễ tân (`Receptionist`) hoặc `Admin` tra cứu toàn bộ lịch hẹn (`SCR-16`)

1. **Đăng nhập tài khoản `Receptionist`**:
   - `POST http://localhost:9999/api/auth/login` với tài khoản Lễ tân → Copy `token` làm **`<TOKEN_RECEPTIONIST>`**.
2. **Xem danh sách tất cả lịch hẹn tại phòng khám**:
   - **Method**: `GET`
   - **URL**:
     ```
     http://localhost:9999/api/appointment-orders?status=Booked&isOnline=true&from=2026-11-01&to=2026-11-30
     ```
     *(Có thể lọc thêm theo `?code=APT-...`, `?ownerId=...`, `?petId=...`)*
   - **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`**)
   - **Bấm Send**:
     - Ra `200 OK`. Mỗi đơn hẹn đã được populate sẵn tên thú cưng (`petId.name`) và họ tên + SĐT chủ nuôi (`ownerId.fullName`, `ownerId.phone`) để Lễ tân đối chiếu khi khách tới quầy.

---

## BƯỚC 5: Lễ tân (`Receptionist`) bấm Check-in khi khách đến phòng khám (`SCR-16`)

- **Method**: `PATCH`
- **URL**: `http://localhost:9999/api/appointment-orders/<ORDER_ID>/check-in`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`** — chỉ `Receptionist` mới được quyền check-in)
- **Body**: Không cần
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Khi đơn đang ở trạng thái `Booked`)**:
     - Ra `200 OK` (`"message": "Check-in thành công"`).
     - Kiểm tra `data`: `"derivedStatus"` đã chuyển sang **`"CheckedIn"`** và `"checkedInAt"` được ghi nhận đúng thời gian thực tế khách đến.
  2. **Lần 2 (Chống Check-in trùng 2 lần)**:
     - Bấm Send thêm lần nữa vào cùng `<ORDER_ID>` đó → Phải ra `409 Conflict` (`"Không thể check-in lịch hẹn đang ở trạng thái \"CheckedIn\""`).
  3. **Lần 3 (Kiểm tra phân quyền)**:
     - Thử thay bằng `<TOKEN_OWNER>` rồi bấm Send → Phải ra `403 Forbidden` (`"Bạn không có quyền thực hiện chức năng này"`).

