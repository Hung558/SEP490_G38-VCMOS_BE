# API Documentation: Get Unified Pet Timeline (`UC-13`, `SCR-08`, `BR-23`)

Returns the unified chronological care timeline of a single pet (newest first), aggregating appointment orders, services, SOAP medical records & prescriptions, paraclinical subtasks, grooming notes, inpatient stays & daily logs, current holding/ward cage, invoices (role-gated per `BR-23`), and shared community timeline posts.

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/pets/:petId/timeline` |
| **Auth** | Required: `Authorization: Bearer <token>` |
| **Access Control (`BR-23`)** | `PetOwner`: own pets only (`403` otherwise). Clinic staff (`Receptionist`, `Veterinarian`, `Groomer`, `Admin`): any pet. Financial `invoice` fields are visible only to `PetOwner`, `Receptionist`, `Admin` (`null` for `Veterinarian` and `Groomer`). |

---

## Path Parameters

| Param | Type | Required | Description |
|---|---|---|---|
| `petId` | ObjectId (24-hex) | Yes | Pet ID |

## Query Parameters

| Query | Type | Default | Description |
|---|---|---|---|
| `type` | Enum | `All` | Filter milestones by category: `All`, `Examination`, `Vaccination`, `Grooming`, `Paraclinical`, `Inpatient` |
| `status` | Enum | — | Filter by order status: `Booked`, `CheckedIn`, `InProgress`, `WaitOwner`, `Done`, `Cancelled`, `Overdue` |
| `from` | `YYYY-MM-DD` | — | Start date filter (inclusive) |
| `to` | `YYYY-MM-DD` | — | End date filter (inclusive, must be `>= from`) |
| `page` | Integer (`>= 1`) | `1` | Page number |
| `limit` | Integer (`1..50`) | `20` | Items per page |

---

## Responses

### `200 OK`

```json
{
  "pet": {
    "_id": "6ad96d4a9664da6b2c0d8e10",
    "code": "PET-TL0001",
    "name": "Milo",
    "species": "Dog",
    "breed": "Poodle",
    "coatColor": "Brown",
    "photoUrl": "https://res.cloudinary.com/demo/image/upload/milo.jpg",
    "dob": "2023-05-01T00:00:00.000Z",
    "weight": 6.5,
    "notes": "Dị ứng hải sản",
    "status": "Active",
    "owner": {
      "_id": "6ad96d4a9664da6b2c0d8e01",
      "code": "USR-TL0001",
      "fullName": "Chủ nuôi A",
      "phone": "0911111001",
      "email": "ownera@test.vn"
    }
  },
  "summary": {
    "totalVisits": 2,
    "completedVisits": 1,
    "activeVisits": 1,
    "totalMedicalRecords": 1,
    "totalGroomingNotes": 1,
    "totalInpatientStays": 1,
    "hasActiveInpatient": true
  },
  "activeInpatient": {
    "_id": "6ad96d4a9664da6b2c0d8e50",
    "orderId": "6ad96d4a9664da6b2c0d8e30",
    "status": "Admitted",
    "initialDiagnosis": "Sốt xuất huyết theo dõi",
    "treatmentPlan": "Truyền dịch và theo dõi nhiệt độ",
    "admittedAt": "2026-11-18T14:30:00.000Z",
    "dischargedAt": null,
    "daysAdmitted": 2,
    "attendingVet": { "_id": "...", "code": "USR-TL0003", "fullName": "BS Hùng", "role": "Veterinarian" },
    "cage": { "_id": "...", "label": "W-01", "zone": "InpatientWard", "size": "M", "maxWeightKg": 15, "isIsolated": false, "status": "Occupied" },
    "dailyLogsCount": 2,
    "dailyLogs": [
      {
        "_id": "...",
        "date": "2026-11-19",
        "recordedBy": { "_id": "...", "code": "USR-TL0003", "fullName": "BS Hùng", "role": "Veterinarian" },
        "observations": "Nhiệt độ giảm còn 38.9°C",
        "notes": "Tiếp tục theo dõi",
        "createdAt": "2026-11-19T08:00:00.000Z"
      }
    ],
    "invoice": null
  },
  "sharedPosts": [],
  "timeline": [
    {
      "id": "6ad96d4a9664da6b2c0d8e20",
      "orderId": "6ad96d4a9664da6b2c0d8e20",
      "code": "APT-TL0001",
      "date": "2026-11-10",
      "slotStart": "09:00",
      "slotEnd": "10:30",
      "isOnline": true,
      "derivedStatus": "Done",
      "statusLabel": "Hoàn tất",
      "checkedInAt": "2026-11-10T08:55:00.000Z",
      "note": "Bé hơi mệt và cần tắm",
      "intake": null,
      "cancelReason": null,
      "cancelledAt": null,
      "categories": ["Examination", "Grooming"],
      "currentCage": {
        "assignmentId": "...",
        "assignedAt": "2026-11-10T08:56:00.000Z",
        "cage": { "_id": "...", "label": "H-01", "zone": "Holding", "size": "M", "maxWeightKg": 15, "isIsolated": false, "status": "Occupied" }
      },
      "services": [
        {
          "_id": "...",
          "sequenceNo": 1,
          "status": "Done",
          "isEmergency": false,
          "scheduledStart": "09:00",
          "scheduledEnd": "09:30",
          "queueNo": null,
          "cancelReason": null,
          "service": { "_id": "...", "code": "SRV-TL0001", "name": "Khám tổng quát", "category": "Examination", "defaultDuration": 30, "basePrice": 150000 },
          "assignedStaff": { "_id": "...", "code": "USR-TL0003", "fullName": "BS Hùng", "role": "Veterinarian" },
          "medicalRecord": {
            "_id": "...",
            "status": "Finalized",
            "subjectiveNote": "Ho nhẹ 2 ngày",
            "objectiveNote": "Nhiệt độ 38.6°C, cân nặng 6.5kg",
            "assessment": "Viêm đường hô hấp nhẹ",
            "plan": "Uống thuốc 5 ngày",
            "notes": "",
            "prescriptions": [
              {
                "_id": "...",
                "productId": "...",
                "productNameSnapshot": "Kháng sinh Amox",
                "unitSnapshot": "Viên",
                "dosage": "1 viên",
                "frequency": "2 lần/ngày",
                "durationDays": 5,
                "instructions": "Uống sau ăn"
              }
            ],
            "createdAt": "2026-11-10T09:10:00.000Z",
            "updatedAt": "2026-11-10T10:45:00.000Z"
          },
          "groomingNote": null,
          "subtasks": [
            {
              "_id": "...",
              "taskType": "Xét nghiệm máu",
              "instructions": "Kiểm tra bạch cầu",
              "resultText": "Bạch cầu tăng nhẹ",
              "resultImageUrl": "https://res.cloudinary.com/demo/image/upload/lab.jpg",
              "status": "Completed",
              "completedAt": "2026-11-10T09:20:00.000Z",
              "service": { "_id": "...", "code": "SRV-TL0003", "name": "Xét nghiệm máu", "category": "Paraclinical" },
              "requestedBy": { "_id": "...", "code": "USR-TL0003", "fullName": "BS Hùng", "role": "Veterinarian" },
              "assignedStaff": { "_id": "...", "code": "USR-TL0003", "fullName": "BS Hùng", "role": "Veterinarian" },
              "createdAt": "2026-11-10T09:05:00.000Z"
            }
          ]
        },
        {
          "_id": "...",
          "sequenceNo": 2,
          "status": "Done",
          "isEmergency": false,
          "scheduledStart": "09:30",
          "scheduledEnd": "10:30",
          "queueNo": null,
          "cancelReason": null,
          "service": { "_id": "...", "code": "SRV-TL0002", "name": "Tắm & cắt tỉa", "category": "Grooming", "defaultDuration": 60, "basePrice": 250000 },
          "assignedStaff": { "_id": "...", "code": "USR-TL0004", "fullName": "Groomer Lan", "role": "Groomer" },
          "medicalRecord": null,
          "groomingNote": {
            "beforeNote": "Lông hơi rối ở tai",
            "afterNote": "Đã gỡ rối, tắm sạch và sấy khô",
            "beforePhotoUrl": "https://res.cloudinary.com/demo/image/upload/before.jpg",
            "afterPhotoUrl": "https://res.cloudinary.com/demo/image/upload/after.jpg",
            "recommendations": "Chải lông mỗi 2 ngày",
            "createdAt": "2026-11-10T10:25:00.000Z"
          },
          "subtasks": []
        }
      ],
      "inpatientRecord": null,
      "invoice": {
        "_id": "...",
        "code": "INV-TL0001",
        "totalAmount": 400000,
        "paymentMethod": "PayOS",
        "paymentStatus": "Paid",
        "issuedAt": "2026-11-10T10:40:00.000Z",
        "paidAt": "2026-11-10T10:45:00.000Z",
        "vnpayTxnRef": null,
        "payosOrderCode": 1794990001,
        "issuedBy": { "_id": "...", "code": "USR-TL0005", "fullName": "Lễ tân Hoa", "role": "Receptionist" },
        "items": [
          {
            "_id": "...",
            "type": "Service",
            "refId": "...",
            "itemNameSnapshot": "Khám tổng quát",
            "unitPriceSnapshot": 150000,
            "quantity": 1,
            "subtotal": 150000
          }
        ]
      },
      "canShareToCommunity": true,
      "createdAt": "2026-11-10T07:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

### Error Responses

- `400 Bad Request`: Invalid `petId` or query parameter (`{ message, errors }`)
- `401 Unauthorized`: Missing or invalid Bearer token
- `403 Forbidden`: `PetOwner` attempting to view another owner's pet timeline (`BR-23`)
- `404 Not Found`: Pet not found

