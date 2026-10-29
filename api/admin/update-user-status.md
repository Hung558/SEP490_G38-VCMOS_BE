# API Documentation: Lock / Unlock / Change User Status (Admin - UC-62, BR-22)

Lock, unlock, or deactivate a user/staff account (`Active`, `Locked`, `Inactive`). Locked or Inactive accounts are blocked from logging in (`403`). An Admin cannot lock or deactivate their own account.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/admin/users/:id/status |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | string | Yes | Target status: `Active`, `Locked`, or `Inactive`. |

**Example**

```json
{
  "status": "Locked"
}
```

## Responses

### 200 OK: success

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
    "status": "Locked",
    "createdAt": "2026-10-29T08:00:00.000Z"
  }
}
```

### 400 Bad Request: invalid status or self-lock attempt

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "status": "Trạng thái chỉ được là Active, Inactive hoặc Locked"
  }
}
```

```json
{ "message": "Không thể tự khóa hoặc vô hiệu hóa tài khoản của chính mình" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy người dùng" }
```

