# Profile Completion and Freelancer Discovery Endpoints

Status: connected and contract-tested on 2026-08-06.

Canonical schemas live in `packages/shared/contracts/profile.js` and are exported from
`@canary/shared`. Responses are explicit projections; raw Mongoose documents are never returned.

## PATCH `/api/profiles/:id`

Updates the authenticated Identity's active Profile. The path ID must equal the active Profile ID.

### Security

- Authenticated session required.
- `x-csrf-token` required.
- Only the active Profile owned by the Identity can be updated.
- `identityId`, `origin`, `paymentVerified`, `verificationStatus`,
  `onboardingCompletedAt`, and derived counts are system-managed.

### Freelancer request

```json
{
  "displayName": "Asha Mehta",
  "headline": "Product designer",
  "bio": "Designs evidence-led onboarding flows.",
  "country": "IN",
  "skills": ["Figma", "User research"],
  "hourlyRate": 55,
  "languages": ["English — professional"],
  "portfolio": ["Onboarding redesign — https://example.invalid/work"],
  "workHistory": ["Product Designer · 2024–2026"],
  "certifications": ["Accessibility Foundations"],
  "discoverable": true,
  "availableForWork": true
}
```

### Client request

```json
{
  "displayName": "Acme Studio",
  "businessName": "Acme Studio Pvt Ltd",
  "headline": "Early-stage product studio",
  "bio": "Builds focused B2B products.",
  "country": "IN",
  "industry": "Software",
  "typicalBudget": 5000,
  "paymentTermsNorm": "50% start, 50% acceptance",
  "discoverable": true
}
```

An empty patch is invalid. Freelancer and Client fields cannot be mixed.

### Response

```json
{
  "profile": {
    "id": "507f1f77bcf86cd799439011",
    "role": "freelancer",
    "displayName": "Asha Mehta",
    "headline": "Product designer",
    "bio": "Designs evidence-led onboarding flows.",
    "paymentVerified": false,
    "verificationStatus": "none",
    "skills": ["Figma", "User research"],
    "hourlyRate": 55,
    "portfolio": [],
    "workHistory": [],
    "certifications": [],
    "languages": ["English — professional"],
    "availableForWork": true,
    "country": "IN",
    "discoverable": true,
    "onboardingCompletedAt": "2026-08-06T12:00:00.000Z",
    "createdAt": "2026-08-06T11:55:00.000Z"
  },
  "onboarding": {
    "complete": true,
    "missingFields": []
  }
}
```

Freelancer completion requires `displayName`, `headline`, `bio`, `country`, at least one skill,
numeric `hourlyRate`, at least one language, and an explicit `availableForWork` boolean. Client
completion requires `displayName`, `businessName`, `headline`, `bio`, `country`, `industry`, numeric
`typicalBudget`, and `paymentTermsNorm`.

### Errors

| Status | Meaning                                                                                   |
| -----: | ----------------------------------------------------------------------------------------- |
|    400 | Invalid ObjectId, empty patch, wrong-role/system field, or field bounds failure           |
|    401 | No authenticated session                                                                  |
|    403 | Missing/invalid CSRF token, no active Profile, or Profile is not the active owned Profile |

## GET `/api/profiles`

Returns the Client Freelancer Gallery. The server always enforces:

- `role=freelancer`;
- `discoverable=true`;
- `availableForWork=true`.

The requester cannot weaken these filters.

### Security

- Authenticated session required.
- Active Client Profile required.
- CSRF is not required for this read.

### Query

| Field       | Type/default                        | Behavior                                                                  |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `q`         | string, optional                    | Case-insensitive literal match over display name, headline, or skill      |
| `skills`    | comma-separated strings             | All selected skills must be present                                       |
| `country`   | string, optional                    | Case-insensitive exact match                                              |
| `minRate`   | number, optional                    | Inclusive numeric USD hourly-rate lower bound                             |
| `maxRate`   | number, optional                    | Inclusive numeric USD hourly-rate upper bound                             |
| `trustBand` | `BAND_LOW`, `BAND_MED`, `BAND_HIGH` | Filters the latest persisted scored snapshot using `<25`, `25–<75`, `≥75` |
| `sort`      | `relevance`                         | `relevance`, `trust-desc`, `rate-asc`, `rate-desc`, or `name-asc`         |
| `page`      | integer, `1`                        | One-based page                                                            |
| `pageSize`  | integer, `24`                       | Maximum 50                                                                |

`minRate` cannot exceed `maxRate`. “Relevance” is deterministic name ordering for the demo; Canary
does not claim semantic search. Grouping is a frontend presentation over the current page and is not
a database query parameter.

Example:

```text
GET /api/profiles?q=designer&skills=Figma,User%20research&country=IN&minRate=25&maxRate=100&trustBand=BAND_HIGH&sort=trust-desc&page=1&pageSize=24
```

### Response

```json
{
  "data": [
    {
      "id": "507f1f77bcf86cd799439011",
      "role": "freelancer",
      "displayName": "Asha Mehta",
      "headline": "Product designer",
      "paymentVerified": false,
      "verificationStatus": "none",
      "skills": ["Figma", "User research"],
      "hourlyRate": 55,
      "portfolio": [],
      "workHistory": [],
      "certifications": [],
      "languages": ["English — professional"],
      "availableForWork": true,
      "country": "IN",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "activeEngagementCount": 1,
      "trust": {
        "status": "scored",
        "profileId": "507f1f77bcf86cd799439011",
        "band": "BAND_HIGH",
        "score": 82,
        "generatedAt": "2026-08-01T00:00:00.000Z",
        "signals": []
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 24,
    "total": 1
  }
}
```

`trust` uses the existing TrustScore state machine and may instead be `stale`, `pending-score`, or
`insufficient-history`; the Gallery never manufactures a numeric zero. `activeEngagementCount` is
derived from active Engagements and is not stored on Profile.

### Errors

| Status | Meaning                                                         |
| -----: | --------------------------------------------------------------- |
|    400 | Unknown query field, invalid enum/number, or invalid rate range |
|    401 | No authenticated session                                        |
|    403 | No active Client Profile                                        |

## Public Profile privacy

`GET /api/profiles/:id` returns `404 NotFoundError` for a non-discoverable Profile unless the
authenticated requester owns it. This prevents enumeration while allowing the owner to preview
their own hidden Profile.
