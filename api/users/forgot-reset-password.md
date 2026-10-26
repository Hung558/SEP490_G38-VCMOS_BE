# API Documentation: Forgot Password & Reset Password

Recover a user's password using a 6-digit OTP sent to their **verified** email address (`isEmailVerified: true`).

---

## 1. Request Password Recovery OTP (`forgot-password`)

Sends a 6-digit OTP (valid for 5 minutes) to the user's verified email address.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/users/forgot-password |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Verified email address of the account. |

```json
{
  "email": "exampleuser@gmail.com"
}
```

### Responses

#### 200 OK
If `EMAIL_USER` and `EMAIL_PASS` are configured in `.env`:
```json
{
  "message": "Mã OTP khôi phục mật khẩu đã được gửi tới email của bạn"
}
```
If Gmail is not configured in `.env` (local dev mode), `devToken` is included for testing:
```json
{
  "message": "Mã OTP khôi phục mật khẩu đã được gửi tới email của bạn",
  "devToken": "482910"
}
```

#### 400 Bad Request
- Invalid or missing email:
  ```json
  {
    "message": "Dữ liệu không hợp lệ",
    "errors": { "email": "Email không hợp lệ" }
  }
  ```
- Email has not been verified yet:
  ```json
  { "message": "Email này chưa được xác thực nên không thể dùng để khôi phục mật khẩu" }
  ```

#### 403 Forbidden
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```

#### 404 Not Found
```json
{ "message": "Không tìm thấy tài khoản với email này" }
```

---

## 2. Reset Password with OTP (`reset-password`)

Verifies the 6-digit OTP and sets a new password.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/users/reset-password |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Verified email address of the account. |
| `otp` (or `token`) | string | Yes | 6-digit OTP code received via email. Both `otp` and `token` field names are accepted. |
| `password` | string | Yes | New plain-text password (8 to 72 characters). |

```json
{
  "email": "exampleuser@gmail.com",
  "token": "482910",
  "password": "NewStrongPassword123"
}
```

### Responses

#### 200 OK
```json
{
  "message": "Đặt lại mật khẩu thành công"
}
```

#### 400 Bad Request
- Validation failed:
  ```json
  {
    "message": "Dữ liệu không hợp lệ",
    "errors": {
      "otp": "Mã xác thực phải gồm 6 chữ số",
      "password": "Mật khẩu phải có ít nhất 8 ký tự"
    }
  }
  ```
- Wrong or expired OTP:
  ```json
  { "message": "Mã xác thực không hợp lệ hoặc đã hết hạn" }
  ```

#### 404 Not Found
```json
{ "message": "Không tìm thấy tài khoản với email này" }
```

