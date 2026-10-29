# API Documentation: Get User Detail by ID (Admin - SCR-32)

Get the details of a single user or staff account. If the target account has role `PetOwner`, the response also includes their `pets` array.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/admin/users/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (**Admin** role only) |
| **Content-Type** | Not applicable (no request body) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | The user's `_id` (24-character MongoDB ObjectId). |

## Responses

### 200 OK: success

```json
{
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-VMJVSG",
    "fullName": "Nguyen Van A",
    "phone": "0901234567",
    "email": "a@mail.com",
    "isEmailVerified": true,
    "role": "PetOwner",
    "status": "Active",
    "createdAt": "2026-10-29T08:00:00.000Z",
    "pets": []
  }
}
```

`pets` is included when `user.role === "PetOwner"`.

### 400 Bad Request: invalid user id

```json
{ "message": "ID người dùng không hợp lệ" }
```

### 401 Unauthorized / 403 Forbidden

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

### 404 Not Found

```json
{ "message": "Không tìm thấy người dùng" }
```

