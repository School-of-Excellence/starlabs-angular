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

## Last session changes (2026-10-01)

**Participant Progress Details table** — `workshop-dashboard.component.{ts,html,css}`:

- **Total / Status / Assignment parked**, not deleted, at the operator's request ("in future we will
  use this"). Each cell definition stays in the template inside `<!-- -->`, and the ids stay as a
  commented line in `displayedColumns`. The two must be uncommented *together* — mat-table throws
  `Could not find column with id` otherwise; that is written into the code comments.
- **New Email column** immediately after Participant. The runtime `type`-column splice was re-
  anchored to Email (it used to insert at `participantId + 1`, which would have pushed Email out of
  the position that was asked for).
- **Search now matches email** as well as name; placeholder reads "Search by name or email".
- **The "New" marker is a text pill**, not `assets/new.png` — converted in all three places it
  appears on the screen (table cell, Participant Data hero, side-panel list).

**Two failures caught before pushing, not after:**

- *Email column shredding.* The first CSS used `overflow-wrap: break-word`. A harness screenshot
  showed it collapsing into a one-character-wide vertical strip — the same failure the operator
  rejected once already on the Dashboard Access picker. mat-table sizes columns by content, so a
  *breakable* long value collapses a column; the fix is `nowrap` + ellipsis + a `title`, with a
  `13em` floor on `.mat-column-email`.
- *The `fill()` trap.* The search input is bound to `(keyup)`, and Playwright's `fill()` dispatches
  only `input` — the spec would have set the box and never run the filter, failing in CI in a way
  that looks like an app bug. The case types with `pressSequentially()`.

**e2e coverage added** (`workshops/workshop-dashboard.spec.ts`): WS-41 Email column position +
rendered address, WS-42 the three parked columns are absent while the kept ones survive (with a
cell-count check that catches a `displayedColumns`/`matColumnDef` mismatch), WS-43 search matches on
email (with the name first stamped distinct, because the CF normally makes name == email), WS-44 the
tag is a text element with a painted background and no `new.png`. Helpers in `workshops/support/wshop.ts`.

`wd-review-assignment-38` went with the Assignment column, so two hub references were parked:
`new-workshop-controls.spec.ts`'s registration line, and WDA-02's Review check — the latter would
still pass but vacuously, since the button is now absent for everyone.

Verified: `ng build` clean (exit 0, only pre-existing warnings) · `playwright test --list` parses all
20 files · readiness gate re-run, `wd-review-assignment-38` absent from the missing-selector list
(the 35 that remain are `bap-*`/`cman-*`/`mcoh-*` from other branches).

## Pending

- **starlabs-angular is uncommitted** — three source files, this file and the journal. The operator
  pushes this repo manually.
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
