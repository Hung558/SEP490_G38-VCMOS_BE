# Quy Trình Các Bước Test API Lễ Tân Lập Hóa Đơn & Thanh Toán Tiền Mặt / VNPay (`SCR-20`, `SCR-15`)

Tài liệu hướng dẫn test từng bước trên **Postman** cho luồng **Thu ngân & Thanh toán (`UC-45..48`)**:
1. **Lễ tân lập hóa đơn tổng hợp** (`POST /api/invoices`)
2. **Thêm / bớt sản phẩm bán lẻ trước khi thu tiền** (`PATCH /api/invoices/:id/items`)
3. **Thanh toán Tiền mặt** (`PATCH /api/invoices/:id/pay-cash`) **HOẶC** **Quét mã VNPay Sandbox** (`POST /api/invoices/:id/vnpay-url` → `GET /api/invoices/vnpay-ipn`)
4. **Chủ nuôi xem hóa đơn & tải biên lai PDF** (`GET /api/invoices/me`, `GET /api/invoices/:id/pdf`)

> **Điều kiện trước khi test:**
> - Cần có **1 tài khoản `Receptionist`** và **1 tài khoản `PetOwner`**.
> - Cần có **1 đơn lịch hẹn ở trạng thái `WaitOwner`** (sau khi Bác sĩ/Groomer đã bấm hoàn tất khám/spa) **hoặc** 1 hồ sơ nội trú đã **`Discharged`**.

---

## BƯỚC 1: Đăng nhập lấy Token
1. Đăng nhập `Receptionist` (`POST http://localhost:9999/api/auth/login`) → lưu **`<TOKEN_RECEPTIONIST>`**.
2. Đăng nhập `PetOwner` (chủ thú cưng của đơn đó) → lưu **`<TOKEN_OWNER>`**.

---

## BƯỚC 2: Lễ tân lập hóa đơn tổng hợp (`POST /api/invoices`)
- **Method & URL**: `POST http://localhost:9999/api/invoices`
- **Header**: `Authorization: Bearer <TOKEN_RECEPTIONIST>`
- **Body (`JSON`)**:
  ```json
  {
    "orderId": "<ORDER_ID_TRANG_THAI_WAIT_OWNER>",
    "retailItems": [
      { "productId": "<PRODUCT_ID_DANG_ACTIVE>", "quantity": 1 }
    ]
  }
  ```
- **Kết quả mong đợi**: `201 Created` (`paymentStatus: "Unpaid"`, tự động gom dịch vụ đã `Done`, đơn thuốc trong `MedicalRecord`, ngày nội trú nếu có, và sản phẩm bán lẻ với đơn giá snapshot `BR-16`).
- 👉 Lưu `data._id` làm **`<INVOICE_ID>`** và `data.items[...]._id` của sản phẩm bán lẻ làm **`<RETAIL_ITEM_ID>`**.

---

## BƯỚC 3 (Tùy chọn): Thêm / bớt sản phẩm bán lẻ khi chưa thu tiền (`PATCH /api/invoices/:id/items`)
- **Method & URL**: `PATCH http://localhost:9999/api/invoices/<INVOICE_ID>/items`
- **Header**: `Authorization: Bearer <TOKEN_RECEPTIONIST>`
- **Body (`JSON`)**:
  ```json
  {
    "removeItemIds": ["<RETAIL_ITEM_ID>"],
    "addItems": [
      { "productId": "<PRODUCT_ID_DANG_ACTIVE>", "quantity": 2 }
    ]
  }
  ```
- **Kết quả mong đợi**: `200 OK`, `totalAmount` tự động cộng lại theo giá snapshot.

---

## BƯỚC 4A: Thanh toán Tiền mặt (`PATCH /api/invoices/:id/pay-cash`)
- **Method & URL**: `PATCH http://localhost:9999/api/invoices/<INVOICE_ID>/pay-cash`
- **Header**: `Authorization: Bearer <TOKEN_RECEPTIONIST>`
- **Body (`JSON`)**:
  ```json
  {
    "cashReceived": 1000000
  }
  ```
- **Kết quả mong đợi**: `200 OK`, `paymentStatus: "Paid"`, trả kèm `changeAmount` (tiền thừa). Đồng thời `AppointmentOrder` tự chuyển **`Done`**, `MedicalRecord` chuyển **`Finalized`**, chuồng chờ chuyển **`Available`**.

---

## BƯỚC 4B: Thanh toán VNPay Sandbox (`POST /api/invoices/:id/vnpay-url` → IPN)
*(Áp dụng cho 1 hóa đơn khác đang `Unpaid`)*

1. **Tạo link thanh toán VNPay**:
   - `POST http://localhost:9999/api/invoices/<INVOICE_ID>/vnpay-url`
   - Header: `Authorization: Bearer <TOKEN_RECEPTIONIST>`
   - Kết quả `200 OK`: Copy chuỗi `data.paymentUrl` dán vào trình duyệt.
2. **Thanh toán trên trang VNPay Sandbox**:
   - Chọn ngân hàng **NCB** và nhập thẻ test:
     - Số thẻ: `9704198526191432198`
     - Tên chủ thẻ: `NGUYEN VAN A`
     - Ngày phát hành: `07/15`
     - OTP: `123456`
   - Trình duyệt sẽ chuyển hướng về `http://localhost:9999/api/invoices/vnpay-return?...` và trả JSON `"success": true` *(lưu ý bước Return chưa tự đổi trạng thái hóa đơn theo `API-04`)*.
3. **Chốt IPN Webhook trên Postman** *(mô phỏng cổng VNPay gọi IPN khi test localhost)*:
   - Copy toàn bộ phần `?vnp_Amount=...` trên thanh địa chỉ của bước Return, dán thành:
     `GET http://localhost:9999/api/invoices/vnpay-ipn?vnp_Amount=...`
   - **Kết quả mong đợi**: `200 OK` `{ "RspCode": "00", "Message": "Confirm Success" }`. Hóa đơn chuyển **`Paid`** (`VNPay`), đơn chuyển **`Done`**, bệnh án khóa **`Finalized`**, chuồng trả **`Available`**.

---

## BƯỚC 5: Chủ nuôi xem hóa đơn & tải biên lai PDF
1. **Xem lịch sử hóa đơn**:
   - `GET http://localhost:9999/api/invoices/me` (`Authorization: Bearer <TOKEN_OWNER>`) → `200 OK`.
2. **Tải biên lai PDF**:
   - `GET http://localhost:9999/api/invoices/<INVOICE_ID>/pdf` (`Authorization: Bearer <TOKEN_OWNER>` hoặc `<TOKEN_RECEPTIONIST>`) → bấm **Send and Download** trên Postman để mở file PDF biên lai.
3. **Kiểm tra bảo mật (`BR-22`, `BR-23`)**:
   - Lấy token của `PetOwner` khác gọi `/api/invoices/<INVOICE_ID>` → báo `403 Forbidden`.
   - Gọi `DELETE http://localhost:9999/api/invoices/<INVOICE_ID>` bằng token Admin/Lễ tân → báo `403 Forbidden`.

