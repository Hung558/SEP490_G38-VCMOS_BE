# API Documentation: Get Cage Assignment by ID

Get the details of a single cage assignment.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/cage-assignments/:id |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Allowed roles** | `Receptionist` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ID of the cage assignment (24-character hex ObjectId). |

**Example**

```
GET /api/cage-assignments/6ad96d4a9664da6b2c0d9a01
```

## Responses

### 200 OK: success

```json
{
  "message": "Lấy thông tin phân công chuồng thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d9a01",
    "cageId": {
      "_id": "6ad96d4a9664da6b2c0d8e10",
      "label": "A-01",
      "size": "M",
      "isIsolated": false,
      "status": "Occupied",
      "createdAt": "2026-10-20T08:15:00.000Z",
      "updatedAt": "2026-11-05T03:20:11.000Z",
      "__v": 0
    },
    "orderId": {
      "_id": "6ad96d4a9664da6b2c0d8f22"
    },
    "assignedById": {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "USR-VMJVSG",
      "fullName": "Example Receptionist",
      "phone": "0987654321",
      "email": "receptionist@gmail.com",
      "isEmailVerified": false,
      "role": "Receptionist",
      "status": "Active"
    },
    "assignedAt": "2026-11-05T03:20:11.000Z",
    "releasedAt": null,
    "createdAt": "2026-11-05T03:20:11.000Z",
    "updatedAt": "2026-11-05T03:20:11.000Z",
    "__v": 0
  }
}
```

`releasedAt` is `null` while the assignment is still open, and a timestamp once the cage has been released.

`cageId`, `orderId` and `assignedById` are populated with the full referenced documents (`orderId` shows all fields of the appointment order; only `_id` is shown above). The password is never included.

### 400 Bad Request: invalid id

```json
{
  "message": "ID phân công chuồng không hợp lệ",
  "errors": [
    "ID phân công chuồng không hợp lệ"
  ]
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

### 404 Not Found: assignment does not exist

```json
{ "message": "Không tìm thấy phân công chuồng" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```