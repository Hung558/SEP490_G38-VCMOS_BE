# API Documentation: List My Community Posts

Lets a pet owner (`PetOwner`) list their **own** community posts in any status (including soft-deleted ones), with pagination. Newest first.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `{base-url}/api/community-posts` |
| **Auth** | Bearer token (role `PetOwner`) |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |

## Query parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | number | No | `1` | Integer >= 1 |
| `limit` | number | No | `10` | Integer from 1 to 50 |
| `postType` | string | No | – | Filter by `TimelineShare` or `Discussion` |
| `status` | string | No | all | Filter by `PendingReview`, `Published`, `Hidden` or `Removed`. Omit to get every status, including soft-deleted (`Removed`) posts |

**Example**

```bash
curl "{base-url}/api/community-posts?status=PendingReview&page=1&limit=10" \
  -H "Authorization: Bearer {token}"
```

## Responses

### 200 OK: success

Only the caller's posts are returned. If there are none, `posts` is an empty array.

```json
{
  "posts": [
    {
      "_id": "6671aa00bb11cc22dd33ee44",
      "authorId": "665f0000000000000000a001",
      "petId": {
        "_id": "665f1c2e9a1b2c3d4e5f6a7b",
        "code": "PET001",
        "name": "Milo",
        "species": "Dog"
      },
      "postType": "Discussion",
      "content": "My cat vomits after eating. Any advice?",
      "timelineItems": [],
      "status": "PendingReview",
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2026-11-19T03:00:00.000Z",
      "updatedAt": "2026-11-19T03:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `posts` | array | The caller's posts |
| `posts[]._id` | string | Post ID |
| `posts[].petId` | object \| null | Featured pet: `_id`, `code`, `name`, `species`, `photoUrl` |
| `posts[].postType` | string | `TimelineShare` or `Discussion` |
| `posts[].content` | string | Post content |
| `posts[].imageUrl` | string | Main image URL (if any) |
| `posts[].timelineItems` | array | Timeline items: `_id`, `date`, `title`, `imageUrl` (if any) |
| `posts[].status` | string | `PendingReview`, `Published`, `Hidden` or `Removed` |
| `posts[].moderationNote` | string | Reviewer's note (if any) |
| `posts[].likeCount`, `posts[].commentCount` | number | Counters |
| `posts[].createdAt`, `posts[].updatedAt` | string | ISO 8601 timestamps |
| `pagination.page` | number | Current page |
| `pagination.limit` | number | Page size |
| `pagination.total` | number | Total posts matching the filters |
| `pagination.totalPages` | number | Total number of pages |

### 400 Bad Request: invalid query

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "limit": "limit phải là số nguyên từ 1 đến 50"
  }
}
```

Possible field errors: `page`, `limit`, `postType`, `status`.

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

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```