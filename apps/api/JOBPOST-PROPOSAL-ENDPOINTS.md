# JobPost Authoring and Client Proposal Inbox

Frontend handoff for the approved demo flow. All data is persisted and fetched through Mongoose; there is no mock response path.

## Authentication

- Mutations require the session cookie and `x-csrf-token` from `GET /api/auth/csrf-token`.
- All four endpoints require an active Client Profile.
- The server derives `clientProfileId` from the active Profile. Never send it in a request body.

## Create a JobPost

`POST /api/jobposts`

- Use `action: "save_draft"` for the editor's Save Draft action.
- Use `action: "publish"` for the approval screen's Publish action.
- Returns the full JobPost with `status: "draft"` or `"open"`.

Required fields: `title`, `category`, `description`, `skills`, `jobType`, `budgetOrRate`, `experienceLevel`, `projectLength`, and `action`.

Optional fields: `hoursPerWeek`, `screeningQuestions`.

## Edit or close an owned JobPost

`PATCH /api/jobposts/:id`

- Send any non-empty subset of editable fields.
- Draft action: `save_draft` or `publish`.
- Open action: omit `action` to edit, or send `close`.
- Closed JobPosts are immutable and cannot be reopened in this phase.

## Client JobPost dashboard

`GET /api/me/jobposts`

Query: `status?`, `q?`, `page?`, `pageSize?`.

Each row is the JobPost contract plus:

```json
{
  "proposalCounts": {
    "submitted": 0,
    "shortlisted": 0,
    "accepted": 0,
    "declined": 0,
    "withdrawn": 0,
    "total": 0
  }
}
```

`q` is a case-insensitive literal search over title and category. The response includes a standard `{ page, pageSize, total }` pagination object.

## Proposal inbox

`GET /api/jobposts/:id/proposals`

Query:

- `status?`: `submitted | shortlisted | accepted | declined | withdrawn`
- `sort?`: `newest | bid_low | bid_high` (default `newest`)
- `page?`, `pageSize?`

Each row contains the Proposal fields, a safe public `freelancer` Profile, and the existing `trustScore` discriminated state. Render TrustScore by `status`; do not assume a numeric score exists during cold start.

## UI screen mapping

- Client JobPost editor → `POST /api/jobposts`, then `PATCH /api/jobposts/:id`
- JobPost approval/review → `PATCH ... { "action": "publish" }`
- Client dashboard / My JobPosts → `GET /api/me/jobposts`
- Proposal approval screen / applicant list → `GET /api/jobposts/:id/proposals`

## Deliberately excluded from this phase

Shortlist/accept/decline mutations, prospective Engagement creation, and RiskAssessment are the next atomic backend slice. The frontend may render disabled action placeholders, but must not simulate successful hiring or fabricate risk data.
