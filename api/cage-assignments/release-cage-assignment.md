# API Documentation: Release Cage Assignment

Release a pet from its cage. The assignment is closed (`releasedAt` is set to the current time) and the cage status is set back to `Available`.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/cage-assignments/:id/release |
| **Auth** | Required. `Authorization: Bearer <token>` |
| **Roles** | `Receptionist`, `Veterinarian`, `Groomer` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ID of the cage assignment to release (24-character hex ObjectId). Leading/trailing spaces are trimmed. This is the assignment's `_id`, not the cage ID or the order ID. |

## Request body

None.

**Example**

```
PATCH /api/cage-assignments/6ad96d4a9664da6b2c0d8e10/release
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Behavior

- Only an open assignment (`releasedAt = null`) can be released. Releasing the same assignment twice returns `409`.
- The assignment is closed atomically, so two concurrent requests cannot release it twice.
- If updating the cage fails, the assignment is re-opened so the data stays consistent, and the request fails with `500`.
- To find the assignment ID of an order, call `GET /api/cage-assignments/order/:orderId`.

## Responses

### 200 OK: success

`cageId`, `orderId` and `assignedById` are populated with the full documents (`assignedById` excludes the password). The returned `cageId.status` is `Available`.

```json
{
  "message": "Giải phóng chuồng thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8e10",
    "cageId": {
      "_id": "6ad96d4a9664da6b2c0d8c01",
      "label": "A-01",
      "size": "M",
      "isIsolated": false,
      "status": "Available"
    },
    "orderId": {
      "_id": "6ad96d4a9664da6b2c0d8d90"
    },
    "assignedById": {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "USR-VMJVSG",
      "fullName": "Example User",
      "phone": "0987654321",
      "email": "exampleuser@gmail.com",
      "role": "Receptionist",
      "status": "Active"
    },
    "assignedAt": "2026-11-10T02:15:30.000Z",
    "releasedAt": "2026-11-10T08:42:11.000Z",
    "createdAt": "2026-11-10T02:15:30.000Z",
    "updatedAt": "2026-11-10T08:42:11.000Z"
  }
}
```

### 400 Bad Request: invalid ID

```json
{ "message": "ID phân công chuồng không hợp lệ" }
```

### 401 Unauthorized: not logged in

Returned when the `Authorization` header is missing or does not start with `Bearer `:

```json
{ "message": "Chưa đăng nhập" }
```

Returned when the token is invalid or expired:

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed

Returned for any role other than `Veterinarian` or `Groomer` (including `Receptionist`):

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found: assignment does not exist

```json
{ "message": "Không tìm thấy phân công chuồng" }
```

### 409 Conflict: already released

```json
{ "message": "Phân công chuồng này đã được giải phóng trước đó" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```