# PROGRESS

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

- **starlabs-angular is uncommitted and the operator pushes it manually.** Two batches:
  `eiflixoperationsdashboard/` (EiFlix Report + Excel export + web-users source change, 2026-10-09)
  and `newusersprofile/` (today), plus `PROGRESS.md` and the journals.
- **Hub is pushed** for today's work (WS-56/WS-57 + the seeder). Nothing parked.
- **The /newusersprofile filter logic lives in the component**, so none of it is unit-testable the way
  `workshop-dashboard.engine.ts` is. `dayBound` and the conversion predicate are pure and would move
  cleanly into an engine file; e2e is the only thing pinning them today.
- **EiFlix Report**: the mobile Total is a deduplicated union and Web is not additive with mobile —
  nothing on screen says so any more (the operator asked both notes removed). Both rules are in code
  comments and unit tests. `xlsx-js-style` would give the export the sample's bold headings; offered,
  not taken (new runtime dependency).
- **Ops dashboard findings not actioned** (`specs/EIFLIX-OPS-DASHBOARD.md`): two unbounded realtime
  listeners; the dashboard writes `eiflixdailywatchers` on render; seven sequential heal queries;
  "Non-Active Users" is narrower than its label; Engagement/Hot Leads/Non-Active/Device Breakdown
  have no hub coverage.
- **Production bootstrap for Dashboard Access** — `static meta data/Workshop Admin` needs
  `workshopdashboardadmin` / `workshopeditaccess` / `workshopnewusersaccess` to contain at least the
  operator's profileid, or the deployed build locks everyone out of the editor that sets those lists.
- **Flutter**: `popup_banner_model.dart` must read `popupbanner` before banners made in the new
  editor are visible in the app. Its integration test has never been executed.
- **The analytics CSV still writes `name` unescaped**, unlike `videoname`. Pre-existing.
- **Duplicate `participant workshop` docs in production** — 11 pairs across 5 workshops;
  `script/dup-participant-workshop.js delete --confirm` is the operator's to run.
