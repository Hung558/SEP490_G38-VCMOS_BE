# API Documentation: Create Online Booking

Create an online appointment together with one or more services in a single request. The appointment belongs to the logged-in pet owner, starts with status `Booked`, and receives an auto-generated code (e.g. `APT-K7M2QX`). Active receptionists are notified by email.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/appointment-services/online-booking |
| **Auth** | Required. `Authorization: Bearer <token>` (token from [Login](login.md)) |
| **Role** | `PetOwner` only |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | Id of the pet to book for. The pet must belong to the logged-in user. |
| `date` | string | Yes | Appointment date in `YYYY-MM-DD` format. Must be a real calendar date (e.g. `2026-02-30` is rejected). |
| `note` | string | No | Note for the clinic. |
| `services` | array | Yes | List of services to book. Must contain at least one item. |

### `services[]` items

| Field | Type | Required | Description |
|---|---|---|---|
| `serviceId` | string | Yes | Id of the service. The service must exist and have status `Active`. |
| `sequenceNo` | integer | No | Order of the service within the appointment (positive integer, unique within the request). If omitted, it is assigned automatically as the highest number so far + 1, starting at `1`. |
| `isEmergency` | boolean | No | Mark the service as an emergency. Defaults to `false`. |

### Fields that must not be sent

The server sets these itself. Sending any of them returns `400`.

| Level | Fields |
|---|---|
| Request body | `code`, `isOnline`, `derivedStatus`, `checkedInAt` |
| Each `services[]` item | `orderId`, `preferredStaffId`, `assignedStaffId`, `status`, `queueNo`, `enqueueAt`, `dequeueAt`, `groomingNote` |

> The owner is always taken from the token. Any `ownerId` in the body is ignored.

**Example**

```json
{
  "petId": "6ad96d4a9664da6b2c0d8d70",
  "date": "2026-11-10",
  "note": "Bé hơi nhát, nhờ nhân viên nhẹ nhàng",
  "services": [
    {
      "serviceId": "6ad96d4a9664da6b2c0d8e01"
    },
    {
      "serviceId": "6ad96d4a9664da6b2c0d8e02",
      "sequenceNo": 2,
      "isEmergency": false
    }
  ]
}
```

## Responses

### 201 Created: success

```json
{
  "message": "Đặt lịch online thành công",
  "data": {
    "appointment": {
      "_id": "6ad96d4a9664da6b2c0d8f10",
      "code": "APT-K7M2QX",
      "petId": "6ad96d4a9664da6b2c0d8d70",
      "ownerId": "6ad96d4a9664da6b2c0d8d61",
      "date": "2026-11-10",
      "note": "Bé hơi nhát, nhờ nhân viên nhẹ nhàng",
      "isOnline": true,
      "derivedStatus": "Booked",
      "checkedInAt": null,
      "createdAt": "2026-11-07T03:15:42.118Z",
      "updatedAt": "2026-11-07T03:15:42.118Z",
      "__v": 0
    },
    "services": [
      {
        "_id": "6ad96d4a9664da6b2c0d8f11",
        "orderId": "6ad96d4a9664da6b2c0d8f10",
        "serviceId": "6ad96d4a9664da6b2c0d8e01",
        "sequenceNo": 1,
        "preferredStaffId": null,
        "assignedStaffId": null,
        "status": "Booked",
        "isEmergency": false,
        "queueNo": null,
        "enqueueAt": null,
        "dequeueAt": null,
        "groomingNote": null,
        "createdAt": "2026-11-07T03:15:42.201Z",
        "updatedAt": "2026-11-07T03:15:42.201Z",
        "__v": 0
      },
      {
        "_id": "6ad96d4a9664da6b2c0d8f12",
        "orderId": "6ad96d4a9664da6b2c0d8f10",
        "serviceId": "6ad96d4a9664da6b2c0d8e02",
        "sequenceNo": 2,
        "preferredStaffId": null,
        "assignedStaffId": null,
        "status": "Booked",
        "isEmergency": false,
        "queueNo": null,
        "enqueueAt": null,
        "dequeueAt": null,
        "groomingNote": null,
        "createdAt": "2026-11-07T03:15:42.263Z",
        "updatedAt": "2026-11-07T03:15:42.263Z",
        "__v": 0
      }
    ]
  }
}
```

`data.services` is returned in the order the services were sent.

### 400 Bad Request: validation failed

The response contains a single `message`. Errors in `services` are prefixed with the index of the failing item (starting at `0`).

```json
{
  "message": "services[1]: serviceId không hợp lệ"
}
```

Possible messages:

| Message | Cause |
|---|---|
| `Không được truyền các trường: <fields>` | A field that must not be sent was included in the body. |
| `petId là bắt buộc` / `petId không hợp lệ` | `petId` is missing or not a valid ObjectId. |
| `date là bắt buộc` | `date` is missing. |
| `date phải có định dạng YYYY-MM-DD và là ngày hợp lệ` | `date` is not a string in `YYYY-MM-DD` format or is not a real date. |
| `note phải là chuỗi` | `note` is not a string. |
| `Lịch hẹn phải có ít nhất một dịch vụ` | `services` is missing, not an array, or empty. |
| `services[i] không hợp lệ` | The item is not an object. |
| `services[i]: không được truyền các trường: <fields>` | A field that must not be sent was included in the item. |
| `services[i]: serviceId là bắt buộc` / `services[i]: serviceId không hợp lệ` | `serviceId` is missing or not a valid ObjectId. |
| `services[i]: sequenceNo phải là số nguyên dương` | `sequenceNo` is not a positive integer. |
| `services[i]: isEmergency phải là true hoặc false` | `isEmergency` is not a boolean. |
| `services[i]: Dịch vụ hiện không hoạt động` | The service exists but its status is not `Active`. |

### 401 Unauthorized: not logged in

```json
{
  "message": "Chưa đăng nhập"
}
```

or, when the token is invalid or expired:

```json
{
  "message": "Token không hợp lệ hoặc đã hết hạn"
}
```

### 403 Forbidden: role not allowed

Returned when the logged-in user is not a `PetOwner`.

```json
{
  "message": "Bạn không có quyền thực hiện chức năng này"
}
```

### 404 Not Found

```json
{
  "message": "Không tìm thấy thú cưng"
}
```

| Message | Cause |
|---|---|
| `Không tìm thấy thú cưng` | The pet does not exist or does not belong to the logged-in user. |
| `services[i]: Không tìm thấy dịch vụ` | The service does not exist. |

### 409 Conflict

```json
{
  "message": "Thú cưng này đã có lịch hẹn trong ngày đã chọn"
}
```

| Message | Cause |
|---|---|
| `Thú cưng này đã có lịch hẹn trong ngày đã chọn` | The pet already has a non-cancelled appointment on that date. |
| `services[i]: Số thứ tự dịch vụ bị trùng trong lịch hẹn này` | Two services in the request end up with the same `sequenceNo` (including numbers assigned automatically). |

### 500 Internal Server Error

```json
{
  "message": "Lỗi máy chủ, vui lòng thử lại sau"
}
```

If a unique appointment code cannot be generated after several attempts, the message is `Không thể tạo mã lịch hẹn, vui lòng thử lại`.

## Notes

- **All or nothing:** if creating any service fails, the appointment and the services already created are deleted, so no partial booking is left behind. This is done by manual cleanup, not a database transaction.
- **Email notification:** the receptionist email is sent as soon as the appointment is created, before the services. In the rare case where a service fails afterwards and the booking is rolled back, receptionists will already have been notified.
- **Past dates:** dates in the past are not rejected by the server.