# API Documentation: PayOS VietQR Payment

Generate a live PayOS payment link and real VietQR EMVCo string (`qrCode`), handle PayOS Webhook callbacks, and actively sync payment status (`PAID`) so real mobile banking apps work seamlessly even on `localhost`.

## 1. Create PayOS Payment Link & VietQR

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/invoices/:id/payos-url |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Receptionist`) |

### Responses

#### 200 OK: success

```json
{
  "message": "Tạo liên kết thanh toán PayOS thành công",
  "data": {
    "invoiceId": "6ad96d4a9664da6b2c0d8e01",
    "invoiceCode": "INV-K8M2PX",
    "orderCode": 1763447000123,
    "paymentLinkId": "0bac53aa220544c79a4fd42113a64194",
    "amount": 150000,
    "checkoutUrl": "https://pay.payos.vn/web/0bac53aa220544c79a4fd42113a64194",
    "paymentUrl": "https://pay.payos.vn/web/0bac53aa220544c79a4fd42113a64194",
    "qrCode": "00020101021238570010A000000727...",
    "accountName": "HA DUY HUNG",
    "accountNumber": "...",
    "bin": "970422",
    "expiresAt": "2026-11-18T06:30:00.000Z"
  }
}
```

> **Frontend note:** Render `<QRCode value={data.qrCode} />` so customers can scan with any real Vietnamese banking app.

---

## 2. Check & Sync PayOS Payment Status

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/invoices/:id/payos-status |
| **Auth** | Required: `Authorization: Bearer <token>` (`Receptionist`, `Admin`, or owning `PetOwner`) |

Actively queries PayOS for `orderCode`. If PayOS confirms `status === "PAID"`, BE immediately transitions the invoice to `Paid` (`PayOS`), `AppointmentOrder` -> `Done`, `MedicalRecord` -> `Finalized`, and releases open cages to `Available`. *(Note: `GET /api/invoices/:id` also runs this check automatically when `payosOrderCode` is present.)*

---

## 3. PayOS Webhook

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/invoices/payos-webhook |
| **Auth** | Verified by `HMAC-SHA256` `signature` using `PAYOS_CHECKSUM_KEY` |

Verifies PayOS webhook payload signature and amount; if paid, finalizes the invoice (`Paid`, `PayOS`), order, medical record, and cage. Returns `{ "error": 0, "message": "Ok", "data": null }`.

