# API Documentation: Get My Queue

Get the list of appointment services assigned to the currently logged-in Veterinarian or Groomer. The staff id is taken from the token, so a staff member can only see their own services.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-services/my-queue |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Roles** | `Veterinarian`, `Groomer` |

## Query parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | string | No | Filter by service status. One of `Booked`, `Waiting`, `InProgress`, `Done`, `Cancelled`, `Overdue`. If omitted, services of all statuses are returned. |

Any other query parameter (including `assignedStaffId`) is ignored.

**Example**

```
GET /api/appointment-services/my-queue?status=Waiting
Authorization: Bearer <token>
```

## Sorting

Results are sorted by emergency priority first (`isEmergency: -1`), then by `queueNo` ascending (`1`), then by `enqueueAt` ascending (`1`). Emergency cases always appear at the top of the queue.

## Responses

### 200 OK: success

Returns an empty `data` array if the staff member has no matching services.

```json
{
  "message": "Lấy danh sách dịch vụ của nhân viên thành công",
  "data": [
    {
      "_id": "6ad96d4a9664da6b2c0d8d70",
      "orderId": {
        "_id": "6ad96d4a9664da6b2c0d8d65",
        "code": "APT-K3XQ9T",
        "isOnline": true,
        "derivedStatus": "CheckedIn"
      },
      "serviceId": {
        "_id": "6ad96d4a9664da6b2c0d8d50",
        "name": "Tắm và cắt tỉa lông",
        "status": "Active"
      },
      "sequenceNo": 1,
      "preferredStaffId": null,
      "assignedStaffId": {
        "_id": "6ad96d4a9664da6b2c0d8d61",
        "code": "USR-VMJVSG",
        "fullName": "Example Groomer",
        "role": "Groomer",
        "status": "Active"
      },
      "status": "Waiting",
      "isEmergency": false,
      "queueNo": 1,
      "enqueueAt": "2026-11-10T02:15:00.000Z",
      "dequeueAt": null,
      "groomingNote": null,
      "createdAt": "2026-11-09T08:00:00.000Z",
      "updatedAt": "2026-11-10T02:15:00.000Z"
    }
  ]
}
```

**Populated fields**

| Field | Populated with |
|---|---|
| `orderId` | The full appointment order |
| `serviceId` | The full service |
| `preferredStaffId` | `code`, `fullName`, `role`, `status` of the user (or `null`) |
| `assignedStaffId` | `code`, `fullName`, `role`, `status` of the user |

### 400 Bad Request: invalid `status`

```json
{
  "message": "status phải là một trong: Booked, Waiting, InProgress, Done, Cancelled, Overdue"
}
```

The same status code is returned if the user's role in the database is not `Veterinarian` or `Groomer`:

```json
{
  "message": "Nhân viên phải có vai trò Veterinarian hoặc Groomer"
}
```

### 401 Unauthorized: missing or invalid token

```json
{
  "message": "Chưa đăng nhập"
}
```

```json
{
  "message": "Token không hợp lệ hoặc đã hết hạn"
}
```

### 403 Forbidden: role not allowed

Returned when the logged-in user is not a `Veterinarian` or `Groomer` (for example a `Receptionist`, `Admin` or `PetOwner`).

```json
{
  "message": "Bạn không có quyền thực hiện chức năng này"
}
```

### 404 Not Found: staff not found

Returned when the user id in the token no longer exists.

```json
{
  "message": "Không tìm thấy nhân viên"
}
```

### 500 Internal Server Error

```json
{
  "message": "Lỗi máy chủ, vui lòng thử lại sau"
}
```