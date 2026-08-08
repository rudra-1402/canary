---
name: Canary
description: A symmetric, evidence-backed trust marketplace for Freelancers and Clients.
colors:
  ink: '#0B0F14'
  mineral: '#E9E7E1'
  cobalt: '#1E5BFF'
  vermilion: '#FF4A24'
  canary-yellow: '#FFD100'
  band-high: '#1f6f4a'
  band-high-soft: '#e4f1ea'
  destructive: '#a3352a'
  destructive-soft: '#f6e6e4'
typography:
  display:
    fontFamily: 'Martian Grotesk, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
  mono:
    fontFamily: 'Martian Mono, ui-monospace, SF Mono, monospace'
rounded:
  field: '0.5rem'
  pill: '9999px'
components:
  button-registration-press:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.mineral}'
    rounded: '{rounded.pill}'
    padding: '12px 28px'
---

# Design System: Canary

## Overview

**Creative North Star: "The Registration Press"**

Canary's public identity is built on one mechanism, borrowed from color-plate printing:
independent evidence only ever produces one trusted result once it registers into
alignment. Two parties record two independent accounts of the same Engagement; when they
agree, a TrustScore comes into register the way three offset printing plates snap into one
sharp image. The public surface (Landing, auth) dramatizes this directly — chromatic plates
that drift apart at rest and lock into place as the visitor's cursor approaches — while the
authenticated product keeps the same vocabulary in small, deliberate doses (badges, sheets,
corner registration marks) rather than large chromatic fields.

This is not generic fintech blue-and-white, not a Material clone, not cyberpunk RGB glitch,
and not glassmorphism. The public register is loud and chromatic on an Ink field; the
product register is disciplined and mostly neutral, with registration details as the only
accent.

**Key Characteristics:**

- Full-bleed Ink (`#0B0F14`) fields on public surfaces; Mineral (`#E9E7E1`) paper-toned fields
  on authenticated/product surfaces.
- Three chromatic plates — Cobalt, Vermilion, Canary-yellow — used together as a system,
  never permanently assigned to a party, a status, or a page section.
- Martian Grotesk carries every headline at full weight; Martian Mono carries every number,
  score, and evidence label.
- Corner registration marks (crop-mark furniture) frame full-bleed sections as literal page
  furniture, not decoration.

## Colors

The palette is five fixed anchors plus a small semantic set for status; chromatic color is
never the only carrier of meaning — direction and confidence always also read as words.

### Primary

- **Cobalt** (`#1E5BFF`): one of the three registration plates. Never a fixed "trust" or
  "client" color — also the product's action/link color inside authenticated surfaces
  (`--color-primary`), a separate, narrower role from its public plate use.

### Secondary

- **Vermilion** (`#FF4A24`): the second registration plate. Never a fixed "risk" or "danger"
  color at the system level, even though a single local view (e.g. a two-party Engagement
  graphic) may label one party's plate vermilion for that view only.
- **Canary Yellow** (`#FFD100`): the registration point — the plate that completes alignment.
  Sparse; never carries small body text on a light surface.

### Neutral

- **Ink** (`#0B0F14`): public-register field color; authenticated-surface primary text/control
  color.
- **Mineral** (`#E9E7E1`): authenticated-register field color (proof-paper); public-surface
  primary text/control color on Ink.

### Named Rules

**The Registration Rule.** Cobalt, Vermilion, and Canary-yellow are used together as
"chromatic plates," never split apart to permanently mean a party, a status, or a section.
**The Evidence-Not-Color Rule.** A TrustScore band or RiskAssessment verdict is always a word
and a position, never color alone — `band-high`/`band-high-soft` and `destructive`/
`destructive-soft` exist for status, and they still ship with text.

## Typography

**Display Font:** Martian Grotesk (OFL, self-hosted; static Regular/Bold only — no width axis
on hand, so the contract's "SemiExpanded" display character is approximated with tight
letter-spacing rather than fabricated)
**Body Font:** the existing product system stack (`ui-sans-serif, system-ui...`) — unchanged
on authenticated surfaces
**Label/Mono Font:** Martian Mono (OFL, self-hosted)

**Character:** Grotesk carries weight and confidence in headlines; mono carries every number,
score, and evidence label so data always reads as data, distinct from prose.

### Hierarchy

- **Display** (Martian Grotesk, 700, `clamp(2.25rem, 5vw, 3.75rem)`, 1.05 line-height): hero
  and section headlines only.
- **Body** (system sans, 400, `text-base`/`text-sm`): all reading text.
- **Label** (Martian Mono, 400, 11px, tracked, uppercase): specimen labels, evidence rows,
  scores, band/verdict badges.

### Named Rules

**The Mono-Means-Measured Rule.** Martian Mono is reserved for numbers, IDs, and evidence
labels — never used as a generic "technical" costume on prose.

## Layout

Public surfaces use a 12-column asymmetric grid at the hero (content ~46-54%, expressive
graphic ~46-54%), full-bleed Ink/Mineral section bands, and a `max-w-5xl`/`max-w-6xl`
container elsewhere. The two-ledger section (`TwoLedgers` on Landing) staggers its two cards
vertically at `lg` width (`lg:mt-16` on the second) as a deliberate visual "two independent
sheets" cue, collapsing to a single stacked column below `lg`. Authenticated/product surfaces
stay in the existing single-column `max-w-6xl` shell (`AppShell.jsx`) — unchanged by this pass.

## Elevation & Depth

Flat by default, matching the existing product system's proof-like, opaque surfaces. Cards
use `shadow-sm` and a hairline border, not stacked shadow depth. No blur or glass behind any
consequential content on either register.

### Named Rules

**The Opaque Rule.** No frost/blur/glass behind forms, evidence, or scores on any surface,
public or product.

## Shapes

- **Pill** (`rounded-full`): primary CTAs only (`RegistrationPressButton`).
- **Rounded rectangle** (`rounded-lg`/`rounded-md`, ~`0.5rem`): cards, panels, fields, badges.
- **Circle**: the registration point in the plate graphic, and icon-only controls.
- **Corner registration marks**: four small L-shaped strokes at the corners of a full-bleed
  section (`CornerMarks` in `Landing.jsx`) — literal proof-sheet/crop-mark furniture, used on
  the hero and final-CTA bands.

## Components

### Buttons

- **Shape:** pill (`rounded-full`) for the primary CTA; the existing product `Button.jsx`
  (rounded-md, `primary`/`ghost` variants) is unchanged for authenticated surfaces.
- **Primary (public):** `RegistrationPressButton` — Ink fill / Mineral label at rest. On
  press, fill goes transparent and three plate layers (Cobalt, Vermilion, Canary-yellow)
  briefly offset behind the label before snapping back — printing-plate misregistration, not
  an RGB glitch.
- **Hover / Focus:** standard color-transition on non-press states; focus ring inherited from
  the product's existing `--color-ring`.

### Cards / Containers

- **Corner Style:** `rounded-lg`, ~8px.
- **Background:** `--color-card` (white) on the public Mineral-scoped sections; `--color-card`
  on product surfaces (unchanged).
- **Shadow Strategy:** `shadow-sm` only; see Elevation & Depth.
- **Border:** 1px `--color-border` hairline throughout.

### Navigation

- **Public nav:** full-width, transparent over the hero; past a 48px scroll threshold it
  detaches into a compact `backdrop-blur` Ink island (the one sanctioned frost use — detached
  chrome, never over content) — `PublicNav` in `Landing.jsx`.
- **Product nav:** unchanged horizontal top bar with `Work`/`Hiring` dropdown groups
  (`AppShell.jsx`), not part of this pass.

### Registration Plates (signature component)

A canvas-drawn, cursor-reactive graphic (`RegistrationPlates.jsx`): three plates at rest with
independent offset/rotation, converging toward exact alignment (plus a crosshair) as the
cursor approaches the graphic's center. Collapses to the aligned end-state with no travel
under `prefers-reduced-motion`. This is the literal visualization of "two independent records
converging on one TrustScore" and is the one graphic every future public surface should reuse
or extend, not reinvent.

## Do's and Don'ts

### Do:

- **Do** keep the three chromatic plates together as a system on public surfaces; never
  isolate one as a standalone "brand color."
- **Do** pair every score/band/verdict with a word and a position, never color alone.
- **Do** use the corner registration marks only on full-bleed Ink/Mineral section bands, not
  inside cards or on product surfaces.
- **Do** keep the authenticated product on its existing neutral palette until a dedicated
  product-page branding pass is approved — this pass is public-surface only.

### Don't:

- **Don't** put a label/eyebrow directly above a heading anywhere — delete it and let the
  heading carry its own weight (confirmed violation, fixed during this build: see git history
  on `Landing.jsx`).
- **Don't** fabricate a Martian Grotesk width axis in CSS — only static Regular/700 are
  self-hosted; approximate expansion with letter-spacing, don't claim `font-stretch` values
  the files don't support.
- **Don't** show fabricated stats, customer logos, or testimonials on any public surface —
  illustrative evidence/example content must say "Illustrative example — synthetic data."
- **Don't** use glass/blur behind forms, evidence, or scores; the public nav's scroll-detached
  island is the one sanctioned exception.
