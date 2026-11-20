# Hóa đơn: tính phí Sub-task
> *Vấn đề ban đầu:* hóa đơn do Lễ tân lập (`POST /api/invoices`) chỉ gom `AppointmentService` đã `Done`, đơn thuốc, ngày nội trú và sản phẩm bán lẻ — các `SubtaskRequest` (xét nghiệm, chẩn đoán hình ảnh...) không được đưa vào hóa đơn.
 
- [x] **Gom Sub-task đã hoàn thành vào hóa đơn (`src/services/invoice.service.js` — `createInvoice`)**
  - Import thêm model `SubtaskRequest`.
  - Với các `AppointmentService` `Done` của đơn, truy vấn `SubtaskRequest` có `status: 'Completed'` và `serviceId` khác `null`, populate `Service` (`name`, `basePrice`) rồi thêm mỗi Sub-task thành một dòng `type: 'Service'` (`quantity: 1`, lưu snapshot tên & đơn giá tại thời điểm lập hoá đơn).
  - Sub-task không gắn `serviceId` (không có đơn giá) **không** bị tính phí.
  - Khối xử lý Sub-task nằm **bên trong** `if (order) { ... if (doneServiceIds.length > 0) { ... } }`, cùng phạm vi với biến `doneServiceIds`.
- [x] **Cập nhật tài liệu API `api/invoices/create-invoice.md`**
  - Bổ sung Sub-task vào phần mô tả, thêm bảng *Invoice item sources* (nguồn → `items[].type` → điều kiện), thêm dòng Sub-task vào ví dụ response `201` và cập nhật `totalAmount`.
  - Đồng bộ thêm với code: trường `email` của chủ nuôi, `payosOrderCode` / `payosPaymentLinkId` trong response, hai lỗi `400` (hồ sơ nội trú không thuộc đơn đã chọn; không có khoản mục nào để lập hoá đơn) và các trường hợp `409` (đơn đã huỷ, đơn đã `Done`).

---

> **Ghi chú cho các thành viên khác:** File này chỉ dùng để ghi lại các thay đổi vừa thực hiện ở trên nhằm thông báo cho cả nhóm. Sau khi đọc xong, bạn có thể **xoá file này an toàn** — nội dung không được code hay test nào tham chiếu tới.