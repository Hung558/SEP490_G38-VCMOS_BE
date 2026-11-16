# API Documentation: List My Pet's Daily Logs

Let a pet owner view the daily observation logs of their own pet across all of the pet's hospitalizations, newest first (by `date`, then by creation time). Each log shows the name of the veterinarian who recorded it.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/inpatient-records/pets/:petId/daily-logs |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `PetOwner`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `petId` | string (ObjectId) | Yes | The pet's id. The pet must belong to the logged-in owner and be `Active`. |

## Query parameters

All parameters are optional. Dates use `YYYY-MM-DD` format and must be real calendar dates.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `recordId` | string (ObjectId) | – | Only logs of this hospitalization. It must belong to the pet. |
| `date` | string | – | Only logs on this exact date. |
| `from` | string | – | Only logs on or after this date. |
| `to` | string | – | Only logs on or before this date. `from` must not be after `to`. |
| `page` | integer | `1` | Page number (minimum 1). |
| `limit` | integer | `20` | Items per page (1 to 100). |

**Example**

```
GET /api/inpatient-records/pets/6ad96d4a9664da6b2c0d8d70/daily-logs?from=2026-11-15&limit=10
```

## Responses

### 200 OK: success

`inpatientRecordId` tells which hospitalization each log belongs to. `items` is an empty array when no log matches.

```json
{
  "items": [
    {
      "_id": "6ad96d4a9664da6b2c0d8db2",
      "date": "2026-11-16",
      "recordedById": {
        "_id": "6ad96d4a9664da6b2c0d8d55",
        "fullName": "Dr. Example Vet"
      },
      "observations": "Vomiting twice overnight, mild dehydration",
      "notes": "Continue IV fluids",
      "createdAt": "2026-11-16T09:00:00.000Z",
      "inpatientRecordId": "6ad96d4a9664da6b2c0d8da0"
    },
    {
      "_id": "6ad96d4a9664da6b2c0d8db1",
      "date": "2026-11-15",
      "recordedById": {
        "_id": "6ad96d4a9664da6b2c0d8d56",
        "fullName": "Dr. Another Vet"
      },
      "observations": "Eating small amounts, temperature normal",
      "createdAt": "2026-11-15T14:30:00.000Z",
      "inpatientRecordId": "6ad96d4a9664da6b2c0d8da0"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

A field that was not recorded (`observations` or `notes`) is omitted from the log.

### 400 Bad Request: invalid petId

```json
{ "message": "petId không hợp lệ" }
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
  "recordId không hợp lệ",
  "date phải có định dạng YYYY-MM-DD và là ngày hợp lệ",
  "from phải có định dạng YYYY-MM-DD và là ngày hợp lệ",
  "to phải có định dạng YYYY-MM-DD và là ngày hợp lệ"
]
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

### 404 Not Found: pet or hospitalization not found

The same response is returned when the pet exists but belongs to another owner.

```json
{ "message": "Không tìm thấy thú cưng" }
```
Or when `recordId` does not belong to the pet:
```json
{ "message": "Không tìm thấy hồ sơ nội trú" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ" }
```