# API Documentation: Delete Pet

Delete one of the logged-in user's pets. This is a **soft delete**: the pet is not removed, its `status` is set to `Deleted`.

## Endpoint

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | http://localhost:9999/api/pets/:petId |
| **Auth** | Required: `Authorization: Bearer <token>` (token from the login API) |
| **Content-Type** | Not applicable (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | The pet's `_id` (a 24-character hexadecimal string). |

**Example**

```
DELETE http://localhost:9999/api/pets/6b1f0c2e9a3d4e5f60718293
```

## What happens after deleting

- The pet no longer appears in [List Pets](list-pets.md) by default. It appears with `status=Deleted` or `status=All`.
- The pet can still be fetched with [Get Pet by ID](get-pet-by-id.md).
- The pet can no longer be updated ([Update Pet](update-pet.md) returns `409`).
- The photo is kept.
- Calling this API again on an already deleted pet is safe and returns `200` again.
- There is currently no API to restore a deleted pet.

## Responses

### 200 OK: success

```json
{
  "message": "Đã xóa thú cưng",
  "pet": {
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
    "status": "Deleted",
    "createdAt": "2026-10-27T03:15:42.123Z",
    "updatedAt": "2026-10-27T05:30:00.789Z",
    "__v": 0
  }
}
```

`pet` is the deleted pet (`status` is `Deleted`). See the [Pet object](create-pet.md#pet-object) for the meaning of every field.

### 400 Bad Request: malformed pet id

```json
{
  "message": "Mã thú cưng không hợp lệ.",
  "errors": [
    { "field": "petId", "message": "Mã thú cưng không hợp lệ." }
  ]
}
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

The first is returned when the `Authorization: Bearer <token>` header is missing, the second when the token is invalid or expired.

### 404 Not Found: pet does not exist or is not yours

```json
{ "message": "Không tìm thấy thú cưng" }
```

The same response is returned when the pet belongs to another user.

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ" }
```