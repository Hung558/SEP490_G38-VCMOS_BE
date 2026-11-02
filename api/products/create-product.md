# API Documentation: Create Product

Create a new product. The product `code` is generated automatically (format `PRD-XXXXXX`) and the new product always has status `Active`.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/products |
| **Auth** | Required: `Authorization: Bearer <token>`, role `Admin` only |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Product name. Leading/trailing spaces are trimmed. Max 200 characters. |
| `category` | string | Yes | One of `Medicine`, `Vaccine`, `Retail`. |
| `unit` | string | Yes | Unit of measure (e.g. `Box`, `Bottle`). Leading/trailing spaces are trimmed. Max 50 characters. |
| `unitPrice` | number | No | Price per unit. Must be a number (not a numeric string) and `>= 0`. |

`code` and `status` must **not** be sent: the request is rejected with 400 if either is present.

A product is unique by the pair (`name`, `unit`): the same name may exist with a different unit.

**Example**

```json
{
  "name": "Paracetamol 500mg",
  "category": "Medicine",
  "unit": "Box",
  "unitPrice": 15000
}
```

## Responses

### 201 Created: success

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

### 400 Bad Request: validation failed

```json
{
  "success": false,
  "message": "Dữ liệu không hợp lệ",
  "errors": [
    { "field": "name", "message": "Tên sản phẩm là bắt buộc và phải là chuỗi không rỗng" },
    { "field": "category", "message": "Loại sản phẩm là bắt buộc" }
  ]
}
```

Possible `errors` entries:

| `field` | `message` |
|---|---|
| `body` | Body phải là một object JSON |
| `name` | Tên sản phẩm là bắt buộc và phải là chuỗi không rỗng / Tên sản phẩm không được vượt quá 200 ký tự |
| `category` | Loại sản phẩm là bắt buộc / Loại sản phẩm phải là một trong: Medicine, Vaccine, Retail |
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

### 409 Conflict: duplicate product

A product with the same `name` and `unit` already exists (exact match after trimming).

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

In the rare case that a unique product code cannot be generated after several attempts:

```json
{
  "success": false,
  "message": "Không thể tạo mã sản phẩm duy nhất, vui lòng thử lại"
}
```