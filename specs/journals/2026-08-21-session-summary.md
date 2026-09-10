# 2026-08-21 — Session summary: EiFlix campaign dashboard + calendar

One session (2026-08-20 → 2026-08-21, branch `nanda-development`) built the
EiFlix campaign/marketing toolset end to end. This entry is the map; the
detailed WHYs live in the three per-feature journals referenced below.
**Nothing from this session is committed — operator commits manually
(standing directive).**

## Arc of the session, in order

### 1. Campaign create dialog → wide dialog → card-grid dashboard
Journal: `2026-08-20-campaign-dashboard.md` (3 rounds)
- `/campaigndashboard` (unguarded route, operator's choice): "New Campaign"
  dialog writing to **`eiflixcampaign`** (lowercase fields: campaignname,
  startdate/enddate Timestamps, segment = newusertags doc id,
  expectedsalevalue/achievedsalesvalue/numberofsales, channels[],
  manualnotes[], campaignassets[{type,name,url}], created/updated).
- Dialog widened to 950px on request (dates+segment one row, asset entry
  one row: Type | name | URL | +Add).
- Dashboard page = LIGHT-theme port of the operator's reference HTML
  (`~/Downloads/eiflix_dashboard.html`, campaigns section): card grid with
  status chips (live/sched/ended derived from dates), ₹ en-IN formatting,
  progress bars, asset chips, notes. **+ Add Sale and Analytics buttons are
  deliberately inert** (operator directive — do not wire them). Edit reopens
  the dialog prefilled (setDoc merge, created preserved).
- Ultracode review fixed: negative-value clamps, AA contrast text colors
  (--ora-tx/--grn-tx/--red-tx pattern), scheme-less asset URL normalization
  (exported `normalizeUrl` in campaigndashboard.component.ts).

### 2. newusertags becomes a multi-family tag collection
Journal: `2026-08-21-newusertags-type-filter.md`
- Profile + assign-tags dialog queries now filter
  `where('type','==','newusersegments')`; tags created there are silently
  stamped `type:'newusersegments'`.
- ⚠️ **Pending operator decision:** the 11 pre-existing newusertags docs
  have NO type field → those two screens list zero tags until backfilled
  (verified read-only via REST: 11 docs, 0 typed). Backfill = write
  `type:'newusersegments'` on all 11; not done (production write needs
  operator approval).
- This established the **discriminator-field pattern** the calendar reuses:
  one collection, `type` field separates families
  (`newusersegments` | `wccalendar` | `location`). Campaign dashboard/dialog
  read newusertags UNFILTERED (segment names resolve regardless of family).

### 3. Workshop & Campaign Calendar
Journal: `2026-08-21-wccalendar.md` (all rounds)
- Design went through 4 drafts (`~/.claude/plans/2026-08-21-wccalendar-design.md`):
  operator REJECTED auto-derived campaign bars AND source-linked
  "assign to calendar" refs — the calendar is fully standalone. Collection
  named by operator: **`workshopcampaigncalendar`** (rules added by them).
- `/wccalendar` (unguarded) = exact DARK-theme clone of the reference
  calendar + deliberate dynamic additions (‹ Today › month nav, "+N more"
  overflow, details dialog).
- Event doc: id, title, **type** (newusertags id, family 'wccalendar'),
  startdate/enddate (**UTC-midnight Timestamps** — see below), allday:true,
  **location** (newusertags id, family 'location', '' if none), note,
  **showinapp** (bool, toggle, default false), **deleted** (soft-delete
  flag), repeat:'none'/repeatuntil:null (reserved phase-2: recurrence,
  timed events), created/updated.
- **UTC rule (load-bearing):** all-day dates write `Date.UTC(y,m,d)` and are
  read ONLY through UTC accessors (`eventDayNum`, `fmtEventDate` with
  timeZone:'UTC', edit prefill via getUTC*). Ultracode review caught the
  original local-midnight version shifting days across timezones and
  corrupting dates on cross-timezone edit round-trips. Never reintroduce
  local accessors in this feature. (Known sibling gap, unchanged:
  eiflixcampaign still stores local-midnight dates.)
- **Soft delete:** Delete = updateDoc {deleted:true}; docs never removed;
  calendar filters `e.deleted !== true` client-side (a Firestore `!=` query
  would drop legacy docs missing the field).
- Dynamic types AND locations from newusertags with in-dialog
  "+ New Type" / "+ New Location" creators (silent discriminator stamp,
  case-insensitive duplicate guard, auto-select). Colors cycle the four
  reference palettes by sorted index; legend/pills/subtitle all dynamic;
  legacy plain-name events render via fallback slots.
- **Click model:** day cell → CREATE dialog with that date patched into
  Start+End; event chip → details (Edit/two-click Delete); "+N more" → day
  list. Dimmed other-month cells inert.
- Dark Material dialog surface via `.wc-dark-panel`/`.wc-dark-backdrop`
  appended to `src/styles.css`.

## Environment facts worth remembering
- Firestore rules are console-managed (repo `firestore.rules` is
  EMULATOR-ONLY). Unauthenticated browser preview: `newusertags` and
  `workshopcampaigncalendar` readable; `eiflixcampaign` permission-denied
  (works for signed-in users; verify cards load, else add a rule).
- Dev server: `.claude/launch.json` → `starlabs-dev`, port 4300
  (`sh -c` wrapper because ng serve ignores PORT).
- Verification trick used throughout: `ng.getComponent()` in the dev
  console to inject mock state — no production writes; every test doc in
  workshopcampaigncalendar/newusertags was created by the operator.
- All prod builds green (`ng build --configuration production`); the only
  warnings are 3 pre-existing CSS selector warnings from other components.

## Pending
- newusertags backfill decision (item 2 above) — blocks the profile/assign
  screens showing their existing 11 tags.
- Operator to review, commit, and deploy the whole session's work.
- Calendar phase-2 candidates (structure ready, unbuilt): timed events +
  week/day views, recurrence, participant-app consumption of `showinapp`.
