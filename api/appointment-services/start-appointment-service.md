# API Documentation: Start Appointment Service

Set a service inside an appointment to `InProgress`. Used by a Veterinarian or Groomer when they begin working on the service.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/appointment-services/:id/start |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Roles** | `Veterinarian`, `Groomer` |
| **Content-Type** | Not required (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ID of the appointment service (`AppointmentService._id`). Must be a valid ObjectId. |

## Request body

None. The status is always set to `InProgress` by the server.

**Example**

```
PATCH /api/appointment-services/6ad96d4a9664da6b2c0d8d70/start
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Behavior

- Sets the service `status` to `InProgress` and records `dequeueAt` (the time it leaves the queue).
- If the parent appointment is `CheckedIn`, its status becomes `InProgress`.
- The service is not required to be assigned to the caller, and its current status is not checked.
- The update is rejected if the parent appointment is already `Done`, `Cancelled` or `Overdue`.

## Responses

### 200 OK: success

Returns the updated appointment service. `serviceId`, `preferredStaffId` and `assignedStaffId` are populated (staff fields: `code`, `fullName`, `role`, `status`).

```json
{
  "message": "Cập nhật trạng thái dịch vụ thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "orderId": "6ad96d4a9664da6b2c0d8d65",
    "serviceId": {
      "_id": "6ad96d4a9664da6b2c0d8d50",
      "defaultDuration": 30,
      "status": "Active"
    },
    "sequenceNo": 1,
    "preferredStaffId": null,
    "assignedStaffId": {
      "_id": "6ad96d4a9664da6b2c0d8d40",
      "code": "USR-GRM001",
      "fullName": "Example Groomer",
      "role": "Groomer",
      "status": "Active"
    },
    "status": "InProgress",
    "isEmergency": false,
    "scheduledStart": "09:00",
    "scheduledEnd": "09:30",
    "queueNo": 1,
    "enqueueAt": "2026-11-12T02:00:00.000Z",
    "dequeueAt": "2026-11-12T02:10:00.000Z",
    "groomingNote": null,
    "cancelReason": null,
    "cancelledAt": null,
    "cancelledBy": null,
    "createdAt": "2026-11-11T08:00:00.000Z",
    "updatedAt": "2026-11-12T02:10:00.000Z",
    "__v": 0
  }
}
```

> `serviceId` is the full populated `Service` document; only some of its fields are shown above.

### 400 Bad Request: invalid ID

```json
{ "message": "ID dịch vụ lịch hẹn không hợp lệ" }
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```
Or when the token is invalid or expired:
```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed or account not active

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```
Or when the account is locked or deactivated:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```
```json
{ "message": "Tài khoản đã ngừng hoạt động" }
```

### 404 Not Found: service or appointment does not exist

```json
{ "message": "Không tìm thấy dịch vụ trong lịch hẹn" }
```
Or when the parent appointment cannot be found:
```json
{ "message": "Không tìm thấy lịch hẹn" }
```

### 409 Conflict: appointment already closed

The message includes the appointment's current status (`Done`, `Cancelled` or `Overdue`).

```json
{ "message": "Không thể cập nhật dịch vụ của lịch hẹn đang ở trạng thái \"Done\"" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ, vui lòng thử lại sau" }
```