# API Documentation: Update Product

Update a product's information. This is a partial update: only the fields sent are changed. `code` and `status` cannot be changed here (use the [activate](activate-product.md) / [inactivate](inactivate-product.md) endpoints for status).

## Endpoint

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | http://localhost:9999/api/products/:id |
| **Auth** | Required: `Authorization: Bearer <token>`, role `Admin` only |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Product `_id`: a 24-character hexadecimal MongoDB ObjectId. |

## Request body

At least one of the fields below must be provided. Each provided field follows the same rules as on [create](create-product.md).

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | No | Product name. Trimmed, non-empty, max 200 characters. |
| `category` | string | No | One of `Medicine`, `Vaccine`, `Retail`. |
| `unit` | string | No | Unit of measure. Trimmed, non-empty, max 50 characters. |
| `unitPrice` | number | No | Price per unit. Must be a number `>= 0` (`0` is allowed). |

`code` and `status` must **not** be sent: the request is rejected with 400 if either is present.

**Example**

```json
{
  "name": "Paracetamol 500mg (new pack)",
  "unitPrice": 18000
}
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
    "name": "Paracetamol 500mg (new pack)",
    "category": "Medicine",
    "unit": "Box",
    "unitPrice": 18000,
    "status": "Active",
    "createdAt": "2026-11-02T08:15:30.123Z",
    "updatedAt": "2026-11-02T09:02:11.456Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

```json
{
  "success": false,
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "unitPrice", "message": "Đơn giá phải là số không âm" }
  ]
}
```

Possible `errors` entries:

| `field` | `message` |
|---|---|
| `id` | ID sản phẩm không hợp lệ (the response `message` is also "ID sản phẩm không hợp lệ") |
| `body` | Body phải là một object JSON / Cần cung cấp ít nhất một trường để cập nhật: name, category, unit, unitPrice |
| `name` | Tên sản phẩm là bắt buộc và phải là chuỗi không rỗng / Tên sản phẩm không được vượt quá 200 ký tự |
| `category` | Loại sản phẩm phải là một trong: Medicine, Vaccine, Retail |
| `unit` | Đơn vị tính là bắt buộc và phải là chuỗi không rỗng / Đơn vị tính không được vượt quá 50 ký tự |
| `unitPrice` | Đơn giá phải là số không âm |
| `code` | Không được phép chỉ định mã sản phẩm (được tạo tự động) |
| `status` | Không được phép chỉ định trạng thái; dùng activate/inactivate để thay đổi |

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

### 409 Conflict: duplicate product

The update would make this product have the same `name` and `unit` as another product.

```json
{
  "success": false,
  "message": "Sản phẩm với cùng tên và đơn vị tính đã tồn tại"
}
```

### 500 Internal Server Error

```json
{ "success": false, "message": "Lỗi máy chủ nội bộ" }
```