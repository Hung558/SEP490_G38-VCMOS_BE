# API Documentation: Admin Community Moderation (`UC-57`, `UC-58`, `UC-59`, `SCR-33`)

All endpoints require `Authorization: Bearer <token>` with role **`Admin`**.

---

## 1. List Posts for Moderation Queue & History (`UC-57`)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/admin/community/posts?status=PendingReview&postType=&page=1&limit=10` |
| **Auth** | Bearer token (`Admin`) |

- `status`: `PendingReview` (default), `Published`, `Hidden`, `Removed`, or `All`.
- `postType`: optional `TimelineShare` or `Discussion`.
- Each post includes `hasSensitiveKeywords` (`boolean`) and `sensitiveMatches` (`string[]`) flagging medical/price terms to assist moderation (`T-53`, `UC-58`).

---

## 2. Approve or Reject a Pending Post (`UC-58`)

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:9999/api/admin/community/posts/:id/moderate` |
| **Auth** | Bearer token (`Admin`) |

### Body (`JSON`)
```json
{
  "decision": "Approve",
  "moderationNote": "Nội dung hợp lệ"
}
```
- `decision`: `"Approve"` (`-> Published`) or `"Reject"` (`-> Hidden`).
- `moderationNote`: **required** (1–500 chars) when `decision === "Reject"` (`400`, `MSG22`).
- Returns `409` if the post is not in `PendingReview`.

---

## 3. List Content Reports (`UC-59`)

| | |
|---|---|
| **Method** | `GET` |
| **URL** | `http://localhost:9999/api/admin/community/reports?status=Pending&targetType=&page=1&limit=10` |
| **Auth** | Bearer token (`Admin`) |

- `status`: `Pending` (default), `Resolved`, or `All`.
- `targetType`: optional `Post` or `Comment`.
- Each report includes `target` (the full reported post or comment with parent post context) and `reportCount` (total reports filed on that target).

---

## 4. Resolve a Content Report (`UC-59`)

| | |
|---|---|
| **Method** | `PATCH` |
| **URL** | `http://localhost:9999/api/admin/community/reports/:id/resolve` |
| **Auth** | Bearer token (`Admin`) |

### Body (`JSON`)
```json
{
  "decision": "Hide",
  "note": "Vi phạm quy định cộng đồng"
}
```
- `decision`:
  - `"Keep"`: keeps content visible, marks all pending reports on that target `Resolved`.
  - `"Hide"`: hides post (`Hidden`) or comment (`Hidden`, syncs `commentCount`), marks all pending reports `Resolved`.
  - `"Delete"`: removes post (`Removed`) or comment (`Deleted`, syncs `commentCount`), marks all pending reports `Resolved`.
- `note`: **required** (1–500 chars) when `decision` is `"Hide"` or `"Delete"` (`400`, `MSG22`).
- Response `200 OK`: `{ "message": "...", "decision": "Hide", "note": "...", "resolvedCount": 2, "target": { ... }, "report": { ... } }`
