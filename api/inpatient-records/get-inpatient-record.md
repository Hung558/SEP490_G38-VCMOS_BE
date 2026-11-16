# API Documentation: Get Inpatient Record

Get one inpatient record by id, including its daily logs.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/inpatient-records/:id |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Veterinarian`) |

## Path parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string (ObjectId) | Yes | The inpatient record id. |

## Responses

### 200 OK: success

```json
{
  "_id": "6ad96d4a9664da6b2c0d8da0",
  "petId": {
    "_id": "6ad96d4a9664da6b2c0d8d70",
    "code": "PET-A1B2C3",
    "name": "Milo",
    "species": "Dog",
    "breed": "Poodle",
    "weight": 6.5,
    "ownerId": "6ad96d4a9664da6b2c0d8d61"
  },
  "orderId": {
    "_id": "6ad96d4a9664da6b2c0d8d85",
    "code": "ORD-X9Y8Z7",
    "date": "2026-11-16",
    "derivedStatus": "InProgress"
  },
  "attendingVetId": {
    "_id": "6ad96d4a9664da6b2c0d8d55",
    "code": "USR-VET001",
    "fullName": "Dr. Example Vet"
  },
  "cageId": {
    "_id": "6ad96d4a9664da6b2c0d8d91",
    "label": "IW-03",
    "size": "M",
    "zone": "InpatientWard",
    "isIsolated": false,
    "status": "Occupied"
  },
  "initialDiagnosis": "Canine parvovirus",
  "treatmentPlan": "IV fluids, anti-emetics, monitor every 4 hours",
  "admittedAt": "2026-11-16T03:15:42.118Z",
  "dischargedAt": null,
  "status": "Admitted",
  "dailyLogs": [
    {
      "_id": "6ad96d4a9664da6b2c0d8db2",
      "date": "2026-11-16",
      "recordedById": {
        "_id": "6ad96d4a9664da6b2c0d8d55",
        "code": "USR-VET001",
        "fullName": "Dr. Example Vet"
      },
      "observations": "Vomiting twice overnight, mild dehydration",
      "notes": "Continue IV fluids",
      "createdAt": "2026-11-16T09:00:00.000Z"
    }
  ],
  "createdAt": "2026-11-16T03:15:42.120Z",
  "updatedAt": "2026-11-16T09:00:00.000Z",
  "__v": 1
}
```

### 400 Bad Request: invalid id

```json
{ "message": "id không hợp lệ" }
```

### 401 Unauthorized: missing or invalid token
```json
{ "message": "Chưa đăng nhập" }
```
Or when the token is invalid or expired:
```json
{ "message": "Token không hợp lệ hoặc đã hết hạn" }
```

### 403 Forbidden: role not allowed or account not active
```json
{ "message": "Bạn không có quyền thực hiện chức năng này" }
```
Or when the account is locked or inactive:
```json
{ "message": "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên" }
```
```json
{ "message": "Tài khoản đã ngừng hoạt động" }
```

### 404 Not Found: record does not exist

```json
{ "message": "Không tìm thấy hồ sơ nội trú" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ" }
```