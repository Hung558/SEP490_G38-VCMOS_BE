# API Documentation: Verify My Email (Send OTP & Verify OTP)

Verify the email address in the currently logged-in user's profile using a 6-digit OTP code. Once verified (`isEmailVerified: true`), the user can later use this email for password recovery (Forgot Password) and password changes.

---

## 1. Send OTP to current email

Generates a 6-digit OTP (valid for 5 minutes) and sends it to the email address currently saved in the user's profile.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/users/me/email/send-otp |
| **Auth** | Required (`Authorization: Bearer <token>`) |
| **Body** | None |

### Responses

#### 200 OK
If `EMAIL_USER` and `EMAIL_PASS` are configured in `.env`, the OTP is sent via Gmail:
```json
{
  "message": "Mã xác thực đã được gửi tới email của bạn"
}
```
If Gmail is not configured in `.env` (local dev mode), the OTP is printed to the server console and also returned in `devToken` for quick testing:
```json
{
  "message": "Mã xác thực đã được gửi tới email của bạn",
  "devToken": "482910"
}
```

#### 400 Bad Request
- User has not set an email yet:
  ```json
  { "message": "Tài khoản chưa cập nhật địa chỉ email" }
  ```
- Email is already verified:
  ```json
  { "message": "Email này đã được xác thực" }
  ```

---

## 2. Verify Email with OTP

Checks the 6-digit OTP code and marks `isEmailVerified: true`.

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/users/me/email/verify |
| **Auth** | Required (`Authorization: Bearer <token>`) |
| **Content-Type** | `application/json` |

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `otp` | string | Yes | 6-digit OTP code received via email (e.g. `"482910"`). |

```json
{
  "otp": "482910"
}
```

### Responses

#### 200 OK
```json
{
  "message": "Xác thực email thành công",
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-VMJVSG",
    "fullName": "Example User",
    "phone": "0987654321",
    "email": "exampleuser@gmail.com",
    "isEmailVerified": true,
    "role": "PetOwner",
    "status": "Active",
    "createdAt": "2026-10-20T08:15:30.000Z"
  }
}
```

#### 400 Bad Request
- Invalid format:
  ```json
  {
    "message": "Dữ liệu không hợp lệ",
    "errors": {
      "otp": "Mã xác thực phải gồm 6 chữ số"
    }
  }
  ```
- Wrong or expired OTP:
  ```json
  { "message": "Mã xác thực không hợp lệ hoặc đã hết hạn" }
  ```

> **Note:** If the user later updates their profile (`PUT /api/users/me`) with a **different** email address or removes their email, `isEmailVerified` automatically resets to `false`.

