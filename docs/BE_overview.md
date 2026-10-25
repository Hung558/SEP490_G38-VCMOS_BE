# VCMOS Backend: Tổng quan, Sequence Diagram và Class Diagram

## 1. Thông tin chung

| Mục | Nội dung |
|---|---|
| Công nghệ | Node.js, Express 5, Mongoose 9 (MongoDB), CommonJS |
| Xác thực | JWT (`jsonwebtoken`), mật khẩu băm bằng `bcryptjs` |
| Test | Jest + Supertest, chạy trên MongoDB local `vcmos_test` |
| Lệnh | `npm run dev` (nodemon), `npm start`, `npm test`, `npm run seed` |
| Port mặc định | `9999` |
| Cấu trúc | `routes → controllers → services → models`, kèm `validators/` và `middlewares/` |

### Cấu trúc thư mục
```
VCMOS_BE/
├── server.js                 # tạo app Express, gắn route
├── src/
│   ├── config/db.js          # kết nối MongoDB
│   ├── routes/               # auth.routes.js, user.routes.js
│   ├── controllers/          # auth.controller.js, user.controller.js
│   ├── services/             # auth.service.js, user.service.js
│   ├── validators/           # auth.validator.js, user.validator.js
│   ├── middlewares/          # auth.middleware.js (protect, authorize)
│   ├── models/               # 17 model Mongoose
│   └── seeds/seed.js         # dữ liệu mẫu
├── tests/                    # auth, authorize, user
├── api/                      # tài liệu từng API
└── docs/                     # tài liệu tổng quan (file này)
```

### Nhiệm vụ từng tầng
- **Route**: khai báo URL, HTTP method và các middleware cần chạy.
- **Middleware**: `protect` kiểm tra JWT rồi gán `req.user = { id, role }`. `authorize(...roles)` chặn những role không được phép (trả 403).
- **Controller**: nhận request, gọi validator (sai dữ liệu thì trả 400), gọi service, trả response.
- **Service**: xử lý nghiệp vụ, làm việc với DB. Gặp lỗi thì ném `httpError(status, message)`.
- **Model**: schema Mongoose và index.

### API đã có

| Method | URL | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/auth/register` | Không | Đăng ký, role luôn là `PetOwner` |
| POST | `/api/auth/login` | Không | Đăng nhập bằng SĐT hoặc email, trả `{ token, user }` |
| POST | `/api/auth/logout` | Bearer | JWT stateless nên server chỉ trả 200, FE tự xoá token |
| GET | `/api/users/me` | Bearer | Xem profile của mình |
| PUT | `/api/users/me` | Bearer | Sửa `fullName`, `phone`, `email` của mình |

### Quy tắc nghiệp vụ chính
- **Số điện thoại là định danh chính:** bắt buộc, unique, đúng 10 số và bắt đầu bằng `0`.
- **Email không bắt buộc:** unique nếu có. Dùng partial index nên nhiều user không có email không bị coi là trùng.
- **Login không phân biệt** "sai tài khoản" hay "sai mật khẩu" (cùng trả 401, cùng message) để tránh bị dò tài khoản. Tài khoản `Locked` hoặc `Inactive` bị chặn với 403.
- **Token chỉ chứa** `id` và `role`. `passwordHash` có `select: false` và không bao giờ được trả ra response.
- **Mã user** có dạng `USR-XXXXXX` (ngẫu nhiên, không dùng ký tự dễ nhầm như 0/O/1/I). Nếu bị trùng thì sinh lại, tối đa 5 lần.
- **Role:** `PetOwner`, `Receptionist`, `Veterinarian`, `Groomer`, `Admin`.

---

## 2. Sequence Diagram

### 2.1 Đăng ký
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'actorBkg': '#ffffff', 'actorBorder': '#000000', 'actorTextColor': '#000000', 'actorLineColor': '#000000', 'signalColor': '#000000', 'signalTextColor': '#000000', 'labelBoxBkgColor': '#ffffff', 'labelBoxBorderColor': '#000000', 'labelTextColor': '#000000', 'loopTextColor': '#000000' }}}%%
sequenceDiagram
    actor Client
    participant Route as auth.routes
    participant Ctrl as auth.controller
    participant Val as auth.validator
    participant Svc as auth.service
    participant DB as MongoDB (User)

    Client->>Route: POST /api/auth/register
    Route->>Ctrl: register(req, res)
    Ctrl->>Val: validateRegister(body)
    alt Invalid data
        Val-->>Ctrl: isValid = false
        Ctrl-->>Client: 400 message + errors
    else Valid data
        Ctrl->>Svc: register(body)
        Svc->>DB: exists phone / email
        alt Already exists
            Svc-->>Ctrl: throw 409
            Ctrl-->>Client: 409 phone or email already registered
        else Not found
            Svc->>Svc: bcrypt.hash(password)
            loop Up to 5 times if code collides
                Svc->>DB: User.create(code USR-XXXXXX, role PetOwner)
            end
            DB-->>Svc: user
            Svc-->>Ctrl: publicUser
            Ctrl-->>Client: 201 registered + user
        end
    end
```

### 2.2 Đăng nhập
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'actorBkg': '#ffffff', 'actorBorder': '#000000', 'actorTextColor': '#000000', 'actorLineColor': '#000000', 'signalColor': '#000000', 'signalTextColor': '#000000', 'labelBoxBkgColor': '#ffffff', 'labelBoxBorderColor': '#000000', 'labelTextColor': '#000000', 'loopTextColor': '#000000' }}}%%
sequenceDiagram
    actor Client
    participant Ctrl as auth.controller
    participant Val as auth.validator
    participant Svc as auth.service
    participant DB as MongoDB (User)

    Client->>Ctrl: POST /api/auth/login (identifier, password)
    Ctrl->>Val: validateLogin(body)
    alt Missing data
        Ctrl-->>Client: 400
    else Valid
        Ctrl->>Svc: login(body)
        Svc->>Svc: is identifier a phone or an email
        Svc->>DB: findOne(...).select(+passwordHash)
        DB-->>Svc: user or null
        alt No user or wrong password
            Svc-->>Ctrl: throw 401
            Ctrl-->>Client: 401 invalid credentials
        else status Locked or Inactive
            Svc-->>Ctrl: throw 403
            Ctrl-->>Client: 403
        else Success
            Svc->>Svc: jwt.sign(id, role)
            Svc-->>Ctrl: token + publicUser
            Ctrl-->>Client: 200 token + user
        end
    end
```

### 2.3 Xem và sửa profile (có protect)
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'actorBkg': '#ffffff', 'actorBorder': '#000000', 'actorTextColor': '#000000', 'actorLineColor': '#000000', 'signalColor': '#000000', 'signalTextColor': '#000000', 'labelBoxBkgColor': '#ffffff', 'labelBoxBorderColor': '#000000', 'labelTextColor': '#000000', 'loopTextColor': '#000000' }}}%%
sequenceDiagram
    actor Client
    participant MW as protect
    participant Ctrl as user.controller
    participant Val as user.validator
    participant Svc as user.service
    participant DB as MongoDB (User)

    Client->>MW: GET or PUT /api/users/me + Bearer token
    alt Missing or invalid token
        MW-->>Client: 401
    else Valid token
        MW->>MW: req.user = id, role
        MW->>Ctrl: next()
        alt GET /me
            Ctrl->>Svc: getMyProfile(req.user.id)
            Svc->>DB: findById(id).select(PROFILE_FIELDS).lean()
        else PUT /me
            Ctrl->>Val: validateUpdateMyProfile(fullName, phone, email)
            alt Invalid data
                Ctrl-->>Client: 400 message + errors
            end
            Ctrl->>Svc: updateMyProfile(id, fullName, phone, email)
            Svc->>DB: findByIdAndUpdate($set / $unset email)
        end
        alt User not found
            Svc-->>Ctrl: throw 404
            Ctrl-->>Client: 404
        else Duplicate phone or email (error 11000)
            Svc-->>Ctrl: throw 409
            Ctrl-->>Client: 409
        else Success
            DB-->>Svc: user
            Svc-->>Ctrl: user
            Ctrl-->>Client: 200 user
        end
    end
```

### 2.4 Phân quyền (authorize)
Hiện chưa có route nào dùng `authorize`. Đây là luồng khi gắn vào một route.
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'actorBkg': '#ffffff', 'actorBorder': '#000000', 'actorTextColor': '#000000', 'actorLineColor': '#000000', 'signalColor': '#000000', 'signalTextColor': '#000000', 'labelBoxBkgColor': '#ffffff', 'labelBoxBorderColor': '#000000', 'labelTextColor': '#000000', 'loopTextColor': '#000000' }}}%%
sequenceDiagram
    actor Client
    participant P as protect
    participant A as authorize(roles)
    participant C as Controller

    Client->>P: Request + Bearer token
    alt Invalid token
        P-->>Client: 401
    else Valid token
        P->>A: req.user = id, role
        alt role not in allowed roles
            A-->>Client: 403 forbidden
        else role allowed
            A->>C: next()
            C-->>Client: Response
        end
    end
```

---

## 3. Class Diagram

### 3.1 Các tầng code (module đã làm)
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#000000', 'classText': '#000000' }}}%%
classDiagram
    class AuthRoutes {
        POST register
        POST login
        POST logout
    }
    class UserRoutes {
        GET me
        PUT me
    }
    class AuthMiddleware {
        +protect(req, res, next)
        +authorize(roles)
    }
    class AuthController {
        +register(req, res)
        +login(req, res)
        +logout(req, res)
    }
    class UserController {
        +getMyProfile(req, res)
        +updateMyProfile(req, res)
    }
    class AuthValidator {
        +PHONE_REGEX
        +validateRegister(body)
        +validateLogin(body)
    }
    class UserValidator {
        +validateUpdateMyProfile(body)
    }
    class AuthService {
        +register(data)
        +login(data)
        -generateToken(user)
        -generateUserCode()
        -toPublicUser(user)
    }
    class UserService {
        +getMyProfile(userId)
        +updateMyProfile(userId, fullName, phone, email)
    }
    class UserModel {
        <<Mongoose Model>>
    }

    AuthRoutes --> AuthController
    AuthRoutes --> AuthMiddleware
    UserRoutes --> UserController
    UserRoutes --> AuthMiddleware
    AuthController --> AuthValidator
    AuthController --> AuthService
    UserController --> UserValidator
    UserController --> UserService
    AuthService --> AuthValidator : uses PHONE_REGEX
    AuthService --> UserModel
    UserService --> UserModel
```

### 3.2 Domain model (17 collection)
```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#ffffff', 'primaryTextColor': '#000000', 'primaryBorderColor': '#000000', 'lineColor': '#000000', 'secondaryColor': '#ffffff', 'tertiaryColor': '#ffffff', 'mainBkg': '#ffffff', 'nodeBorder': '#000000', 'classText': '#000000' }}}%%
classDiagram
    class User {
        String code
        String fullName
        String phone
        String email
        String passwordHash
        String role
        String status
    }
    class Pet {
        String code
        ObjectId ownerId
        String name
        String species
        String breed
        Date dob
        Number weight
        String status
    }
    class StaffSchedule {
        ObjectId staffId
        String workDate
        String notes
    }
    class Service {
        String code
        String name
        String category
        Number defaultDuration
        Number basePrice
        String status
    }
    class Product {
        String code
        String name
        String category
        String unit
        Number unitPrice
        String status
    }
    class AppointmentOrder {
        String code
        ObjectId petId
        ObjectId ownerId
        String date
        Boolean isOnline
        String derivedStatus
        Date checkedInAt
    }
    class AppointmentService {
        ObjectId orderId
        ObjectId serviceId
        Number sequenceNo
        ObjectId assignedStaffId
        String status
        Boolean isEmergency
        Number queueNo
        GroomingNote groomingNote
    }
    class MedicalRecord {
        ObjectId appointmentServiceId
        ObjectId petId
        String assessment
        String plan
        Prescription[] prescriptions
        String status
    }
    class SubtaskRequest {
        ObjectId appointmentServiceId
        ObjectId requestedById
        ObjectId assignedStaffId
        String taskType
        String resultText
        String status
    }
    class Cage {
        String label
        String size
        Boolean isIsolated
        String status
    }
    class CageAssignment {
        ObjectId cageId
        ObjectId orderId
        ObjectId assignedById
        Date releasedAt
    }
    class InpatientRecord {
        ObjectId petId
        ObjectId orderId
        ObjectId attendingVetId
        ObjectId cageId
        String status
        DailyLog[] dailyLogs
    }
    class Invoice {
        String code
        ObjectId orderId
        ObjectId inpatientRecordId
        ObjectId issuedById
        InvoiceItem[] items
        Number totalAmount
        String paymentMethod
        String paymentStatus
    }
    class CommunityPost {
        ObjectId authorId
        ObjectId petId
        String postType
        String content
        String status
        Number likeCount
        Number commentCount
    }
    class PostComment {
        ObjectId postId
        ObjectId authorId
        ObjectId parentCommentId
        String content
        String status
    }
    class PostLike {
        ObjectId postId
        ObjectId userId
    }
    class ContentReport {
        ObjectId reporterId
        String targetType
        ObjectId targetId
        String reason
        String status
    }

    User "1" --> "*" Pet : owns
    User "1" --> "*" StaffSchedule : works on
    User "1" --> "*" AppointmentOrder : books
    Pet "1" --> "*" AppointmentOrder
    AppointmentOrder "1" *-- "*" AppointmentService : contains
    Service "1" --> "*" AppointmentService
    User "1" --> "*" AppointmentService : assigned staff
    AppointmentService "1" --> "0..1" MedicalRecord
    AppointmentService "1" --> "*" SubtaskRequest
    MedicalRecord --> Product : prescribes
    AppointmentOrder "1" --> "*" CageAssignment
    Cage "1" --> "*" CageAssignment
    Pet "1" --> "*" InpatientRecord
    InpatientRecord --> Cage
    AppointmentOrder "1" --> "0..1" Invoice
    InpatientRecord "1" --> "0..1" Invoice
    User "1" --> "*" CommunityPost : writes
    CommunityPost "1" *-- "*" PostComment
    CommunityPost "1" *-- "*" PostLike
    PostComment --> PostComment : replies to
    User "1" --> "*" ContentReport : reports
    ContentReport ..> CommunityPost : targetType Post
    ContentReport ..> PostComment : targetType Comment
```

### Các ràng buộc unique quan trọng
| Model | Ràng buộc |
|---|---|
| User | `code`, `phone` unique. `email` unique khi có giá trị (partial index) |
| Pet, Service, Product, AppointmentOrder, Invoice | `code` unique |
| AppointmentService | (`orderId`, `sequenceNo`) unique |
| CageAssignment | Mỗi chuồng chỉ có 1 assignment đang mở (`releasedAt = null`) |
| InpatientRecord | Mỗi pet chỉ có 1 đợt nội trú `Admitted` |
| Invoice | `orderId`, `inpatientRecordId`, `vnpayTxnRef` unique khi có giá trị |
| MedicalRecord | `appointmentServiceId` unique (mỗi dịch vụ có 1 bệnh án) |
| PostLike | (`postId`, `userId`) unique, mỗi người like 1 lần |
| ContentReport | (`reporterId`, `targetType`, `targetId`) unique |
| StaffSchedule | (`staffId`, `workDate`) unique |
| Service / Product | (`category`, `name`) / (`name`, `unit`) unique |
