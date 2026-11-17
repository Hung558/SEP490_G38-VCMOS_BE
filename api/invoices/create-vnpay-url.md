# API Documentation: Create VNPay Payment URL

Generate a signed VNPay Sandbox payment URL (valid for 15 minutes per `JOB-04`) for an `Unpaid` invoice and store `vnpayTxnRef` on the invoice (`UC-47`, `API-02`).

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/invoices/:id/vnpay-url |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Receptionist`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The invoice `_id`. |

## Request body

None.

## Responses

### 200 OK: success

```json
{
  "message": "Tạo liên kết thanh toán VNPay thành công",
  "data": {
    "invoiceId": "6ad96d4a9664da6b2c0d8e01",
    "invoiceCode": "INV-K8M2PX",
    "vnpayTxnRef": "INVK8M2PX12345678",
    "amount": 150000,
    "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=15000000&...",
    "expiresAt": "2026-11-17T08:45:00.000Z"
  }
}
```

### 400 / 404 / 409

- `400`: `{ "message": "Tổng tiền hóa đơn bằng 0đ, vui lòng xác nhận thanh toán tiền mặt thay cho VNPay" }`
- `404`: `{ "message": "Không tìm thấy hóa đơn" }`
- `409`: `{ "message": "Hóa đơn đang ở trạng thái \"Paid\", không thể tạo mã thanh toán" }`

