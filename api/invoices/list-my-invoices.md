# API Documentation: List My Invoices

Retrieve the authenticated `PetOwner`'s invoice history across all of their owned pets (`UC-48`, `SCR-15`, `BR-23`).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/me |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `PetOwner`) |

## Query parameters

Supports `paymentStatus`, `paymentMethod`, `petId` (must belong to the logged-in `PetOwner`), `from`, `to`, `page`, `limit`.

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

### 403 Forbidden: querying another owner's `petId` (`BR-23`)

```json
{ "message": "Bạn không có quyền xem hóa đơn của thú cưng này" }
```

