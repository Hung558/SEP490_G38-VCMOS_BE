# API Documentation: Get Product by ID

Get the details of a single product by its ID.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/products/:id |
| **Auth** | None (public) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Product `_id`: a 24-character hexadecimal MongoDB ObjectId. |

**Example**

```
GET /api/products/64b7f0c2a1b2c3d4e5f60718
```

## Responses

### 200 OK: success

```json
{
  "success": true,
  "data": {
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
}
```

`unitPrice` is omitted for products that have none.

### 400 Bad Request: invalid ID

```json
{
  "success": false,
  "message": "ID sản phẩm không hợp lệ",
  "errors": [
    { "field": "id", "message": "ID sản phẩm không hợp lệ" }
  ]
}
```

### 404 Not Found: product does not exist

```json
{ "success": false, "message": "Không tìm thấy sản phẩm" }
```

### 500 Internal Server Error

```json
{ "success": false, "message": "Lỗi máy chủ nội bộ" }
```