# API Documentation: List Pets

Get a paginated list of the logged-in user's pets, newest first. By default only `Active` pets are returned.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/pets |
| **Auth** | Required: `Authorization: Bearer <token>` (token from the login API) |
| **Content-Type** | Not applicable (no request body) |

## Query parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | string | No | `Active` | Which pets to return: `Active`, `Archived` or `All`. Case-sensitive. |
| `page` | integer | No | `1` | Page number, starting from `1`. |
| `limit` | integer | No | `20` | Items per page, from `1` to `100`. |

**Example**

```
GET http://localhost:9999/api/pets?status=All&page=1&limit=10
```

## Responses

### 200 OK: success

```json
{
  "items": [
    {
      "_id": "6b1f0c2e9a3d4e5f60718293",
      "code": "PET-K7M2QX",
      "ownerId": "6ad96d4a9664da6b2c0d8d61",
      "name": "Mimi",
      "species": "Cat",
      "breed": "British Shorthair",
      "coatColor": "Grey",
      "photoUrl": "https://res.cloudinary.com/demo/image/upload/v1699999999/pets/abc123.jpg",
      "notes": "Allergic to chicken",
      "dob": "2021-03-15T00:00:00.000Z",
      "weight": 4.2,
      "status": "Active",
      "createdAt": "2026-10-27T03:15:42.123Z",
      "updatedAt": "2026-10-27T03:15:42.123Z",
      "__v": 0
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

| Field | Type | Description |
|---|---|---|
| `items` | array | Pets on this page. See the [Pet object](create-pet.md#pet-object). |
| `total` | number | Total number of pets matching the `status` filter, across all pages. |
| `page` | number | The page returned. |
| `limit` | number | The page size used. |
| `totalPages` | number | `ceil(total / limit)`. |

If the user has no matching pets, or `page` is beyond the last page, the response is still `200` with `"items": []`. When `total` is `0`, `totalPages` is `0`.

### 400 Bad Request: invalid query parameters

`errors` is an array, and all invalid parameters are reported together.

```json
{
  "message": "Tham số truy vấn không hợp lệ.",
  "errors": [
    { "field": "status", "message": "Trạng thái phải là một trong: Active, Archived, All." },
    { "field": "limit", "message": "Số lượng mỗi trang phải từ 1 đến 100." }
  ]
}
```

`errors[].field` can be `status`, `page` or `limit`.

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

The first is returned when the `Authorization: Bearer <token>` header is missing, the second when the token is invalid or expired.

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ" }
```