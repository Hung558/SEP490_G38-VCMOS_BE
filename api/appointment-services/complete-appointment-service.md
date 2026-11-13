# API Documentation: Complete Appointment Service

A Groomer marks one of their assigned appointment services as finished (`status` → `Done`).

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/appointment-services/:id/complete |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Role** | `Groomer` |
| **Content-Type** | None (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ID (`_id`) of the appointment service (a valid MongoDB ObjectId). The service must be assigned to the logged-in Groomer. |

## Request body

None. The new status is always `Done`.

**Example**

```
PATCH /api/appointment-services/6ad96d4a9664da6b2c0d8e10/complete
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Business rules

- The service must be assigned to the logged-in Groomer (`assignedStaffId`).
- The service must currently be `InProgress`. Services in any other status cannot be completed.
- The parent appointment order must not be `Done`, `Cancelled` or `Overdue`.
- **Side effect:** if the order is `CheckedIn` or `InProgress` and every non-cancelled service in it is now `Done`, the order's `derivedStatus` changes to `WaitOwner`.

## Responses

### 200 OK: success

```json
{
  "message": "Cập nhật trạng thái dịch vụ thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8e10",
    "orderId": "6ad96d4a9664da6b2c0d8d90",
    "serviceId": {
      "_id": "6ad96d4a9664da6b2c0d8c01",
      "name": "Bath & Grooming"
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
    "status": "Done",
    "isEmergency": false,
    "scheduledStart": "09:00",
    "scheduledEnd": "09:30",
    "queueNo": 3,
    "enqueueAt": "2026-11-13T02:05:11.000Z",
    "dequeueAt": "2026-11-13T02:20:42.000Z",
    "groomingNote": null,
    "cancelReason": null,
    "cancelledAt": null,
    "cancelledBy": null,
    "createdAt": "2026-11-12T08:00:00.000Z",
    "updatedAt": "2026-11-13T02:48:09.000Z"
  }
}
```

`serviceId` is the full populated `Service` document (only a few fields are shown here). `preferredStaffId` and `assignedStaffId` are populated with `code`, `fullName`, `role` and `status`.

### 400 Bad Request: invalid ID

```json
{ "message": "ID dịch vụ lịch hẹn không hợp lệ" }
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```
Or when the token is malformed or expired:
```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden

When the logged-in user is not a Groomer:
```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```
When the service is assigned to a different staff member:
```json
{ "message": "Bạn chỉ có thể thao tác trên dịch vụ được phân công cho mình" }
```
When the account is locked or inactive:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```
```json
{ "message": "Tài khoản đã ngừng hoạt động" }
```

### 404 Not Found

When the appointment service does not exist:
```json
{ "message": "Không tìm thấy dịch vụ trong lịch hẹn" }
```
When its parent appointment order does not exist:
```json
{ "message": "Không tìm thấy lịch hẹn" }
```

### 409 Conflict

When the service is not `InProgress` (the current status is included in the message):
```json
{ "message": "Chỉ có thể hoàn thành dịch vụ đang thực hiện (InProgress), hiện tại: \"Booked\"" }
```
When the parent order is already finished:
```json
{ "message": "Không thể cập nhật dịch vụ của lịch hẹn đang ở trạng thái \"Done\"" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ, vui lòng thử lại sau" }
```