# API Documentation: List Invoices

List all invoices with filters and pagination for Receptionist and Admin (`SCR-20`). Sorted newest `issuedAt` first.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices |
| **Auth** | Required: `Authorization: Bearer <token>` (roles: `Receptionist`, `Admin`) |

## Query parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paymentStatus` | string | No | Filter by `Unpaid`, `Paid`, or `Refunded`. |
| `paymentMethod` | string | No | Filter by `Cash` or `VNPay`. |
| `orderId` | string (ObjectId) | No | Filter by appointment order id. |
| `inpatientRecordId` | string (ObjectId) | No | Filter by inpatient record id. |
| `petId` | string (ObjectId) | No | Filter invoices belonging to a specific pet. |
| `code` | string | No | Filter by exact invoice code (case-insensitive, e.g. `INV-K8M2PX`). |
| `from` | string (`YYYY-MM-DD`) | No | Start date (`issuedAt >= from 00:00:00+07:00`). |
| `to` | string (`YYYY-MM-DD`) | No | End date (`issuedAt <= to 23:59:59+07:00`). |
| `page` | number | No | Page number (default `1`). |
| `limit` | number | No | Page size (`1..100`, default `20`). |

## Responses

### 200 OK: success

```json
{
  "items": [
    {
      "_id": "6ad96d4a9664da6b2c0d8e01",
      "code": "INV-K8M2PX",
      "totalAmount": 320000,
      "paymentMethod": "Cash",
      "paymentStatus": "Paid",
      "issuedAt": "2026-11-17T08:15:00.000Z",
      "paidAt": "2026-11-17T08:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 400 / 401 / 403

- `400`: `{ "message": "Tham số lọc danh sách hóa đơn không hợp lệ", "errors": { ... } }`
- `401`: `{ "message": "Chưa đăng nhập" }`
- `403`: `{ "message": "Bạn không có quyền thực hiện chức năng này" }`

