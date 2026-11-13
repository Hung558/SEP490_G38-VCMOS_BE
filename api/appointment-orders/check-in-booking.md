# API Documentation: Check-in Appointment

Check in an appointment when the customer arrives at the clinic. Only appointments with status `Booked` can be checked in. On success, the status changes to `CheckedIn` and `checkedInAt` is set to the current time.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/appointment-orders/:id/check-in |
| **Auth** | Required. Bearer token, role `Receptionist` only |
| **Content-Type** | Not required (no request body) |

## Request headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer <token>`, the token returned by the login API. |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The appointment `_id` (a valid MongoDB ObjectId). |

## Request body

Optional JSON body. Receptionist can optionally assign an available holding cage and specify isolation requirement directly during check-in (UC-22, BR-09, BR-11).

| Field | Type | Required | Description |
|---|---|---|---|
| `intake` | object | Conditional | Receptionist initial check-in assessment (`{ symptoms, initialCondition }`). When sent, both `symptoms` and `initialCondition` must be non-empty strings (max 500 characters each). Kept optional on omit while FE rollout flag is off. |
| `cageId` | string | No | The `_id` of an available cage to assign. Must match pet weight according to BR-11 (S: $\le$5kg, M: 5–15kg, L: 15–30kg, XL: >30kg). |
| `requiresIsolation` | boolean | No | Set to `true` if pet is suspected of contagious diseases (requires an `isIsolated = true` cage). Defaults to `false`. |

**Example 1: Check-in with initial assessment (`intake`)**
```json
{
  "intake": {
    "symptoms": "Bé bỏ ăn 1 ngày, ho nhẹ vào buổi sáng",
    "initialCondition": "Tỉnh táo, hơi mệt, không sốt"
  }
}
```

**Example 2: Check-in with initial assessment and cage assignment**
```json
{
  "intake": {
    "symptoms": "Nôn 2 lần, tiêu chảy nhẹ",
    "initialCondition": "Mệt nhẹ, cần theo dõi cách ly"
  },
  "cageId": "6ad96d4a9664da6b2c0d8d70",
  "requiresIsolation": true
}
```

```
PATCH /api/appointment-orders/6ad96d4a9664da6b2c0d8d70/check-in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

## Responses

### 200 OK: success

```json
{
  "message": "Check-in thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "code": "APT-K7M2QX",
    "petId": "6ad96d4a9664da6b2c0d8d65",
    "ownerId": "6ad96d4a9664da6b2c0d8d61",
    "date": "2026-11-05",
    "note": "Khám tổng quát",
    "intake": {
      "symptoms": "Bé bỏ ăn 1 ngày, ho nhẹ vào buổi sáng",
      "initialCondition": "Tỉnh táo, hơi mệt, không sốt",
      "recordedBy": "6ad96d4a9664da6b2c0d8d60",
      "recordedAt": "2026-11-05T02:30:00.000Z"
    },
    "isOnline": true,
    "derivedStatus": "CheckedIn",
    "checkedInAt": "2026-11-05T02:30:00.000Z",
    "createdAt": "2026-11-03T09:15:00.000Z",
    "updatedAt": "2026-11-05T02:30:00.000Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

Returned when `id` or `cageId` is not a valid MongoDB ObjectId, or when the selected cage size does not accommodate pet weight / isolation requirement according to BR-11.

```json
{
  "message": "Chuồng cỡ S (tối đa 5kg) không phù hợp với thú cưng nặng 8.5kg"
}
```

### 401 Unauthorized: missing or invalid token

Returned when the `Authorization` header is missing or does not start with `Bearer `.

```json
{
  "message": "Chưa đăng nhập"
}
```

Returned when the token is invalid or expired.

```json
{
  "message": "Token không hợp lệ hoặc đã hết hạn"
}
```

### 403 Forbidden: role not allowed

Returned when the logged-in user is not a Receptionist (for example a `PetOwner`).

```json
{
  "message": "Bạn không có quyền thực hiện chức năng này"
}
```

### 404 Not Found: appointment does not exist

```json
{
  "message": "Không tìm thấy lịch hẹn"
}
```

### 409 Conflict: appointment is not in `Booked` status

Returned when the appointment is already `CheckedIn` or is in any other status (`InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`). The current status is included in the message.

```json
{
  "message": "Không thể check-in lịch hẹn đang ở trạng thái \"CheckedIn\""
}
```

### 500 Internal Server Error

```json
{
  "message": "Lỗi hệ thống"
}
```

## Notes

- The status check and the update happen in one atomic operation, so if two requests check in the same appointment at the same time, only one succeeds and the other receives `409`.
- The endpoint is not scoped to an owner. Any Receptionist can check in any appointment.