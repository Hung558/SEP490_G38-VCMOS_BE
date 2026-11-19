# API Documentation: Delete My Community Post

Lets a pet owner (`PetOwner`) delete their own community post **while it is still `PendingReview`**. This is a soft delete: `status` is changed to `Removed` and the post stays in the database. It can still be viewed through [Get My Community Post](get-community-post.md) and [List My Community Posts](list-community-posts.md), but can no longer be edited or deleted.

## Endpoint

| | |
|---|---|
| **Method** | `DELETE` |
| **URL** | `{base-url}/api/community-posts/{id}` |
| **Auth** | Bearer token (role `PetOwner`) |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ObjectId of the post |

**Example**

```bash
curl -X DELETE {base-url}/api/community-posts/{id} \
  -H "Authorization: Bearer {token}"
```

## Responses

### 200 OK: success

```json
{ "message": "Đã xoá bài viết" }
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `message` | string | Success message |

### 400 Bad Request: invalid id

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": { "id": "ID bài viết không hợp lệ" }
}
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

Or when the token is invalid or expired:

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: not allowed

When the role is not `PetOwner`:

```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```

Or when the account is locked / inactive:

```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```

### 404 Not Found: post does not exist or is not yours

```json
{ "message": "Không tìm thấy bài viết" }
```

### 409 Conflict: post is no longer pending review

The post has already been handled or deleted (`Published`, `Hidden`, `Removed`).

```json
{ "message": "Chỉ có thể thao tác với bài viết đang chờ duyệt" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```