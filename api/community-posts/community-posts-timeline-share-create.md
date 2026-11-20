# API Documentation: Create Timeline Share from Visit History

Creates a `TimelineShare` community post from a pet's `Done` appointment orders. The server builds the timeline itself and automatically strips sensitive data (SOAP notes, prescriptions, invoice prices, order notes/symptoms); only the milestone date, the service names and one representative image per milestone are kept. Used by pet owners. See [Preview Timeline Share](./community-posts-timeline-share-preview.md) for exactly what will be published.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `http://localhost:9999/api/community-posts/timeline-share` |
| **Auth** | Bearer token (role `PetOwner`) |
| **Content-Type** | `application/json` |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |
| `Content-Type` | Yes | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | ObjectId of the pet. Must belong to the caller and have status `Active` |
| `orderIds` | string[] | No | Orders to include (1–50 ObjectIds, duplicates are removed). If omitted, the 50 most recent `Done` orders of the pet are used. Every order must be `Done` and belong to this pet and this owner |
| `content` | string | No | Owner's caption. Trimmed, max 5000 characters. Defaults to an empty string |

The client cannot send `timelineItems`, `status`, `imageUrl`, `authorId`, etc.; milestones are always built by the server and any other field is ignored.

**Example**

```json
{
  "petId": "665f0c2e8a1b2c3d4e5f6a7b",
  "orderIds": ["665f1a2b3c4d5e6f7a8b9c0d", "665f1b2c3d4e5f6a7b8c9d0e"],
  "content": "Hành trình lớn lên của Mimi tại phòng khám"
}
```

## Behavior

- The post is always created with `postType = TimelineShare` and `status = PendingReview`. It appears in the public feed only after a moderator publishes it.
- One order = one milestone, ordered oldest → newest. `title` is the names of the order's `Done` services joined by `, ` (max 200 characters). `imageUrl` is the order's after-photo, falling back to the before-photo, and is omitted if the order has no photo.
- Eligible orders are the pet's `Done` orders (UC-49), read with a lightweight query that selects only the order date, `Service.name` of `Done` services and the grooming before/after photo URLs. `MedicalRecord` (SOAP, prescriptions), `Invoice`, order notes and symptoms are never read, so they can never be stored in the post.
- The owner's own `content` text is not filtered; it is the owner's responsibility and is reviewed during moderation.

## Responses

### 201 Created: post submitted

```json
{
  "message": "Đã gửi bài chia sẻ hành trình, vui lòng chờ duyệt",
  "post": {
    "_id": "665f2c3d4e5f6a7b8c9d0e1f",
    "authorId": "665e00112233445566778899",
    "petId": {
      "_id": "665f0c2e8a1b2c3d4e5f6a7b",
      "code": "PET001",
      "name": "Mimi",
      "species": "Cat",
      "photoUrl": "https://res.cloudinary.com/demo/image/upload/mimi.jpg"
    },
    "postType": "TimelineShare",
    "content": "Hành trình lớn lên của Mimi tại phòng khám",
    "status": "PendingReview",
    "timelineItems": [
      {
        "date": "2026-03-01",
        "title": "Khám tổng quát, Tiêm phòng"
      },
      {
        "date": "2026-05-01",
        "title": "Spa tắm",
        "imageUrl": "https://res.cloudinary.com/demo/image/upload/after.jpg"
      }
    ],
    "likeCount": 0,
    "commentCount": 0,
    "createdAt": "2026-11-20T03:30:00.000Z",
    "updatedAt": "2026-11-20T03:30:00.000Z"
  }
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `message` | string | Success message |
| `post` | object | The created post (same shape as `POST /api/community-posts`) |
| `post.status` | string | Always `PendingReview` |
| `post.postType` | string | Always `TimelineShare` |
| `post.petId` | object | Populated pet: `_id`, `code`, `name`, `species`, `photoUrl` |
| `post.timelineItems` | array | Milestones, oldest → newest |
| `post.timelineItems[].date` | string | Order date, `YYYY-MM-DD` |
| `post.timelineItems[].title` | string | Names of the `Done` services joined by `, ` |
| `post.timelineItems[].imageUrl` | string | After-photo, else before-photo. Omitted if the order has no photo |

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "orderIds": "orderIds chứa ID đơn khám không hợp lệ"
  }
}
```

Other possible `errors`:

| Field | Message | Cause |
|---|---|---|
| `petId` | `Thú cưng là bắt buộc` | `petId` missing |
| `petId` | `ID thú cưng không hợp lệ` | `petId` is not a valid ObjectId |
| `petId` | `Thú cưng chưa có lượt khám nào đã hoàn thành để chia sẻ` | The pet has no eligible `Done` orders |
| `orderIds` | `orderIds phải là mảng gồm ít nhất 1 ID đơn khám` | Not an array, or an empty array |
| `orderIds` | `Tối đa 50 đơn khám` | More than 50 unique IDs |
| `orderIds` | `Có đơn khám không tồn tại, không thuộc thú cưng này hoặc chưa hoàn thành` | At least one order does not exist, belongs to another pet/owner, or is not `Done` |
| `content` | `Nội dung phải là chuỗi ký tự` | `content` is not a string |
| `content` | `Nội dung tối đa 5000 ký tự` | `content` is too long |

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

### 403 Forbidden: caller is not a `PetOwner`

```json
{ "message": "Bạn không có quyền thực hiện thao tác này" }
```

Or when the pet belongs to another owner, or the caller's role is not `PetOwner` (BR-23):

```json
{ "message": "Bạn không có quyền xem dòng thời gian của thú cưng này" }
```

### 404 Not Found: pet does not exist

```json
{ "message": "Không tìm thấy hồ sơ thú cưng" }
```

Or when the pet has been soft-deleted (`status = Deleted`):

```json
{ "message": "Không tìm thấy thú cưng của bạn" }
```

### 500 Internal Server Error

```json
{ "message": "Internal server error" }
```

## Related

- After creation, the owner can read the post with `GET /api/community-posts/:id`, and edit or delete it (`PUT` / `DELETE`) while it is still `PendingReview`.
- When editing via `PUT`, a milestone's `imageUrl` can only be kept if it equals the URL already stored on the post; any other external URL is rejected with `400`.