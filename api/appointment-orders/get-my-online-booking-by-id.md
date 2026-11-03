# API Documentation: Get My Online Booking by ID

Get the details of one online appointment that belongs to the logged-in pet owner.

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
    "updatedAt": "2026-11-03T03:15:42.123Z"
  }
}
```

`derivedStatus` is one of: `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`.

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