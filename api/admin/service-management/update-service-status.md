# API Documentation: Activate / Deactivate Service (Admin - SCR-29, UC-66)

Toggle a service's status between `Active` and `Inactive`. Inactive services disappear from new customer bookings (`SCR-02`, `SCR-12`) while remaining intact on historical appointment orders and invoices (`BR-16`).

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/services/:id/status |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `status` | string | Yes | Target status: `Active` or `Inactive`. |

**Example**

```json
{
  "status": "Inactive"
}
```

## Responses

### 200 OK: success

```json
{
  "service": {
    "_id": "6ad96d4a9664da6b2c0d8d71",
    "code": "SRV-K7M2QX",
    "name": "Khám tổng quát chuyên sâu",
    "category": "Examination",
    "defaultDuration": 30,
    "basePrice": 150000,
    "status": "Inactive",
    "description": "Khám lâm sàng toàn diện cho thú cưng",
    "createdAt": "2026-10-31T10:00:00.000Z",
    "updatedAt": "2026-10-31T10:10:00.000Z"
  }
}
```

### 400 Bad Request: invalid status

```json
{
  "message": "Trạng thái dịch vụ chỉ được là Active hoặc Inactive",
  "errors": {
    "status": "Trạng thái dịch vụ chỉ được là Active hoặc Inactive"
  }
}
```

### 404 Not Found

```json
{ "message": "Không tìm thấy dịch vụ" }
```

