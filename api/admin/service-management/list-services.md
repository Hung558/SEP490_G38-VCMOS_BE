# API Documentation: List & Search Services (Public & Admin - UC-01, UC-66, SCR-02, SCR-29)

Get a list of clinic services, sorted newest first. Supports filtering by `category`, `status`, and keyword `search` (`name`, `code`, `description`).
- On public/customer screens (`SCR-02`, `SCR-12`), pass `?status=Active` to list only active services.
- On the Admin Service Catalogue screen (`SCR-29`), omit `status` (or pass `?status=Active` / `?status=Inactive`) to view and filter all services.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/services |
| **Auth** | Public (no token required) |
| **Content-Type** | Not applicable (no request body) |

## Query parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | No | Filter by category: `Examination`, `Vaccination`, `Grooming`, `Paraclinical`, or `Inpatient`. |
| `status` | string | No | Filter by service status: `Active` or `Inactive`. |
| `search` | string | No | Case-insensitive keyword search matching `name`, `code`, or `description`. |

**Example**

```
GET http://localhost:9999/api/services?category=Examination&status=Active&search=tổng quát
```

## Responses

### 200 OK: success

```json
{
  "services": [
    {
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
  ]
}
```

### 400 Bad Request: invalid filter value

```json
{ "message": "Danh mục lọc không hợp lệ" }
```

```json
{ "message": "Trạng thái lọc không hợp lệ" }
```

