# API Documentation: List My Grooming Notes

A Groomer views all the grooming notes they have created, newest first. The Groomer is identified by the token, so no ID is passed.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-services/my-grooming-notes |
| **Auth** | Required: `Authorization: Bearer <token>`, role `Groomer` |

## Request

No path parameters, query parameters or body.

Only services that are assigned to the logged-in Groomer **and** already have a grooming note are returned. Results are sorted by `groomingNote.createdAt`, newest first.

**Example**

```bash
curl http://localhost:9999/api/appointment-services/my-grooming-notes \
  -H "Authorization: Bearer <token>"
```

## Responses

### 200 OK: success

`data` is an array of appointment services. `orderId` and `serviceId` are populated with the full order / service documents (abbreviated below); `assignedStaffId` is returned as a plain ID. `data` is an empty array when the Groomer has no notes yet.

```json
{
  "message": "Lấy danh sách ghi chú chăm sóc thành công",
  "data": [
    {
      "_id": "6ad96d4a9664da6b2c0d8d70",
      "orderId": { "_id": "6ad96d4a9664da6b2c0d8d65", "code": "APT-XXXXXX", "date": "2026-11-13" },
      "serviceId": { "_id": "6ad96d4a9664da6b2c0d8d50", "name": "Tắm và cắt tỉa lông" },
      "sequenceNo": 1,
      "preferredStaffId": null,
      "assignedStaffId": "6ad96d4a9664da6b2c0d8d61",
      "status": "Done",
      "isEmergency": false,
      "scheduledStart": "09:00",
      "scheduledEnd": "09:30",
      "groomingNote": {
        "beforeNote": "Lông rối nhiều, da khô",
        "afterNote": "Đã tắm và cắt tỉa gọn gàng",
        "beforePhotoUrl": "https://res.cloudinary.com/<cloud_name>/image/upload/v1731480000/grooming-notes/6ad96d4a9664da6b2c0d8d70/abc123.jpg",
        "afterPhotoUrl": "https://res.cloudinary.com/<cloud_name>/image/upload/v1731480300/grooming-notes/6ad96d4a9664da6b2c0d8d70/def456.jpg",
        "recommendations": "Chải lông mỗi ngày",
        "createdAt": "2026-11-13T02:30:00.000Z"
      },
      "createdAt": "2026-11-12T08:00:00.000Z",
      "updatedAt": "2026-11-13T02:30:00.000Z"
    }
  ]
}
```

### 401 Unauthorized: not logged in

```json
{ "message": "Chưa đăng nhập" }
```
Or when the token is invalid or expired:
```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden

Role is not `Groomer`:
```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```
Or the account is locked / inactive:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ, vui lòng thử lại sau" }
```