# API Documentation: List Staff

Get a paginated list of staff members (users with role `Veterinarian` or `Groomer`). Supports filtering by role and status, and searching by name, code or phone number.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/users/staff |
| **Auth** | Required. Send the login token in the `Authorization: Bearer <token>` header |

## Query parameters

All parameters are optional.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `role` | string | both roles | Filter by role. Allowed values: `Veterinarian`, `Groomer`. Any other value (including `Admin`, `Receptionist`, `PetOwner`) is rejected with `400`. |
| `status` | string | `Active` | Filter by account status. Allowed values: `Active`, `Inactive`, `Locked`. |
| `search` | string | none | Keyword matched against `fullName`, `code` and `phone` (partial match, case-insensitive). Leading/trailing spaces are trimmed. Maximum 100 characters. Special characters are matched literally. |
| `workDate` | string | none | Date formatted as `YYYY-MM-DD`. Filters only staff members who have a working shift scheduled on that date in `StaffSchedule`. |
| `page` | integer | `1` | Page number, starting from 1. |
| `limit` | integer | `10` | Number of items per page. Between 1 and 100. |

Results are sorted by `fullName` (A to Z).

**Example**

```
GET /api/users/staff?role=Veterinarian&search=nguyen&page=1&limit=10
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Responses

### 200 OK: success

```json
{
  "items": [
    {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "VET001",
      "fullName": "Nguyễn Văn A",
      "role": "Veterinarian",
      "status": "Active"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

| Field | Type | Description |
|---|---|---|
| `items` | array | Staff members on the current page. Empty array if nothing matches. |
| `items[]._id` | string | User ID. |
| `items[].code` | string | Staff code. |
| `items[].fullName` | string | Full name. |
| `items[].role` | string | `Veterinarian` or `Groomer`. |
| `items[].status` | string | `Active`, `Inactive` or `Locked`. |
| `pagination.page` | integer | Current page. |
| `pagination.limit` | integer | Items per page. |
| `pagination.total` | integer | Total number of staff members matching the filters. |
| `pagination.totalPages` | integer | Total number of pages (`0` when there are no results). |

Email, phone and password-related fields are never returned.

### 400 Bad Request: validation failed

Returned when a query parameter is invalid. `errors` contains one entry per invalid parameter.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "role": "Vai trò phải là một trong: Veterinarian, Groomer",
    "limit": "limit phải từ 1 đến 100"
  }
}
```

Possible error keys: `role`, `status`, `search`, `page`, `limit`.

### 401 Unauthorized: missing or invalid token

Returned by the authentication middleware when the token is missing, invalid or expired. The exact message depends on that middleware.

```json
{ "message": "Unauthorized" }
```

### 403 Forbidden: role not allowed

Only returned if the route is restricted to certain roles (for example Admin and Receptionist) with an authorization middleware. The exact message depends on that middleware.

```json
{ "message": "Forbidden" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```