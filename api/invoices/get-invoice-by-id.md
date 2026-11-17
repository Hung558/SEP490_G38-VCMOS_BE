# API Documentation: Get Invoice By ID

Get full itemized details of a single invoice (`UC-48`). `PetOwner` can only view invoices belonging to their own pets (`BR-23`). Hard deletion (`DELETE /api/invoices/:id`) is blocked with `403` (`BR-22`).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (roles: `Receptionist`, `Admin`, `PetOwner`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The invoice `_id`. |

## Responses

### 200 OK: success

Returns `{ data: <invoice with orderId, inpatientRecordId, issuedById populated> }`.

### 400 / 403 / 404

- `400`: `{ "message": "ID hóa đơn không hợp lệ", "errors": { "id": "ID hóa đơn không hợp lệ" } }`
- `403`: `{ "message": "Bạn không có quyền truy cập hóa đơn này" }` (khi `PetOwner` xem hóa đơn của người khác theo `BR-23`)
- `404`: `{ "message": "Không tìm thấy hóa đơn" }`

