# API Documentation: Change My Password

Change the password of the currently logged-in user. Requires a **verified** email address (`isEmailVerified: true`), the current password, and a 6-digit OTP sent to the user's email.

---

## 1. Send OTP for Password Change

Generates a 6-digit OTP (valid for 5 minutes) and sends it to the logged-in user's verified email address.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/users/me/password/send-otp |
| **Auth** | Required (`Authorization: Bearer <token>`) |
| **Body** | None |

### Responses

#### 200 OK
```json
{
  "message": "Mã OTP đổi mật khẩu đã được gửi tới email của bạn"
}
```
*(In local dev mode without Gmail configured, `"devToken": "482910"` is also returned).*

#### 400 Bad Request
- Email is missing or not verified yet:
  ```json
  { "message": "Bạn cần xác thực địa chỉ email trước khi đổi mật khẩu" }
  ```

---

## 2. Change Password with OTP

Verifies the current password and the 6-digit OTP, then updates the user's password.

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | http://localhost:9999/api/users/me/password |
| **Auth** | Required (`Authorization: Bearer <token>`) |
| **Content-Type** | `application/json` |

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `otp` | string | Yes | 6-digit OTP code received via email. |
| `currentPassword` | string | Yes | Current plain-text password. |
| `newPassword` | string | Yes | New plain-text password (8 to 72 characters, must differ from `currentPassword`). |

```json
{
  "otp": "482910",
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

### Responses

#### 200 OK
```json
{
  "message": "Đổi mật khẩu thành công"
}
```

#### 400 Bad Request
- Validation failed:
  ```json
  {
    "message": "Dữ liệu không hợp lệ",
    "errors": {
      "otp": "Mã xác thực phải gồm 6 chữ số",
      "currentPassword": "Vui lòng nhập mật khẩu hiện tại",
      "newPassword": "Mật khẩu mới phải khác mật khẩu hiện tại"
    }
  }
  ```
- Wrong current password:
  ```json
  { "message": "Mật khẩu hiện tại không chính xác" }
  ```
- Wrong or expired OTP:
  ```json
  { "message": "Mã xác thực không hợp lệ hoặc đã hết hạn" }
  ```

