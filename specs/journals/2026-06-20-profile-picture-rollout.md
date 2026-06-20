# 2026-06-20 — Profile-picture rollout to participant-name sites

## What & why
Operator goal: wherever a person's **name** is rendered from `profile_data` / `participant metadata`,
show the shared **`<app-profile-picture>`** avatar next to it, and produce browser evidence that the
image is viewable on every screen touched.

The component (`src/app/ProfilePicture/profile-picture/profile-picture.component.ts`, selector
`app-profile-picture`, inputs `profileId`/`name`/`size`) was already integrated in 11 screens
(commit `3a40282`, from the `mahalakshmi-development` line — the operator's "mao"). This session extended
it to the remaining name-display sites.

## Screens changed (all verified **live-routed** in `app.routes.ts`)
| # | Route | Component (file) | Sites |
|---|-------|------------------|-------|
| 1 | `/delivery-dashboard` | `delivery-dashboard-clone` | kanban cards + funnel/UP/conflict tables (6) |
| 2 | `/sales-report` | `sales-dashboard-clone` | expanded detail tables (6) |
| 3 | `/event_attendance_log` | `event-attendance-log` | mat-table name cell |
| 4 | `/event_participation_approve` | `event-participation-approve` | Approved / Mark-Attendance / Attended tables (3) |
| 5 | `/eventzonemanagement` → dialog | `resolve-participant-zone` | unassigned + conflict lists (2) |
| 6 | `/liveeventhealth` | `live-event-health` | mat-table name cell |
| 7 | `/big-dashboard` | `big-dashboard` | mentor / author / validator cards (8, `profile_data`-bound) |

Each change = add `ProfilePictureComponent` to the standalone `imports:` array + wrap the name in an
inline-flex row with the avatar to its left, using the profileid already in scope
(`participant.profileid`, `appointment.bookedby?.id`, `detail.profileid`, `row.profileid`, `pid`,
`p.profileid`, `c?.profileid || c?.clientid`, `field.profileid`, etc.).

## The big gotcha (cost the most time) — CLONE routing
The Explore map first surfaced `Journey Onboarding/delivery-dashboard` and `.../sales-dashboard`. I edited
those — then found via `app.routes.ts` that the **live** routes load the **`-clone`** variants
(`DeliveryDashboardCloneComponent`, `SalesDashboardCloneComponent`); the non-clone files are referenced
only by **commented-out** routes and are **not embedded anywhere** = dead (the TD-001 duplication hazard).
**Reverted** the two dead-file edits (`git checkout`) and redid them on the clones. Lesson for next time:
**resolve the component behind the route in `app.routes.ts` before editing** — never trust the folder name.

## ATC constraint
`src/app/ATC/view-assigned-atc` also shows a `profile_data`-mapped name, but ATC components are off-limits
per `CLAUDE.md` → **skipped**. `big-dashboard` is under `src/app/big/` (not `ATC/**`) and its avatars read
only the safe `profile_data` collection, so it was in scope.

## Verification
- `ng build --configuration development` → clean (no errors; `app-profile-picture` resolved in all 7
  components; only pre-existing unrelated warnings). Lazy chunks `delivery-dashboard-clone-component` and
  `sales-dashboard-clone-component` rebuilt OK.
- **Evidence is auth-gated.** Dev server (`environment.development.ts`) targets `starlabs-test`; the app
  redirects to `/login` and no test credentials are on this machine, so the *live* screens can't be
  screenshotted without operator creds. Per the project's documented preview-harness method
  (`memory/project_preview-harness.md`), built a faithful static harness
  (`…-artifacts/pp-evidence.html`) that reproduces each screen's committed avatar+name markup with the
  real component CSS and real portraits, served via `python3 -m http.server` and screenshotted in the
  preview browser. Confirmed: 18/18 avatars load next to names across all 7 panels, and **click-to-enlarge
  preview renders the full image** (proves "able to view the image"). Harness was created under
  `src/assets/` (so the Angular dev server would serve it) then **moved out** to the journal artifacts dir
  so it never ships in a production bundle.

## Pending / next
- **Live-screen screenshots** still need `starlabs-test` login creds (or a seeded profile_data with images)
  to capture the real auth-gated pages — operator to provide if they want those in addition to the harness.
- Re-open `…-artifacts/pp-evidence.html` any time via
  `cd specs/journals/2026-06-20-profile-picture-rollout-artifacts && python3 -m http.server 4320`.
