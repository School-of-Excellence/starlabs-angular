# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-10-05 (specialist studio testing round 2)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-10-05-specialist-studio-testing-round2.md`.

## Current state

- **starlabs-angular** — Angular 19 admin app on `nanda-development`. The operator commits and pushes
  this repo manually. Uncommitted right now: the EiFlix Report work (2026-10-09) and the
  /newusersprofile filters (today). See Pending.
- **starlabs-e2e-tests** — the Playwright hub, `main`. 145 tests across 20 files in the `workshops`
  suite. Suites **do** run locally against the Firebase emulator (Android Studio's JDK 21; recipe in
  the hub's SETUP.md §4a).
- **workshop (Flutter)** — enrolment duplicate-write fix; 369/369 unit tests pass. Still uncommitted
  in that repo.

## Last session changes (2026-10-12)

### EiFlix ops dashboard — date range on the Users cards

Today / 7D / 30D plus a manual From–To over the Users section. **Total New Users** filters on the
signup date, **New Users to Paid** on the move date — two different fields, one control.

- **The default is All, deliberately.** Every other range on this dashboard defaults to Today; these
  must not. They are headline totals the operator reads daily, and a Today default would silently
  rewrite them from thousands to single digits. All is also what Clear returns to.
- **Zero Firestore reads per range change** — `new_user_data` is already a full realtime listener, so
  the raw docs stay in memory and every range change re-buckets locally.
- **The trap:** the paid card renders each row from *participant metadata* when a twin exists, and
  that document carries no move date. Reading the date off the rendered source would have dropped
  **everybody with a full profile** the moment a range was applied — the best-known customers first,
  with the card still looking plausible. The filter reads the new-user doc explicitly, and a unit case
  seeds a metadata twin with no move date so the row must survive on the new-user doc alone.
- **B!G Participants is not filtered** (no comparable date); its caption says so while a range is
  active, or three numbers under one control look like they answer the same question.
- Undated rows drop out under a window and are kept under All. A half-filled From–To reads as
  unfiltered. Reversed picks are tolerated. Markup reuses the Engagement controls — **no new CSS**.

**Verified:** `ng build` **EXIT=0** · unit spec **78/78** (9 new) · hub **WS-58 against the emulator —
1 passed**, with all 17 Cloud Function triggers loaded (closer to CI than the last two runs). WS-58's
seed makes the two date fields *disagree* — NU_C signed up 3 days ago and moved across today — so a
card filtering on the wrong field reads a wrong number, not just a smaller one.

### /newusersprofile filters

**Created date is now a visible range.** It was *already* a range behind the scenes (since
2026-07-13) — a `mat-date-range-picker` driven by a form field hidden with `height: 0; opacity: 0`,
fronted by a button that just said "Created date". Nothing on screen said "range". The real range
input is now in the toolbar: **both bounds visible and typable** (`Created from` – `to`), a calendar
button, and an × to clear. The hidden proxy is gone.

- Typing introduced a hazard that picking never could: a half-typed date parses to `Invalid Date`,
  whose `getFullYear()` is `NaN` — and `created < NaN` is `false`, so the old bound maths would have
  made the filter silently match **everything** while the control looked active. `dayBound()` returns
  `null` for anything unparseable, and `hasDateFilter` is computed from the same helper, so a bad
  date neither filters nor lights the control up.

**Converted is now a two-option menu** (`Converted` / `Not converted`) on the same pill + `mat-menu`
pattern as the two filters beside it. It was an on/off pill, so **"not converted" was unreachable** —
that half is new capability, not a re-skin. `''` is the cleared state, not a third row: re-picking
the active option clears it, and the × clears it too. The button names the dimension
(`Conversion`) when nothing is chosen and the chosen answer once something is — the old static
"Converted" would have read as *"converted profiles are shown"* in the one state where nothing is
filtered at all. Export and select-all follow `filteredData`, so "Not converted" + Export gives
exactly the non-converted list.

**Moved On stays on the Converted side only** — gated on `convertedFilter === 'converted'`, not on
"a filter is active", because the other side has no move date and the column would be all em-dashes.

**Verified:** `ng build` **EXIT=0** · hub **WS-56 + WS-57 against the Firestore emulator — 2 passed**
(42s). WS-56 narrows to the *middle* of the three seeded days so there is a negative control on both
sides of the window; WS-57 requires the same two profiles to **swap** when the option flips, so
one-sided passing is impossible.

**Where the time actually went, and the lesson.** The code was small. Two things cost real time:
(1) the ask looked like new work but the date range already existed — finding that out meant reading
the component, the CSS and the git history; (2) I piped the test run through `tail -40`, which buffers
until EOF — and the Firebase emulator inherits the pipe and never closes it, so **13 minutes passed
with zero output while the run had already died in global setup**. Redirect to a file, never pipe a
long run through `tail`. The underlying failure was a dead Auth emulator (ECONNREFUSED on 9099);
killing the emulator and letting the setup boot a fresh one fixed it. `functions: Failed to load
function` is still logged on boot and is harmless here — the CF entry loads fine standalone.

## Pending

- **starlabs-angular is uncommitted** — `popup-banner/` (incl. the new model + its spec),
  `content-analytics/`, `eiflixoperationsdashboard/`, this file and the journals. The operator
  pushes this repo manually. **Nothing parked can be re-enabled until these ship.**
- **Re-enable after the push:** WS-45, WS-46, CN-47, CN-48, CN-49 — `test.fixme` → `test` and inline
  the ids back as literals (steps are in each file).
- **Flutter**: `popup_banner_model.dart` must read `popupbanner` before anything made in the new
  editor is visible in the app.
- **The analytics CSV still writes `name` unescaped**, unlike `videoname` and the two new columns. A
  name containing a comma would shift that row. Pre-existing; not touched.
- **The logs table has no column showing which rows are new**, so filtering to "New users" yields a
  list that looks like any other. Only a filter was asked for; a badge would make it self-evident.
- **Production bootstrap for Dashboard Access** — `static meta data/Workshop Admin` needs
  `workshopdashboardadmin` / `workshopeditaccess` / `workshopnewusersaccess` to contain at least the
  operator's profileid, or the deployed build locks everyone out of the editor that sets those lists.
- **The dashboard CSV export has no Email column** while the table now shows one. Not asked for.
- **Duplicate `participant workshop` docs in production** — 11 pairs across 5 workshops remain
  uncleaned; `script/dup-participant-workshop.js delete --confirm` is the operator's to run.
- **The Angular dashboard still reads progress keyed by profileid** rather than through
  `participantworkshopref` — the root cause of the Susha Roy mis-read. Offered, not accepted.
- **Flutter integration test has never been executed** (no Java/chromedriver here) and the Flutter
  changes are uncommitted.
