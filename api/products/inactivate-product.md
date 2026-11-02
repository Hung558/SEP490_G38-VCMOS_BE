# API Documentation: Inactivate Product

Set a product's status to `Inactive` (soft delete). The product is not removed from the database and can be restored with the [activate](activate-product.md) endpoint. Calling this on a product that is already `Inactive` is allowed and simply returns the product unchanged.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/products/:id/inactivate |
| **Auth** | Required: `Authorization: Bearer <token>`, role `Admin` only |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Product `_id`: a 24-character hexadecimal MongoDB ObjectId. |

## Request body

None.

**Example**

```
PATCH /api/products/64b7f0c2a1b2c3d4e5f60718/inactivate
Authorization: Bearer <token>
```

## Responses

### 200 OK: success

Returns the product after the update.

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
    "status": "Inactive",
    "createdAt": "2026-11-02T08:15:30.123Z",
    "updatedAt": "2026-11-02T09:12:03.321Z",
    "__v": 0
  }
}
```

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

### 401 Unauthorized: not logged in

```json
{ "message": "Chưa đăng nhập" }
```

Or, when the token is invalid or expired:

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: not an Admin

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found: product does not exist

```json
{ "success": false, "message": "Không tìm thấy sản phẩm" }
```

### 500 Internal Server Error

```json
{ "success": false, "message": "Lỗi máy chủ nội bộ" }
```