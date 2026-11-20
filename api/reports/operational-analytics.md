# API Documentation: Operational & Appointment Analytics (`UC-64`, `SCR-28`)

Returns appointment counts grouped by status, Online vs Walk-in ratio, service usage by category, Top 5 services, real-time cage occupancy (overall and by zone), and high-level customer/pet/product inventory counts.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/reports/operations` |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Admin`) |

---

## Query Parameters

| Query | Type | Default | Description |
|---|---|---|---|
| `period` | `day \| week \| month \| custom` | `month` | Preset range in Vietnam time (UTC+7) |
| `from` | `YYYY-MM-DD` | — | Custom start date (inclusive) |
| `to` | `YYYY-MM-DD` | — | Custom end date (inclusive, max 366 days) |

---

## Responses

### `200 OK`

```json
{
  "period": "custom",
  "from": "2026-11-10",
  "to": "2026-11-12",
  "appointments": {
    "total": 4,
    "byStatus": {
      "Booked": 0,
      "CheckedIn": 0,
      "InProgress": 0,
      "WaitOwner": 0,
      "Done": 2,
      "Overdue": 1,
      "Cancelled": 1
    },
    "byChannel": {
      "online": 3,
      "walkIn": 1,
      "onlineRate": 75,
      "walkInRate": 25
    },
    "completionRate": 50,
    "overdueRate": 25,
    "cancellationRate": 25
  },
  "servicesByCategory": [
    { "category": "Examination", "totalCount": 2, "doneCount": 2 },
    { "category": "Vaccination", "totalCount": 0, "doneCount": 0 },
    { "category": "Grooming", "totalCount": 2, "doneCount": 1 },
    { "category": "Paraclinical", "totalCount": 0, "doneCount": 0 },
    { "category": "Inpatient", "totalCount": 0, "doneCount": 0 }
  ],
  "topServices": [
    { "rank": 1, "serviceId": "...", "code": "SRV-RP0001", "name": "Khám tổng quát", "category": "Examination", "count": 2, "doneCount": 2 }
  ],
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
  },
  "overview": {
    "activeCustomersCount": 1,
    "activePetsCount": 1,
    "activeProductsCount": 1,
    "inactiveProductsCount": 1
  }
}
```

### Error Responses

- `400 Bad Request`: Invalid date/period parameters.
- `401 Unauthorized`: Missing or invalid Bearer token.
- `403 Forbidden`: Non-`Admin` role.
