# @canary/shared

Cross-app contracts (Zod schemas) shared between `apps/web` and `apps/api`, imported by both via
npm workspaces (`@canary/shared`).

Currently an empty scaffold — this package exists so the workspace wiring is proven end-to-end.
Real Zod schemas are added in a follow-up pass, one per API endpoint, as those endpoints are built.
