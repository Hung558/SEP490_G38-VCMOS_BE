# API Documentation: Export Invoice PDF

Generate and stream a formatted Vietnamese PDF receipt (`application/pdf`) containing clinic details, pet/owner info, snapshot line items, total amount, and payment status (`UC-48`, `SCR-15`).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/:id/pdf |
| **Auth** | Required: `Authorization: Bearer <token>` (roles: `Receptionist`, `Admin`, `PetOwner`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The invoice `_id`. |

## Responses

### 200 OK: PDF stream

- `Content-Type`: `application/pdf`
- `Content-Disposition`: `inline; filename="<invoice.code>.pdf"`
- Body: Binary PDF file bytes (`%PDF-...`).

### 400 / 403 / 404

- `400`: `{ "message": "ID hóa đơn không hợp lệ" }`
- `403`: `{ "message": "Bạn không có quyền truy cập hóa đơn này" }` (`BR-23` đối với `PetOwner` không phải chủ thú cưng)
- `404`: `{ "message": "Không tìm thấy hóa đơn" }`

