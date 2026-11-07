# API Documentation: Get My Online Booking by ID

Get the details of one online appointment that belongs to the logged-in pet owner, including all services booked under that appointment.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-orders/me/:id |
| **Auth** | Required. `Authorization: Bearer <token>` (role `PetOwner` only) |
| **Content-Type** | None (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Appointment ID (24-character hex MongoDB ObjectId). |

**Example**

```
GET http://localhost:9999/api/appointment-orders/me/6ad96d4a9664da6b2c0d8d99
```

## Business rules

- Only appointments owned by the logged-in user and created online (`isOnline: true`) are returned.
- An appointment that exists but belongs to another user, or is not an online appointment, returns `404`, the same as one that does not exist.
- The response includes every service that belongs to the appointment in a `services` array, sorted by `sequenceNo` ascending.
- Services are only loaded after ownership of the appointment is verified, so an owner can never see services of another user's appointment.
- If the appointment has no services, `services` is an empty array (`[]`).

## Responses

### 200 OK: success

```json
{
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d99",
    "code": "APT-K7M2QX",
    "petId": "6ad96d4a9664da6b2c0d8d70",
    "ownerId": "6ad96d4a9664da6b2c0d8d61",
    "date": "2026-11-20",
    "note": "Khám tổng quát và tiêm phòng",
    "isOnline": true,
    "checkedInAt": null,
    "derivedStatus": "Booked",
    "createdAt": "2026-11-03T03:15:42.123Z",
    "updatedAt": "2026-11-03T03:15:42.123Z",
    "services": [
      {
        "_id": "6ad96d4a9664da6b2c0d8e01",
        "orderId": "6ad96d4a9664da6b2c0d8d99",
        "serviceId": {
          "_id": "6ad96d4a9664da6b2c0d8c10",
          "name": "Khám tổng quát"
        },
        "sequenceNo": 1,
        "preferredStaffId": {
          "_id": "6ad96d4a9664da6b2c0d8b05",
          "fullName": "Nguyễn Văn A"
        },
        "assignedStaffId": null,
        "status": "Booked",
        "isEmergency": false,
        "queueNo": null,
        "enqueueAt": null,
        "dequeueAt": null,
        "groomingNote": null,
        "createdAt": "2026-11-03T03:15:42.456Z",
        "updatedAt": "2026-11-03T03:15:42.456Z"
      }
    ]
  }
}
```

`derivedStatus` (appointment) is one of: `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`.

#### `services[]` fields

| Field | Type | Description |
|---|---|---|
| `_id` | string | Appointment service ID. |
| `orderId` | string | ID of the parent appointment. |
| `serviceId` | object | The booked service, populated with the full `Service` document (fields depend on the `Service` model; `_id` and `name` are shown in the example). |
| `sequenceNo` | number | Order of the service within the appointment. Unique per appointment; the array is sorted by this field. |
| `preferredStaffId` | object \| null | Staff the owner prefers: `{ _id, fullName }`, or `null` if none. |
| `assignedStaffId` | object \| null | Staff assigned to perform the service: `{ _id, fullName }`, or `null` if not yet assigned. |
| `status` | string | One of: `Booked`, `Waiting`, `InProgress`, `Done`, `Cancelled`, `Overdue`. Note this differs from the appointment's `derivedStatus`. |
| `isEmergency` | boolean | Whether the service is flagged as an emergency. |
| `queueNo` | number \| null | Queue number, `null` until queued. |
| `enqueueAt` | string (ISO date) \| null | When the service entered the queue. |
| `dequeueAt` | string (ISO date) \| null | When the service left the queue. |
| `groomingNote` | object \| null | Grooming record, `null` if none. When present: `beforeNote`, `afterNote`, `beforePhotoUrl`, `afterPhotoUrl`, `recommendations`, `createdAt`. |
| `createdAt` | string (ISO date) | Creation time. |
| `updatedAt` | string (ISO date) | Last update time. |

### 400 Bad Request: invalid id

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "id", "message": "id không hợp lệ" }
  ]
}
```

### 401 Unauthorized: missing or invalid token

Returned by the `protect` middleware. Exact message depends on the middleware.

### 403 Forbidden: role not allowed

Returned by the `authorize('PetOwner')` middleware when the logged-in user is not a pet owner.

### 404 Not Found: appointment not found

```json
{ "message": "Không tìm thấy lịch hẹn" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```