# API Documentation: Create Service (Admin - SCR-29, UC-66, BR-24)

Create a new clinic service in the catalogue. The server automatically generates an immutable `SRV-XXXXXX` code (`BR-24`) and defaults `status` to `Active`. Service `name` must be unique within the same `category` (case-insensitive).

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/services |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Service name (3 to 100 characters, unique within the same `category`). |
| `category` | string | Yes | Must be one of: `Examination`, `Vaccination`, `Grooming`, `Paraclinical`, `Inpatient`. |
| `defaultDuration` | number | Yes | Integer duration in minutes (`5` to `480`). |
| `basePrice` | number | Yes | Listed base price in VND (`>= 0`). |
| `description` | string | No | Optional service description (up to 500 characters). |
| `status` | string | No | `Active` (default) or `Inactive`. |

**Example**

```json
{
  "name": "Khám tổng quát chuyên sâu",
  "category": "Examination",
  "defaultDuration": 30,
  "basePrice": 150000,
  "description": "Khám lâm sàng toàn diện cho thú cưng"
}
```

## Responses

### 201 Created: success

```json
{
  "service": {
    "_id": "6ad96d4a9664da6b2c0d8d71",
    "code": "SRV-K7M2QX",
    "name": "Khám tổng quát chuyên sâu",
    "category": "Examination",
    "defaultDuration": 30,
    "basePrice": 150000,
    "status": "Active",
    "description": "Khám lâm sàng toàn diện cho thú cưng",
    "createdAt": "2026-10-31T10:00:00.000Z",
    "updatedAt": "2026-10-31T10:00:00.000Z"
  }
}
```

### 400 Bad Request: validation failed

```json
{
  "message": "Tên dịch vụ phải có ít nhất 3 ký tự",
  "errors": {
    "name": "Tên dịch vụ phải có ít nhất 3 ký tự",
    "category": "Danh mục dịch vụ không hợp lệ",
    "defaultDuration": "Thời lượng thực hiện phải là số nguyên từ 5 đến 480 phút",
    "basePrice": "Giá niêm yết phải là số lớn hơn hoặc bằng 0"
  }
}
```

### 409 Conflict: duplicate name in the same category

```json
{ "message": "Tên dịch vụ đã tồn tại trong danh mục này" }
```

