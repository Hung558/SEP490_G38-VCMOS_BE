# API Documentation: Delete Service (Blocked by SCR-29 & BR-16)

To preserve historical appointment orders and invoice line items, clinic services are never physically deleted from the database. Calling `DELETE` returns `403 Forbidden` and instructs the caller to set `status` to `Inactive` via `PATCH /api/services/:id/status`.

## Endpoint

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | http://localhost:9999/api/services/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |

## Responses

### 403 Forbidden: physical deletion prohibited

```json
{
  "message": "Không được phép xóa vật lý dịch vụ để bảo toàn lịch sử đơn hẹn và hóa đơn. Vui lòng chuyển trạng thái sang Inactive"
}
```

