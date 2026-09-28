# 2026-08-06 — Ads tab: auto notification schedule (appnotificationmap)

## What was asked
On `/eiflixhomeconfig` (Home Widgets → Ads tab), add to each ad:
`autonotification` (boolean); when true, mandatory `startdate`/`enddate`
timestamps and an `enableappnotification` boolean; when that is true, an
`appnotificationmap` array of `{title, subtitle, message, landingPage,
sticky, logged}` — exactly one entry per day of the date range. Start date
must not be editable while the ad's existing `show` boolean is on, and end
date must be after start date. Clean responsive UI.

## What was done (and WHY each constraint landed)
All changes live in the shared dialog
`src/app/New-Workshop/upcomingworkshops/createupcomingworkshops/` (ads
mode) — the Ads tab itself only lists docs; create/edit already happens in
this dialog, so the new fields belong there. Committed as `4b46ce9d`.

- **Day count = date-only difference, not inclusive count.** The operator's
  own example (Jul 22 2:27 PM → Jul 30 11:27 PM "= 8 days, 8 maps") is the
  spec: `round((dateOnly(end) − dateOnly(start)) / 86_400_000)`. Times are
  ignored; saved timestamps are pinned to **12:01 am (start)** and
  **11:59 pm (end)** local, exactly as dictated ("assume like this").
- **Rows auto-resize, preserving typed values.** `appnotificationmap` is a
  `FormArray` resized on every date change (push/removeAt from the end), so
  shrinking the range never wipes the days that survive.
- **Hidden ≠ invalid.** Schedule controls carry `Validators.required` (and
  an end-after-start validator on `enddate`), but `syncAdsControlState()`
  disables them whenever their section is hidden (`autonotification` off →
  dates+toggle+array disabled; `enableappnotification` off → array
  disabled). Disabled controls skip validation, so the collapsed form stays
  savable; `getRawValue()` still reads them, and the payload builder nulls
  them out (`startdate/enddate: null`, `appnotificationmap: []`) when off,
  keeping the Firestore doc shape consistent.
- **Start-date lock.** `isStartdateLocked` = ads + edit mode + doc already
  has a saved startdate + `show` is on → control disabled (datepicker and
  toggle grey out; a lock hint explains why). The
  edit-mode-with-saved-value qualifier exists because locking on create
  would make a required field unfillable. `getRawValue()` keeps the locked
  value flowing into the payload.
- **End > start enforced twice**: `[min]` on the end datepicker (start+1
  day) plus a cross-field validator (`daterange` error, surfaced even when
  only the start date changed by `markAsTouched` on end).
- UI follows the dialog's existing design system (toggle-rows, `#f8fafc`
  cards, indigo chips); per-day cards are labeled "Day N — actual date";
  reuses the existing responsive `.grid` (collapses at 560px).

## Round 2 — notifyto audience (same day, commit `faecb355`)
- When autonotification is on, a **Notify To** block renders *before* the
  Notification Schedule: required multi-select `notifyto` storing the
  operator's exact strings (`journey`, `active participants`,
  `non active participants`, `all exist users`, `new users`) — displayed
  via `titlecase`, stored verbatim.
- Choosing `journey` reveals a required **Journeys** multi-select fed by a
  one-shot `getDocs` of the `journey` collection (label = the `journey`
  field — same pattern as journeyplan's `mapjourneyname`; sorted, with an
  'Untitled journey' fallback), storing **document ids** in
  `selectedjourneys`.
- Same disable-when-hidden discipline: autonotification off disables both;
  `notifyto` without `journey` disables `selectedjourneys` (value kept in
  the form for re-toggle, but the payload writes `[]` so Firestore never
  holds journeys for a non-journey audience).

## Round 3 — funnel only audience (2026-08-11, commit `63a244b4`)
- New `notifyto` option **`funnel only`** (stored verbatim, displayed
  "Funnel Only" via titlecase, placed right after `journey`). Selecting it
  reveals a required **Funnel Workshops** multi-select.
- Options come from a one-shot
  `getDocs(query(workshopconfiguration, where('evergreenWorkshop','==',true)))`;
  label = `detailpage.title` (the codebase's standard workshop-title path,
  e.g. view-participants-form's `mapWorkshopNew`), fallback 'Untitled
  workshop', sorted; stored value = **document id**, in `selectedfunnels`.
- Same disable-when-hidden + payload-clearing discipline as
  `selectedjourneys`: hidden ⇒ disabled (never blocks save); payload writes
  `[]` unless `funnel only` is actually among the audiences.
- **Operator hand-edit discovered mid-session:** `'all exist users'` was
  commented out of `notifyToOptions` between sessions (file drifted from
  the 08-06 state). Preserved as-is — do not "restore" it; the operator
  removed it deliberately.

## Round 4 — Enable Wati per-day schedule (2026-08-12, commit `db185c76`)
- **Dialog enlarged for ads only**: openAdsDialog 1100px / maxHeight 94vh;
  `.dialog-wrap.wide` (min(1060px, 92vw)) + `.dialog-body` 78vh, gated on
  `[class.wide]="widgettype === 'ads'"` so comingsoon keeps its 720px.
- **Enable Wati** toggle sits right after the Enable App Notification
  block; `watimap` is sized by the SAME `syncNotificationRows()` resize
  as `appnotificationmap` (one row per date-difference day). Each day:
  required `templateName` + `variables` FormArray of
  `{name, type: static|metadata, value}`.
- **Templates**: lazy-loaded when Enable Wati turns on (or hydrates on),
  from `classify/wati` key `101723` → `GET /api/v1/getMessageTemplates`
  (Bearer, pageSize 1000) filtered to non-DELETED UTILITY — the exact
  sendmessages recipe (note: sendmessages' initWatiConfig reads
  `wati[0]` but its loadTemplates re-reads `101723`; the `101723` path is
  the effective one, so that's what this uses). Load/Reload button with
  loading/error text; select is **searchable** via ngx-mat-select-search
  (one shared search control — only one dropdown opens at a time — reset
  on every open; the current value stays selectable when filtered out or
  missing from the loaded list, suffixed "(not loaded)").
- **Variables**: choosing a template rebuilds that day's variables from
  its `customParams[].paramName`, preserving same-named type/value.
  Static → single-line textarea (newlines stripped on paste AND in the
  payload — WATI rejects multi-line params, same rule as sendmessages'
  onPasteRemoveNewlines); Metadata → mat-select with only `name` for
  now (`watiMetadataOptions`), preset on switch; a static→metadata→static
  round-trip restores the stashed text.
- **Adversarial review (3 lenses; regressions clean) drove:** the
  reconcile pass (`reconcileWatiVariables()` after every successful load
  — hydrated rows would otherwise keep stale variables since re-picking
  the same template fires no selectionChange); `syncAdsControlState()`
  after `setControl` (fresh arrays are born enabled); the honest
  config-missing error message; the newline stripping; the stash.
  The searchable select was independently flagged by the review AND
  requested by the operator in the same minute.
- Accepted nits (documented): a "(not loaded)" template becomes
  unrecoverable once switched away from (needs a deleted/recategorized
  WATI template); a failed reload keeps the stale list alongside the
  error text.

## Round 5 — near-fullscreen sectioned redesign (2026-08-12, commit `2ba1543e`)
- **Dialog 93vw × 93vh** (operator wanted "full screen but not full — 93%").
  `.dialog-wrap.wide` fills the panel with a flex column: `form` flex:1
  min-height:0, `.dialog-body` flex:1 max-height:none — only the body
  scrolls; the actions bar stays pinned. Comingsoon keeps 720px.
- **Template/CSS restructure only** — the form model, validators,
  orchestration, and Firestore payload are byte-identical. Two new getters:
  `scheduleDays` (indices from `adsNotifications.length`; both maps are
  always resized together so indices are safe) and `bothDailyColumns`.
- **Sections** (`.sect` + `.sect-head` icon headers): Ad Content (wide mode
  makes `.grid` 3-col), Display (3 toggle cards), Audience & Schedule (all
  audience selects + start/end in one grid, day chip in the head), Daily
  Messages, Images (`.uploads-row` auto-fit grid — 3 uploads side by side;
  comingsoon's single upload untouched, `uploads-wrap` only gets `.sect`
  in ads mode).
- **Daily Messages = one row per day, channels side by side.** ngFor over
  `scheduleDays`; inside each row, an App Notification column
  (`formArrayName="appnotificationmap"` → `[formGroupName]="i"`) and a
  Wati column (`watimap` → same index) — `.two` grid only when both
  toggles are on, lone column full-width (capped 980px), stacked <980px.
  Inner grids use `.col-grid` (2-col) so the wide 3-col `.grid` rule
  doesn't leak in. Error bindings switched from ngFor locals to
  `adsNotifications.at(i)` / `adsWati.at(i)`.
- **Review (3 lenses, all verdicts OK)** — fixes applied: `.sect-head`
  regained `flex-wrap` (the old head had it; without it the day chip +
  wati toolbar overflow at mobile widths and force horizontal scroll),
  empty `.day-list` no longer renders (dead margin), lone `.day-col`
  capped at 980px, uploads markup re-indented.

## Surprises / notes
- `graphify` module is not installed in this environment — the post-edit
  graph rebuild command from CLAUDE.md fails with ModuleNotFoundError.
  Skipped; run `/graphify .` when available.
- PROGRESS.md claimed uncommitted 08-01 work, but the tree was clean at
  session start — the operator has since committed/merged (HEAD
  `41de2ed7`).

## Pending
- Nothing half-done in this feature. Consumer side (whatever sends the
  daily notifications from `appnotificationmap`) is out of scope here —
  the admin UI only writes the schedule onto `eiflixhomewidgets` docs.
- Not requested/not built: showing autonotification status as a column in
  the Ads table.
