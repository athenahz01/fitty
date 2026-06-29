# Executor Handoff — UX/IA Restructure: turn the one-page app into a real multi-page product

> **New here?** Read `docs/cowork/EXECUTOR_CONTEXT.md` first — what Admira is, the loop, repo layout, what's
> built (all features), and how you'll be audited. Use the **interface-design / frontend-design** skills for
> the visual system. Then come back.

*Builds on current `master`/`v2/polish-pass` (commit `83ea6ee`). Branch `v2/ux-restructure`. **Commit your
work.** Money/Phase 4 is still deferred — keep ROI as a labeled stub, no cost numbers.*

---

## Problem

Every module is stacked on one endless page — it's cluttered and confusing. The engine and features are done
and audited; this task is purely **information architecture + visual design**: split the product into a real
multi-route app with navigation, a marketing landing/hero, distinct module pages, detail subpages, dashboards,
and proper empty/loading states — **without changing any scoring, data, or behavior.**

## The hard rule (any violation = Blocker)

**This is presentation + routing only. Do not change what anything computes.**
- Pages/components keep calling the **same** `lib/*` modules and `/api/*` routes. No scoring/list/cohort/
  report logic moves or gets re-derived in the UI. Numbers on screen still come from the module/data layer.
- **No hardcoded/decorative numbers** anywhere — including the new hero/landing/marketing pages. If a landing
  page shows an example score, label it clearly as an *illustration/sample*, never a user's real read.
- **Every feature flag still gates its surface** (`ADMIRA_*_ENABLED`): a flagged-off module's route/nav entry
  is hidden or shows a "coming soon," never errors. Don't change flag defaults; don't flip anything on.
- **Preserve every honesty/safety behavior:** k-anonymity messaging + suppression, consent/sign-in gating,
  owner-RLS for user data, "merit not predicted"/ROI-stub (money deferred), no ghostwriting, no hallucinated
  numbers in Copilot/Reports. No new data path bypasses RLS/consent.
- Keep the polish-pass wins: responsive, `prefers-reduced-motion`, a11y, no secrets/PII in bundle/logs.
- Full existing test suite stays green.

## Proposed information architecture (refine as needed)

Use the Next.js App Router. Suggested routes:

- **`/` — Marketing landing / hero.** Bold value prop ("Honest, confident college chances for the US &
  Canada"), what Admira does, a primary CTA ("Get your read" → onboarding). Sample/illustrative visuals only.
- **`/start` (or `/profile`) — Onboarding & Profile Studio.** The academic profile inputs + the 5-axis radar.
  This is the gate that powers everything else.
- **`/dashboard` — The signed-in/active home.** At-a-glance overview: top school reads, list summary, next
  Climb move, command-center progress, a Copilot entry. Cards link into the full module pages.
- **`/schools` — School & Program Universe.** Browse/search; each school is a detail subpage
  **`/schools/[unitid]`** with the Admit Intelligence read (bold score + tier + drivers + radar), program
  requirements, cost (published only), outcomes, similar programs.
- **`/list` — Smart List Builder** and the resulting balanced list.
- **`/students-like-you` — cohorts** (k-gated; honest empty state).
- **`/climb` — Climb Roadmap.**
- **`/command-center` — tasks, deadlines, document vault, progress.**
- **`/studio` — Narrative & Essay Studio** (already a route; fold in).
- **`/compass` — Major & Career Compass** (already a route; fold in).
- **`/reports` — Stunning Reports** (generate/export/share). Shared view stays its token-scoped page.
- **`/money` — placeholder** "Coming soon" (flagged off) — no fake numbers.
- **Copilot** — a persistent panel/drawer available across the app (or its own `/copilot`), grounded in tools.
- Keep **`/methodology`, `/privacy`, `/privacy#terms`.**

Within heavy pages, use **tabs/sub-sections** (e.g., a school detail page: Overview · Requirements · Outcomes ·
Similar; Command Center: Tasks · Deadlines · Documents).

## Layout & navigation
- A persistent top nav (and/or left sidebar in the app area) with the module groups; a clear split between the
  **marketing surface** (`/`) and the **app shell** (everything profile-driven).
- Mobile: hamburger or bottom tab bar; nothing should overflow.
- Profile-gating: module pages that need a profile prompt the user to complete `/start` first (graceful, not a
  dead end).
- Breadcrumbs / back affordances on detail subpages.

## Critical architecture note — shared profile state
Today the profile lives in one page component. In a multi-route app the profile/inputs **must persist across
routes** — use a React context/provider (and, for signed-in users, the saved profile in Supabase) so a read
on `/schools/[unitid]`, the `/list`, and `/climb` all use the same profile without re-entry. Design this
explicitly; it's the main thing that makes the split feel like one product, not ten pages.

## Design direction
- One cohesive, premium "intelligence dashboard" system: shared tokens (color, type, spacing, motion),
  consistent cards, charts (the existing Recharts radar/score), and reveals. Avoid generic templated AI look —
  use the interface-design/frontend-design skill.
- **Resolve the mixed voice.** Right now the bold "11/100" headline sits inside V1 "read the range first /
  ranges, not points / FIT is not admission chance" copy. Pick ONE consistent voice per the product owner's
  call (default per build plan: lead with the confident verdict, keep rigor in methodology/tooltips, not as
  hedging headlines) and apply it everywhere. Flag to Athena if unsure — don't leave it half-and-half.

## Tests (required for sign-off)
- **No-regression:** lint, unit, e2e, build all green; behavior/numbers unchanged.
- **Routing/e2e:** each route renders; nav works; profile persists across routes (set on `/start`, read on a
  school page and `/list`).
- **Flag-gating per route:** a flagged-off module's route shows coming-soon/hidden, not an error.
- **No-hardcoded-number guard:** presentational/marketing components contain no literal stat figures (sample
  visuals explicitly labeled).
- **Empty/loading/error per page;** mobile nav; reduced-motion.
- **Honesty intact:** k-anon empty state, money/ROI stub, consent gating still present.

## Acceptance criteria (Cowork checks exactly)
- [ ] Multi-route product (landing, onboarding, dashboard, per-module pages, school detail subpages); no more single mega-page.
- [ ] Every number still sourced from `lib/*`/`/api/*`; zero hardcoded/decorative figures (samples labeled).
- [ ] All feature flags still gate their routes/nav; defaults unchanged; nothing flipped on.
- [ ] Profile persists across routes (shared context / saved profile); no re-entry per page.
- [ ] k-anonymity, consent/RLS, money-deferral/ROI-stub, no-ghostwriting, no-hallucinated-numbers all intact.
- [ ] One consistent voice (confident vs range) applied throughout — no mixed messaging.
- [ ] Responsive + reduced-motion + a11y; no secrets/PII in bundle/logs.
- [ ] Full suite green; `MODEL_CARD.md` unchanged in substance; route map documented.

## Out of scope (do NOT do)
- Any change to scoring/list/cohort/report logic or the numbers; any new module; Money numbers.
- New backend behavior, new data paths, flag flips, RLS/consent/k-anon changes.

## Deliver to the auditor
A committed branch/PR + commit range, a short **route map** (page → which module/lib it renders → its flag),
a note on how shared profile state works, which messaging voice you applied, and confirmation the diff is
presentation/routing only (call out any file where logic was touched — there should be none).
