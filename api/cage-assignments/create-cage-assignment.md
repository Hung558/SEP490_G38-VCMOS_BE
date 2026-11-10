# API Documentation: Create Cage Assignment

Assign an available cage to an appointment order. On success the cage status is set to `Occupied`.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/cage-assignments |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Allowed roles** | `Receptionist` |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `cageId` | string | Yes | ID of the cage to assign (24-character hex ObjectId). The cage must have status `Available`. |
| `orderId` | string | Yes | ID of the appointment order the cage is assigned to (24-character hex ObjectId). |

The person who assigns the cage (`assignedById`) is taken from the token of the logged-in user and must not be sent in the body.

**Example**

```json
{
  "cageId": "6ad96d4a9664da6b2c0d8e10",
  "orderId": "6ad96d4a9664da6b2c0d8f22"
}
```

## Responses

### 201 Created: success

```json
{
  "message": "Phân công chuồng thành công",
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

`cageId`, `orderId` and `assignedById` are populated with the full referenced documents (`orderId` shows all fields of the appointment order; only `_id` is shown above). The password is never included.

### 400 Bad Request: validation failed

All problems found are reported at once. Can also be triggered when the cage size does not accommodate pet weight according to BR-11 (S: $\le$5kg, M: 5–15kg, L: 15–30kg, XL: >30kg) or when isolation requirement does not match (`isIsolated`).

```json
{
  "message": "Chuồng cỡ S (tối đa 5kg) không phù hợp với thú cưng nặng 8.5kg"
}
```

Possible messages: `ID chuồng là bắt buộc`, `ID chuồng không hợp lệ`, `ID đơn hẹn là bắt buộc`, `ID đơn hẹn không hợp lệ`, `ID người phân công là bắt buộc`, `ID người phân công không hợp lệ`, `Dữ liệu gửi lên không hợp lệ`.

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
{ "message": "Không tìm thấy chuồng" }
```

### 409 Conflict: cage cannot be assigned

The cage exists but its status is not `Available`:

```json
{ "message": "Chuồng không ở trạng thái trống (Available)" }
```

The cage already has an open assignment (can also occur when two requests race for the same cage):

```json
{ "message": "Chuồng đã có phân công đang hoạt động" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```