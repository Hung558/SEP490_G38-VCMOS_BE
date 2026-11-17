# API Documentation: Create Invoice

Create a consolidated invoice (`Unpaid`) for a completed outpatient order (`WaitOwner`) or a `Discharged` inpatient stay. Automatically aggregates completed services, prescribed medications from Medical Records, inpatient daily charges, and optional retail OTC products with immutable price snapshots (`BR-16`, `BR-24`).

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/invoices |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Receptionist`) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `orderId` | string (ObjectId) | Conditional | The appointment order id. Required if `inpatientRecordId` is not provided. |
| `inpatientRecordId` | string (ObjectId) | Conditional | The discharged inpatient record id. Required if `orderId` is not provided. |
| `prescriptionQuantities` | array | No | Optional overrides for prescribed item quantities (`[{ productId, quantity (1..999) }]`). Defaults to `1` per prescription line. |
| `retailItems` | array | No | Retail OTC products bought at the counter (`[{ productId, quantity (1..99) }]`). Only `Active` products are allowed (`BR-16`). |
| `inpatientDailyRate` | number | No | Fallback VND daily rate (`>= 0`) if the order/catalog has no `Inpatient` service. |

**Example**

```json
{
  "orderId": "6ad96d4a9664da6b2c0d8d85",
  "prescriptionQuantities": [
    { "productId": "6ad96d4a9664da6b2c0d8d90", "quantity": 2 }
  ],
  "retailItems": [
    { "productId": "6ad96d4a9664da6b2c0d8d91", "quantity": 1 }
  ]
}
```

## Responses

### 201 Created: success

```json
{
  "message": "Lập hóa đơn thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8e01",
    "code": "INV-K8M2PX",
    "orderId": {
      "_id": "6ad96d4a9664da6b2c0d8d85",
      "code": "APT-A1B2C3",
      "date": "2026-11-17",
      "derivedStatus": "WaitOwner",
      "petId": {
        "_id": "6ad96d4a9664da6b2c0d8d70",
        "code": "PET-000001",
        "name": "Bông",
        "species": "Dog",
        "breed": "Corgi",
        "weight": 8
      },
      "ownerId": {
        "_id": "6ad96d4a9664da6b2c0d8d61",
        "code": "USR-000001",
        "fullName": "Chủ Pet Một",
        "phone": "0944000004"
      }
    },
    "inpatientRecordId": null,
    "issuedById": {
      "_id": "6ad96d4a9664da6b2c0d8d60",
      "code": "USR-000002",
      "fullName": "Lễ Tân Lan",
      "role": "Receptionist"
    },
    "items": [
      {
        "_id": "6ad96d4a9664da6b2c0d8e02",
        "type": "Service",
        "refId": "6ad96d4a9664da6b2c0d8d50",
        "itemNameSnapshot": "Khám lâm sàng",
        "unitPriceSnapshot": 150000,
        "quantity": 1,
        "subtotal": 150000
      }
    ],
    "totalAmount": 150000,
    "paymentMethod": null,
    "paymentStatus": "Unpaid",
    "issuedAt": "2026-11-17T08:15:00.000Z",
    "paidAt": null,
    "vnpayTxnRef": null
  }
}
```

### 400 Bad Request: validation or Inactive product (`BR-16`)

```json
{
  "message": "Dữ liệu lập hóa đơn không hợp lệ",
  "errors": {
    "orderId": "Vui lòng cung cấp orderId hoặc inpatientRecordId để lập hóa đơn"
  }
}
```
```json
{ "message": "Sản phẩm \"Vòng cổ hết hàng\" hiện đang ngừng kinh doanh hoặc hết hàng (Inactive), không thể bán" }
```

### 401 / 403 / 404 / 409

- `401`: `{ "message": "Chưa đăng nhập" }` hoặc `{ "message": "Token không hợp lệ hoặc đã hết hạn" }`
- `403`: `{ "message": "Bạn không có quyền thực hiện chức năng này" }`
- `404`: `{ "message": "Không tìm thấy đơn lịch hẹn" }` / `"Không tìm thấy hồ sơ điều trị nội trú"` / `"Không tìm thấy sản phẩm trong danh mục"`
- `409`: Đơn chưa ở `WaitOwner`, còn đợt nội trú `Admitted`, hoặc đơn/hồ sơ nội trú đã được lập hóa đơn trước đó.

