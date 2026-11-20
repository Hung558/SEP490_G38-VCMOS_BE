# API Documentation: List published community posts

Returns a paginated list of approved (`Published`) community posts, newest first. Used by Guests and Pet Owners to browse the community feed.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/community-posts/public` |
| **Auth** | None (public) |
| **Content-Type** | `application/json` |

## Query parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `page` | number | No | `1` | Page number. Integer >= 1 |
| `limit` | number | No | `10` | Items per page. Integer from 1 to 50 |
| `postType` | string | No | – | Filter by type: `TimelineShare` or `Discussion`. Omit for all types |

Any other query parameter (including `status`) is ignored. Only `Published` posts are ever returned.

## Responses

### 200 OK: success

Returns an empty `posts` array when nothing matches.

```json
{
  "posts": [
    {
      "_id": "6650f1c2a1b2c3d4e5f60718",
      "authorId": { "_id": "664f0000a1b2c3d4e5f60001", "fullName": "Nguyễn Văn A" },
      "petId": {
        "_id": "664f0000a1b2c3d4e5f60002",
        "name": "Milo",
        "species": "Dog",
        "breed": "Corgi",
        "photoUrl": "https://res.cloudinary.com/.../milo.jpg"
      },
      "postType": "TimelineShare",
      "content": "Hành trình khoẻ mạnh của Milo",
      "imageUrl": "https://res.cloudinary.com/.../cover.jpg",
      "timelineItems": [
        { "_id": "...", "date": "2026-03-01", "title": "Tiêm phòng 5 bệnh", "imageUrl": "https://res.cloudinary.com/.../1.jpg" }
      ],
      "status": "Published",
      "likeCount": 12,
      "commentCount": 3,
      "createdAt": "2026-03-02T08:00:00.000Z",
      "updatedAt": "2026-03-02T09:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `posts` | array | Published posts, sorted by `createdAt` descending |
| `posts[].authorId` | object | Author's public info: `_id`, `fullName` only |
| `posts[].petId` | object \| null | Featured pet (`_id`, `name`, `species`, `breed`, `photoUrl`). `null` if none or the pet was deleted |
| `posts[].postType` | string | `TimelineShare` or `Discussion` |
| `posts[].timelineItems` | array | Timeline milestones (`date`, `title`, `imageUrl`); empty for `Discussion` |
| `pagination` | object | `page`, `limit`, `total`, `totalPages` |

`moderationNote` is internal and never returned.

### 400 Bad Request: invalid query

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "limit": "limit phải là số nguyên từ 1 đến 50",
    "postType": "Loại bài viết phải là một trong: TimelineShare, Discussion"
  }
}
```

### 500 Internal Server Error

```json
{ "message": "Internal server error" }
```