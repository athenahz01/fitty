# Handoff: Admira UX/IA Restructure (Split-verdict system)

> For the executor (Claude Cowork) implementing on branch `v2/ux-restructure`.
> Pairs with the original task brief `UX_RESTRUCTURE_PROMPT.md` — **its hard rules still bind.**

## Overview
This is the **design** for the IA restructure: turn the single mega-page Admira app into a real
multi-route product (marketing landing → app shell → per-module pages → school detail subpages),
with one cohesive visual system. The product owner has chosen the **Split-verdict (Style B)**
direction and the **confident voice**.

## About the design files
The files in this bundle are **design references authored in HTML** (Design-Component prototypes) —
they show the intended look, layout, components, states and flow. They are **not production code to
copy**. Your job is to **recreate these designs in the existing Next.js App Router codebase**, using
its established patterns (React Server/Client components, Recharts for the radar/score, the existing
`globals.css` token layer, lucide icons). Do **not** introduce a new styling stack — the tokens
already exist (see Design Tokens below).

Bundled files:
- **`Admira Design System.dc.html`** — the canonical system. Open it in a browser; it has a live
  light/dark toggle and a table of contents. **This is the source of truth** for color, type,
  spacing, motion, every component, the signature data viz, states, the honesty system, the voice,
  and the split-verdict page template. When in doubt, match this file.
- **`Admira App Prototype.dc.html`** — the navigable IA: landing, app shell (sidebar + topbar +
  Copilot drawer), and every module screen wired together. Shows routing, shared-profile behavior,
  theme + voice toggles, k-anon states, and the flag-gated Money stub. (Note: this prototype's
  dashboard predates the final pick; build the dashboard per the **split-verdict template**, not the
  prototype's command-rail card grid.)
- **`ROUTE_MAP.md`** — route → module/lib → feature flag, plus the shared-profile-state plan.

> These are `.dc.html` prototypes that render via a small runtime; treat them as visual references.
> If you want them to open standalone/offline for review, ask and we can export self-contained HTML.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii and interactions are decided. Recreate
the UI faithfully using the codebase's libraries. The numbers shown are **illustrative samples** —
in production every figure must come from the existing `lib/*` / `/api/*` layer (see Hard rules).

## The hard rules (carried from the brief — any violation = Blocker)
This is **presentation + routing only. Do not change what anything computes.**
- Pages keep calling the **same** `lib/*` modules and `/api/*` routes. No scoring/list/cohort/report
  logic moves or gets re-derived in the UI.
- **No hardcoded/decorative numbers.** The prototypes' figures are samples; replace with real
  module/data output. Any illustrative figure on marketing must stay explicitly labeled.
- **Every feature flag still gates its surface** (`ADMIRA_*_ENABLED`). A flagged-off module's
  route/nav entry hides or shows "coming soon" — never errors. Don't change flag defaults.
- **Preserve every honesty/safety behavior:** k-anonymity suppression + messaging, consent/sign-in
  gating, owner-RLS, ROI/Money deferral, no ghostwriting, no hallucinated numbers in Copilot/Reports.
- Keep responsive, `prefers-reduced-motion`, a11y, no secrets/PII in bundle/logs. Full test suite green.

## Design tokens (already in the repo)
All tokens exist in `app/globals.css` (`:root` and `:root[data-theme="dark"]`) and are documented in
`DESIGN_NOTES.md`. Use them by name — do not introduce new hexes. Key roles:
- **Chance (oxide):** `--chance-primary #c2410c`, `--chance-ink #7c2d12`, `--chance-soft #fdba74`,
  `--chance-wash`. Reserved for admissions chance / range.
- **Fit (teal/green):** `--fit-teal #0f766e`, `--fit-green #10b981`, `--fit-wash`. Reserved for FIT.
- **Reference (indigo):** `--school-indigo #6366f1`, `--school-indigo-wash`. Typical-admit reference.
- **Paper:** `--canvas`, `--warm-card`, `--plain-card`, `--surface-soft`, `--control-bg`, `--ink`,
  `--muted`, `--faint`. **`--ink` is the Style B verdict-rail surface.**
- **Tiers:** Reach (oxide), Target (gold `#eab308`), Likely / Safety (teal/green).
- Radii `--r-card 16–20 / --r-panel 12–14 / --r-control 11 / 999px pills`. Motion `--motion-fast 150`,
  `--motion-slow 420`, `--ease-out-quart`. Type: Bricolage Grotesque 800 (display/verdict), Plus
  Jakarta Sans (body/UI), Space Mono (labels/data, tabular nums).

## The system in one paragraph (Style B)
Every **read-bearing** page uses the **split-verdict template**: an **ink verdict rail** stating the
call in plain Bricolage ("A target. Strong academics, fierce field."), paired with a light data
surface holding the honest range bar, fit radar, FIT overlay and drivers. Operational sub-tabs
(Requirements, Outcomes, the kanban) stay on warm paper. Lead with the verdict; keep rigor (the range,
limits, methodology) one tap away — never as a hedging headline. See Design System §16 + §19.

## Screens / Views
Build per `ROUTE_MAP.md`. For each, the Design System file is the visual spec; key notes:

1. **`/` Landing** — split-verdict hero (dark statement rail + live sample read on the right, labeled
   illustration). One primary CTA "Get your read" → `/start`. Marketing has its own chrome.
2. **`/start` Profile Studio** — academic inputs (mono data fields; "Not scored" tags on ignored
   inputs) + the 5-axis Recharts fit radar (green = you, indigo dashed = typical admit) with the
   text axis list for a11y. Saves to the shared profile (owner-RLS). This is the gate.
3. **`/dashboard`** — split-verdict hero read + cards linking into each module (list balance, next
   Climb move, Command progress). **Use the split-verdict template, not a plain card grid.**
4. **`/schools` + `/schools/[unitid]`** — Universe browse/search; detail = split-verdict read +
   tabs Overview (drivers) · Requirements (published bands) · Outcomes (published cost/grad rate) ·
   Similar (embedding-nearest). Back affordance + breadcrumb.
5. **`/list`** — Smart List: balance bar + reach/target/likely, sourced from each school's read.
6. **`/students-like-you`** — k-gated cohorts: outcome distribution, attribute cards, provenance;
   honest suppressed state under k=5.
7. **`/climb`** — ranked moves (modeled delta / published delta / direction-only). No fake numbers.
8. **`/command-center`** — tabs Tasks (kanban) · Deadlines (published cycles) · Documents (vault,
   owner-only) + progress meter.
9. **`/studio`, `/compass`, `/reports`** — fold in existing routes; Compass keeps the ROI stub;
   Reports generate/export/share token-scoped, assembled only from computed numbers.
10. **`/money`** — coming-soon stub, flag off, no cost numbers. Keep nav "Soon" badge.
11. **Copilot** — persistent drawer across the app; tool-grounded answers with visible receipts.
12. Keep **`/methodology`, `/privacy`, `/privacy#terms`.**

## Interactions, state & behavior
- **Shared profile state** is the spine: a `ProfileProvider` context (hydrated from the Supabase
  saved profile for signed-in users) read by Dashboard, school detail, List, Climb and Copilot — set
  once on `/start`, no re-entry. Details in `ROUTE_MAP.md`.
- App shell: sticky sidebar (groups Overview · Build · Decide · Tell the story + profile chip) and a
  topbar (breadcrumb, theme toggle, Copilot launcher). Theme via `data-theme` on the root.
- States: every module ships empty / loading / error. **Skeletons never show a temporary number** —
  band-scan placeholders only (Design System §17). Reduced-motion disables all of it.
- Voice: confident verdict everywhere. (The prototype includes a range-first toggle used only to make
  the decision — ship confident; the toggle need not be built unless the owner asks.)

## Files in the repo to reference / touch
- Source of truth visuals: this bundle's two `.dc.html` files + `DESIGN_NOTES.md`.
- Tokens: `app/globals.css`. Logic (do **not** change): everything under `lib/*` and `app/api/*`.
- Today's mega-page to split: `app/admira-app.tsx` (+ `app/page.tsx`). Existing routes to fold in:
  `app/studio`, `app/compass`, `app/methodology`, `app/privacy`, `app/schools`.

## Deliver back to the auditor (per the brief)
A committed branch/PR + commit range, the route map, a note on shared profile state, the voice
applied (confident), and confirmation the diff is **presentation/routing only** — call out any file
where logic was touched (there should be none).
