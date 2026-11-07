# API Documentation: Assign Staff To Appointment Service (Receptionist - SCR-16)

Assign an active `Veterinarian` or `Groomer` to a specific service item (`AppointmentService`) within an appointment order.
- If the parent `AppointmentOrder` is already in `CheckedIn` (or `InProgress`) status, assigning a staff member automatically transitions the service status to **`Waiting`**, sets `enqueueAt` to the current time, and assigns the next `queueNo` in that staff member's work queue.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/appointment-services/:id/assign-staff |
| **Auth** | Required: `Authorization: Bearer <token>` (**Receptionist** role only) |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Valid MongoDB ObjectId of the `AppointmentService` document. |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `assignedStaffId` | string | Yes | Valid MongoDB ObjectId of an active `Veterinarian` or `Groomer`. |

**Example**

```json
{
  "assignedStaffId": "6ad96d4a9664da6b2c0d8d61"
}
```

## Responses

### 200 OK: success

```json
{
  "message": "Phân công nhân sự cho dịch vụ thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8f11",
    "orderId": "6ad96d4a9664da6b2c0d8f10",
    "serviceId": {
      "_id": "6ad96d4a9664da6b2c0d8e01",
      "code": "SRV-K7M2QX",
      "name": "Khám tổng quát chuyên sâu",
      "category": "Examination",
      "defaultDuration": 30,
      "basePrice": 150000
    },
    "sequenceNo": 1,
    "preferredStaffId": null,
    "assignedStaffId": {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "USR-K7M2QX",
      "fullName": "BS Trần Minh",
      "role": "Veterinarian",
      "status": "Active"
    },
    "status": "Waiting",
    "isEmergency": false,
    "queueNo": 1,
    "enqueueAt": "2026-11-07T16:45:00.000Z",
    "dequeueAt": null,
    "groomingNote": null
  }
}
```

### 400 Bad Request

```json
{ "message": "Nhân sự được phân công phải có vai trò Veterinarian hoặc Groomer" }
```

```json
{ "message": "Nhân sự được phân công hiện không ở trạng thái hoạt động (Active)" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy dịch vụ trong lịch hẹn" }
```

```json
{ "message": "Không tìm thấy nhân viên được phân công" }
```

### 409 Conflict

```json
{ "message": "Không thể phân công nhân sự cho dịch vụ đang ở trạng thái \"Done\"" }
```

