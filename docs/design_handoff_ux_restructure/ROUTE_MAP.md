# Admira UX Restructure — Route Map & Handoff

This prototype (`Admira.dc.html`) is the **design** for the IA restructure described in
`UX_RESTRUCTURE_PROMPT.md`: one mega-page → a multi-route product. It is a presentation/routing
reference for developers to build against in the Next.js App Router. **No scoring/list/cohort/report
logic is expressed here** — every figure shown is an explicitly-labeled illustrative sample.

## Route map (page → module/lib it renders → flag)

| Route | Screen | Renders from (existing module/lib) | Flag |
| --- | --- | --- | --- |
| `/` | Marketing landing / hero | static; sample read labeled "Illustration" | — |
| `/start` | Profile Studio (inputs + 5-axis radar) | `lib/profile`, `lib/fit/fit-score.ts` | — |
| `/dashboard` | Signed-in home (at-a-glance cards) | aggregates the modules below | — |
| `/schools` | School & Program Universe (browse/search) | `lib/school-search`, `lib/universe` | — |
| `/schools/[unitid]` | School detail — tabs: Overview · Requirements · Outcomes · Similar | `/api/admit-intelligence`, `lib/score`, `lib/similarity` | — |
| `/list` | Smart List Builder + balanced list | `lib/list-builder` | `ADMIRA_LIST_BUILDER_ENABLED` |
| `/students-like-you` | Cohorts (k-gated) | `/api/students-like-you`, `lib/outcomes` | `ADMIRA_STUDENTS_LIKE_YOU_ENABLED` |
| `/climb` | Climb Roadmap (ranked moves) | `/api/climb`, `lib/climb`, `lib/levers.ts` | `ADMIRA_CLIMB_ENABLED` |
| `/command-center` | Tasks · Deadlines · Documents | `/api/command-center`, `lib/command-center` | `ADMIRA_COMMAND_CENTER_ENABLED` |
| `/studio` | Narrative & Essay Studio (existing route, folded in) | `/api/narrative`, `lib/narrative` | `ADMIRA_NARRATIVE_ENABLED` |
| `/compass` | Major & Career Compass (existing route, folded in) | `/api/compass`, `lib/compass` — ROI stub | `ADMIRA_COMPASS_ENABLED` |
| `/reports` | Stunning Reports (generate/export/share) | `/api/reports/*`, `lib/report` | `ADMIRA_REPORTS_ENABLED` |
| `/money` | Coming-soon stub, no cost numbers | — (deferred) | static stub; no money flag exists yet |
| Copilot | Persistent drawer across the app | `/api/copilot`, `lib/copilot` (tool-grounded) | `ADMIRA_COPILOT_ENABLED` |
| `/methodology`, `/privacy`, `/privacy#terms` | kept | static | — |

Flag-gated surfaces hide their nav entry or show "coming soon" — never an error. Money's nav entry
keeps a visible **Soon** badge as the modeled example of a flagged-off route.

## Shared profile state (the thing that makes it one product)

The profile must persist across routes. In the prototype it lives in the root component's state
(`profile = { gpa, sat, act, major, round, state }`) and is read by Dashboard, school detail, List,
Climb and Copilot without re-entry — edited only on `/start`. In production:

- **Client:** a `ProfileProvider` React context wrapping the app shell; module pages call
  `useProfile()` instead of holding their own inputs.
- **Signed-in:** hydrate the context from the Supabase saved profile (owner-RLS); writes on `/start`
  persist back. The context is the single source of truth so a read on `/schools/[unitid]`, `/list`
  and `/climb` all use the same inputs.

## Layout & navigation

- Clear split between the **marketing surface** (`/`, its own chrome) and the **app shell**
  (sidebar + topbar) for everything profile-driven.
- Persistent left sidebar grouped: Overview · Build · Decide · Tell the story, plus the profile chip.
- Topbar: breadcrumb, **voice toggle**, theme toggle, Copilot launcher.
- Mobile (≤1080px): sidebar collapses; nothing overflows (single-column reflow).
- Detail subpages have a back affordance + breadcrumb; heavy pages use tabs/sub-sections.

## Messaging voice — shipped as a live comparison

The MD flags the mixed "11/100 headline vs. range-first copy" voice and asks to pick ONE. The
prototype exposes **both** behind a topbar toggle so the product owner can decide on real screens:

- **Confident** (build-plan default): leads with the verdict — bold score + tier — rigor kept in
  Requirements/tooltips, not as hedging headlines.
- **Range-first:** leads with the honest interval (`24–38%`, most-likely tick), tier as a chip.

Both apply consistently across Dashboard + school detail. **Recommendation: ship Confident** per the
build-plan default; flag to Athena if the owner prefers range-first.

## Honesty / safety behaviors preserved

- **No hardcoded/decorative numbers as real reads.** A global ribbon + per-section "Sample/Illustration"
  tags label every figure; the landing's example score is marked an illustration.
- **k-anonymity:** Students-Like-You shows the suppressed state (min cohort 5) and a k-safe cohort with
  provenance — toggle included to demo both honest states.
- **Money deferred / ROI stub:** `/money` and Compass earnings show labeled stubs, no dollar figures —
  "merit, not predicted."
- **Owner-RLS + consent:** profile/documents marked owner-only; cohort contribution is opt-in.
- **No ghostwriting:** Narrative Studio surfaces/outlines themes; "the words stay yours."
- **Copilot grounded:** answers cite tool receipts; refuses to invent numbers for unseen levers.

## Scope confirmation

Presentation + routing only. No `lib/*` or `/api/*` logic is reproduced or re-derived here — the
prototype is a static design reference. When implemented, pages must keep calling the same modules so
numbers on screen continue to come from the data layer.
