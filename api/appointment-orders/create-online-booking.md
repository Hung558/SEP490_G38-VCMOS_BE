# API Documentation: Create Online Booking

Create an online appointment for one of the logged-in pet owner's pets. The owner is taken from the token, never from the request body. A unique appointment code (e.g. `APT-K7M2QX`) is generated automatically and the appointment starts with the status `Booked`.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/appointment-orders/online |
| **Auth** | Required. `Authorization: Bearer <token>` (role `PetOwner` only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | ID of the pet to book for (24-character hex MongoDB ObjectId). The pet must belong to the logged-in user. |
| `date` | string | Yes | Appointment date in `YYYY-MM-DD` format. Must be a real calendar date (e.g. `2026-02-31` is rejected) and must not be in the past (compared against today in Vietnam time, `Asia/Ho_Chi_Minh`). |
| `note` | string | No | Free-text note. Leading/trailing spaces are trimmed. Maximum 500 characters. `null` or an empty string is treated as not provided. |

**Example**

```json
{
  "petId": "6ad96d4a9664da6b2c0d8d70",
  "date": "2026-11-20",
  "note": "Khám tổng quát và tiêm phòng"
}
```

## Business rules

- The pet must exist and belong to the current user.
- A pet cannot have two appointments on the same date, unless the existing one is `Cancelled`.

## Responses

### 201 Created: success

```json
{
  "message": "Đặt lịch thành công",
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

### 400 Bad Request: validation failed

`errors` is an array of `{ field, message }`. All failing fields are reported together.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "petId", "message": "petId không hợp lệ" },
    { "field": "date", "message": "Ngày hẹn không được ở trong quá khứ" }
  ]
}
```

Possible validation messages:

| Field | Message |
|---|---|
| `petId` | `petId không hợp lệ` |
| `date` | `Ngày phải đúng định dạng YYYY-MM-DD và hợp lệ` |
| `date` | `Ngày hẹn không được ở trong quá khứ` |
| `note` | `Ghi chú phải là chuỗi` |
| `note` | `Ghi chú tối đa 500 ký tự` |

### 401 Unauthorized: missing or invalid token

Returned by the `protect` middleware. Exact message depends on the middleware.

### 403 Forbidden: role not allowed

Returned by the `authorize('PetOwner')` middleware when the logged-in user is not a pet owner.

### 404 Not Found: pet not found

The pet does not exist or does not belong to the current user.

```json
{ "message": "Không tìm thấy thú cưng" }
```

### 409 Conflict: duplicate booking

The pet already has a non-cancelled appointment on the selected date.

```json
{ "message": "Thú cưng này đã có lịch hẹn trong ngày đã chọn" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```

Also returned with a specific message if a unique appointment code could not be generated after 5 attempts (very rare):

```json
{ "message": "Không thể tạo mã lịch hẹn, vui lòng thử lại" }
```