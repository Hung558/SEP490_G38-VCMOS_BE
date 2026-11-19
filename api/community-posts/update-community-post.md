# API Documentation: Update My Community Post

Lets a pet owner (`PetOwner`) edit their own community post **while it is still `PendingReview`**. This is a full replacement of the editable fields: optional fields that are omitted reset to their defaults (`content` → `''`, `petId` → `null`, `timelineItems` → `[]`), and any image that is not mentioned is removed from the post.

## Endpoint

| | |
|---|---|
| **Method** | `PUT` |
| **URL** | `{base-url}/api/community-posts/{id}` |
| **Auth** | Bearer token (role `PetOwner`) |
| **Content-Type** | `multipart/form-data` (the only accepted format) |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |
| `Content-Type` | Yes | `multipart/form-data; boundary=...` (set automatically by clients when sending form-data) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | ObjectId of the post |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `postType` | string | Yes | `TimelineShare` or `Discussion` |
| `content` | string | `Discussion`: Yes | Trimmed, max 5000 characters |
| `petId` | string | `TimelineShare`: Yes | ObjectId of an `Active` pet that belongs to the caller |
| `timelineItems` | string (JSON) | `TimelineShare`: Yes | JSON-encoded array of 1–50 items (see below). Ignored for `Discussion` |
| `image` | file | No | New main image, at most 1 file. Replaces the old one |
| `imageUrl` | string | No | Keeps the existing main image: must exactly match the URL currently stored on the post. Ignored when `image` is sent |
| `timelineImages` | file[] | No | Up to 10 new images for timeline items |

**`timelineItems` element**

| Field | Type | Required | Description |
|---|---|---|---|
| `date` | string | Yes | `YYYY-MM-DD`, must be a real calendar date |
| `title` | string | Yes | Trimmed, max 200 characters |
| `imageIndex` | integer | No | Zero-based position of a new image in `timelineImages` to use for this item |
| `imageUrl` | string | No | Keeps the existing image of an item: must match a URL currently stored on the post. Ignored when `imageIndex` is set |

**Image rules**

- New images must be uploaded (JPEG, PNG or WebP, max 5MB each). Any image URL that does not belong to this post is rejected.
- Main image: send `image` to replace it, send `imageUrl` to keep the current one, send neither to remove it.
- Timeline item image: use `imageIndex` for a new image, `imageUrl` to keep the current one, omit both to remove it.
- Old images that are replaced or removed are not deleted from Cloudinary.

All other rules (data types, limits, `status` / `authorId` being ignored) are the same as [Create Community Post](create-community-post.md).

**Example**

```bash
curl -X PUT {base-url}/api/community-posts/{id} \
  -H "Authorization: Bearer {token}" \
  -F postType=TimelineShare \
  -F content="Milo's journey, updated" \
  -F petId=665f1c2e9a1b2c3d4e5f6a7b \
  -F imageUrl="https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/cover.jpg" \
  -F 'timelineItems=[{"date":"2026-01-10","title":"First day at home","imageUrl":"https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/day1.jpg"},{"date":"2026-06-01","title":"Rabies vaccine","imageIndex":0}]' \
  -F timelineImages=@vaccine.jpg
```

## Responses

### 200 OK: success

```json
{
  "message": "Cập nhật bài viết thành công",
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
    "content": "Milo's journey, updated",
    "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/cover.jpg",
    "timelineItems": [
      {
        "_id": "6671aa00bb11cc22dd33ee47",
        "date": "2026-01-10",
        "title": "First day at home",
        "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/day1.jpg"
      },
      {
        "_id": "6671aa00bb11cc22dd33ee48",
        "date": "2026-06-01",
        "title": "Rabies vaccine",
        "imageUrl": "https://res.cloudinary.com/demo/image/upload/v1/vcmos/community-posts/vaccine.jpg"
      }
    ],
    "status": "PendingReview",
    "likeCount": 0,
    "commentCount": 0,
    "createdAt": "2026-11-19T03:00:00.000Z",
    "updatedAt": "2026-11-19T04:00:00.000Z"
  }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `message` | string | Success message |
| `post` | object | The post after the update (same structure as in [Create Community Post](create-community-post.md)) |
| `post.status` | string | Still `PendingReview` |
| `post.updatedAt` | string | Time of the update, ISO 8601 |

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "id": "ID bài viết không hợp lệ"
  }
}
```

Besides the `id` error, the same field errors as in [Create Community Post](create-community-post.md) apply (`postType`, `content`, `petId`, `timelineItems`, `imageUrl`, image file errors). The `imageUrl` / `timelineItems` errors appear when a submitted URL does not match an image already stored on the post:

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": { "imageUrl": "Chỉ có thể giữ lại ảnh đang có của bài viết, ảnh mới phải được tải lên" }
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

The post has already been handled (`Published`, `Hidden`, `Removed`) and can no longer be edited. This check runs before any image is uploaded.

```json
{ "message": "Chỉ có thể thao tác với bài viết đang chờ duyệt" }
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