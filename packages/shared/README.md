# @canary/shared

Cross-app contracts (Zod schemas) shared between `apps/web` and `apps/api`, imported by both via
npm workspaces (`@canary/shared`).

**Contracts:**

- `HealthResponseSchema` (`contracts/health.js`) — the shape of `GET /api/health`. Seeded as the
  first real contract to prove the pattern before any feature endpoint exists. See
  `apps/api/src/health.js` and `apps/web/src/lib/health.js` for both sides consuming it.

New contracts land here one per API endpoint, as those endpoints are built.
