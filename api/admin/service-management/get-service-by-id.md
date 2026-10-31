# API Documentation: Get Service By ID (Public & Admin - SCR-02, SCR-29)

Get the details of a single clinic service by its MongoDB `_id`.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/services/:id |
| **Auth** | Public (no token required) |
| **Content-Type** | Not applicable (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Valid MongoDB ObjectId of the service. |

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
    "status": "Active",
    "description": "Khám lâm sàng toàn diện cho thú cưng",
    "createdAt": "2026-10-31T10:00:00.000Z",
    "updatedAt": "2026-10-31T10:00:00.000Z"
  }
}
```

### 400 Bad Request: invalid ObjectId

```json
{ "message": "ID dịch vụ không hợp lệ" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy dịch vụ" }
```

