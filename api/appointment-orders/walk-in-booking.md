# Tài Liệu API Tiếp Nhận Khách Vãng Lai Tại Quầy (Walk-in & BR-04)

Module này phục vụ quy trình **Lễ tân tiếp nhận khách vãng lai trực tiếp tại quầy (`UC-19`, `UC-20`, `UC-21`, `SCR-18`)** và **Tự động kích hoạt tài khoản vãng lai khi khách đăng ký Online (`BR-04`, `UC-02` Flow 5a)**.

---

## 1. Tra cứu khách hàng theo số điện thoại (`UC-20`)

Khi Lễ tân nhập số điện thoại của khách vào ô tìm kiếm trên Modal Walk-in (`SCR-18`), FE gọi API này để kiểm tra khách đã từng đến phòng khám chưa và lấy danh sách thú cưng của khách.

* **Method & URL:** `GET /api/appointment-orders/walk-in/customer-lookup?phone=0988111222`
* **Headers:** `Authorization: Bearer <Receptionist_or_Admin_Token>`
* **Query Params:**
  * `phone` *(bắt buộc)*: Số điện thoại 10 chữ số bắt đầu bằng `0`.

### Response thành công (`200 OK`)

**Trường hợp 1: Khách hàng mới chưa có trong hệ thống**
```json
{
  "message": "Khách hàng mới chưa có hồ sơ trong hệ thống",
  "data": {
    "found": false,
    "customer": null,
    "pets": []
  }
}
```

**Trường hợp 2: Khách hàng đã tồn tại (`Active` hoặc `Inactive`)**
```json
{
  "message": "Tìm thấy thông tin khách hàng",
  "data": {
    "found": true,
    "customer": {
      "_id": "672c00000000000000000001",
      "code": "USR-K7M2QX",
      "fullName": "Trần Thị Khách Vãng Lai",
      "phone": "0988111222",
      "role": "PetOwner",
      "status": "Inactive"
    },
    "pets": [
      {
        "_id": "672c00000000000000000002",
        "code": "PET-9X2M4P",
        "ownerId": "672c00000000000000000001",
        "name": "Milo",
        "species": "Chó",
        "breed": "Poodle",
        "weight": 4.5,
        "coatColor": "Nâu đỏ",
        "status": "Active"
      }
    ]
  }
}
```

---

## 2. Đăng ký khám vãng lai tại quầy (`UC-19`, `UC-21`, `BR-04`, `BR-06`, `BR-12`)

* **Method & URL:** `POST /api/appointment-orders/walk-in`
* **Headers:** `Authorization: Bearer <Receptionist_Token>`
* **Quy tắc nghiệp vụ tự động xử lý:**
  1. **Tài khoản khách hàng (`User`):**
     * Nếu `phone` chưa tồn tại $\rightarrow$ bắt buộc phải truyền `fullName`, hệ thống tự động tạo `User` với `code: "USR-XXXXXX"`, `role: "PetOwner"`, **`status: "Inactive"`** và **`passwordHash: null`** (`BR-04`).
     * Nếu `phone` đã tồn tại và là `PetOwner` (`Active` hoặc `Inactive`) $\rightarrow$ tái sử dụng tài khoản đó (`isNewCustomer: false`).
  2. **Hồ sơ thú cưng (`Pet`):**
     * Truyền **`petId`** nếu chọn thú cưng có sẵn của khách **HOẶC** truyền **`petInfo`** nếu tạo thú cưng mới (`code: "PET-XXXXXX"`).
  3. **Đơn lịch hẹn (`AppointmentOrder`):**
     * Tạo đơn với `code: "APT-XXXXXX"`, **`isOnline: false`**, **`derivedStatus: "CheckedIn"`** và **`checkedInAt: new Date()`** (vì khách đang có mặt trực tiếp tại quầy theo `BR-06`).
  4. **Danh sách dịch vụ (`AppointmentService`):**
     * Nếu dịch vụ có truyền `assignedStaffId` (Bác sĩ cho dịch vụ y tế hoặc Groomer cho dịch vụ Spa) $\rightarrow$ chuyển thẳng sang **`status: "Waiting"`**, tự động cấp số thứ tự **`queueNo`** và **`enqueueAt`** để hiển thị ngay trên màn hình hàng đợi của nhân viên (`BR-12`).
     * Nếu chưa truyền `assignedStaffId` $\rightarrow$ để `status: "Booked"` (Lễ tân phân công sau).
  5. **Chuồng lưu giữ (`cageId` - không bắt buộc):**
     * Nếu truyền `cageId` của một chuồng đang `Available`, hệ thống tạo luôn bản ghi `CageAssignment` và đổi trạng thái chuồng sang `Occupied`.

### Request Body Mẫu 1: Khách mới hoàn toàn + Thú cưng mới
```json
{
  "phone": "0988111222",
  "fullName": "Trần Thị Khách Vãng Lai",
  "email": "khachvanglai@gmail.com",
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
  "intake": {
    "symptoms": "Bé ho nhẹ từ tối qua, ăn ít",
    "initialCondition": "Tỉnh táo, thân nhiệt bình thường"
  },
  "services": [
    {
      "serviceId": "<ID_DICH_VU_KHAM>",
      "assignedStaffId": "<ID_BAC_SI>",
      "isEmergency": false
    }
  ],
  "cageId": null
}
```

### Request Body Mẫu 2: Khách cũ quay lại + Chọn thú cưng cũ (`petId`)
```json
{
  "phone": "0988111222",
  "petId": "<ID_THU_CUNG_CU_CUA_KHACH>",
  "note": "Tái khám định kỳ",
  "services": [
    {
      "serviceId": "<ID_DICH_VU_KHAM>",
      "assignedStaffId": "<ID_BAC_SI>"
    }
  ]
}
```

---

## 3. Kích hoạt tài khoản vãng lai `Inactive` khi khách tự đăng ký Online (`BR-04`, `UC-02` Flow 5a)

* **Method & URL:** `POST /api/auth/register`
* **Cơ chế hoạt động:**
  * Khi khách vãng lai (đã được Lễ tân tạo tài khoản `status: "Inactive"`, `passwordHash: null` tại quầy) về nhà lên website tự đăng ký tài khoản bằng **đúng số điện thoại `phone` đó**:
  * Hệ thống nhận diện đây là tài khoản vãng lai chưa kích hoạt $\rightarrow$ **không báo lỗi trùng SĐT `409`** mà tự động cập nhật `fullName`, `email`, `passwordHash` mới và chuyển trạng thái tài khoản từ **`Inactive` $\rightarrow$ `Active`**.
  * Vì giữ nguyên `_id` và mã `USR-XXXXXX`, ngay sau khi đăng nhập khách sẽ nhìn thấy đầy đủ hồ sơ thú cưng (`Milo`, ...) và lịch sử khám bệnh tại quầy trước đó!

