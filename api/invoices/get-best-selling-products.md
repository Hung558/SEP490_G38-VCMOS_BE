# API Documentation: Get Best-Selling Products

Aggregates the best-selling products (retail items plus prescribed medicines/vaccines) from **paid** invoices over a date range. Used by Admin for sales reports.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/invoices/reports/best-selling-products` |
| **Auth** | Bearer token (role: `Admin`) |
| **Content-Type** | `application/json` |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |

## Query parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `from` | string | No | same as `to` | Start date `YYYY-MM-DD` (inclusive, UTC+7) |
| `to` | string | No | today (UTC+7) | End date `YYYY-MM-DD` (inclusive, UTC+7). Must not be before `from` |
| `category` | string | No | – | Filter by product category: `Medicine`, `Vaccine`, `Retail` |
| `sortBy` | string | No | `quantity` | Ranking criterion: `quantity` (units sold) or `revenue` |
| `limit` | number | No | `10` | Top N products, clamped to 1–50 |

**Rules**

- With no `from`/`to`, today is reported. Only `from` → `from` through today. Only `to` → that single day.
- The range is limited to 366 days.
- Only invoices with `paymentStatus = Paid` are counted, bucketed by `paidAt` in Vietnam time (UTC+7). `Unpaid` and `Refunded` invoices are excluded.
- Ties are broken by the other metric (revenue for `quantity`, quantity for `revenue`), then by name.

## Responses

### 200 OK: success

```json
{
  "from": "2026-11-16",
  "to": "2026-11-22",
  "sortBy": "quantity",
  "category": null,
  "items": [
    {
      "rank": 1,
      "productId": "66f1c0a2b3c4d5e6f7a8b9c0",
      "code": "PRD-AMOX500",
      "name": "Amoxicillin 500mg",
      "category": "Medicine",
      "unit": "tablet",
      "totalQuantity": 120,
      "totalRevenue": 600000,
      "invoiceCount": 18
    }
  ]
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `from`, `to` | string | Inclusive date range applied (`YYYY-MM-DD`, UTC+7), after defaults |
| `sortBy` | string | Ranking criterion applied |
| `category` | string \| null | Category filter applied |
| `items[].rank` | number | Position in the ranking, starting at 1 |
| `items[].productId` | string | Product `_id` |
| `items[].code`, `name`, `category`, `unit` | string | Current catalog data. If the product no longer exists, `name` falls back to the invoice snapshot and the others are omitted |
| `items[].totalQuantity` | number | Total units sold |
| `items[].totalRevenue` | number | Sum of line `subtotal` (VND) |
| `items[].invoiceCount` | number | Number of distinct invoices containing the product |

### 400 Bad Request: validation failed

```json
{
  "message": "Tham số báo cáo sản phẩm bán chạy không hợp lệ",
  "errors": {
    "from": "Ngày bắt đầu (from) không được sau ngày kết thúc (to)"
  }
}
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Unauthorized" }
```

### 403 Forbidden: role not allowed

```json
{ "message": "Forbidden" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ khi xử lý hóa đơn và thanh toán" }
```