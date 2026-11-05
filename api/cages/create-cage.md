# API Documentation: Create Cage

Create a new cage.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/cages |
| **Auth** | Required (Bearer token). Role: `Admin` |
| **Content-Type** | `application/json` |

## Request headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `label` | string | Yes | Cage label. Must be a non-empty string and unique across all cages. Leading/trailing spaces are trimmed. |
| `size` | string | Yes | Cage size. One of `S`, `M`, `L`, `XL`. |
| `isIsolated` | boolean | No | Whether the cage is an isolation cage. Must be a real boolean (`true`/`false`). Defaults to `false`. |
| `status` | string | No | Cage status. One of `Available`, `Occupied`. Defaults to `Available`. |

Any other field in the body is ignored.

**Example**

```json
{
  "label": "A-01",
  "size": "M",
  "isIsolated": false
}
```

## Responses

### 201 Created: success

```json
{
  "success": true,
  "message": "Tạo chuồng thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "label": "A-01",
    "size": "M",
    "isIsolated": false,
    "status": "Available",
    "createdAt": "2026-11-05T03:15:42.118Z",
    "updatedAt": "2026-11-05T03:15:42.118Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

`message` is the first error; `errors` lists every error found.

```json
{
  "success": false,
  "message": "Nhãn chuồng phải là chuỗi không rỗng",
  "errors": [
    "Nhãn chuồng phải là chuỗi không rỗng",
    "Kích thước chuồng phải là một trong: S, M, L, XL"
  ]
}
```

Possible error messages:

| Message | Cause |
|---|---|
| `Dữ liệu gửi lên không hợp lệ` | Body is not a JSON object. |
| `Nhãn chuồng là bắt buộc` | `label` is missing. |
| `Nhãn chuồng phải là chuỗi không rỗng` | `label` is not a string or is blank. |
| `Kích thước chuồng là bắt buộc` | `size` is missing. |
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