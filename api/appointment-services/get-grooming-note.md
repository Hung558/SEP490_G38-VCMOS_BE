# API Documentation: Get Grooming Note

A Groomer views the grooming note of one service that is assigned to them.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/appointment-services/:id/grooming-note |
| **Auth** | Required: `Authorization: Bearer <token>`, role `Groomer` |

## Path parameters

| Parameter | Type | Description |
|---|---|---|
| `id` | string (ObjectId) | ID of the appointment service (`AppointmentService`). |

## Request body

None.

**Example**

```bash
curl http://localhost:9999/api/appointment-services/6ad96d4a9664da6b2c0d8d70/grooming-note \
  -H "Authorization: Bearer <token>"
```

## Responses

### 200 OK: success

Returns the whole appointment service with its `groomingNote`. `orderId` and `serviceId` are populated with the full order / service documents (abbreviated below).

```json
{
  "message": "Lấy ghi chú chăm sóc thành công",
  "data": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "orderId": { "_id": "6ad96d4a9664da6b2c0d8d65", "code": "APT-XXXXXX", "date": "2026-11-13" },
    "serviceId": { "_id": "6ad96d4a9664da6b2c0d8d50", "name": "Tắm và cắt tỉa lông" },
    "sequenceNo": 1,
    "preferredStaffId": null,
    "assignedStaffId": {
      "_id": "6ad96d4a9664da6b2c0d8d61",
      "code": "USR-ABCDEF",
      "fullName": "Example Groomer",
      "role": "Groomer",
      "status": "Active"
    },
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
}
```

### 400 Bad Request: invalid ID

```json
{ "message": "ID dịch vụ lịch hẹn không hợp lệ" }
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
The service is not assigned to the logged-in Groomer:
```json
{ "message": "Bạn chỉ có thể thao tác trên dịch vụ được phân công cho mình" }
```
Or the account is locked / inactive:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```

### 404 Not Found

The service does not exist:
```json
{ "message": "Không tìm thấy dịch vụ trong lịch hẹn" }
```
The service exists and is assigned to the Groomer, but has no grooming note yet:
```json
{ "message": "Dịch vụ này chưa có ghi chú chăm sóc" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ, vui lòng thử lại sau" }
```