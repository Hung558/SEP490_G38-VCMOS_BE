# API Documentation: Get Pet by ID

Get one pet by its id. Only the pet's owner can read it. Both `Active` and `Deleted` pets can be fetched.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/pets/:petId |
| **Auth** | Required: `Authorization: Bearer <token>` (token from the login API) |
| **Content-Type** | Not applicable (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | The pet's `_id` (a 24-character hexadecimal string). |

**Example**

```
GET http://localhost:9999/api/pets/6b1f0c2e9a3d4e5f60718293
```

## Responses

### 200 OK: success

```json
{
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
    "status": "Active",
    "createdAt": "2026-10-27T03:15:42.123Z",
    "updatedAt": "2026-10-27T03:15:42.123Z",
    "__v": 0
  }
}
```

See the [Pet object](create-pet.md#pet-object) for the meaning of every field.

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

The same response is returned when the pet belongs to another user, so the API never reveals whether someone else's pet exists.

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ" }
```