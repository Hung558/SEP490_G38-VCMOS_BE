# API Documentation: Register

Register a new pet owner account.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/auth/register |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `fullName` | string | Yes | Full name (1 to 100 characters). Leading/trailing spaces are trimmed. |
| `phone` | string | Yes | Phone number (10 digits starting with `0`). Trimmed and must be unique. Used as the login identifier. |
| `email` | string | No | Email address. Trimmed and lowercased, must be unique if provided. |
| `password` | string | Yes | Plain-text password (8 to 72 characters). It is hashed on the server and never returned. |

**Example**

```json
{
  "fullName": "Nguyễn Văn A",
  "phone": "0901234567",
  "email": "vana@example.com",
  "password": "MyS3cretPass"
}
```

## Responses

### 201 Created: success

```json
{
  "message": "Đăng ký thành công",
  "user": {
    "_id": "6ad97cd2a1914248c8963636",
    "code": "USR-K8826Q",
    "fullName": "Example User 1",
    "phone": "0987654322",
    "email": "exampleuser1@gmail.com",
    "isEmailVerified": false,
    "role": "PetOwner",
    "status": "Active"
  }
}
```

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "phone": "Số điện thoại phải gồm 10 số, bắt đầu bằng 0"
  }
}
```

### 409 Conflict: already registered
```json
{ "message": "Số điện thoại đã được đăng ký" }
```

### 500 Internal Server Error
```json
{ "message": "Không thể tạo mã người dùng, vui lòng thử lại" }
```
