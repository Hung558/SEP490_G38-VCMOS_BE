# API Documentation: Get published community post

Returns the details of one approved (`Published`) community post. Used by Guests and Pet Owners.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/community-posts/public/{id}` |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Post ID (24-character hex ObjectId) |

## Responses

### 200 OK: success

```json
{
  "post": {
    "_id": "6650f1c2a1b2c3d4e5f60718",
    "authorId": { "_id": "664f0000a1b2c3d4e5f60001", "fullName": "Nguyễn Văn A" },
    "petId": null,
    "postType": "Discussion",
    "content": "Mèo bị nôn sau khi ăn, mọi người có kinh nghiệm không?",
    "imageUrl": null,
    "timelineItems": [],
    "status": "Published",
    "likeCount": 4,
    "commentCount": 2,
    "createdAt": "2026-03-02T08:00:00.000Z",
    "updatedAt": "2026-03-02T09:30:00.000Z"
  }
}
```

Field meanings are the same as in the list endpoint.

### 400 Bad Request: invalid ID

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": { "id": "ID bài viết không hợp lệ" }
}
```

### 404 Not Found: post does not exist or is not published

Posts that are `PendingReview`, `Hidden` or `Removed` also return 404, so their existence is not revealed.

```json
{ "message": "Không tìm thấy bài viết" }
```

### 500 Internal Server Error

```json
{ "message": "Internal server error" }
```