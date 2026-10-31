# API Documentation: Update Service (Admin - SCR-29, UC-66)

Update an existing clinic service's details. The auto-generated `code` (`SRV-XXXXXX`) is immutable and cannot be changed.

## Endpoint

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | http://localhost:9999/api/services/:id |
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
| `status` | string | No | `Active` or `Inactive`. |

**Example**

```json
{
  "name": "Khám tổng quát chuyên sâu (Gói tiêu chuẩn)",
  "category": "Examination",
  "defaultDuration": 45,
  "basePrice": 180000,
  "description": "Cập nhật thời lượng 45 phút và giá niêm yết mới"
}
```

## Responses

### 200 OK: success

```json
{
  "service": {
    "_id": "6ad96d4a9664da6b2c0d8d71",
    "code": "SRV-K7M2QX",
    "name": "Khám tổng quát chuyên sâu (Gói tiêu chuẩn)",
    "category": "Examination",
    "defaultDuration": 45,
    "basePrice": 180000,
    "status": "Active",
    "description": "Cập nhật thời lượng 45 phút và giá niêm yết mới",
    "createdAt": "2026-10-31T10:00:00.000Z",
    "updatedAt": "2026-10-31T10:05:00.000Z"
  }
}
```

### 400 Bad Request

```json
{
  "message": "Thời lượng thực hiện phải là số nguyên từ 5 đến 480 phút",
  "errors": {
    "defaultDuration": "Thời lượng thực hiện phải là số nguyên từ 5 đến 480 phút"
  }
}
```

### 404 Not Found

```json
{ "message": "Không tìm thấy dịch vụ" }
```

### 409 Conflict: duplicate name in the same category

```json
{ "message": "Tên dịch vụ đã tồn tại trong danh mục này" }
```

