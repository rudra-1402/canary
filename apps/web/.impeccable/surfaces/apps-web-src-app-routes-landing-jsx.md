---
version: 1
slug: 'apps-web-src-app-routes-landing-jsx'
primary_target: 'apps/web/src/app/routes/Landing.jsx'
related_targets: []
---

## Scope and visitor mode

Persuade. Public, unauthenticated marketing surface at `/` (branches by session status in
`RootRoute.jsx`; authenticated visitors still see `FindWork`, unchanged).

## Audience, job, action, proof, constraints

- **Audience:** a prospective Freelancer or Client deciding whether to trust this
  marketplace's scoring over an incumbent's one-directional star system.
- **Job:** understand that both sides get scored symmetrically from real Engagement outcomes,
  with the evidence behind every score inspectable, not asserted.
- **Action:** create an account (Sign up), or sign in if returning.
- **Proof:** the registration mechanism itself (live, cursor-reactive), the two-ledger
  specimen sheets (labeled illustrative/synthetic), the five-step pipeline
  (JobPost→Proposal→Engagement→Outcome→TrustScore), and a sample RiskSignal list. No
  fabricated customer testimonials, logos, or stats — PRODUCT.md forbids presenting synthetic
  data as real.
- **Constraints:** must not imply real customers/scraped data; must keep the authenticated
  product's neutral palette untouched (public-only branding pass); Martian Grotesk/Mono are
  static Regular/Bold only, no variable width axis available.

## Chosen direction and memorable moment

Candidate 5 of a 7-item grounded structural list (seed key `98899076`, surface scope): the
page as two interleaved registration/proof sheets extending the brand contract's own
"registration" mechanism into full-page structure, not just a button detail. Memorable
moment: the hero's three chromatic plates (Cobalt rect / Vermilion rect / Canary-yellow
circle) drifting apart at rest and snapping into exact alignment, crosshair included, as the
visitor's cursor approaches center — a live, literal dramatization of "two independent
records converging on one TrustScore."

## Unresolved decisions

- Martian Grotesk's true variable width axis (SemiExpanded/Expanded per the brand contract)
  is not on hand — only static Regular/Bold. If a variable instance becomes available, revisit
  the letter-spacing approximation on display type.
- The Chromatic Registration Press CTA press-state and the nav's scroll-detach frost are built
  to the contract's spec at reduced fidelity (no motion-blur peripheral-plate detail, no
  arrow-to-disc loader); full signature-interaction fidelity was explicitly deferred at Gate
  BRAND's original scoping and remains deferred here.
- No `.impeccable/design.json` sidecar was generated alongside `DESIGN.md` in this pass —
  flagged as a known gap, not silently skipped.
