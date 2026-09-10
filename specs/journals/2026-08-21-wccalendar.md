# 2026-08-21 — Workshop & Campaign Calendar (wccalendar)

## What was asked
Exact dark-theme clone of the reference `~/Downloads/eiflix_dashboard.html`
calendar view ("strictly same UI, same dark theme"), backed by the new
collection **`workshopcampaigncalendar`** (operator named it and added the
Firestore rules themselves). Design went through 4 drafts first (see
`~/.claude/plans/2026-08-21-wccalendar-design.md`): auto-derived campaign
bars REJECTED, source-linked "assign to calendar" REJECTED — the calendar is
fully standalone; all events (incl. campaigns) enter via + Add Event only.

## What was built
- `wccalendar/` component (+ `/wccalendar` lazy route, unguarded like
  campaigndashboard): legend row, gradient + Add Event, stacked month cards
  with exact reference CSS (colors, chips, borders, today ring, dimmed
  neighbor days). ‹ Today › nav + range label = deliberate addition (operator
  wanted a "fully dynamic Google-like" calendar); shows viewStart + 2 months.
- Event chips render on every spanned day, type-letter prefix on the start
  day, MAX 3 chips/day then "+N more"; chip click → details dialog; day click
  → day list in the same dialog.
- `add-event-dialog/` — exact clone of the reference #calModal (dark .mi
  inputs, native date pickers with color-scheme:dark, gradient Add to
  Calendar). Doubles as Edit via MAT_DIALOG_DATA (Update Event, created
  preserved, merge:true).
- `event-details-dialog/` — list + detail views, Edit hands back
  {edit: event} to reopen the add dialog; Delete is two-click
  ("Confirm Delete?") then deleteDoc.
- Dark dialog surface via `.wc-dark-panel` / `.wc-dark-backdrop` appended to
  `src/styles.css` (same pattern as `.eod-dialog-panel`).
- Doc fields: id, title, type(workshop|campaign|masterclass|webinar),
  startdate, enddate, allday:true, note, repeat:'none', repeatuntil:null,
  created, updated.

## Load-bearing: all-day dates are UTC-anchored
Ultracode review (14 agents) confirmed one real defect: the first version
stored creator-LOCAL-midnight Timestamps; viewers west of the creator saw
events one day early, and a cross-timezone edit round-trip would silently
shift stored dates (the reference's 'yyyy-MM-dd' strings were tz-proof; the
port lost that). Fix: write `Date.UTC(y,m,d)` midnight, and read EVERYWHERE
through UTC accessors — `eventDayNum()` (UTC day number), `fmtEventDate()`
(timeZone:'UTC'), edit prefill via getUTC*. Grid cells compare as
`Date.UTC(cell y,m,d)`; today = local today's y/m/d as UTC number. Do NOT
reintroduce local accessors anywhere in this feature. Docs created before
the fix render one day early — operator can re-save them via Edit.
(Related known gap, NOT changed: eiflixcampaign stores local-midnight dates;
same class of issue if that org ever goes multi-timezone.)

## Verification
- Browser: reference's 15 sample events injected → month subtitles/counts
  matched the operator's screenshot exactly; then the operator's own live
  test docs streamed in and rendered (spans, prefixes, +1 more, today ring).
  Add dialog, details dialog, edit prefill all screenshot-verified.
- Rules: unauthenticated read of workshopcampaigncalendar WORKS (operator's
  rules); no writes performed by me — all test docs are the operator's.
- `ng build --configuration production` green after the UTC fix.
- Not committed (operator commits manually).

---

## Later round — dynamic event types from newusertags

Operator: Type must come from a collection, not the static four. Reuses
`newusertags` with discriminator **type=='wccalendar'** (same pattern as
'newusersegments'); calendar events store the tag DOC ID in their `type`
field; new types can be created inside the Add Event dialog (stamped
type:'wccalendar' silently, duplicate names blocked case-insensitively,
auto-selected after create).

- Calendar: second subscription on newusertags(where type=='wccalendar').
  Legend, chip colors, prefix letters, month pills + subtitle all resolve
  from tag names now. Colors: tags cycle through the four reference
  palettes by sorted index (TYPE_PALETTE); month subtitle = top-2 type
  counts + total; pills capped at 3 (added .mchip-mc/.mchip-web).
- Legacy events (plain-name type like 'workshop') still render via
  LEGACY_TYPE_SLOTS fallback and stay editable (pseudo-option appended in
  the edit dialog). New saves always store tag ids.
- Details dialog gets a {type -> meta} map via MAT_DIALOG_DATA (it can't
  resolve ids itself without another fetch).
- Also answered operator mid-round: allday/repeat/repeatuntil are reserved
  phase-2 fields (timed events + recurrence), unread today; offered to
  strip them if unwanted.
- Verified in browser against the operator's own live tags (Masterclass,
  Workshop) and events; prod build green. Not committed.

---

## Later rounds — soft delete, location, showinapp, day-click create

Operator requirements landed in quick succession (some mid-turn):

- **Soft delete:** Delete in the details dialog now sets `deleted: true`
  (+ updated timestamp) via updateDoc — documents are NEVER removed. The
  calendar filters `e.deleted !== true` CLIENT-side on purpose: a Firestore
  `where('deleted','!=',true)` would also drop legacy docs missing the
  field. New creates stamp `deleted: false`.
- **Location:** second tag family in `newusertags`, discriminator
  **type=='location'** (operator's naming). Event doc gains `location`
  (tag doc id, '' when none — optional). Dialog: Location dropdown +
  "+ New Location" inline creator (same silent-stamp pattern as types);
  Notes is now a separate plain field. Location shown in: chip tooltip
  (title — location · note), details dialog (📍 row), day-list sub line.
  Calendar has a third subscription (location id→name map), passed to the
  details dialog alongside the type meta map.
- **showinapp:** boolean on the event doc, dark gradient toggle in the
  dialog ("Show in App"), defaults FALSE (opt-in exposure to the
  participant app; nothing reads it yet). Edit prefills via ===true.
- **Day-click create:** clicking an in-month day cell opens the CREATE
  dialog with that date patched into both Start and End (presetStart via
  MAT_DIALOG_DATA as a yyyy-MM-dd string — no tz round-trip). Event chips
  alone open the details (edit/delete); "+N more" opens the day list
  (stopPropagation on both). Dimmed other-month cells are inert.

Verified in browser (day-click patched 2026-08-26 into both pickers;
chip click opened details with Edit/Delete; operator's live tags —
4 types, 3 locations — populate both dropdowns). Prod build green.
Not committed.
