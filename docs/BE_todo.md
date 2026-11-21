# Danh sách công việc Backend còn lại — VCMOS_BE

> Tài liệu tổng hợp từ **SRS (Report 3)**, **Sprint Backlog** và đối chiếu code hiện có trong `VCMOS_BE/`.
> Dùng để theo dõi chung giữa 2 thành viên BE (`HungHD` & `QuangTD`) — làm xong mục nào thì tick `[x]`.

---

## 1. Cộng đồng & Tương tác (`T-47` — `PB-19`, `PB-23`)
> *Đã có:* `PetOwner` tạo / xem / sửa / xoá mềm bài viết của chính mình khi còn `PendingReview` (`/api/community-posts` — PR #53).
> *Model có sẵn trong `src/models/`:* `CommunityPost.js`, `PostLike.js`, `PostComment.js`, `ContentReport.js`.

- [x] **Bảng tin cộng đồng công khai (`UC-51`, `SCR-03`, `SCR-14`)**
  - API cho cả `Guest` (không cần đăng nhập) và `PetOwner` xem danh sách & chi tiết các bài viết đã được duyệt (`status: 'Published'`).
  - Hỗ trợ phân trang và lọc theo `postType` (`TimelineShare` / `Discussion`).
- [x] **Chia sẻ hành trình tự động ẩn thông tin nhạy cảm (`UC-49`, `BR-18`)**
  - API xem trước / tạo bài `TimelineShare` từ lịch sử đơn khám đã `Done` của thú cưng.
  - Tự động cắt bỏ toàn bộ nội dung khám SOAP (`S, O, A, P`), đơn thuốc và giá tiền hoá đơn; chỉ giữ ngày mốc, tên dịch vụ và ảnh before/after.
- [x] **Thu hồi bài chia sẻ đã đăng (`UC-50`, `SCR-08`, `SCR-14`)**
  - `PATCH /api/community-posts/:id/withdraw`: cho phép `PetOwner` gỡ (`Removed`) bài viết/chia sẻ của mình kể cả khi đã `Published`.
- [x] **Thả tim / Bỏ thích bài viết (`UC-53`, `BR-19`)**
  - `POST /api/community-posts/:id/like` & `GET /:id/like-status`: dùng model `PostLike` (unique index `(postId, userId)`), tự đồng bộ `likeCount`.
- [x] **Bình luận & Trả lời bình luận 1 cấp (`UC-54`, `UC-55`, `BR-19`)**
  - `GET/POST /api/community-posts/:id/comments` & `DELETE /comments/:commentId`: xem công khai, bình luận gốc + reply 1 cấp (chặn lồng cấp 2), tác giả tự xoá mềm, tự đồng bộ `commentCount`.
- [x] **Báo cáo vi phạm bài viết / bình luận (`UC-56`)**
  - `POST /api/community-posts/reports`: dùng model `ContentReport`, chặn tự báo cáo và chặn trùng báo cáo (`409`).

---

## 2. Admin Kiểm duyệt Cộng đồng (`T-53` — `PB-20`, `SCR-33`)
- [x] **Hàng đợi bài viết chờ duyệt (`UC-57`)**
  - `GET /api/admin/community/posts`: lọc theo trạng thái (`PendingReview` mặc định) kèm cờ phát hiện từ khoá y tế / giá tiền (`hasSensitiveKeywords`, `sensitiveMatches`).
- [x] **Duyệt / Từ chối bài viết (`UC-58`)**
  - `PATCH /api/admin/community/posts/:id/moderate`: `Approve -> Published`, `Reject -> Hidden` bắt buộc nhập lý do `moderationNote` (`MSG22`).
- [x] **Xử lý báo cáo vi phạm (`UC-59`)**
  - `GET /api/admin/community/reports` & `PATCH /reports/:id/resolve`: xem ngữ cảnh bài/bình luận + số lượt báo cáo; xử lý `Keep` / `Hide` / `Delete` (bắt buộc `note` khi Ẩn/Xoá) và đóng toàn bộ báo cáo `Pending` của nội dung đó sang `Resolved`.
  - Đã có file test `tests/communityPost.test.js` và tài liệu `api/community-posts/interactions.md`, `api/admin/community-moderation.md`.

---

## 3. Thống kê Dashboard cho Admin & Lễ tân (`T-52` — `PB-22`, `SCR-28`, `SCR-16`)
> *Đã có:* `GET /api/invoices/reports/best-selling-products` (`UC-65` — Top sản phẩm bán chạy).

- [x] **Thống kê doanh thu (`UC-63`, `SCR-28` — `GET /api/reports/revenue`)**
  - Lọc theo Ngày / Tuần / Tháng / Khoảng thời gian (tối đa 12 tháng / 366 ngày), bổ sung Compound Index `{ paymentStatus: 1, paidAt: -1 }` trên `Invoice`.
  - Trả về: tổng doanh thu, số hoá đơn `Paid`, giá trị trung bình hoá đơn, % thay đổi so với kỳ trước, biểu đồ doanh thu theo ngày/tháng (tự lấp ngày/tháng trống bằng `0`), tách theo nhóm dịch vụ (`Service.category`), loại dòng hoá đơn (`Service`/`Product`/`InpatientDay`) và phương thức thanh toán (`Cash`, `VNPay`, `PayOS`).
- [x] **Thống kê lịch hẹn & vận hành (`UC-64`, `SCR-28`, `SCR-16` — `GET /api/reports/operations` & `GET /api/reports/front-desk`)**
  - Đếm số đơn hẹn theo trạng thái (`Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Overdue`, `Cancelled`), tỷ lệ Online vs Walk-in, số lượt dịch vụ theo danh mục, Top 5 dịch vụ nổi bật, tỷ lệ lấp đầy chuồng theo khu vực (`Holding` / `InpatientWard`).
  - Widget thống kê nhanh tại quầy cho Lễ tân & Admin (`SCR-16`), kèm thời gian chờ trung bình từ Check-in tới khi bắt đầu dịch vụ và số tiền đã thu theo phương thức.
  - Đã có file test `tests/report.test.js` và tài liệu trong `api/reports/`.

---

## 4. Dòng thời gian Thú cưng Hợp nhất (`T-40` — `PB-13`, `UC-13`, `SCR-08`)
- [x] **API Unified Pet Timeline (`GET /api/pets/:petId/timeline`)**
  - Tổng hợp theo thứ tự thời gian toàn bộ lịch sử của 1 thú cưng: lịch hẹn, bệnh án SOAP, Sub-task, Grooming Note, đợt nội trú + nhật ký hằng ngày, chuồng đang dùng, bài chia sẻ cộng đồng và hoá đơn.
  - Kiểm soát quyền riêng tư `BR-23`: chỉ `PetOwner` sở hữu thú cưng đó và nhân sự phòng khám được xem; ẩn thông tin tài chính `invoice` với `Veterinarian` và `Groomer`.
  - Đã có file test `tests/petTimeline.test.js` và tài liệu `api/pets/get-pet-timeline.md`.

---

## 5. Trợ lý AI Gemini Đánh giá Sức khỏe Tham khảo (`T-46` — `PB-18`, `UC-14`, `API-01`, `SCR-10`)
- [ ] **Tích hợp Google Gemini API (`BR-20`)** *(xác nhận với BA xem có cần tạo thêm model lưu lịch sử đánh giá AI hay không)*
  - Nhận tối đa 3 ảnh thú cưng (`JPG`/`PNG` ≤ 5MB) + chỉ số hồ sơ (loài, tuổi, cân nặng) + triệu chứng.
  - Gọi Gemini API với timeout `<= 30s`, chuẩn hoá JSON trả về: `urgency` (`Routine` | `Monitor` | `Urgent`), `possibleCauses`, `advice`, kèm nội dung miễn trừ trách nhiệm (`MSG33`).
  - Tuyệt đối không ghi đè vào bảng `MedicalRecord` (`BR-20`).

---

## 6. Tiến trình ngầm (Background Jobs) & Thông báo (`T-28`, `T-52` — `PB-16`, `PB-21`)
> *Thư mục hiện đang trống:* `src/jobs/`

- [ ] **`JOB-01` — Đánh dấu lịch hẹn quá hạn `Overdue` (`UC-23`, `BR-08`)**
  - Chạy cuối ngày lúc `23:59`: tìm các đơn `Booked` của ngày hôm đó chưa `CheckedIn`, chuyển dịch vụ đầu tiên và trạng thái đơn sang `Overdue` (không huỷ đơn).
- [ ] **`JOB-02` & Thông báo tự động (`UC-69`, `UC-70`, `UC-71`)**
  - Chạy mỗi 15 phút: nhắc lịch hẹn trước giờ hẹn 2 tiếng (In-app + gửi Email SMTP với tài khoản đã xác thực email, retry tối đa 3 lần khi SMTP lỗi).
  - Gửi thông báo khi có thay đổi trạng thái quan trọng (khách huỷ lịch → báo Lễ tân; xong hết dịch vụ chuyển `WaitOwner` → báo Chủ nuôi đón thú cưng; chỉ định/trả kết quả Sub-task; kết quả kiểm duyệt cộng đồng).

---

## 7. Kiểm thử, Tối ưu & Dữ liệu mẫu (`T-50`, `T-56`, `T-58`, `T-60`, `T-63`)
- [ ] **Viết Unit / Integration Test Jest cho các module mới**
  - `tests/communityPost.test.js` (CRUD bài viết, bảng tin `Published`, ẩn dữ liệu nhạy cảm `BR-18`, Like/Comment/Report `BR-19`, Admin duyệt & xử lý báo cáo).
  - Test cho Thống kê Dashboard, Pet Timeline, AI Gemini, `JOB-01` & `JOB-02`.
  - Chạy `npm test` pass 100% trước khi merge.
- [ ] **Tối ưu & rà soát bảo mật (`T-58`)**
  - Kiểm tra Compound Index MongoDB cho các truy vấn thống kê 12 tháng (`<= 3s`), chống Race Condition khi đặt trùng slot / chọn trùng chuồng.
- [ ] **Hoàn thiện dữ liệu mẫu (`src/seeds/seed.js` — `T-63`)**
  - Bổ sung dữ liệu mẫu thực tế xuyên suốt 5 vai trò (ca làm việc, chuồng, thú cưng có lịch sử SOAP / Spa / Nội trú, hoá đơn 12 tháng, bài đăng cộng đồng) để phục vụ Live Demo bảo vệ đồ án.

