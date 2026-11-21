# API Documentation: Community Post Interactions (`UC-50`, `UC-53..UC-56`, `BR-19`)

Endpoints for withdrawing a published post, liking/unliking posts, commenting & 1-level nested replies, and reporting inappropriate posts or comments.

---

## 1. Withdraw Own Post / Timeline Share (`UC-50`)

Allows a `PetOwner` to remove (`status: "Removed"`) their own post even after it has been `Published`.

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:9999/api/community-posts/:id/withdraw` |
| **Auth** | Bearer token (role: `PetOwner`) |

### Response `200 OK`
```json
{
  "message": "Đã thu hồi bài viết khỏi cộng đồng",
  "post": { "_id": "...", "status": "Removed" }
}
```
- `404`: Post not found or not owned by caller.
- `409`: Already `Removed`, or currently `Hidden` by Admin moderation.

---

## 2. Toggle Like on Published Post (`UC-53`, `BR-19`)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:9999/api/community-posts/:id/like` |
| **Auth** | Bearer token (role: `PetOwner`) |

### Response `200 OK`
```json
{
  "liked": true,
  "likeCount": 5,
  "message": "Đã thích bài viết"
}
```
*(Calling again unlikes the post and returns `liked: false`.)*

### Check Current User's Like Status
- **`GET /api/community-posts/:id/like-status`** (`PetOwner`) -> `{ "liked": true, "likeCount": 5 }`

---

## 3. Comments & 1-Level Replies (`UC-54`, `UC-55`, `BR-19`)

### 3.1. List Comments of a Published Post (Public)
- **`GET /api/community-posts/:id/comments?page=1&limit=20`** (No auth required — Guest & PetOwner)
- Returns paginated top-level comments (newest first), each containing `replies` (oldest first, 1 level deep).

```json
{
  "comments": [
    {
      "_id": "...",
      "postId": "...",
      "authorId": { "_id": "...", "fullName": "Trần Thảo B" },
      "parentCommentId": null,
      "content": "Mẹo rất hữu ích!",
      "status": "Published",
      "createdAt": "2026-11-21T08:00:00.000Z",
      "replies": [
        {
          "_id": "...",
          "authorId": { "_id": "...", "fullName": "Nguyễn Minh A" },
          "parentCommentId": "...",
          "content": "Cảm ơn bạn nhiều!",
          "status": "Published"
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### 3.2. Create Comment or 1-Level Reply
- **`POST /api/community-posts/:id/comments`** (`PetOwner`)
- Body (`JSON`):
  ```json
  {
    "content": "Chúc bé mau khoẻ!",
    "parentCommentId": null
  }
  ```
- Rules: `content` required (1–500 chars). Replying to a comment that already has a `parentCommentId` returns `400` (`BR-19`: max 1 nested level).
- Response `201 Created`: `{ "message": "Đã gửi bình luận", "comment": { ... }, "commentCount": 2 }`

### 3.3. Delete Own Comment (Soft Delete)
- **`DELETE /api/community-posts/comments/:commentId`** (`PetOwner`)
- Only the comment's author can soft-delete it (`status -> "Deleted"`; `403` for other users).
- Response `200 OK`: `{ "message": "Đã xoá bình luận", "commentCount": 1 }`

---

## 4. Report Inappropriate Content (`UC-56`)

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:9999/api/community-posts/reports` |
| **Auth** | Bearer token (role: `PetOwner`) |

### Body (`JSON`)
```json
{
  "targetType": "Post",
  "targetId": "6650f1c2a1b2c3d4e5f60718",
  "reason": "Nội dung quảng cáo spam"
}
```
- `targetType`: `"Post"` or `"Comment"`.
- `reason`: required, 1–200 characters.
- Cannot report own content (`400`) or report the same target twice (`409`).
- Response `201 Created`: `{ "message": "Cảm ơn bạn. Báo cáo đã được gửi đến quản trị viên", "report": { ... } }`
