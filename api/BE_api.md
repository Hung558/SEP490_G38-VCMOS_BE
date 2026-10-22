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
Mong đợi 200 và có thông tin user (code, fullName, phone, email, role, status, createdAt), không có passwordHash.
Không gắn token thì phải ra 401 (Chưa đăng nhập).
