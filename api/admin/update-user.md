# API Documentation: Update User Account (Admin - SCR-32)

Update a user or staff account's full name and (for staff accounts) their staff role. Phone number and email are personal login identifiers and OTP-verified fields, so they can only be updated by the account owner via `/api/users/me`.

## Endpoint

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | http://localhost:9999/api/admin/users/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `fullName` | string | Yes | Full name (1 to 100 characters). |
| `role` | string | No | Staff role (`Receptionist`, `Veterinarian`, `Groomer`). Only allowed when the target user is a staff member. |

**Example**

```json
{
  "fullName": "Trần Minh (Groomer)",
  "role": "Groomer"
}
```

## Responses

### 200 OK: success

```json
{
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-K7M2QX",
    "fullName": "Trần Minh (Groomer)",
    "phone": "0977111222",
    "email": "minh.groomer@vcmos.vn",
    "isEmailVerified": false,
    "role": "Groomer",
    "status": "Active",
    "createdAt": "2026-10-29T08:00:00.000Z"
  }
}
```

### 400 Bad Request

```json
{ "message": "Chỉ được phép thay đổi vai trò của tài khoản nhân viên" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy người dùng" }
```

### 409 Conflict

```json
{ "message": "Số điện thoại đã được sử dụng" }
```

```json
{ "message": "Email đã được sử dụng" }
```

