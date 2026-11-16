# API Documentation: Create Inpatient Record

Admit a pet to the inpatient ward. Creates the inpatient record, marks the cage as `Occupied` and records a cage assignment for the order. The attending veterinarian is always the logged-in user.

## Endpoint

| | |
|---|---|
| **Method** | `POST` |
| **URL** | http://localhost:9999/api/inpatient-records |
| **Auth** | Required: `Authorization: Bearer <token>` (role: `Veterinarian`) |
| **Content-Type** | `application/json` |

## Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `petId` | string (ObjectId) | Yes | The pet to admit. Must be an `Active` pet. |
| `orderId` | string (ObjectId) | Yes | The originating appointment order. Must belong to `petId` and must not be `Cancelled`. |
| `cageId` | string (ObjectId) | Yes | The cage to place the pet in. Must be in the `InpatientWard` zone, currently `Available`, and its `maxWeightKg` (if set) must not be lower than the pet's weight. |
| `initialDiagnosis` | string | No | Initial diagnosis. Leading/trailing spaces are trimmed. |
| `treatmentPlan` | string | No | Planned treatment. Leading/trailing spaces are trimmed. |

**Business rules**

- A pet can have only one active (`Admitted`) hospitalization at a time.
- If the order already holds an open cage assignment (e.g. a holding cage), it is released and that cage becomes `Available` again.
- `attendingVetId` cannot be set in the request; it is taken from the token.

**Example**

```json
{
  "petId": "6ad96d4a9664da6b2c0d8d70",
  "orderId": "6ad96d4a9664da6b2c0d8d85",
  "cageId": "6ad96d4a9664da6b2c0d8d91",
  "initialDiagnosis": "Canine parvovirus",
  "treatmentPlan": "IV fluids, anti-emetics, monitor every 4 hours"
}
```

## Responses

### 201 Created: success

Returns the new record with related documents populated. `dailyLogs` is empty on creation.

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
  "dailyLogs": [],
  "createdAt": "2026-11-16T03:15:42.120Z",
  "updatedAt": "2026-11-16T03:15:42.120Z",
  "__v": 0
}
```

### 400 Bad Request: validation failed

`errors` is an array of messages.

```json
{
  "message": "Dữ liệu không hợp lệ",
  "errors": ["petId không hợp lệ", "cageId không hợp lệ"]
}
```

### 400 Bad Request: business rule violated

One of the following messages:

```json
{ "message": "Lịch hẹn không thuộc thú cưng này" }
```
```json
{ "message": "Lịch hẹn đã bị huỷ" }
```
```json
{ "message": "Lồng không thuộc khu nội trú" }
```
```json
{ "message": "Cân nặng thú cưng vượt quá giới hạn của lồng" }
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

### 404 Not Found: referenced document does not exist

One of the following messages:

```json
{ "message": "Không tìm thấy thú cưng" }
```
```json
{ "message": "Không tìm thấy lịch hẹn" }
```
```json
{ "message": "Không tìm thấy lồng" }
```

### 409 Conflict: pet already admitted or cage occupied

```json
{ "message": "Thú cưng đang trong đợt nội trú khác" }
```
```json
{ "message": "Lồng đã có thú cưng khác" }
```

### 500 Internal Server Error
```json
{ "message": "Lỗi máy chủ" }
```