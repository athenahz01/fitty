# UX Restructure Route Map

This is the implemented route map for `v2/ux-restructure`. The pass is presentation and routing only; module numbers still come from the existing `/api/*` routes and `lib/*` code.

| Route | Surface | Data/module source | Gate |
| --- | --- | --- | --- |
| `/` | Marketing landing with labeled illustrative read | Static sample only | None |
| `/start` | Profile Studio and shared profile context | Existing profile inputs in `app/admira-app.tsx`; context in `app/admira-profile.tsx` | None |
| `/dashboard` | App home with split-verdict summary and module links | Added school reads from existing chance/admit calls | None |
| `/schools` | School search, Fit Finder when enabled, school read list | `/api/chance`, `/api/admit-intelligence`, `/api/fit`, `/api/schools/search` | Fit Finder: `ADMIRA_FIT_FINDER_ENABLED`; Admit Intelligence: `ADMIRA_ADMIT_INTELLIGENCE_ENABLED` |
| `/schools/[unitid]` | School Universe detail | `/api/schools/universe` | `ADMIRA_UNIVERSE_ENABLED` |
| `/list` | Smart List Builder | `/api/list/generate`, `lib/list-builder` | `ADMIRA_LIST_BUILDER_ENABLED` |
| `/students-like-you` | k-safe cohorts | `/api/students-like-you`, `lib/outcomes` | `ADMIRA_STUDENTS_LIKE_YOU_ENABLED` |
| `/climb` | Climb Roadmap | `/api/climb`, `lib/climb` | `ADMIRA_CLIMB_ENABLED` |
| `/command-center` | Tasks, deadlines, documents | `/api/command-center`, `lib/command-center` | `ADMIRA_COMMAND_CENTER_ENABLED` |
| `/studio` | Narrative & Essay Studio | `/api/narrative`, `lib/narrative` | `ADMIRA_NARRATIVE_ENABLED` |
| `/compass` | Major & Career Compass with ROI stub | `/api/compass`, `lib/compass` | `ADMIRA_COMPASS_ENABLED` |
| `/reports` | Reports generate/export | `/api/reports/*`, `lib/report` | `ADMIRA_REPORTS_ENABLED` |
| `/money` | Deferred Money stub | Static, no figures | Static stub; no money flag exists yet |
| Copilot drawer | Persistent app-shell drawer | `/api/copilot`, `lib/copilot` | `ADMIRA_COPILOT_ENABLED` |
| `/methodology`, `/privacy`, `/privacy#terms` | Static policy/methodology | Existing routes | None |

## Shared Profile State

`app/layout.tsx` wraps all routes in `AdmiraProfileProvider`. The provider exposes `profile` and `setProfile` through `useAdmiraProfile()`, hydrates from `localStorage` for reload continuity, and keeps client-side route navigation on one shared profile. Signed-in persistence remains the existing owner-RLS API path; this pass does not change Supabase write behavior.

## Voice

The shipped voice is confident: route headlines lead with the verdict or action, while methodology/range nuance stays in the read details, tooltips, and methodology route.
