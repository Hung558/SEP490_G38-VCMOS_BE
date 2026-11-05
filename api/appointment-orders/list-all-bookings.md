# API Documentation: List All Bookings

Get a paginated list of all appointment orders (online and walk-in, any owner). Intended for staff. Results are sorted by appointment date, newest first.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-orders |
| **Auth** | Required. `Authorization: Bearer <token>` |
| **Allowed roles** | `Admin`, `Receptionist` |

## Query parameters

All parameters are optional. Empty values (`?status=`) are treated as not provided. Filters are combined with AND.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | | Filter by status. One of `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`. |
| `isOnline` | boolean | | `true` for online bookings, `false` for walk-in bookings. Omit to get both. |
| `ownerId` | string | | Filter by owner. Must be a 24-character hex MongoDB ObjectId. |
| `petId` | string | | Filter by pet. Must be a 24-character hex MongoDB ObjectId. |
| `code` | string | | Exact appointment code, e.g. `APT-K7M2QX`. Trimmed and uppercased before matching. Partial codes are rejected. |
| `from` | string | | Earliest appointment date (inclusive), format `YYYY-MM-DD`. Must be a real calendar date. |
| `to` | string | | Latest appointment date (inclusive), format `YYYY-MM-DD`. Must be a real calendar date and not earlier than `from`. |
| `page` | integer | `1` | Page number. Must be an integer >= 1. |
| `limit` | integer | `10` | Items per page. Must be an integer from 1 to 100. |

**Example**

```
GET http://localhost:9999/api/appointment-orders?status=Booked&isOnline=true&from=2026-11-01&to=2026-11-30&page=1&limit=10
Authorization: Bearer <token>
```

## Responses

### 200 OK: success

`data` is the list of appointments on the requested page. `petId` and `ownerId` are populated with a subset of the pet and owner documents. `note` is only present when it was provided. `checkedInAt` is `null` until the appointment is checked in.

```json
{
  "data": [
    {
      "_id": "6b0a1f4e9664da6b2c0d9a10",
      "code": "APT-K7M2QX",
      "petId": {
        "_id": "6ad96d4a9664da6b2c0d8d70",
        "name": "Milo"
      },
      "ownerId": {
        "_id": "6ad96d4a9664da6b2c0d8d61",
        "fullName": "Example User",
        "phone": "0987654321"
      },
      "date": "2026-11-10",
      "note": "Tiêm phòng định kỳ",
      "isOnline": true,
      "derivedStatus": "Booked",
      "checkedInAt": null,
      "createdAt": "2026-11-05T03:12:44.918Z",
      "updatedAt": "2026-11-05T03:12:44.918Z",
      "__v": 0
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

**Appointment fields (items in `data`)**

| Field | Type | Description |
|---|---|---|
| `_id` | string | Appointment ID (MongoDB ObjectId). |
| `code` | string | Unique appointment code, uppercase, e.g. `APT-K7M2QX`. |
| `petId` | object | Populated pet: `{ _id, name }`. |
| `ownerId` | object | Populated owner: `{ _id, fullName, phone }`. |
| `date` | string | Appointment date, `YYYY-MM-DD`. |
| `note` | string | Optional note. Omitted when not provided. |
| `isOnline` | boolean | `true` for online bookings, `false` for walk-in. |
| `derivedStatus` | string | One of `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`. |
| `checkedInAt` | string \| null | ISO date-time of check-in, `null` until checked in. |
| `createdAt` | string | ISO date-time the record was created. |
| `updatedAt` | string | ISO date-time the record was last updated. |
| `__v` | number | Mongoose version key. |

**Pagination fields**

| Field | Type | Description |
|---|---|---|
| `page` | number | Current page. |
| `limit` | number | Items per page. |
| `total` | number | Total number of appointments matching the filters. |
| `totalPages` | number | `ceil(total / limit)`. `0` when nothing matches. |

When no appointment matches, the response is still `200 OK` with `"data": []`.

### 400 Bad Request: validation failed

`errors` is an array with one entry per invalid field. A single request can return several errors.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "status", "message": "Trạng thái không hợp lệ" },
    { "field": "from", "message": "from không được lớn hơn to" },
    { "field": "limit", "message": "limit phải từ 1 đến 100" }
  ]
}
```

**Possible validation errors**

| Field | Message |
|---|---|
| `status` | `Trạng thái không hợp lệ` |
| `isOnline` | `isOnline phải là true hoặc false` |
| `ownerId` | `ownerId không hợp lệ` |
| `petId` | `petId không hợp lệ` |
| `code` | `Mã lịch hẹn không hợp lệ (ví dụ: APT-K7M2QX)` |
| `from` | `from phải đúng định dạng YYYY-MM-DD và hợp lệ` or `from không được lớn hơn to` |
| `to` | `to phải đúng định dạng YYYY-MM-DD và hợp lệ` |
| `page` | `page phải là số nguyên >= 1` |
| `limit` | `limit phải từ 1 đến 100` |

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed

Returned when the logged-in user's role is not `Admin` or `Receptionist` (for example `PetOwner`).

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```