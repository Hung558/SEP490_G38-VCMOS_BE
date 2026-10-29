# API Documentation: Delete User Account (Blocked by BR-22)

Per business rule **BR-22 (Non-Destructive User Retention)**, user and staff accounts are never physically deleted from the database in order to preserve historical medical records and invoices. Calling `DELETE` returns `403 Forbidden` and instructs the caller to lock the account instead.

## Endpoint

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | http://localhost:9999/api/admin/users/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |

## Responses

### 403 Forbidden: physical deletion prohibited (`BR-22`)

```json
{
  "message": "Không được phép xóa vật lý tài khoản người dùng (BR-22). Vui lòng sử dụng chức năng khóa tài khoản"
}
```

