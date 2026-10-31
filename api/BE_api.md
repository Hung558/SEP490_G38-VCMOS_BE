Đăng Ký: 
Method: POST
Url: http://localhost:9999/api/auth/register
Body: { "fullName": "Test User", "phone": "0911111111", "email": "test@mail.com", "password": "12345678" }
Bấm Send. Mong đợi status 201.
Bấm Send thêm lần nữa thì phải ra 409 (SĐT đã được đăng ký)

Đăng nhập:
Method: POST
Url: http://localhost:9999/api/auth/login
Body: { "identifier": "0911111111", "password": "12345678" }
Mong đợi 200 và có token trong kết quả. Copy chuỗi token đó.

Đăng xuất:
Method: POST
Url: http://localhost:9999/api/auth/logout
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 (Đăng xuất thành công).
Không gắn token thì phải ra 401 (Chưa đăng nhập).

Xem profile của mình:
Method: GET
Url: http://localhost:9999/api/users/me
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 và có thông tin user (code, fullName, phone, email, isEmailVerified, role, status, createdAt), không có passwordHash.
Không gắn token thì phải ra 401 (Chưa đăng nhập).

Cập nhật profile của mình:
Method: PUT
Url: http://localhost:9999/api/users/me
Body: { "fullName": "Test User Moi", "phone": "0911111111", "email": "test@mail.com" }
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 và trả về thông tin user đã cập nhật (nếu đổi sang email mới thì isEmailVerified tự động về false).

Gửi mã OTP xác thực email (ở trang Profile):
Method: POST
Url: http://localhost:9999/api/users/me/email/send-otp
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 (Mã xác thực được gửi về Gmail nếu đã cấu hình .env, hoặc trả kèm devToken).

Xác nhận mã OTP để xác thực email:
Method: POST
Url: http://localhost:9999/api/users/me/email/verify
Body: { "otp": "123456" }
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 (Xác thực email thành công, user.isEmailVerified = true).

Gửi mã OTP đổi mật khẩu (khi đang đăng nhập, yêu cầu email đã xác thực):
Method: POST
Url: http://localhost:9999/api/users/me/password/send-otp
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 (Mã OTP đổi mật khẩu được gửi về Gmail).

Đổi mật khẩu bằng mã OTP (khi đang đăng nhập):
Method: PUT
Url: http://localhost:9999/api/users/me/password
Body: { "otp": "123456", "currentPassword": "12345678", "newPassword": "newpassword123" }
Tab Authorization → Type chọn Bearer Token → dán token vừa copy.
Mong đợi 200 (Đổi mật khẩu thành công).

Quên mật khẩu - Bước 1 (Gửi mã OTP về email đã xác thực):
Method: POST
Url: http://localhost:9999/api/users/forgot-password
Body: { "email": "test@mail.com" }
Mong đợi 200 (Mã OTP khôi phục mật khẩu được gửi về Gmail). Nếu email chưa xác thực sẽ trả 400.

Quên mật khẩu - Bước 2 (Đặt lại mật khẩu mới bằng mã OTP):
Method: POST
Url: http://localhost:9999/api/users/reset-password
Body: { "email": "test@mail.com", "token": "123456", "password": "resetpassword123" }
Mong đợi 200 (Đặt lại mật khẩu thành công).

======================================================================
QUẢN TRỊ TÀI KHOẢN NHÂN SỰ & NGƯỜI DÙNG (ADMIN - SCR-32, BR-22, BR-24)
(Yêu cầu đăng nhập bằng tài khoản có role "Admin" và gắn Bearer Token)
======================================================================

Admin - Xem danh sách & tìm kiếm/lọc tài khoản (UC-60):
Method: GET
Url: http://localhost:9999/api/admin/users
Query (tùy chọn): ?role=Veterinarian&status=Active&search=0977111222
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 200 và danh sách users (không bao giờ trả passwordHash hay mã OTP).
Nếu không gắn token → 401; nếu gắn token của PetOwner/Nhân viên → 403.

Admin - Xem chi tiết 1 tài khoản (SCR-32):
Method: GET
Url: http://localhost:9999/api/admin/users/:id
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 200 và thông tin user (nếu user là PetOwner sẽ trả kèm mảng pets của khách hàng đó).

Admin - Tạo tài khoản nhân sự mới (UC-61 & BR-24):
Method: POST
Url: http://localhost:9999/api/admin/users
Body: { "fullName": "BS Trần Minh", "phone": "0977111222", "email": "vet.minh@vcmos.vn", "password": "password123", "role": "Veterinarian" }
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 201 (Tự động sinh mã code USR-XXXXXX, status mặc định Active).
Lưu ý: role chỉ nhận "Receptionist", "Veterinarian", hoặc "Groomer". Trùng SĐT/email sẽ trả 409.

Admin - Cập nhật họ tên & điều chuyển vai trò nhân sự (SCR-32):
Method: PUT
Url: http://localhost:9999/api/admin/users/:id
Body: { "fullName": "Trần Minh (Groomer)", "role": "Groomer" }
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 200 và trả về thông tin user đã cập nhật (SĐT và Email là định danh cá nhân nên không sửa qua API này).

Admin - Khóa / Mở khóa tài khoản (UC-62):
Method: PATCH
Url: http://localhost:9999/api/admin/users/:id/status
Body: { "status": "Locked" }
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 200 (status chỉ nhận "Active" hoặc "Locked", truyền "Inactive" sẽ báo lỗi 400). Tài khoản bị Locked sẽ bị chặn đăng nhập (403). Admin không thể tự khóa chính mình (400).

Admin - Xóa tài khoản (Kiểm tra quy tắc cấm xóa vật lý BR-22):
Method: DELETE
Url: http://localhost:9999/api/admin/users/:id
Body: không cần
Tab Authorization → Type chọn Bearer Token → dán token của Admin.
Mong đợi 403 (Không được phép xóa vật lý tài khoản người dùng theo BR-22, chỉ sử dụng chức năng khóa tài khoản).
