# API Documentation: Get Cages

Get a paginated list of cages, with optional filters and sorting.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/cages |
| **Auth** | Required (Bearer token). Roles: `Admin`, `Receptionist` |

## Request headers

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` |

## Query parameters

All parameters are optional. Unknown parameters are ignored.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | | Filter by status. One of `Available`, `Occupied`. |
| `size` | string | | Filter by size. One of `S`, `M`, `L`, `XL`. |
| `isIsolated` | string | | Filter by isolation. `true` or `false`. |
| `page` | integer | `1` | Page number. Must be a positive integer. |
| `limit` | integer | `20` | Items per page. Integer from 1 to 100. |
| `sort` | string | `label` | Sort field: `label`, `size`, `status`, `createdAt`, `updatedAt`. Prefix with `-` for descending order (e.g. `-createdAt`). |

**Example**

```
GET /api/cages?status=Available&size=M&page=1&limit=10&sort=-createdAt
```

## Responses

### 200 OK: success

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "6ad96d4a9664da6b2c0d8d70",
        "label": "A-01",
        "size": "M",
        "isIsolated": false,
        "status": "Available",
        "createdAt": "2026-11-05T03:15:42.118Z",
        "updatedAt": "2026-11-05T03:15:42.118Z",
        "__v": 0
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

| Field | Description |
|---|---|
| `items` | Cages on the current page. |
| `total` | Number of cages matching the filters (across all pages). |
| `page` | Current page number. |
| `limit` | Items per page. |
| `totalPages` | `ceil(total / limit)`. |

### 400 Bad Request: validation failed

`message` is the first error; `errors` lists every error found.

```json
{
  "success": false,
  "message": "Trạng thái chuồng phải là một trong: Available, Occupied",
  "errors": [
    "Trạng thái chuồng phải là một trong: Available, Occupied",
    "Số trang phải là số nguyên dương"
  ]
}
```

Possible error messages:

| Message | Cause |
|---|---|
| `Trạng thái chuồng phải là một trong: Available, Occupied` | `status` is not an allowed value. |
| `Kích thước chuồng phải là một trong: S, M, L, XL` | `size` is not an allowed value. |
| `Trạng thái cách ly phải là true hoặc false` | `isIsolated` is not `true` or `false`. |
| `Số trang phải là số nguyên dương` | `page` is not a positive integer. |
| `Số lượng mỗi trang phải là số nguyên từ 1 đến 100` | `limit` is not an integer from 1 to 100. |
| `Trường sắp xếp phải là một trong: label, size, status, createdAt, updatedAt (thêm "-" phía trước để sắp xếp giảm dần)` | `sort` is not an allowed field. |

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

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Đã xảy ra lỗi hệ thống"
}
```