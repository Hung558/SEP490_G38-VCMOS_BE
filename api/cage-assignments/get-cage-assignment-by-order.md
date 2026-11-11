# API Documentation: Get Cage Assignment by Order

Get the currently open cage assignment (`releasedAt = null`) of an appointment order. Used by Veterinarians and Groomers to find out which cage a pet is in.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/cage-assignments/order/:orderId |
| **Auth** | Required. `Authorization: Bearer <token>` |
| **Roles** | `Receptionist`, `Veterinarian`, `Groomer` |

## Request headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer <token>` (note the space after `Bearer`). The token is returned by the login endpoint and carries the user's `id` and `role`. |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | ID of the appointment order (24-character hex MongoDB ObjectId). Leading/trailing spaces are trimmed. |

**Example**

```
GET http://localhost:9999/api/cage-assignments/order/6ad96d4a9664da6b2c0d8d70
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Behavior

- Only an **open** assignment (not yet released) is returned. If the order was moved to another cage, only the current assignment is returned.
- If several open assignments exist for the order, the most recent one (`assignedAt` descending) is returned.
- `cageId`, `orderId` and `assignedById` are populated with the full documents. The `password` field of the user is excluded.

## Responses

### 200 OK: success

```json
{
  "message": "Lấy thông tin phân công chuồng của đơn hẹn thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d90",
    "cageId": {
      "_id": "6ad96d4a9664da6b2c0d8d50",
      "status": "Occupied"
    },
    "orderId": {
      "_id": "6ad96d4a9664da6b2c0d8d70"
    },
    "assignedById": {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "USR-VMJVSG",
      "fullName": "Example Receptionist",
      "phone": "0987654321",
      "email": "receptionist@gmail.com",
      "role": "Receptionist",
      "status": "Active"
    },
    "assignedAt": "2026-11-10T08:30:00.000Z",
    "releasedAt": null,
    "createdAt": "2026-11-10T08:30:00.000Z",
    "updatedAt": "2026-11-10T08:30:00.000Z"
  }
}
```

The `cageId` and `orderId` objects are shortened here; the real response contains all fields of the `Cage` and `AppointmentOrder` documents.

### 400 Bad Request: invalid order ID

```json
{
  "message": "ID đơn hẹn không hợp lệ"
}
```

### 401 Unauthorized: not logged in

The `Authorization` header is missing or does not start with `Bearer `.

```json
{ "message": "Chưa đăng nhập" }
```

### 401 Unauthorized: invalid or expired token

The token could not be verified (wrong signature, malformed, or expired).

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed

The logged-in user's role is not `Veterinarian` or `Groomer` (for example, a `Receptionist`).

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found: no open assignment

The order has no cage assignment, or its assignment has already been released.

```json
{
  "message": "Đơn hẹn này chưa có phân công chuồng đang hoạt động"
}
```

### 500 Internal Server Error

```json
{ "message": "Internal server error" }
```