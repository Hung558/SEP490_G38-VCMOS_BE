# API Documentation: Get All Cage Assignments

List cage assignments, newest first (sorted by `assignedAt` descending). Results can be filtered by cage, order, or whether the assignment is still active.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/cage-assignments |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Allowed roles** | `Receptionist` |

## Query parameters

All parameters are optional. Empty values are ignored and unknown parameters are dropped.

| Parameter | Type | Description |
|---|---|---|
| `cageId` | string | Only return assignments of this cage (24-character hex ObjectId). |
| `orderId` | string | Only return assignments of this appointment order (24-character hex ObjectId). |
| `active` | string | `true`: only open assignments (`releasedAt` is `null`). `false`: only released assignments. Omit to return both. |

**Example**

```
GET /api/cage-assignments?cageId=6ad96d4a9664da6b2c0d8e10&active=true
```

## Responses

### 200 OK: success

```json
{
  "message": "Lấy danh sách phân công chuồng thành công",
  "count": 2,
  "data": [
    {
      "_id": "6ad96d4a9664da6b2c0d9a02",
      "cageId": {
        "_id": "6ad96d4a9664da6b2c0d8e11",
        "label": "A-02",
        "size": "L",
        "isIsolated": true,
        "status": "Occupied",
        "createdAt": "2026-10-20T08:16:00.000Z",
        "updatedAt": "2026-11-05T03:40:02.000Z",
        "__v": 0
      },
      "orderId": {
        "_id": "6ad96d4a9664da6b2c0d8f23"
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
      "assignedAt": "2026-11-05T03:40:02.000Z",
      "releasedAt": null,
      "createdAt": "2026-11-05T03:40:02.000Z",
      "updatedAt": "2026-11-05T03:40:02.000Z",
      "__v": 0
    },
    {
      "_id": "6ad96d4a9664da6b2c0d9a01",
      "cageId": {
        "_id": "6ad96d4a9664da6b2c0d8e10",
        "label": "A-01",
        "size": "M",
        "isIsolated": false,
        "status": "Available",
        "createdAt": "2026-10-20T08:15:00.000Z",
        "updatedAt": "2026-11-05T03:30:45.000Z",
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
      "releasedAt": "2026-11-05T03:30:45.000Z",
      "createdAt": "2026-11-05T03:20:11.000Z",
      "updatedAt": "2026-11-05T03:30:45.000Z",
      "__v": 0
    }
  ]
}
```

`count` is the number of items in `data`. When nothing matches, the response is still `200` with `count: 0` and `data: []`.

`cageId`, `orderId` and `assignedById` are populated with the full referenced documents (`orderId` shows all fields of the appointment order; only `_id` is shown above). The password is never included.

### 400 Bad Request: invalid query parameters

```json
{
  "message": "ID chuồng không hợp lệ; Tham số active chỉ nhận giá trị 'true' hoặc 'false'",
  "errors": [
    "ID chuồng không hợp lệ",
    "Tham số active chỉ nhận giá trị 'true' hoặc 'false'"
  ]
}
```

Possible messages: `ID chuồng không hợp lệ`, `ID đơn hẹn không hợp lệ`, `Tham số active chỉ nhận giá trị 'true' hoặc 'false'`, `Tham số truy vấn không hợp lệ`.

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

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```