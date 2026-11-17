# API Documentation: Update Invoice Retail Items

Add or remove `Product` items on an `Unpaid` invoice before payment (`UC-45` Alt Flow 5a, `SCR-20`). Recalculates `totalAmount` automatically without altering existing `Service` or `InpatientDay` snapshots.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/invoices/:id/items |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Receptionist`) |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The invoice `_id`. |

## Request body

Provide `addItems`, `removeItemIds`, or both.

| Field | Type | Required | Description |
|---|---|---|---|
| `addItems` | array | No | Array of `{ productId, quantity (1..99) }`. Only `Active` products are allowed (`BR-16`). |
| `removeItemIds` | array | No | Array of invoice item `_id` strings to remove. Only `type === "Product"` lines can be removed. |

**Example**

```json
{
  "addItems": [{ "productId": "6ad96d4a9664da6b2c0d8d91", "quantity": 2 }],
  "removeItemIds": ["6ad96d4a9664da6b2c0d8e03"]
}
```

## Responses

### 200 OK: success

```json
{
  "message": "Cập nhật sản phẩm hóa đơn thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8e01",
    "code": "INV-K8M2PX",
    "items": [],
    "totalAmount": 220000,
    "paymentStatus": "Unpaid"
  }
}
```

### 400 / 404 / 409

- `400`: `{ "message": "Chỉ được phép gỡ bỏ dòng sản phẩm/thuốc, không thể xóa dịch vụ đã hoàn thành" }` hoặc sản phẩm `Inactive`.
- `404`: `{ "message": "Không tìm thấy hóa đơn" }` hoặc `{ "message": "Không tìm thấy dòng hóa đơn có ID \"...\"" }`.
- `409`: `{ "message": "Không thể chỉnh sửa hóa đơn đang ở trạng thái \"Paid\"" }`

