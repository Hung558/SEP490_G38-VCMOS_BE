# API Documentation: Create Daily Log

Add a daily observation log to an inpatient record that is still `Admitted`. The log is recorded under the logged-in veterinarian.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/inpatient-records/:id/daily-logs |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Veterinarian`) |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The inpatient record id. |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | string | No | Log date in `YYYY-MM-DD` format, must be a real calendar date. Defaults to today (Vietnam time, UTC+7). Cannot be in the future or before the admission date. |
| `observations` | string | One of `observations` / `notes` | Clinical observations (max 2000 characters). Leading/trailing spaces are trimmed. |
| `notes` | string | One of `observations` / `notes` | Additional notes (max 2000 characters). Leading/trailing spaces are trimmed. |

**Business rules**

- The record must have status `Admitted`; logs cannot be added after discharge.
- The same date can have several logs (e.g. checks every few hours).
- `recordedById` cannot be set in the request; it is taken from the token.
- Any veterinarian can add a log, not only the attending veterinarian.

**Example**

```json
{
  "date": "2026-11-16",
  "observations": "Vomiting twice overnight, mild dehydration",
  "notes": "Continue IV fluids"
}
```

## Responses

### 201 Created: success

Returns the new log. A field that was not provided (`observations` or `notes`) is omitted.

```json
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
}
```

### 400 Bad Request: validation failed

`errors` is an array of messages.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": ["Cần nhập ít nhất observations hoặc notes"]
}
```

Other possible entries in `errors`:

```json
[
  "date phải có định dạng YYYY-MM-DD và là ngày hợp lệ",
  "observations phải là chuỗi",
  "notes phải là chuỗi",
  "observations không được vượt quá 2000 ký tự",
  "notes không được vượt quá 2000 ký tự"
]
```

### 400 Bad Request: invalid id

```json
{ "message": "id không hợp lệ" }
```

### 400 Bad Request: business rule violated

One of the following messages:

```json
{ "message": "Hồ sơ nội trú đã xuất viện, không thể thêm nhật ký" }
```
```json
{ "message": "Không thể ghi nhật ký cho ngày trong tương lai" }
```
```json
{ "message": "Ngày ghi nhật ký không được trước ngày nhập viện" }
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