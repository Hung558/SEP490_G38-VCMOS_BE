# API Documentation: List Inpatient Records

Get a paginated list of inpatient records, newest admission first. The `dailyLogs` array is not included in list results; use [Get Inpatient Record](get-inpatient-record.md) for the full record.

## Endpoint

| | |
|---|---|
| **Method** | `GET` |
| **URL** | http://localhost:9999/api/inpatient-records |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Veterinarian`) |

## Query parameters

All parameters are optional.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | – | Filter by status: `Admitted` or `Discharged`. |
| `petId` | string (ObjectId) | – | Only records of this pet. |
| `attendingVetId` | string (ObjectId) | – | Only records of this attending veterinarian. Ignored when `mine=true`. |
| `mine` | string | – | Set to `true` to return only records where the logged-in vet is the attending vet. |
| `page` | integer | `1` | Page number (minimum 1). |
| `limit` | integer | `20` | Items per page (1 to 100). |

**Example**

```
GET /api/inpatient-records?status=Admitted&mine=true&page=1&limit=10
```

## Responses

### 200 OK: success

```json
{
  "items": [
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
      "createdAt": "2026-11-16T03:15:42.120Z",
      "updatedAt": "2026-11-16T03:15:42.120Z",
      "__v": 0
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

### 400 Bad Request: invalid query parameters

`errors` is an array of messages.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": ["status không hợp lệ"]
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

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ" }
```