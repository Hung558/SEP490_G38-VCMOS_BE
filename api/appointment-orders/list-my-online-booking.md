# API Documentation: List My Online Bookings

List the logged-in pet owner's online appointments, with optional filters and pagination. Results are sorted by appointment date (newest first), then by creation time (newest first).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-orders/me |
| **Auth** | Required. `Authorization: Bearer <token>` (role `PetOwner` only) |
| **Content-Type** | None (no request body) |

## Query parameters

All parameters are optional. An empty value is treated as not provided.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | None | Filter by status. One of `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue`. |
| `from` | string | None | Only appointments on or after this date. Format `YYYY-MM-DD`, must be a real date. |
| `to` | string | None | Only appointments on or before this date. Format `YYYY-MM-DD`, must be a real date. Must not be earlier than `from`. |
| `page` | integer | `1` | Page number, `>= 1`. |
| `limit` | integer | `10` | Items per page, from `1` to `100`. |

**Example**

```
GET http://localhost:9999/api/appointment-orders/me?status=Booked&from=2026-11-01&to=2026-11-30&page=1&limit=10
```

## Business rules

- Only appointments owned by the logged-in user and created online (`isOnline: true`) are returned.
- If no appointments match, the response is still `200` with an empty `data` array.

## Responses

### 200 OK: success

```json
{
  "data": [
    {
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
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

| Pagination field | Description |
|---|---|
| `page` | Current page. |
| `limit` | Items per page. |
| `total` | Total number of matching appointments. |
| `totalPages` | `ceil(total / limit)`. |

### 400 Bad Request: validation failed

`errors` is an array of `{ field, message }`. All failing fields are reported together.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "status", "message": "Trạng thái không hợp lệ" },
    { "field": "limit", "message": "limit phải từ 1 đến 100" }
  ]
}
```

Possible validation messages:

| Field | Message |
|---|---|
| `status` | `Trạng thái không hợp lệ` |
| `from` | `from phải đúng định dạng YYYY-MM-DD và hợp lệ` |
| `to` | `to phải đúng định dạng YYYY-MM-DD và hợp lệ` |
| `from` | `from không được lớn hơn to` |
| `page` | `page phải là số nguyên >= 1` |
| `limit` | `limit phải từ 1 đến 100` |

### 401 Unauthorized: missing or invalid token

Returned by the `protect` middleware. Exact message depends on the middleware.

### 403 Forbidden: role not allowed

Returned by the `authorize('PetOwner')` middleware when the logged-in user is not a pet owner.

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```