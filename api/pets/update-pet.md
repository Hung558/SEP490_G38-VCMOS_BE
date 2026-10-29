# API Documentation: Update Pet

Update the information or photo of one of the logged-in user's pets. This is a partial update: only the fields you send are changed.

## Endpoint

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | http://localhost:9999/api/pets/:petId |
| **Auth** | Required: `Authorization: Bearer <token>` (token from the login API) |
| **Content-Type** | `multipart/form-data` (when uploading a photo) or `application/json` (no photo) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `petId` | string | Yes | The pet's `_id` (a 24-character hexadecimal string). |

## Request body

All fields are optional, but **at least one field or a photo must be sent**.

| Field | Type | Description |
|---|---|---|
| `name` | string | New name. Trimmed, max 100 characters. Cannot be empty. |
| `species` | string | Trimmed, max 50 characters. |
| `breed` | string | Trimmed, max 50 characters. |
| `coatColor` | string | Trimmed, max 50 characters. |
| `notes` | string | Trimmed, max 1000 characters. |
| `dob` | string | Date of birth, e.g. `2021-03-15` or a full ISO 8601 date-time. Must not be in the future. |
| `weight` | number | Weight in kg, from `0` to `500`. A numeric string (e.g. `"4.2"`) is accepted. |
| `photo` | file | New photo. **Must be sent as a file in a `multipart/form-data` request** with the field name `photo`. JPEG, PNG or WebP, max 5 MB. |

How values are applied:

- **Field not sent:** left unchanged.
- **Field sent with a value:** replaced with the new value.
- **Optional field sent empty** (`""`, or `null` in JSON), for `species`, `breed`, `coatColor`, `notes`, `dob` or `weight`: the field is **cleared** (it becomes `null`). With `multipart/form-data`, send an empty string to clear a field. `name` cannot be cleared.
- **`photo`:** replaces the existing photo, and the old image is deleted from storage. A photo can only be replaced, not removed.
- `code`, `ownerId`, `status` and `photoUrl` cannot be changed through this API. Any such fields are ignored. A `photo` key inside a JSON body is also ignored.
- Deleted pets cannot be updated.

**Example (JSON)**

```json
{
  "weight": 4.6,
  "notes": ""
}
```

This changes the weight to 4.6 and clears the notes. Everything else stays the same.

**Example (multipart with photo, browser)**

```js
const form = new FormData();
form.append('name', 'Mimi Jr.');
form.append('photo', fileInput.files[0]);

fetch(`http://localhost:9999/api/pets/${petId}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}` }, // do NOT set Content-Type yourself; the browser adds the multipart boundary
  body: form,
});
```

## Responses

### 200 OK: success

Returns the full updated pet. See the [Pet object](create-pet.md#pet-object) for the meaning of every field.

```json
{
  "pet": {
    "_id": "6b1f0c2e9a3d4e5f60718293",
    "code": "PET-K7M2QX",
    "ownerId": "6ad96d4a9664da6b2c0d8d61",
    "name": "Mimi",
    "species": "Cat",
    "breed": "British Shorthair",
    "coatColor": "Grey",
    "photoUrl": "https://res.cloudinary.com/demo/image/upload/v1699999999/pets/abc123.jpg",
    "notes": null,
    "dob": "2021-03-15T00:00:00.000Z",
    "weight": 4.6,
    "status": "Active",
    "createdAt": "2026-10-27T03:15:42.123Z",
    "updatedAt": "2026-10-27T04:02:10.456Z",
    "__v": 0
  }
}
```

### 400 Bad Request: validation failed

`errors` is an array. Every problem is reported at once.

```json
{
  "message": "Dữ liệu cập nhật thú cưng không hợp lệ.",
  "errors": [
    { "field": "name", "message": "Tên thú cưng là bắt buộc." },
    { "field": "dob", "message": "Ngày sinh không được ở tương lai." }
  ]
}
```

When nothing to update was sent:

```json
{
  "message": "Dữ liệu cập nhật thú cưng không hợp lệ.",
  "errors": [
    { "field": "body", "message": "Cần ít nhất một thông tin để cập nhật." }
  ]
}
```

A malformed `petId` returns:

```json
{
  "message": "Mã thú cưng không hợp lệ.",
  "errors": [
    { "field": "petId", "message": "Mã thú cưng không hợp lệ." }
  ]
}
```

`errors[].field` can be `name`, `species`, `breed`, `coatColor`, `notes`, `dob`, `weight`, `photo`, `body` or `petId`.

Photo problems found while parsing the upload (file too large, or the file sent under a different field name) return only a `message`, without `errors`:

```json
{ "message": "Ảnh không được vượt quá 5MB." }
```

```json
{ "message": "Tệp ảnh phải được gửi với tên trường \"photo\"." }
```

### 401 Unauthorized: missing or invalid token

```json
{ "message": "Chưa đăng nhập" }
```

```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

The first is returned when the `Authorization: Bearer <token>` header is missing, the second when the token is invalid or expired.

### 404 Not Found: pet does not exist or is not yours

```json
{ "message": "Không tìm thấy thú cưng" }
```

The same response is returned when the pet belongs to another user.

### 409 Conflict: pet is deleted

```json
{ "message": "Không thể cập nhật các thú cưng đã bị xóa" }
```

### 500 Internal Server Error

```json
{ "message": "Lỗi máy chủ" }
```