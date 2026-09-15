# 2026-08-20 — Campaign Dashboard: New Campaign dialog

## What was done
- Built the `campaigndashboard` component (src/app/New-Workshop/campaigndashboard/) — previously an empty CLI stub the operator generated. It renders a header and a **New Campaign** button that opens a dialog.
- Created `NewCampaignDialogComponent` (new-campaign-dialog/) — standalone Material dialog that saves one document per campaign to the **`eiflixcampaign`** Firestore collection.
- Fixed a route collision in `app.routes.ts`: the operator-added campaigndashboard route reused path `eiflixoperationsdashboard`, making it unreachable (router matches the first entry). Renamed to `campaigndashboard`. Left **unguarded**, consistent with the operator's deliberate choice for the sibling EiFlix ops route (see 2026-08-18 journal / route-guard note: authGuard needs a Firestore `dashboard` route-config entry first, else it locks everyone out).

## Data structure (operator-approved with lowercase rename)
Operator reviewed the proposed structure and directed: **all field names lowercase**, `created`/`updated` instead of `createdAt`/`updatedAt`. Saved shape:

```
eiflixcampaign/{autoId}:
  id            string   (doc id, mirrors assign-tags-dialog convention)
  campaignname  string
  startdate     Timestamp
  enddate       Timestamp
  segment       string   — doc id from `newusertags` (name shown in the select)
  expectedsalevalue   number (₹, plain number; UI shows e.g. 5,00,000 as placeholder)
  achievedsalesvalue  number (default 0)
  numberofsales       number (default 0)
  channels      string[] — subset of Email | WhatsApp | SMS | Ads | Webinar
  manualnotes   string[] — chips with per-item remove
  campaignassets array of { type, name, url } — type from fixed 9-option list, url may be ''
  created, updated    serverTimestamp()
```

## WHY the constraints landed this way
- **Sale values as numbers, not formatted strings** — summable/queryable for future dashboard cards; Indian-format display is a UI concern.
- **`segment` single string, not array** — operator spec; matches the one-tag-per-campaign model for now.
- **Notes/assets typed-but-not-added are auto-included on save** — prevents silently losing a filled-in row when the operator hits Create without pressing + Add.
- **UI matches the operator's reference screenshot but in light theme** (their explicit direction: "exactly like in the image but not dark color"): external bold labels above fields, uppercase letter-spaced section headers, pink "+ Add" buttons, full-width purple→pink gradient "Create Campaign" button, header ✕ instead of a Cancel row.
- **No test save performed** — dev server points at production Firebase; a test write would put a junk doc in `eiflixcampaign`. Verified visually up to (not including) save; segment select confirmed loading live `newusertags` docs.

## Surprises / gotchas
- `ng serve` ignores the `PORT` env var (interactive port prompt), so `.claude/launch.json` wraps it in `sh -c "npx ng serve --port ${PORT:-4300}"` with `autoPort` — port 4200 is usually occupied by the operator's own dev server.
- graphify is not installed in this environment (`ModuleNotFoundError`) and `graphify-out/` doesn't exist — the CLAUDE.md rebuild step is currently a no-op.

## Pending
- Campaign list/cards on the dashboard page (only the create flow exists so far).
- Route guard for `/campaigndashboard` (and siblings) once the Firestore `dashboard` route-config entry exists.
- Not committed — operator commits manually (standing directive).

---

## Round 2 (same day) — wide dialog

Operator: "more and more width for the dialog and adjust all the fields based on the dialog."

- Dialog width 620px → **950px** (maxWidth 95vw untouched).
- Reflow to use the width: **Start Date | End Date | Segment now share one
  3-column row** (was dates 2-col + segment full-width); **Campaign Assets
  entry is one row: Type | name | URL | + Add** (URL was a separate
  full-width line). Sales targets stay 3-col; body/header padding 24→28px,
  row gap 12→16px; asset type column 140→170px.
- Responsive: below 700px viewport the 3-col rows stack and the asset row
  wraps (`flex-wrap`) — verified at the Browser pane's narrow native width.
- Wide layout verified at 1440×900; production build green (same 3
  pre-existing CSS warnings from other components).
- Gotcha: the Browser pane's compositor got stuck at a tiny scale after an
  explicit 1440×900 `resize_window` (one `UnknownVizError` screenshot) —
  pane artifact only, not an app bug.

---

## Round 3 (2026-08-21) — card grid dashboard (light-theme port)

Operator supplied a dark-theme reference (`~/Downloads/eiflix_dashboard.html`,
campaign section only) + screenshot; wanted the page "exactly like the image"
but WHITE theme, with **+ Add Sale and Analytics as deliberately inert
buttons** (explicit request — do not "fix" them later).

- `campaigndashboard` component rewritten: `.sep` header row (label + line +
  gradient button), 3-column `.camp-grid` of `.cc` cards, dashed `.empty-camp`
  tile. Live `collectionData` on `eiflixcampaign` + `newusertags` (id→name for
  the segment chip). Status derived from dates (live/sched/+ our own `ended`
  gray chip); sort live → sched → ended.
- Card math: pct = clamp(achieved/expected, 0..100); Indian digit grouping via
  `Intl.NumberFormat('en-IN')`; achieved color + bar color thresholds (≥80
  green / ≥50 orange / else red text, magenta bar) copied from the reference.
- Light palette derived from the dark vars; text-role variants added after an
  ultracode review flagged AA contrast (`--ora-tx #B84E18`, `--grn-tx
  #0C7A37`, `--red-tx #D53238`, sky → `#1E6BC8`); brighter hues kept for the
  non-text progress bars.
- Dialog gained **edit mode** (Edit button prefills via `MAT_DIALOG_DATA`,
  `setDoc(..., {merge:true})` on the same id, `created` preserved,
  `updated` refreshed). WHY Edit works while Add Sale/Analytics don't:
  operator singled out only those two as inert.
- Review workflow (3 lenses + adversarial verify, 9 agents) confirmed 3 real
  defects, all fixed: negative values savable → clamped in save() AND pct
  lower-clamped; achieved-value contrast (above); scheme-less asset URLs
  resolving relative to app origin → `normalizeUrl()` (exported from the
  dashboard component) applied on add and on display.
- **Verification caveat:** browser preview is UNAUTHENTICATED → reading
  `eiflixcampaign` returned permission-denied while `newusertags` read fine.
  Cards were verified by injecting the reference's three sample campaigns via
  `ng.getComponent()` in the console (76%/78%/0%, statuses, chips, edit
  prefill all exact). If cards don't load for a logged-in user, the
  production Firestore rules (console-managed, not in repo) likely need an
  `eiflixcampaign` entry — repo `firestore.rules` is emulator-only.
- Prod build green. Not committed (operator commits manually).
