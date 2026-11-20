# API Documentation: Create Community Post

Lets a pet owner (`PetOwner`) create a community post. A new post always has `status = PendingReview` and waits for moderation. All images are uploaded to Cloudinary.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:9999/api/community-posts` |
| **Auth** | Bearer token (role `PetOwner`) |
| **Content-Type** | `multipart/form-data` (the only accepted format) |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |
| `Content-Type` | Yes | `multipart/form-data; boundary=...` (set automatically by clients when sending form-data) |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `postType` | string | Yes | `TimelineShare` or `Discussion` |
| `content` | string | `Discussion`: Yes | Trimmed, max 5000 characters |
| `petId` | string | `TimelineShare`: Yes | ObjectId of an `Active` pet that belongs to the caller |
| `timelineItems` | string (JSON) | `TimelineShare`: Yes | JSON-encoded array of 1–50 items (see below). Ignored for `Discussion` |
| `image` | file | No | Main image of the post, at most 1 file |
| `timelineImages` | file[] | No | Up to 10 images for timeline items |

**`timelineItems` element**

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | string | Yes | `YYYY-MM-DD`, must be a real calendar date |
| `title` | string | Yes | Trimmed, max 200 characters |
| `imageIndex` | integer | No | Zero-based position of the image in `timelineImages` to use for this item |

**Rules**

- Images: JPEG, PNG or WebP, max 5MB each. Files in `timelineImages` that no item references are ignored (not uploaded).
- Arbitrary image URLs are not accepted: sending `imageUrl` (on the post or on a timeline item) when creating is rejected.
- `authorId` is taken from the token. `status`, `moderationNote`, `likeCount` and `commentCount` in the request are ignored.

**Example**

```bash
curl -X POST {base-url}/api/community-posts \
  -H "Authorization: Bearer {token}" \
  -F postType=TimelineShare \
  -F content="Milo growing up" \
  -F petId=665f1c2e9a1b2c3d4e5f6a7b \
  -F 'timelineItems=[{"date":"2026-01-10","title":"First day at home","imageIndex":0},{"date":"2026-06-01","title":"Rabies vaccine"}]' \
  -F image=@cover.jpg \
  -F timelineImages=@day1.jpg
```

## Responses

### 201 Created: success

```json
{
  "message": "Đã gửi bài viết, vui lòng chờ duyệt",
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
      {
        "_id": "6671aa00bb11cc22dd33ee45",
        "date": "2026-01-10",
        "title": "First day at home",
        "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/day1.jpg"
      },
      { "_id": "6671aa00bb11cc22dd33ee46", "date": "2026-06-01", "title": "Rabies vaccine" }
    ],
    "status": "PendingReview",
    "likeCount": 0,
    "commentCount": 0,
    "createdAt": "2026-11-19T03:00:00.000Z",
    "updatedAt": "2026-11-19T03:00:00.000Z"
  }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `message` | string | Success message |
| `post` | object | The newly created post |
| `post._id` | string | Post ID |
| `post.authorId` | string | ID of the author (from the token) |
| `post.petId` | object \| null | Featured pet: `_id`, `code`, `name`, `species`, `photoUrl` |
| `post.postType` | string | `TimelineShare` or `Discussion` |
| `post.content` | string | Post content (empty string if none) |
| `post.imageUrl` | string \| null | Cloudinary URL of the main image |
| `post.timelineItems` | array | Timeline items: `_id`, `date`, `title`, `imageUrl` (if any) |
| `post.status` | string | Always `PendingReview` |
| `post.likeCount`, `post.commentCount` | number | Always `0` for a new post |
| `post.createdAt`, `post.updatedAt` | string | ISO 8601 timestamps |

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "postType": "Loại bài viết phải là một trong: TimelineShare, Discussion"
  }
}
```

Possible field errors: `postType`, `content`, `petId`, `timelineItems` (a string, or an array of per-item errors where each element has `date` / `title` / `imageIndex`), `imageUrl`.

When `petId` does not belong to the caller:

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": { "petId": "Không tìm thấy thú cưng của bạn" }
}
```

When an image URL is sent instead of uploading a file:

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": { "imageUrl": "Chỉ có thể giữ lại ảnh đang có của bài viết, ảnh mới phải được tải lên" }
}
```

When an image file is invalid (wrong type, too large, wrong field name, too many files):

```json
{ "message": "Ảnh phải có định dạng JPEG, PNG hoặc WebP" }
```

Other upload messages: `Mỗi ảnh tối đa 5MB`, `Chỉ được tải lên tối đa 11 ảnh`, `Chỉ nhận ảnh qua trường image (1 ảnh) và timelineImages (tối đa 10 ảnh)`.

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

### 415 Unsupported Media Type: not multipart/form-data

```json
{ "message": "Chỉ chấp nhận multipart/form-data" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi hệ thống" }
```

### 502 Bad Gateway: Cloudinary upload failed

```json
{ "message": "Không thể tải ảnh lên, vui lòng thử lại sau" }
```