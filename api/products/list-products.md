# API Documentation: List Products

Get a paginated list of products, optionally filtered by category, status or a search keyword. Results are sorted by creation time, newest first.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/products |
| **Auth** | None (public) |

## Query parameters

All parameters are optional. An empty value (e.g. `?category=`) is treated as "not provided".

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | No | Filter by category. One of `Medicine`, `Vaccine`, `Retail`. |
| `status` | string | No | Filter by status. One of `Active`, `Inactive`. |
| `search` | string | No | Keyword matched against product `name` or `code` (case-insensitive, partial match). Leading/trailing spaces are trimmed. Max 100 characters. Special characters are matched literally. |
| `page` | integer | No | Page number, starting at 1. Default `1`. |
| `limit` | integer | No | Items per page, from 1 to 100. Default `20`. |

**Example**

```
GET /api/products?category=Medicine&status=Active&search=para&page=1&limit=10
```

## Responses

### 200 OK: success

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "64b7f0c2a1b2c3d4e5f60718",
        "code": "PRD-K7M2QX",
        "name": "Paracetamol 500mg",
        "category": "Medicine",
        "unit": "Box",
        "unitPrice": 15000,
        "status": "Active",
        "createdAt": "2026-11-02T08:15:30.123Z",
        "updatedAt": "2026-11-02T08:15:30.123Z",
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
| `items` | Products on the current page. `unitPrice` is omitted for products that have none. |
| `total` | Total number of products matching the filters (across all pages). |
| `page` | Current page number. |
| `limit` | Page size used. |
| `totalPages` | `ceil(total / limit)`. `0` when nothing matches. |

### 400 Bad Request: validation failed

```json
{
  "success": false,
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "category", "message": "Loại sản phẩm phải là một trong: Medicine, Vaccine, Retail" },
    { "field": "limit", "message": "limit không được vượt quá 100" }
  ]
}
```

Possible `errors` entries:

| `field` | `message` |
|---|---|
| `category` | Loại sản phẩm phải là một trong: Medicine, Vaccine, Retail |
| `status` | Trạng thái phải là một trong: Active, Inactive |
| `search` | Từ khóa tìm kiếm phải là chuỗi / Từ khóa tìm kiếm không được vượt quá 100 ký tự |
| `page` | page phải là số nguyên dương |
| `limit` | limit phải là số nguyên dương / limit không được vượt quá 100 |

### 500 Internal Server Error

```json
{ "success": false, "message": "Lỗi máy chủ nội bộ" }
```