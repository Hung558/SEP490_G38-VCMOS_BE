# API Documentation: Receptionist Front-Desk Statistics (`SCR-16`)

Returns live front-desk counters (expected today, currently checked in, in progress, waiting for pick-up, cage availability) plus period statistics (appointments by status, Online vs Walk-in, average wait time from check-in to first service start, and invoices/collections by payment method).

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/reports/front-desk` |
| **Auth** | Required: `Authorization: Bearer <token>` (roles: `Receptionist`, `Admin`) |

---

## Query Parameters

| Query | Type | Default | Description |
|---|---|---|---|
| `period` | `day \| week \| month \| custom` | `day` | Preset range (`day` = Today, `week` = This week, `month` = This month) |
| `from` | `YYYY-MM-DD` | — | Custom start date (inclusive) |
| `to` | `YYYY-MM-DD` | — | Custom end date (inclusive, max 366 days) |

---

## Responses

### `200 OK`

```json
{
  "today": "2026-11-20",
  "period": "day",
  "from": "2026-11-20",
  "to": "2026-11-20",
  "todayCounters": {
    "expectedToday": 1,
    "checkedInNow": 1,
    "inProgressNow": 1,
    "waitingForPickup": 1,
    "cages": {
      "available": 2,
      "occupied": 2,
      "total": 4,
      "occupancyRate": 50
    }
  },
  "periodStats": {
    "totalAppointments": 4,
    "appointmentsByStatus": {
      "Booked": 0,
      "CheckedIn": 0,
      "InProgress": 0,
      "WaitOwner": 0,
      "Done": 2,
      "Overdue": 1,
      "Cancelled": 1
    },
    "onlineCount": 3,
    "walkInCount": 1,
    "averageWaitMinutes": 20,
    "waitTimeSampleCount": 2,
    "invoices": {
      "issuedCount": 4,
      "paidCount": 2,
      "unpaidCount": 1,
      "totalCollected": 800000,
      "byPaymentMethod": [
        { "paymentMethod": "Cash", "revenue": 300000, "invoiceCount": 1 },
        { "paymentMethod": "VNPay", "revenue": 0, "invoiceCount": 0 },
        { "paymentMethod": "PayOS", "revenue": 500000, "invoiceCount": 1 }
      ]
    },
    "cageOccupancy": {
      "total": 4,
      "occupied": 2,
      "available": 2,
      "occupancyRate": 50,
      "byZone": {
        "Holding": { "total": 2, "occupied": 1, "available": 1, "occupancyRate": 50 },
        "InpatientWard": { "total": 2, "occupied": 1, "available": 1, "occupancyRate": 50 }
      },
      "isolatedCages": { "total": 1, "occupied": 0, "available": 1 }
    }
  }
}
```

### Error Responses

- `400 Bad Request`: Invalid date/period parameters.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: Role is neither `Receptionist` nor `Admin`.
