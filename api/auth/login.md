# API Documentation: Login

Log in with a phone number or email and password.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/auth/login |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `identifier` | string | Yes | Phone number or email address. Leading/trailing spaces are trimmed. If the value matches the phone number format it is treated as a phone number, otherwise as an email (case-insensitive). |
| `password` | string | Yes | Plain-text password. |

**Example**

```json
{
  "identifier": "0901234567",
  "password": "MyS3cretPass"
}
```

## Responses

### 200 OK: success

```json
{
  "message": "Đăng nhập thành công",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjZhZDk2ZDRhOTY2NGRhNmIyYzBkOGQ2MSIsInJvbGUiOiJQZXRPd25lciIsImlhdCI6MTc5MjYzOTg2MSwiZXhwIjoxNzkyNzI2MjYxfQ.5TRbHYwcvoSbGIEouiK1lh8iP1LQ11cnJKCqaaQaq6o",
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-VMJVSG",
    "fullName": "Example User",
    "phone": "0987654321",
    "email": "exampleuser@gmail.com",
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
    "identifier": "Vui lòng nhập số điện thoại hoặc email"
  }
}
```

### 401 Unauthorized: wrong credentials

```json
{
  "message": "Thông tin đăng nhập không chính xác"
}
```

### 403 Forbidden: account not allowed to log in
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```