# Cowork Design Review — UX/IA Restructure handoff

*Reviewer: Cowork (auditor). Input: `design_handoff_ux_restructure/` (README + ROUTE_MAP + 2 `.dc.html`
design-component prototypes). This reviews the **design**, not code — the code audit happens when it's built
on `v2/ux-restructure`.*

VERDICT: **Approved to implement — with required naming corrections below.** The IA, shared-profile
architecture, honesty handling, and design system all satisfy the brief. One real issue: several flag/route
names in ROUTE_MAP don't match the actual codebase and will break gating if copied verbatim.

---

## What's good (matches the brief)
- **IA is right:** marketing `/` → `/start` → `/dashboard` → per-module pages → `/schools/[unitid]` detail
  with tabs. Clean split between marketing chrome and the app shell (sidebar + topbar + Copilot drawer).
- **Shared profile state** solved correctly: a `ProfileProvider` context hydrated from the Supabase saved
  profile (owner-RLS), set once on `/start`, read everywhere — exactly the spine I flagged as the make-or-break.
- **Mixed-voice issue resolved:** they prototyped both voices behind a toggle so the owner could decide, and
  recommend shipping **Confident** per the build plan (rigor kept in Requirements/methodology, not as hedging
  headlines). Good — just confirm the call and ship one voice.
- **Honesty preserved in the design:** illustrative-sample labels on every figure, k-anon suppressed state
  (min 5) shown, Money/Compass ROI as labeled stubs (no dollar figures), owner-RLS for profile/documents,
  no-ghostwriting framing, Copilot answers "cite tool receipts, refuse to invent numbers."
- **No new styling stack:** reuses the existing `app/globals.css` tokens + Recharts + lucide. Correct.
- Hard rules (presentation/routing only, numbers from `lib/*`/`api/*`) are restated and bind the implementer.

## REQUIRED corrections before/while implementing (Blocker if shipped wrong)

ROUTE_MAP invented flag and route names that don't exist in the codebase. Use the **actual** names (verified
in the committed `.env.example` and the route tree). If the implementer wires the ROUTE_MAP names, gating
silently breaks (features stuck off, or rendered ungated).

| ROUTE_MAP says | Actual name in code | Fix |
| --- | --- | --- |
| `ADMIRA_LIST_ENABLED` | **`ADMIRA_LIST_BUILDER_ENABLED`** | rename |
| `ADMIRA_SLY_ENABLED` | **`ADMIRA_STUDENTS_LIKE_YOU_ENABLED`** | rename |
| `ADMIRA_COMMAND_ENABLED` | **`ADMIRA_COMMAND_CENTER_ENABLED`** | rename |
| `/api/similar` | **`/api/students-like-you`** | rename |
| `ADMIRA_MONEY_ENABLED` | *(does not exist — Money isn't built)* | `/money` is a static "coming soon"; don't gate on a non-existent flag (or add the flag, default off) |

Also: routes marked "— (no flag)" that **are** actually flag-gated — wire their real flags:
- `/schools/[unitid]` admit read → **`ADMIRA_ADMIT_INTELLIGENCE_ENABLED`** (and CA reads also respect
  **`ADMIRA_CANADA_ENABLED`**).
- `/schools` Universe → **`ADMIRA_UNIVERSE_ENABLED`**; Fit Finder surface → **`ADMIRA_FIT_FINDER_ENABLED`**;
  outcome capture/sign-in → **`ADMIRA_OUTCOME_CAPTURE_ENABLED`**.

Correct flags already right in ROUTE_MAP: `ADMIRA_CLIMB_ENABLED`, `ADMIRA_NARRATIVE_ENABLED`,
`ADMIRA_COMPASS_ENABLED`, `ADMIRA_COPILOT_ENABLED`, `ADMIRA_REPORTS_ENABLED`.

(Source of truth for flag names: `.env.example` / `lib/*/server.ts`. Don't invent new ones.)

## Minor notes
- README addresses the implementer as "Claude Cowork" — that's me, the **auditor**, not the implementer. Keep
  roles straight: Cowork audits; an executor (Codex/Claude Code) builds. Cosmetic.
- The prototype's old "command-rail card grid" dashboard is explicitly superseded by the split-verdict
  dashboard template — make sure the implementer builds the latter (README already says so).
- The `range-first` voice toggle is a decision aid; per the recommendation it need not ship — confirm with
  Athena, then remove the dead toggle rather than leaving it half-wired.

## When implemented, I will audit
Diff is presentation/routing only (no `lib/*` or `app/api/*` logic touched); every number traces to the
module/data layer (no hardcoded figures, marketing samples labeled); **correct** flags gate every surface;
profile persists across routes; k-anon/consent/RLS/ROI-stub/no-ghostwriting/no-hallucinated-numbers intact;
full suite green + new-route e2e. I'll also re-run the live smoke test on the multi-page flow.
