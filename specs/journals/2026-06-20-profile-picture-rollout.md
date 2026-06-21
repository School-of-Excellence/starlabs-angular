# 2026-06-20 — Profile-picture rollout to participant-name sites

---

## 🔄 CHANGE LOG & REVERT GUIDE  (update on EVERY screen change — operator directive 2026-06-20)
> Append a row here whenever a screen is touched, so any change can be reverted in isolation.
> Keep newest at the bottom of each section.

### A. COMMITTED (revert with `git revert <hash>`, or `git checkout <hash>^ -- <path>` for one file)
| Commit | Scope | Files |
|---|---|---|
| `3a40282` | (prior, not this session) avatar integrated in 11 screens incl. profilelist | ProfilePicture/* + 9 callers |
| `c33ff4d` | avatar on **7** live screens | delivery-dashboard-clone, sales-dashboard-clone, event-attendance-log, event-participation-approve, resolve-participant-zone, live-event-health, big-dashboard (.html+.ts each) |
| `ba69f7e` | avatar on **23** more live screens | live-event-dashboard, journeycoach-opportunities, journey-coach-health-dashboard, eco-system-new, onboarding-pipeline, product-initiation-dashboard, approve-offtime, arena-design-insights, big-planner, view-notification-participants, arenastudioactivity, queue-planning-review, event-zone-management, participant-form-tracker, view-participants-form, participant-touchpoint, participant-product, profile-summary, participant-ael, monitor-activity-log, questionandanswer, mode-dashboard, participant-reports |
| `101d776` | evidence harness + journal (no screen code) | specs/journals/2026-06-20-…-artifacts/index.html, launch.json, journal |

### B. UNCOMMITTED — working tree (discard a file with `git checkout -- "<path>"`; discard all with `git stash`)
1. **COEP/crossorigin image fix (load-bearing, shared)** — `ProfilePicture/profile-picture/profile-picture.component.html`: added `crossorigin="anonymous"` to BOTH `<img>` tags. *Without this every avatar is a broken image under the coi-serviceworker's COEP. Do NOT revert in isolation unless reverting the whole rollout.*
2. **Dropdown avatars (`<mat-option>` person pickers, size 24)** — hpc, big-aggregate, big-aggregate-event-level, big-activity-log, monitor-activity-log, view-arena-space, participant-ael, update-adjustment-taxonomy, videoasktranscribe, capacity-dashboard, workshop-configuration, participant-delivery-sequence, evolution-mapping, map-client-eis-dialog, team-delivery-hours-update, arena-e-ticket-approve, event-attendance-log, live-event-dashboard, assign-queue-studio, big-planner, queue-creation-v3, big-event-invitation, add-issue (.html ± .ts each).
3. **Customer Support avatars** — customer-support-dashboard, customer-ticket-new, customer-chat-screen (+ **import-array fix**: `ProfilePictureComponent` was missing from `imports[]` — required, else the dashboard crashes), chat-config, flag-review-screen, insert-message-dialog, releaselogdialog (.html ± .ts).
4. **Route Configuration avatars** — route-configuration-duplicate/createroutedialog (.html+.ts) — replaced initials placeholder in Profiles + Child-Profiles dropdowns. (Parent route-configuration table untouched = route labels, no people.)

### C. OPERATIONAL (not code; no revert needed)
- Cleared `.angular/cache` + restarted the operator's `ng serve` on **:4200** to fix a stale Vite dep cache that caused `NullInjectorError: No provider for _MatSelect` (dashboard rendered blank). Source was always correct.

### D. KNOWN DATA ISSUE (not a code change)
- Profile **Vignesh S** has a blank/near-black stored image (`profile_data` `Vignesh S/profile/image_cropper_17…`, brightness 24, sd 4) → shows a dark avatar everywhere. Pixel-scan of 5 screens (dashboard, profilelist, view-participants-form, evolution-mapping, participant-product) found this is the ONLY bad image; 0 broken. Fix = re-upload his photo (production data, not touched).

---

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
- Re-open `…-artifacts/index.html` (all 30 screens) via the `pp-evidence` launch config (port 4320) or
  `cd specs/journals/2026-06-20-profile-picture-rollout-artifacts && python3 -m http.server 4320`.

---

## Session 2 (same day) — operator pushed: "what about other screens?"

The first pass (7 screens) was **not comprehensive**. Re-ran an exhaustive 4-way parallel Explore sweep
over every feature folder, cross-checking each candidate against `app.routes.ts` for LIVE routing and
excluding ATC + dead clones. Found **23 more LIVE name-display sites** and integrated the avatar in each
(same pattern: add `ProfilePictureComponent` to the standalone `imports:` array + inline-flex wrapper with
the in-scope profileid). Committed as `ba69f7e`.

### The 23 added this session
live-event-dashboard, journeycoach-opportunities, journey-coach-health-dashboard (replaced its placeholder
initials avatar), eco-system-new, onboarding-pipeline (replaced placeholder avatar button),
product-initiation-dashboard (dynamic-column table — gated avatar to the Name column only via
`column.key==='profileid' && column.mapValue==='name'` so Mobile/Email/Finance columns that reuse the
`profileid` key don't get stamped), approve-offtime, arena-design-insights, big-planner,
view-notification-participants (removed its old initials circle so there's one avatar, not two),
arenastudioactivity, queue-planning-review, event-zone-management (comma lists), participant-form-tracker,
view-participants-form, participant-touchpoint, participant-product, profile-summary (first table's client +
reportedBy cells), participant-ael, monitor-activity-log, questionandanswer (6 live question/reply spans;
left the large commented-out block untouched), mode-dashboard, participant-reports.

### Verification
- `ng build --configuration production` → **green** (no errors; `app-profile-picture` resolves in all 23
  new components; only pre-existing canvg/CommonJS warnings).
- Evidence: extended the harness to **all 30 screens** (7 done + 23 new) at `…-artifacts/index.html`,
  served on :4320 and screenshotted in the browser. **30/30 panels, 92/92 portraits loaded, 0 failed**;
  click-to-enlarge preview confirmed (full-size image + name caption). Real `i.pravatar.cc` portraits stand
  in for the auth-gated production `profile_data` images.

### Still pending
- Real authenticated live-screen captures need operator `starlabs-test` creds.
- Two cosmetic follow-ups a designer may want: (a) journey-coach-health-dashboard's 5 summary-card preview
  rows still use the old initials badge (only the main table got the real avatar); (b) decide a consistent
  avatar size for the comma-list screens (currently 22px).

## Session 3 (same day) — live Chrome verification, the COEP fix, dropdowns, Customer Support + Route Config

Drove the REAL auth-gated app in the operator's connected Chrome (app already logged in; `ng serve` :4310,
which uses `environment.ts` → prod `fir-sample-aae4a` for reads).

- **CRITICAL BUG FOUND + FIXED — broken avatars everywhere.** The app ships `coi-serviceworker.js` which
  forces `COEP: require-corp`; that blocks cross-origin `<img>` (Firebase Storage photos) unless loaded in
  CORS mode → every avatar rendered as a broken-image icon. Fix = `crossorigin="anonymous"` on the shared
  component's two `<img>` tags (Storage returns CORS headers, so the CORS load satisfies COEP). One line in
  `profile-picture.component.html` repairs ALL screens. Tell-tale: `fetch(url)` 200 but `<img>` `onerror`.
  Verified live: profilelist 25/25 photos load, 0 broken.
- **profilelist "roles expanded by default"** — NOT a bug: detail rows are collapsed (`display:none,h:0`);
  the tall 126px rows are pre-existing CSS + stacked action buttons. profilelist was NOT changed this session.
- **Dropdowns** — added the avatar inside ~30 `<mat-option>` person-pickers across ~20 live components
  (full list in [[project_profile-picture-rollout]] memory). Verified live on `hpc`.
- **Customer Support** (operator ask) — added avatars to customer-support-dashboard (Reported By + Client
  Name table cells, Assigned/Reviewed-By filters, notes-author + category popups), customer-ticket-new
  (review/notes/assigned-to/calendar-participant), customer-chat-screen (Assigned To / Issue Reported By /
  Reported By / chat sender / notes / log user — 6 sites), insert-message-dialog + releaselogdialog dropdowns.
  SKIPPED (no person-name-with-id): customertickets (analytics), add-notes, customer-ticket-review.
  customer-chat-screen had a HALF-APPLIED import from a 529-crashed agent (import line present, not in
  imports array) → fixed manually. Verified live: dashboard 20/20 loaded, chat screen 6/6 loaded.
- **Route Configuration** (operator ask) — LIVE route `/routeconfiguration` loads the `-duplicate` clone
  (the plain `route-configuration/` is dead). Parent table = route/screen labels (no people → no avatars).
  Added avatars to the `createroutedialog` Profiles + Child-Profiles dropdowns (replaced the initials
  placeholder). Verified live: Profiles dropdown shows photo+name+email per option.
- All audited clean by 5 parallel agents; **production build green**. **NOT committed** (operator gate):
  the `crossorigin` fix + all dropdown + Customer Support + route-config edits are uncommitted.

## Pending / next (session 1, superseded above)
- **Live-screen screenshots** still need `starlabs-test` login creds (or a seeded profile_data with images)
  to capture the real auth-gated pages — operator to provide if they want those in addition to the harness.
- Re-open `…-artifacts/pp-evidence.html` any time via
  `cd specs/journals/2026-06-20-profile-picture-rollout-artifacts && python3 -m http.server 4320`.
