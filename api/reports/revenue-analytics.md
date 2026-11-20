# API Documentation: Revenue Analytics (`UC-63`, `SCR-28`)

Returns revenue KPIs (with comparison against the immediately preceding period), a continuous daily or monthly revenue chart series, breakdown by payment method (`Cash`, `VNPay`, `PayOS`), breakdown by service category (`Examination`, `Vaccination`, `Grooming`, `Paraclinical`, `Inpatient`), and breakdown by invoice line type (`Service`, `Product`, `InpatientDay`).

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/reports/revenue` |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Admin`) |

---

## Query Parameters

| Query | Type | Default | Description |
|---|---|---|---|
| `period` | `day \| week \| month \| custom` | `month` | Preset range in Vietnam time (UTC+7): `day` = today, `week` = Mon–Sun of current week, `month` = 1st–last day of current month |
| `from` | `YYYY-MM-DD` | — | Custom start date (inclusive, UTC+7) |
| `to` | `YYYY-MM-DD` | — | Custom end date (inclusive, UTC+7; max span 366 days / 12 months) |
| `groupBy` | `day \| month` | Auto (`day` if `<= 62` days, else `month`) | Time bucket for `revenueSeries` chart |

> **Rules:** Only invoices with `paymentStatus = "Paid"` are counted, bucketed by `paidAt` in Vietnam time (`+07:00`). `Unpaid` and `Refunded` invoices are excluded.

---

## Responses

### `200 OK`

```json
{
  "period": "custom",
  "from": "2026-11-10",
  "to": "2026-11-12",
  "groupBy": "day",
  "kpis": {
    "totalRevenue": 800000,
    "paidInvoiceCount": 2,
    "averageInvoiceValue": 400000,
    "revenueChangePercent": 100,
    "previousPeriod": {
      "from": "2026-11-07",
      "to": "2026-11-09",
      "totalRevenue": 400000,
      "paidInvoiceCount": 1
    }
  },
  "revenueSeries": [
    { "period": "2026-11-10", "revenue": 300000, "invoiceCount": 1 },
    { "period": "2026-11-11", "revenue": 0, "invoiceCount": 0 },
    { "period": "2026-11-12", "revenue": 500000, "invoiceCount": 1 }
  ],
  "byPaymentMethod": [
    { "paymentMethod": "Cash", "revenue": 300000, "invoiceCount": 1, "percentage": 37.5 },
    { "paymentMethod": "VNPay", "revenue": 0, "invoiceCount": 0, "percentage": 0 },
    { "paymentMethod": "PayOS", "revenue": 500000, "invoiceCount": 1, "percentage": 62.5 }
  ],
  "byServiceCategory": [
    { "category": "Examination", "revenue": 200000, "itemCount": 1, "percentage": 28.6 },
    { "category": "Vaccination", "revenue": 0, "itemCount": 0, "percentage": 0 },
    { "category": "Grooming", "revenue": 300000, "itemCount": 1, "percentage": 42.9 },
    { "category": "Paraclinical", "revenue": 0, "itemCount": 0, "percentage": 0 },
    { "category": "Inpatient", "revenue": 200000, "itemCount": 1, "percentage": 28.6 }
  ],
  "byItemType": [
    { "type": "Service", "revenue": 500000, "itemCount": 2, "percentage": 62.5 },
    { "type": "Product", "revenue": 100000, "itemCount": 1, "percentage": 12.5 },
    { "type": "InpatientDay", "revenue": 200000, "itemCount": 1, "percentage": 25 }
  ]
}
```

### Error Responses

- `400 Bad Request`: Invalid `period`, `from`, `to`, `groupBy`, `from > to`, or range exceeds 366 days.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: Non-`Admin` role.
