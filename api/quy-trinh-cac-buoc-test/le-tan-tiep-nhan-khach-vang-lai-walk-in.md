# Quy Trình Các Bước Test API Tiếp Nhận Khách Vãng Lai Tại Quầy (Walk-in & BR-04 — SCR-18, UC-19, UC-20, UC-21)

Tài liệu hướng dẫn test từng bước từ A → Z trên **Postman** cho luồng **Lễ tân (`Receptionist`) tiếp nhận khách vãng lai trực tiếp tại quầy (Walk-in)**, tự động tạo tài khoản `Inactive` theo quy tắc **`BR-04`**, phân công Bác sĩ/Groomer vào hàng đợi `Waiting`, và **Khách vãng lai sau đó tự đăng ký Online để kích hoạt tài khoản `Active`**.

> **Chuẩn bị trước khi test:**
> - Chạy server tại thư mục `VCMOS_BE` (`npm run dev`).
> - Cần có **1 tài khoản `Receptionist`** để thực hiện tiếp nhận tại quầy.

---

## BƯỚC 1: Chuẩn bị dữ liệu (Token Lễ tân, Service ID, Staff ID và Cage ID)

1. **Đăng nhập tài khoản `Receptionist`**:
   - `POST http://localhost:9999/api/auth/login` với tài khoản Lễ tân → Copy `token` làm **`<TOKEN_RECEPTIONIST>`**.
2. **Lấy `_id` của dịch vụ đang hoạt động (`Active`)**:
   - Gọi `GET http://localhost:9999/api/services?status=Active`.
   - Copy `"_id"` của 1 dịch vụ khám bệnh (`category: "Examination"`) làm **`<SERVICE_ID_EXAM>`**.
3. **Lấy `_id` của Bác sĩ (`Veterinarian`) đang hoạt động**:
   - Gọi `GET http://localhost:9999/api/users/staff?role=Veterinarian&status=Active` (gắn Bearer `<TOKEN_RECEPTIONIST>`).
   - Copy `"_id"` của 1 Bác sĩ làm **`<VET_STAFF_ID>`**.
4. **(Tùy chọn) Lấy `_id` của Chuồng đang trống (`Available`)**:
   - Gọi `GET http://localhost:9999/api/cages?status=Available` (gắn Bearer `<TOKEN_RECEPTIONIST>`).
   - Copy `"_id"` của 1 chuồng trống làm **`<CAGE_ID>`**.

---

## BƯỚC 2: Lễ tân tra cứu SĐT khách vãng lai mới lần đầu đến quầy (`UC-20`)

Giả sử có một khách hàng mới hoàn toàn với số điện thoại **`0988777666`** bước vào quầy lễ tân.

- **Method**: `GET`
- **URL**:
  ```
  http://localhost:9999/api/appointment-orders/walk-in/customer-lookup?phone=0988777666
  ```
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`**)
- **Các trường hợp cần bấm Send kiểm tra**:
  1. **SĐT hợp lệ nhưng chưa từng có trong hệ thống (`0988777666`)**:
     - Ra `200 OK` (`"message": "Khách hàng mới chưa có hồ sơ trong hệ thống"`).
     - `data` trả về:
       ```json
       {
         "found": false,
         "customer": null,
         "pets": []
       }
       ```
     - *(Trên UI `SCR-18`, kết quả này báo cho FE mở ô nhập Họ tên khách mới và Form thêm thú cưng mới).*
  2. **Nhập SĐT sai định dạng (ví dụ `?phone=12345`)**:
     - Ra `400 Bad Request` kèm lỗi `errors.phone`.

---

## BƯỚC 3: Lễ tân đăng ký khám vãng lai cho Khách mới + Thú cưng mới (`UC-19`, `UC-21`, `BR-04`, `BR-06`)

- **Method**: `POST`
- **URL**: `http://localhost:9999/api/appointment-orders/walk-in`
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`**)
- **Body** (`raw` → `JSON`):
  ```json
  {
    "phone": "0988777666",
    "fullName": "Trần Thị Khách Vãng Lai",
    "petInfo": {
      "name": "Milo",
      "species": "Chó",
      "breed": "Poodle",
      "weight": 4.5,
      "coatColor": "Nâu đỏ",
      "dob": "2024-05-10",
      "notes": "Hơi nhát người lạ"
    },
    "note": "Khách đưa bé đến khám trực tiếp tại quầy",
    "services": [
      {
        "serviceId": "<dán_SERVICE_ID_EXAM>",
        "assignedStaffId": "<dán_VET_STAFF_ID>",
        "isEmergency": false
      }
    ],
    "cageId": null
  }
  ```
  *(Nếu muốn test gán chuồng ngay lúc tiếp nhận thì thay `"cageId": "<dán_CAGE_ID>"`).*

- **Các trường hợp cần bấm Send kiểm tra**:
  1. **Lần 1 (Hợp lệ — Tiếp nhận thành công)**:
     - Ra `201 Created` (`"message": "Đăng ký khám vãng lai tại quầy thành công"`).
     - Kiểm tra trong `data`:
       - **`isNewCustomer`: `true`**; **`customer`**: Tự sinh mã `"code": "USR-..."`, `"role": "PetOwner"`, **`"status": "Inactive"`** (tài khoản chưa có mật khẩu theo đúng **`BR-04`**).
       - **`isNewPet`: `true`**; **`pet`**: Tự sinh mã `"code": "PET-..."`, `"name": "Milo"`, `"status": "Active"`.
       - **`appointment`**: Tự sinh mã `"code": "APT-..."`, **`"isOnline": false`**, **`"derivedStatus": "CheckedIn"`** và có sẵn **`"checkedInAt"`** (vì khách đang đứng tại quầy theo **`BR-06`**).
       - **`services`**: Dịch vụ có gán `assignedStaffId` được chuyển thẳng sang **`"status": "Waiting"`**, tự động cấp số thứ tự hàng đợi **`"queueNo"`** và **`"enqueueAt"`** để hiện ngay trên màn hình của Bác sĩ (**`BR-12`**).
     - 👉 **Hãy copy lại `data.pet._id`** (gọi là **`<WALKIN_PET_ID>`**) để test Bước 4.
  2. **Lần 2 (Chống tạo trùng ca khám cho cùng 1 thú cưng trong cùng ngày)**:
     - Thử gửi Body chọn lại thú cưng vừa tạo (`"phone": "0988777666"`, `"petId": "<dán_WALKIN_PET_ID>"`) trong cùng ngày hôm nay → Phải ra `409 Conflict` (`"Thú cưng này đã có lịch hẹn hoặc ca khám đang hoạt động trong ngày hôm nay"`).
  3. **Lần 3 (Kiểm tra phân công sai chuyên môn nhân sự)**:
     - Nếu truyền `serviceId` là dịch vụ Khám bệnh (`Examination`) nhưng `assignedStaffId` lại là nhân viên `Groomer` (hoặc ngược lại) → Phải ra `400 Bad Request`.

---

## BƯỚC 4: Lễ tân tra cứu lại SĐT `0988777666` khi khách quay lại phòng khám (`UC-20`)

- **Method**: `GET`
- **URL**:
  ```
  http://localhost:9999/api/appointment-orders/walk-in/customer-lookup?phone=0988777666
  ```
- **Authorization**: `Bearer Token` (dán **`<TOKEN_RECEPTIONIST>`**)
- **Bấm Send**:
  - Ra `200 OK` (`"message": "Tìm thấy thông tin khách hàng"`).
  - Trong `data`:
    - `"found": true`
    - `"customer"`: Trả về thông tin của `"Trần Thị Khách Vãng Lai"` (`status: "Inactive"`).
    - `"pets"`: Mảng chứa sẵn bé `"Milo"` (`<WALKIN_PET_ID>`) để Lễ tân chọn nhanh ở những lần khám sau hoặc tạo thêm thú cưng thứ 2 cho khách này.

---

## BƯỚC 5: Khách vãng lai về nhà tự Đăng ký Online & Kích hoạt tài khoản theo `BR-04` (`UC-02` Flow 5a)

Theo quy tắc **`BR-04`** trong SRS: Khách vãng lai có tài khoản `Inactive` (mật khẩu rỗng) khi về nhà lên web tự đăng ký bằng **đúng số điện thoại `0988777666`** sẽ không bị báo lỗi trùng SĐT mà được **kích hoạt tài khoản lên `Active`** và giữ nguyên toàn bộ thú cưng + lịch sử khám trước đó.

### 1. Thử đăng nhập khi khách chưa đăng ký mật khẩu online
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/login`
- **Body** (`JSON`):
  ```json
  {
    "identifier": "0988777666",
    "password": "password123"
  }
  ```
- **Bấm Send** → Phải ra `401 Unauthorized` (vì tài khoản Walk-in `Inactive` chưa có mật khẩu).

### 2. Khách vãng lai gọi API Đăng ký tài khoản bằng đúng SĐT `0988777666`
- **Method**: `POST`
- **URL**: `http://localhost:9999/api/auth/register`
- **Body** (`JSON`):
  ```json
  {
    "fullName": "Trần Thị Khách Vãng Lai",
    "phone": "0988777666",
    "email": "khachvanglai666@gmail.com",
    "password": "password123"
  }
  ```
- **Bấm Send**:
  - Ra `201 Created` (`"message": "Đăng ký tài khoản thành công"`).
  - Kiểm tra `user`:
    - Giữ nguyên **`_id`** và mã **`code: "USR-..."`** đã được tạo ở Bước 3!
    - Trạng thái **`"status"`** đã tự động chuyển từ `"Inactive"` sang **`"Active"`**!
  - *(Nếu bấm Send đăng ký lại thêm 1 lần nữa khi tài khoản đã `Active` → Hệ thống sẽ chặn `409 Conflict: Số điện thoại đã được đăng ký` như bình thường).*

### 3. Khách đăng nhập và kiểm tra hồ sơ thú cưng được giữ nguyên
1. Gọi `POST http://localhost:9999/api/auth/login` với `"identifier": "0988777666"` và `"password": "password123"` → Ra `200 OK`, copy `token` làm **`<TOKEN_WALKIN_CUSTOMER>`**.
2. Gọi `GET http://localhost:9999/api/pets` với `Authorization: Bearer <TOKEN_WALKIN_CUSTOMER>` → Ra `200 OK`, trong danh sách `items` **thấy ngay hồ sơ bé `"Milo"`** đã được Lễ tân tạo tại quầy ở Bước 3!

