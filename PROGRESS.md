# PROGRESS

## Current state

- **starlabs-angular** — Angular 19 admin app. Live on `nanda-development`; the operator commits and
  pushes this repo manually. Workshop Dashboard (`/workshop_dashboard/:id`) carries the per-workshop
  Dashboard Access grants (`workshopsettings` + `static meta data/Workshop Admin`), the EiFlix home
  config screen carries the Journey/Tier audience picker and the Home Series series-level fields.
- **starlabs-e2e-tests** — the Playwright hub, `main`. 132 tests across 20 files in the `workshops`
  suite config. CI is the only place the suites can run: they need the Firebase emulator, which
  needs Java, which is not installed on this machine.
- **workshop (Flutter)** — enrolment duplicate-write bug fixed (synchronous latch + atomic batch +
  post-commit reconcile, Firestore auto-ids). 369/369 unit tests pass, `dart analyze lib` clean.
  Changes are still **uncommitted** in that repo.

## Last session changes (2026-10-08)

**Workshop dashboard side panel — search by name.** A search box with a clear button at the top of
the panel's participant list. Narrows the panel only; the progress table behind it is untouched.

- The rule is `filterParticipantsByName()` in `workshop-dashboard.engine.ts` — pure, so it runs in
  the local unit spec. The component needs Firestore and cannot be spec-built, which is why that
  engine exists.
- `nameOf` is passed in: the panel's entries come from several builders, some carrying `name`
  directly and others only a profileid resolved against the profile maps.
- Cleared alongside `filterOption` at all 15 panel-open sites, or a stale term would make the next
  card open on an empty panel.

**Evergreen "days remaining".** Each profile in the Extended Participants dialog now shows
"12 days left" / "Last day" / "Expired". Calendar days, not elapsed hours — `extenduntill` is stored
at 23:59, so an hours-based count would read "0 days left" for most of someone's final day.
`Math.round` over midnight-to-midnight, because DST makes a day 23 or 25 hours and flooring the raw
gap would be off by one past the switch. Today is "Last day", not zero; no extension shows nothing
at all rather than "Expired".

**Verified:** engine unit spec **134/134 locally** (17 new across both changes) · `ng build` clean ·
hub parses at 137. **Hub: WS-48 and WS-49**, pushed.

Two mistakes caught locally, neither worth a CI round trip: an import insert that assumed a trailing
comma and broke the build, and a wrong test expectation (`ita` does not match "Chitra" — it contains
`itr`); the code was right.

### Previous: the 2026-10-06 parked cases were ARMED and the app was pushed
WS-45, WS-46, WS-47, CN-47, CN-48, CN-49 are live again (`test.fixme` → `test`, ids inlined), and
the Angular side landed as `b5bec223`.

### Previous session (2026-10-06) — popup banner array

**Popup banner → an array of banners.** `classify/eiflixpopupbanner` held ONE banner as flat fields;
it now also holds `popupbanner`, an array of maps. The dialog became a master-detail: a list picks a
banner, the form edits the selected one. New pure `popup-banner.model.ts`.

- **The legacy flat fields are deliberately kept.** The Flutter app renders the popup from the FLAT
  fields (`popup_banner_model.dart` `fromMap`: `m['enable']`, `m['desktop']`, `m['header']`…) and
  knows nothing about `popupbanner`. The save writes only `popupbanner` with `merge: true`, so the
  live banner keeps rendering. **Until Flutter is updated, banners made in the new editor will not
  appear in the app.**
- **The pre-array banner is adopted as the first entry** when `popupbanner` is missing *or empty* —
  otherwise the operator sees an empty editor whose first save replaces a live banner with nothing.
- One set of six ProseMirror editors is reused across the selection, so `commitForm()` runs before
  every selection change and `patchForm()` must call `editor.setContent()`, not just set the value.
- `listDirty` widens the dirty check to cover add/remove, which `form.dirty` cannot see.

**Verified:** model unit spec **28/28 locally** · `ng build` clean · hub specs parse.

**Hub: WS-46** — drives the real dialog, reads the document back, asserts the adopted banner keeps
its content, both entries are written as maps, a new banner is off and empty, and the legacy flat
fields survive.

**PARKED — and this is the thing to action.** WS-46 and CN-47/48/49 are `test.fixme`, because they
drive hooks on no pushed app branch. Armed, they make the rollout gate report "selectors gone from
the app" for EVERY release — what WS-45 did on 2026-10-05 and what Charan had to clean up. Ids go
through `PARKED_*` lookups so the gate ignores them. CLAUDE.md says land app hooks FIRST, spec
second; four parked cases is the cost of getting that backwards.

### Previous session (2026-10-05) — /contentanalytics

**/contentanalytics → Analytics Table** — three changes:

- **`new_user_data` answers only for people who are still new.** A record flagged
  `movedtoexist: true` no longer stands in for its person. Same rule as the workshop dashboard and
  the EiFlix ops dashboard — three screens, one definition of "new user".
- **Export gained an `email` column** (after the name), resolving from participant metadata first and
  new_user_data second — the same precedence as the name, and it matters *because* of the change
  above: somebody who moved across now gets their email from their full profile, not their stale row.
- **Export gained the `status` column** the table already displayed.
- **Export gained `phonenumber`**, rendered as country code then number. The number is `phonenumber`
  in both collections, but the code is `countryCode` on new_user_data and the lower-cased
  `countrycode` on participant metadata — reading one spelling would have blanked it for half the
  people. `AuthguardService`'s `phonenumber` map is the wrong source: it reads `doc['number']`, the
  `profile_data` shape, absent on these documents.

**Where the code went, and why it matters.** The rule is applied in the *component*, not in
`AuthguardService.getProfileMapNewUser()` — that service is read by ten screens and filtering inside
it would have changed all of them silently. But the rule *itself* lives in
`content-analytics.engine.ts`, because the engine has a unit spec that **runs on this machine** while
the component cannot be spec-built at all (it imports Node's `console`, which does not resolve under
tsconfig.spec — the reason its own spec is a stub).

`csvCell()` exists because `ConvertToCSV` joins on bare commas and escapes nothing; the export
already stripped commas out of `videoname` by hand for that reason, and any new field needs the same.

**Also — the Video Name dropdown got a typeahead.** Not cosmetic: the dropdown is `multiple`, and
MatSelect re-selects only the options currently rendered on every options change, then writes back
`selected.map(o => o.value)`. A chosen video hidden behind a search term would be dropped from the
model on the user's next click. `filterVideoNameOptions()` always renders already-selected names, in
source order (MatSelect sorts by `options.indexOf`). Found by reading Material's source before
writing the test — the rule added on 10-01, this time changing the implementation rather than the spec.

**Verified:** engine unit spec **61/61 locally** (32 new cases) · `ng build` clean · hub specs parse ·
readiness gate clean.

**Hub coverage: CN-47 / CN-48 / CN-49** (renumbered from CN-43/44, which `arena-video-ask.spec.ts` owns).
CN-47 gives the moved person no participant metadata on purpose — with it, the template would prefer
that name anyway and the case would pass whether or not the filter existed. CN-48 clicks the real
export, takes the real download off disk and reads the CSV. Both filter by a run-unique prefix first:
the table paginates, the shared emulator holds other runs' rows in the same window, and filtering
makes the exported file deterministic.

These are the first cases to actually drive the name filter and the export button, so
`customfilter`/`exportCSV`/`ConvertToCSV` were read end to end first — the rule added after the
2026-10-01 CI failure. That turned up the prefix-vs-substring match and the `(keyup)` binding, both
of which would otherwise have failed in CI.

### Previous session (2026-10-02) — EiFlix ops log user-type filter

**EiFlix Mobile App Logs — New users / Existing users filter** (`/eiflixoperationsdashboard`):

- A fourth filter on the logs toolbar, stacking with search / name / Device OS, counted by the Clear
  chip and reset with it.
- **The definition is borrowed, not invented.** It uses the same rule the two cards above the table
  already use (`new_user_data` with `movedtoexist !== true`), so a card's number and the filter can
  never disagree about the same person. The load-bearing consequence: somebody moved to paid is
  **existing**, not new — the half a careless implementation gets wrong.
- The split is total (`existing = !isNew`), so no log row falls out of both halves.
- `isNewUser` is resolved at load beside `name`, not per filter pass.
- `.eod-log-select-md` (172px): "Existing users" measures 99.6px and the 150px class used by Device
  OS leaves only ~94px of text area once padding and the dropdown arrow are taken — it would have
  clipped. Measured, not guessed.

**Verified locally — the first time this session that was possible.** The logs unit spec builds the
component with `Object.create(prototype)` and needs neither Firestore nor a browser, so
`ng test --include='**/eiflixoperationsdashboard.logs.spec.ts'` runs here: **13/13**, including four
new cases. `ng build` clean. (The sibling `eiflixoperationsdashboard.component.spec.ts` fails with
`No provider for Firestore!` — the untouched CLI stub, failing that way before this change.)

**Hub coverage: WS-45**, in its own describe with its own seeder — WS-31 asserts exact tallies off
`seedLoginLogs` and adding people to it would have rewritten them all. The seeder flips NU_C's
`movedtoexist` rather than adding a document, so WS-30's count floor is untouched. The readiness gate
caught that `eif-logs-usertype-all` was never driven; added as its own step.

### Previous session (2026-10-01) — Participant Progress Details

Total/Status/Assignment parked (not deleted), Email column added after Participant, search matches
email, "New" is a text pill instead of `assets/new.png`. **CI found one real bug**: `filterPredicate`
dereferenced a sub-challenge's `name` bare while the seed stores `heading`, so typing in the search
box threw, MatTableDataSource aborted the filter pass, and the table silently stopped responding.
Fixed with a `str()` normaliser over every searchable term. The spec's own ordering had hidden it —
the positive case ran first and expected the row to STAY, which is exactly what a thrown predicate
produces. Negative control now runs first.

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
