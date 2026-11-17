# API Documentation: VNPay IPN Webhook & Return URL

Endpoints handling callbacks from VNPay Sandbox (`API-03`, `API-04`, `BR-17`). Authentication is done via HMAC-SHA512 checksum (`vnp_SecureHash`) instead of Bearer JWT.

## 1. VNPay IPN Webhook (`API-03`, `BR-17`)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/vnpay-ipn |
| **Auth** | Signed by VNPay `vnp_SecureHash` (HMAC-SHA512) |

Verifies signature, `vnp_TxnRef`, and `vnp_Amount === invoice.totalAmount * 100`. When `vnp_ResponseCode === "00"` (and `vnp_TransactionStatus === "00"`), marks the invoice `Paid` (`VNPay`), sets `AppointmentOrder` -> `Done`, locks `MedicalRecord` -> `Finalized`, and releases open cages to `Available`.

**Responses (`200 OK` per VNPay IPN spec)**

- `{ "RspCode": "00", "Message": "Confirm Success" }` — Verified and processed
- `{ "RspCode": "97", "Message": "Invalid signature" }` — Checksum mismatch
- `{ "RspCode": "01", "Message": "Order not found" }` — Unknown `vnp_TxnRef`
- `{ "RspCode": "04", "Message": "Invalid amount" }` — Amount mismatch
- `{ "RspCode": "02", "Message": "Order already confirmed" }` — Already `Paid`

---

## 2. VNPay Return URL (`API-04`)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/vnpay-return |
| **Auth** | Signed by VNPay `vnp_SecureHash` (HMAC-SHA512) |

Verifies the returned signature and displays payment status for the browser/payer. **Does not modify invoice paymentStatus** (`BR-17` — only `/vnpay-ipn` changes status).

### 200 OK: valid signature

```json
{
  "valid": true,
  "success": true,
  "responseCode": "00",
  "vnpayTxnRef": "INVK8M2PX12345678",
  "amount": 150000,
  "invoice": {
    "_id": "6ad96d4a9664da6b2c0d8e01",
    "code": "INV-K8M2PX",
    "totalAmount": 150000,
    "paymentMethod": null,
    "paymentStatus": "Unpaid",
    "paidAt": null,
    "vnpayTxnRef": "INVK8M2PX12345678"
  },
  "message": "Giao dịch VNPay thành công"
}
```

### 400 Bad Request: tampered signature

```json
{ "message": "Chữ ký VNPay trả về không hợp lệ" }
```

