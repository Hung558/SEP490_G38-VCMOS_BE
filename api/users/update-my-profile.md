# API Documentation: Update My Profile

Update the profile of the currently logged-in user (full name, phone number and email).

## Endpoint

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | http://localhost:9999/api/users/me |
| **Auth** | Required. Any logged-in role. Send the token from the login response in the `Authorization` header: `Bearer <token>` |
| **Content-Type** | `application/json` |

The user is identified by the token, so no user id is sent in the URL or body. A user can only update their own profile.

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `fullName` | string | Yes | Full name (1 to 100 characters). Must not be blank. Leading/trailing spaces are trimmed. |
| `phone` | string | Yes | Phone number: exactly 10 digits, starting with `0` (e.g. `0901234567`). Must be unique across all users. |
| `email` | string | No | Email address. Stored in lowercase. Must be unique across all users. Send an empty string `""` or `null` to remove the email. If changed to a different address or removed, `isEmailVerified` automatically resets to `false`. |

Both `fullName` and `phone` must be sent on every request, even if only one of them changed. Always send the full current values.

Fields not listed above (`code`, `role`, `status`, password) cannot be changed with this API and are ignored if sent.

**Example**

```json
{
  "fullName": "Example User",
  "phone": "0987654321",
  "email": "exampleuser@gmail.com"
}
```

**Example: remove the email**

```json
{
  "fullName": "Example User",
  "phone": "0987654321",
  "email": ""
}
```

## Responses

### 200 OK: success

Returns the updated profile.

```json
{
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-VMJVSG",
    "fullName": "Example User",
    "phone": "0987654321",
    "email": "exampleuser@gmail.com",
    "isEmailVerified": false,
    "role": "PetOwner",
    "status": "Active",
    "createdAt": "2026-10-20T08:15:30.000Z"
  }
}
```

If the user has no email (never set, or removed by this request), the `email` field is **absent** from the `user` object rather than `null`.

### 400 Bad Request: validation failed

`errors` contains only the fields that failed.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "fullName": "Họ tên là bắt buộc",
    "phone": "Số điện thoại phải gồm 10 số, bắt đầu bằng 0",
    "email": "Email không hợp lệ"
  }
}
```

Possible error messages per field:

| Field | Message | Cause |
|---|---|---|
| `fullName` | `Họ tên là bắt buộc` | Missing, not a string, or blank |
| `fullName` | `Họ tên không được vượt quá 100 ký tự` | Exceeds 100 characters |
| `phone` | `Số điện thoại là bắt buộc` | Missing, not a string, or blank |
| `phone` | `Số điện thoại phải gồm 10 số, bắt đầu bằng 0` | Wrong format |
| `email` | `Email không hợp lệ` | Not a valid email format |

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 404 Not Found: user no longer exists

The token is valid but the account has been deleted.

```json
{ "message": "Không tìm thấy người dùng" }
```

### 409 Conflict: phone or email already in use

Another account already uses this phone number or email.

```json
{ "message": "Số điện thoại đã được sử dụng" }
```

```json
{ "message": "Email đã được sử dụng" }
```

### 500 Internal Server Error

```json
{ "message": "Internal server error" }
```
