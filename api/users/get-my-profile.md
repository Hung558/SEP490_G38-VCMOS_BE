# API Documentation: Get My Profile

Get the profile of the currently logged-in user (any role).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/users/me |
| **Auth** | `Authorization: Bearer <token>` (token from login) |

No request body. The user is identified by the token, not by any id sent from the client.

## Responses

### 200 OK: success

```json
{
  "user": {
    "_id": "6ad96d4a9664da6b2c0d8d61",
    "code": "USR-VMJVSG",
    "fullName": "Example User",
    "phone": "0987654321",
    "email": "exampleuser@gmail.com",
    "isEmailVerified": false,
    "role": "PetOwner",
    "status": "Active",
    "createdAt": "2026-10-22T09:00:00.000Z"
  }
}
```

`email` is omitted if the user has no email.

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 404 Not Found: user no longer exists

```json
{ "message": "Không tìm thấy người dùng" }
```

### 500 Internal Server Error
```json
{ "message": "Internal server error" }
```
