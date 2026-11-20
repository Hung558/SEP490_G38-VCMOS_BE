# API Documentation: Get My Community Post

Lets a pet owner (`PetOwner`) view one of their **own** community posts in any status (including soft-deleted ones).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/community-posts/{id}` |
| **Auth** | Bearer token (role `PetOwner`) |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ObjectId of the post |

## Responses

### 200 OK: success

```json
{
  "post": {
    "_id": "6671aa00bb11cc22dd33ee44",
    "authorId": "665f0000000000000000a001",
    "petId": {
      "_id": "665f1c2e9a1b2c3d4e5f6a7b",
      "code": "PET001",
      "name": "Milo",
      "species": "Dog"
    },
    "postType": "TimelineShare",
    "content": "Milo growing up",
    "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/cover.jpg",
    "timelineItems": [
      { "_id": "6671aa00bb11cc22dd33ee46", "date": "2026-06-01", "title": "Rabies vaccine" }
    ],
    "status": "Published",
    "moderationNote": "Approved",
    "likeCount": 3,
    "commentCount": 1,
    "createdAt": "2026-11-19T03:00:00.000Z",
    "updatedAt": "2026-11-19T05:00:00.000Z"
  }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `post` | object | The caller's post |
| `post._id` | string | Post ID |
| `post.authorId` | string | ID of the author |
| `post.petId` | object \| null | Featured pet: `_id`, `code`, `name`, `species`, `photoUrl` |
| `post.postType` | string | `TimelineShare` or `Discussion` |
| `post.content` | string | Post content |
| `post.imageUrl` | string | Main image URL (if any) |
| `post.timelineItems` | array | Timeline items: `_id`, `date`, `title`, `imageUrl` (if any) |
| `post.status` | string | `PendingReview`, `Published`, `Hidden` or `Removed` |
| `post.moderationNote` | string | Reviewer's note (if any) |
| `post.likeCount`, `post.commentCount` | number | Counters |
| `post.createdAt`, `post.updatedAt` | string | ISO 8601 timestamps |

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

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```