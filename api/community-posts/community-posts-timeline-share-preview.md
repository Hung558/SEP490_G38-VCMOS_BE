# API Documentation: Preview Timeline Share from Visit History

Returns a preview of the timeline milestones that would be published if a pet owner shares a pet's visit history to the community. Milestones are built server-side from the pet's `Done` orders (UC-49) using a lightweight query that only reads the fields needed for sharing, so all sensitive data is excluded at the query level. Used by pet owners to review (and pick orders from) what will be shared before calling [Create Timeline Share](./community-posts-timeline-share-create.md).

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/community-posts/timeline-share/preview` |
| **Auth** | Bearer token (role `PetOwner`) |
| **Content-Type** | – |

## Headers

| Header | Required | Description |
|---|---|---|
| `Authorization` | Yes | `Bearer {token}` |

## Query parameters

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `petId` | string | Yes | – | ObjectId of the pet. The pet must belong to the caller and have status `Active` |

## Data handling

The service uses a **whitelist**: it only selects the fields below (3 lightweight queries: pet, orders, appointment services) and never queries `MedicalRecord`, `Invoice`, sub-tasks, inpatient records or cage assignments. The result is then mapped again into new objects, so sensitive data cannot appear in the response or in the resulting post.

| Source | Kept | Never read |
|---|---|---|
| `AppointmentOrder` (`derivedStatus = Done`) | `date` (milestone date), `code` (preview only) | `note`, `intake` (symptoms), `cancelReason`, … |
| `AppointmentService` (`status = Done`) | `Service.name`, `groomingNote.afterPhotoUrl` / `beforePhotoUrl` (only used to pick the milestone image) | `groomingNote.beforeNote` / `afterNote` / `recommendations`, `assignedStaffId`, … |
| `MedicalRecord` | – | Everything (SOAP `S, O, A, P`, `prescriptions`, `notes`) |
| `Invoice` | – | Everything (`items`, `totalAmount`, …) |
| `Service` | – | `basePrice`, `description` |

**Selection rules**

- Only orders of this pet with `derivedStatus = Done` are eligible, and only for the pet's owner (BR-23). Only services with `status = Done` contribute to `title` and the image.
- At most the **50 most recent** eligible orders are returned, sorted **oldest → newest**.
- One order = one milestone. `title` is the names of the order's `Done` services joined by `, ` (truncated to 200 characters; falls back to a generic title if no service name is available).
- `imageUrl` is the order's after-photo; if there is none, the before-photo; if neither exists, the field is omitted. Only `http(s)` URLs are accepted.

## Responses

### 200 OK: preview built

```json
{
  "pet": {
    "_id": "665f0c2e8a1b2c3d4e5f6a7b",
    "code": "PET001",
    "name": "Mimi",
    "species": "Cat",
    "photoUrl": "https://res.cloudinary.com/demo/image/upload/mimi.jpg"
  },
  "milestones": [
    {
      "orderId": "665f1a2b3c4d5e6f7a8b9c0d",
      "orderCode": "ORD0001",
      "date": "2026-03-01",
      "title": "Khám tổng quát, Tiêm phòng",
      "services": ["Khám tổng quát", "Tiêm phòng"]
    },
    {
      "orderId": "665f1b2c3d4e5f6a7b8c9d0e",
      "orderCode": "ORD0007",
      "date": "2026-05-01",
      "title": "Spa tắm",
      "services": ["Spa tắm"],
      "imageUrl": "https://res.cloudinary.com/demo/image/upload/after.jpg"
    }
  ],
  "totalEligible": 2,
  "truncated": false
}
```

If the pet has no `Done` orders, the response is still `200` with `"milestones": []`, `"totalEligible": 0`.

#### Response fields

| Field | Type | Description |
|---|---|---|
| `pet` | object | The pet being shared |
| `pet._id`, `pet.code`, `pet.name`, `pet.species`, `pet.photoUrl` | string | Basic pet info (`code` is shown to the owner here only). Owner contact info, date of birth, weight and notes are never read |
| `milestones` | array | Milestones that will be published, oldest → newest |
| `milestones[].orderId` | string | Order ID; use it as an item of `orderIds` when creating the post |
| `milestones[].orderCode` | string | Order code, for the owner's reference only; **not** stored in the post |
| `milestones[].date` | string | Milestone date, `YYYY-MM-DD` |
| `milestones[].title` | string | Names of the `Done` services joined by `, ` |
| `milestones[].services` | string[] | Service names |
| `milestones[].imageUrl` | string | Representative image (after-photo, else before-photo). Omitted if the order has no photo |
| `totalEligible` | number | Total number of eligible `Done` orders for the pet |
| `truncated` | boolean | `true` if `totalEligible` exceeds the 50 returned milestones |

### 400 Bad Request: validation failed

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": {
    "petId": "ID thú cưng không hợp lệ"
  }
}
```

When `petId` is missing, `errors.petId` is `"Thú cưng là bắt buộc"`.

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