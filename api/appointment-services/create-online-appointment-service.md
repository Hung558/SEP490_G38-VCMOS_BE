# API Documentation: Create Online Appointment Service

Add a service to an existing online appointment order. Only the pet owner who owns the order can call this endpoint.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/appointment-services/online |
| **Auth** | Required. Header `Authorization: Bearer <token>` |
| **Allowed roles** | `PetOwner` only, and only for their own appointment orders |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `orderId` | string | Yes | Id of the appointment order. Must be a valid ObjectId. The order must exist, be an online order, belong to the logged-in user, and not have the status `Done`, `Cancelled` or `Overdue`. |
| `serviceId` | string | Yes | Id of the service to add. Must be a valid ObjectId. The service must exist and have the status `Active`. |
| `sequenceNo` | integer | No | Position of the service within the order. Must be a positive integer and unique within the order. If omitted, it is set to the highest existing number in the order plus one (starting at `1`). |
| `isEmergency` | boolean | No | Whether the service is an emergency. Defaults to `false`. |

The following fields must **not** be sent. They always get default values when the service is created: `preferredStaffId`, `assignedStaffId`, `status`, `queueNo`, `enqueueAt`, `dequeueAt`, `groomingNote`.

**Example**

```json
{
  "orderId": "6ad96d4a9664da6b2c0d8d70",
  "serviceId": "6ad96d4a9664da6b2c0d8d55",
  "isEmergency": false
}
```

## Responses

### 201 Created: success

```json
{
  "message": "Tạo dịch vụ cho lịch hẹn online thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d91",
    "orderId": "6ad96d4a9664da6b2c0d8d70",
    "serviceId": "6ad96d4a9664da6b2c0d8d55",
    "sequenceNo": 1,
    "preferredStaffId": null,
    "assignedStaffId": null,
    "status": "Booked",
    "isEmergency": false,
    "queueNo": null,
    "enqueueAt": null,
    "dequeueAt": null,
    "groomingNote": null,
    "createdAt": "2026-11-06T03:15:42.118Z",
    "updatedAt": "2026-11-06T03:15:42.118Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

```json
{
  "message": "orderId không hợp lệ"
}
```

Possible messages:

| Message | Cause |
|---|---|
| `Không được truyền các trường: <field names>` | The body contains fields that only take default values. |
| `orderId là bắt buộc` | `orderId` is missing. |
| `orderId không hợp lệ` | `orderId` is not a valid ObjectId. |
| `serviceId là bắt buộc` | `serviceId` is missing. |
| `serviceId không hợp lệ` | `serviceId` is not a valid ObjectId. |
| `sequenceNo phải là số nguyên dương` | `sequenceNo` is not a positive integer. |
| `isEmergency phải là true hoặc false` | `isEmergency` is not a boolean. |
| `Lịch hẹn này không phải lịch hẹn online` | The order is not an online order. |
| `Không thể thêm dịch vụ vào lịch hẹn có trạng thái "<status>"` | The order is `Done`, `Cancelled` or `Overdue`. |
| `Dịch vụ hiện không hoạt động` | The service is `Inactive`. |

### 401 Unauthorized: not logged in

```json
{ "message": "Chưa đăng nhập" }
```

Also returned as `{ "message": "Token không hợp lệ hoặc đã hết hạn" }` when the token is invalid or expired.

### 403 Forbidden: not allowed

Returned when the user's role is not `PetOwner`:

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

Returned when the order belongs to another user:

```json
{ "message": "Bạn chỉ có thể tạo dịch vụ cho lịch hẹn của mình" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy lịch hẹn" }
```

Also returned as `{ "message": "Không tìm thấy dịch vụ" }` when the service does not exist.

### 409 Conflict: duplicate sequence number

```json
{ "message": "Số thứ tự dịch vụ đã tồn tại trong lịch hẹn này" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ, vui lòng thử lại sau" }
```