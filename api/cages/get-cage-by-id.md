# API Documentation: Get Cage by ID

Get a single cage by its ID.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/cages/:id |
| **Auth** | Required (Bearer token). Roles: `Admin`, `Receptionist`, `Veterinarian`, `Groomer` |

## Request headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

## Path parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string | Cage `_id`. Must be a valid MongoDB ObjectId. |

**Example**

```
GET /api/cages/6ad96d4a9664da6b2c0d8d70
```

## Responses

### 200 OK: success

```json
{
  "success": true,
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "label": "A-01",
    "size": "M",
    "isIsolated": false,
    "status": "Available",
    "createdAt": "2026-11-05T03:15:42.118Z",
    "updatedAt": "2026-11-05T03:15:42.118Z",
    "__v": 0
  }
}
```

### 400 Bad Request: invalid ID

```json
{
  "success": false,
  "message": "Mã chuồng không hợp lệ",
  "errors": ["Mã chuồng không hợp lệ"]
}
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found: cage does not exist

```json
{
  "success": false,
  "message": "Không tìm thấy chuồng"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Đã xảy ra lỗi hệ thống"
}
```