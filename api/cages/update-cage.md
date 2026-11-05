# API Documentation: Update Cage

Partially update a cage. Only the fields provided in the body are changed.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/cages/:id |
| **Auth** | Required (Bearer token). Role: `Admin` |
| **Content-Type** | `application/json` |

## Request headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |

## Path parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string | Cage `_id`. Must be a valid MongoDB ObjectId. |

## Request body

All fields are optional, but at least one must be provided. Any other field in the body is ignored.

| Field | Type | Description |
|---|---|---|
| `label` | string | New label. Must be a non-empty string and unique across all cages. Leading/trailing spaces are trimmed. |
| `size` | string | New size. One of `S`, `M`, `L`, `XL`. |
| `isIsolated` | boolean | Whether the cage is an isolation cage. Must be a real boolean (`true`/`false`). |
| `status` | string | New status. One of `Available`, `Occupied`. |

**Example**

```
PATCH /api/cages/6ad96d4a9664da6b2c0d8d70
```

```json
{
  "status": "Occupied",
  "isIsolated": true
}
```

## Responses

### 200 OK: success

Returns the cage after the update.

```json
{
  "success": true,
  "message": "Cập nhật chuồng thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "label": "A-01",
    "size": "M",
    "isIsolated": true,
    "status": "Occupied",
    "createdAt": "2026-11-05T03:15:42.118Z",
    "updatedAt": "2026-11-05T04:02:10.554Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

The `id` is checked first; if it is invalid, the body is not checked. For body errors, `message` is the first error and `errors` lists every error found.

```json
{
  "success": false,
  "message": "Kích thước chuồng phải là một trong: S, M, L, XL",
  "errors": [
    "Kích thước chuồng phải là một trong: S, M, L, XL"
  ]
}
```

Possible error messages:

| Message | Cause |
|---|---|
| `Mã chuồng không hợp lệ` | `id` is not a valid ObjectId. |
| `Dữ liệu gửi lên không hợp lệ` | Body is not a JSON object. |
| `Cần cung cấp ít nhất một trường để cập nhật` | Body has no updatable field. |
| `Nhãn chuồng phải là chuỗi không rỗng` | `label` is not a string or is blank. |
| `Kích thước chuồng phải là một trong: S, M, L, XL` | `size` is not an allowed value. |
| `Trạng thái cách ly phải là true hoặc false` | `isIsolated` is not a boolean. |
| `Trạng thái chuồng phải là một trong: Available, Occupied` | `status` is not an allowed value. |

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found: cage does not exist

```json
{
  "success": false,
  "message": "Không tìm thấy chuồng"
}
```

### 409 Conflict: duplicate label

```json
{
  "success": false,
  "message": "Nhãn chuồng đã tồn tại"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Đã xảy ra lỗi hệ thống"
}
```