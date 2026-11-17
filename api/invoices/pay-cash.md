# API Documentation: Pay Invoice by Cash

Confirm cash payment for an `Unpaid` invoice (`UC-46`). Atomically marks the invoice `Paid` (`Cash`), transitions the `AppointmentOrder` to `Done`, finalizes all `Draft` `MedicalRecord`s (`Finalized` per `BR-14`), and closes open `CageAssignment`s to release cages back to `Available` (`UC-31`).

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/invoices/:id/pay-cash |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Receptionist`) |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The invoice `_id`. |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `cashReceived` | number | No | Amount given by the customer (`>= totalAmount`). If omitted, defaults to `totalAmount`. |

**Example**

```json
{
  "cashReceived": 500000
}
```

## Responses

### 200 OK: success

```json
{
  "message": "Thanh toán tiền mặt thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8e01",
    "code": "INV-K8M2PX",
    "totalAmount": 320000,
    "paymentMethod": "Cash",
    "paymentStatus": "Paid",
    "paidAt": "2026-11-17T08:30:00.000Z"
  },
  "cashReceived": 500000,
  "changeAmount": 180000
}
```

### 400 / 404 / 409

- `400`: `{ "message": "Số tiền khách đưa phải lớn hơn hoặc bằng tổng tiền hóa đơn", "errors": { "cashReceived": "..." } }`
- `404`: `{ "message": "Không tìm thấy hóa đơn" }`
- `409`: `{ "message": "Hóa đơn này đã ở trạng thái \"Paid\", không thể thanh toán lại" }`

