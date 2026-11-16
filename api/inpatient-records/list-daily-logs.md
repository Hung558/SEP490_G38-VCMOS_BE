# API Documentation: List Daily Logs

Get the daily logs of an inpatient record, newest first (by `date`, then by creation time). The same logs are also included in [Get Inpatient Record](get-inpatient-record.md); use this endpoint to filter by date.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/inpatient-records/:id/daily-logs |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Veterinarian`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The inpatient record id. |

## Query parameters

All parameters are optional. Dates use `YYYY-MM-DD` format and must be real calendar dates. This endpoint is not paginated.

| Parameter | Type | Description |
|---|---|---|
| `date` | string | Only logs on this exact date. |
| `from` | string | Only logs on or after this date. |
| `to` | string | Only logs on or before this date. `from` must not be after `to`. |

**Example**

```
GET /api/inpatient-records/6ad96d4a9664da6b2c0d8da0/daily-logs?from=2026-11-15&to=2026-11-16
```

## Responses

### 200 OK: success

`items` is an empty array when no log matches.

```json
{
  "items": [
    {
      "_id": "6ad96d4a9664da6b2c0d8db2",
      "date": "2026-11-16",
      "recordedById": {
        "_id": "6ad96d4a9664da6b2c0d8d55",
        "code": "USR-VET001",
        "fullName": "Dr. Example Vet"
      },
      "observations": "Vomiting twice overnight, mild dehydration",
      "notes": "Continue IV fluids",
      "createdAt": "2026-11-16T09:00:00.000Z"
    },
    {
      "_id": "6ad96d4a9664da6b2c0d8db1",
      "date": "2026-11-15",
      "recordedById": {
        "_id": "6ad96d4a9664da6b2c0d8d56",
        "code": "USR-VET002",
        "fullName": "Dr. Another Vet"
      },
      "observations": "Eating small amounts, temperature normal",
      "createdAt": "2026-11-15T14:30:00.000Z"
    }
  ],
  "total": 2
}
```

### 400 Bad Request: invalid query parameters

`errors` is an array of messages.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": ["from không được sau to"]
}
```

Other possible entries in `errors`:

```json
[
  "date phải có định dạng YYYY-MM-DD và là ngày hợp lệ",
  "from phải có định dạng YYYY-MM-DD và là ngày hợp lệ",
  "to phải có định dạng YYYY-MM-DD và là ngày hợp lệ"
]
```

### 400 Bad Request: invalid id

```json
{ "message": "id không hợp lệ" }
```

### 401 Unauthorized: missing or invalid token
```json
{ "message": "Chưa đăng nhập" }
```
Or when the token is invalid or expired:
```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed or account not active
```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```
Or when the account is locked or inactive:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```
```json
{ "message": "Tài khoản đã ngừng hoạt động" }
```

### 404 Not Found: record does not exist

```json
{ "message": "Không tìm thấy hồ sơ nội trú" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ" }
```