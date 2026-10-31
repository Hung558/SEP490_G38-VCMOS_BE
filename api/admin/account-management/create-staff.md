# API Documentation: Create Staff Account (Admin - UC-61, BR-24)

Create a new staff account (`Receptionist`, `Veterinarian`, or `Groomer`). The server automatically generates a unique `USR-XXXXXX` code (`BR-24`) and sets `status` to `Active`.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/admin/users |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `fullName` | string | Yes | Staff full name (1 to 100 characters). |
| `phone` | string | Yes | Phone number: 10 digits starting with `0` (unique across all users). |
| `email` | string | No | Email address (stored in lowercase, unique when provided). |
| `password` | string | Yes | Temporary password (8 to 72 characters). Hashed with bcrypt. |
| `role` | string | Yes | Must be one of: `Receptionist`, `Veterinarian`, `Groomer`. |

**Example**

```json
{
  "fullName": "BS Trần Minh",
  "phone": "0977111222",
  "email": "vet.minh@vcmos.vn",
  "password": "staffpassword123",
  "role": "Veterinarian"
}
```

## Responses

### 201 Created: success

```json
{
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-K7M2QX",
    "fullName": "BS Trần Minh",
    "phone": "0977111222",
    "email": "vet.minh@vcmos.vn",
    "isEmailVerified": false,
    "role": "Veterinarian",
    "status": "Active",
    "createdAt": "2026-10-29T08:00:00.000Z"
  }
}
```

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "fullName": "Họ tên là bắt buộc",
    "phone": "Số điện thoại phải gồm 10 số, bắt đầu bằng 0",
    "password": "Mật khẩu phải có ít nhất 8 ký tự",
    "role": "Vai trò nhân viên chỉ được là Receptionist, Veterinarian hoặc Groomer"
  }
}
```

### 409 Conflict: duplicate phone or email

```json
{ "message": "Số điện thoại đã được đăng ký" }
```

```json
{ "message": "Email đã được đăng ký" }
```

