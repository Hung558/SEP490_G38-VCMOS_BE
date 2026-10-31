# API Documentation: List & Search Users (Admin - UC-60)

Get a list of all user and staff accounts, sorted newest first. Supports filtering by `role`, `status`, and keyword `search` (`fullName`, `phone`, `email`, `code`).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/admin/users |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | Not applicable (no request body) |

## Query parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `role` | string | No | Filter by role: `PetOwner`, `Receptionist`, `Veterinarian`, `Groomer`, or `Admin`. |
| `status` | string | No | Filter by account status: `Active`, `Inactive`, or `Locked`. |
| `search` | string | No | Case-insensitive keyword search matching `fullName`, `phone`, `email`, or `code`. |

**Example**

```
GET http://localhost:9999/api/admin/users?role=Veterinarian&status=Active&search=0977
```

## Responses

### 200 OK: success

```json
{
  "users": [
    {
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
  ]
}
```

### 400 Bad Request: invalid filter value

```json
{ "message": "Vai trò lọc không hợp lệ" }
```

```json
{ "message": "Trạng thái lọc không hợp lệ" }
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

### 403 Forbidden: not an Admin

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

