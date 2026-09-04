# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-09-04 (popup banner editor + enrollment diagnostics; workshopconfig v2 complete)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-09-04-eiflix-popup-banner.md` and
`specs/journals/2026-09-04-workshop-enroll-diagnostics.md` (newest) and
`specs/journals/2026-09-02-workshopconfig-v2-enrollment-design.md` (the full v2 story,
newest section at the bottom). ⚠️ `/specs` is gitignored (`.gitignore:8`) — the
journal and the HTML mockups exist only on this machine.

## Current state
- Branch `nanda-development`. **UNCOMMITTED** working tree: the whole
  `src/app/New-Workshop/workshop-configurationv2/` tree, `app.routes.ts` (v2 on
  `/workshopconfig/:id`, legacy untouched on `/workshopconfigold/:id`), the
  `/workshops` list (New Workshop → fresh id, guarded Duplicate, Type badge reads
  `workshoptype`), `/create-workshop` (type select removed), plus the older
  contentanalytics "New users only" filter. Operator commits manually — standing
  directive. NOT pushed, NOT deployed.
- v2 editor: Enrollment, Challenges and Settings tabs built to the approved
  HTML/CSS mockups; same `detailpage` / `challenges` / 53 root Settings fields as
  the legacy editor. Only deliberate data change: new mandatory root field
  **`workshoptype`** (`liveworkshop` | `evergreenworkshop` | `cpworkshop`), which
  the operator has declared the main driver for all workshop creation from now on.
- Dev + production builds green. **Runtime never verified behind login.**

## Last session changes (2026-09-03/04)
- **EiFlix popup banner editor**: a Popup Banner button on `/workshops` (before
  New Users) opens a dialog editing the single document
  `classify/eiflixpopupbanner` — six rich-text fields, a plain button-1 link, no
  button-2 link, three Storage uploads into `desktop`/`tablet`/`mobile`, and a
  boolean `enable`. Nothing is required. Reuses the workshop-configuration rich
  text via `@import wc2-shared.css`; that import also dragged in a page-level
  `min-height: 100vh` that had to be neutralised for a dialog. Review found 5
  confirmed issues, all fixed — four were state changing mid-flight (dirty flag
  cleared after an await, upload races, trapped during save, double-open).
- **Enrollment diagnostics** on `/workshop_dashboard/:id`: a Diagnose button beside
  Q&A opens a dialog (profileid + new/existing radio + Check) that replays every
  EiFlix enroll gate for that user against THIS workshop and explains the outcome
  in plain English. Ports the Flutter gates read-only from the `workshop` project
  (never written to). Where queries throughout, scoped by `workshopref`. Two
  things the extraction changed: new-vs-existing is **derived** by the app from
  three documents, not asked, so the radio is treated as intent and a mismatch is
  flagged; and the registration-window / challenges-assigned checks in the write
  path were missing from the first cut and are now Layer 3. The input takes a
  profileid **or an email** (regex-detected, resolved via `where('email','==')`
  on the three profile collections, lowercase then original case); one email
  matching several profiles shows a picker rather than guessing. A 118-agent
  extraction of the Flutter rules confirmed the port and added a profileid
  integrity check (the app uses the `profileid` FIELD as a document id, so a
  field/id mismatch breaks every downstream lookup). See the journal.
- **Settings › Messages now shows the two "enrollment not allowed" textareas**
  (`enrollmentnotallowedmessage`, `enrollmentnotallowedmessagenew`). No data
  change: both root fields were already in the form, patch and payload, but only
  rendered inside the Referral Workshop expand (hidden unless Referral is on), as
  in the legacy editor. Moved rather than duplicated, so one edit marks one
  section dirty; the Referral block keeps a pointer to where they went. Operator
  rule confirmed: **never surface internal field names in the UI.**
- **UI bug (operator screenshot): header type badge full width.** Root cause is
  global, not v2: `angular.json` loads Bootstrap 5 for every page and its grid rule
  `.row > * { width: 100% }` matched the v2 class `row` (header buttons stacked
  too). Reproduced in a harness with the real stylesheets. Fix: v2 class `row` →
  `hrow`; component-scoped resets for the other 7 colliding Bootstrap classes
  (`btn*`, `badge`, `card`, `placeholder`, incl. `--bs-btn-*` vars so pressed/
  focused buttons stay navy). A 4-lens multi-agent sweep of all six global
  stylesheets then found 8 more leaks (Material `.mat-typography` line-height /
  h2 Roboto on section titles, editor links/headings, card text colour, missing
  focus ring on primary buttons) — all fixed in `wc2-shared.css`. Builds green.
- **`workshoptype` promoted to the top**: highlighted card with a segmented picker
  opens the Enrollment tab, a type badge sits next to the title on every tab, rail
  item first under Basics; the dropdown in Workshop information is gone. Red cue
  now also shows on existing documents that have no type.
- **New-workshop flow reviewed (12 confirmed findings, all fixed)**: offline cache
  miss no longer enters new mode (server confirmed via `getDocFromServer`, else the
  load-error card) — previously a save could `setDoc` over a real workshop; Discard
  on a new workshop now resets the form; **only the Enrollment save creates the
  document** (Challenges/Settings block with "Save the Enrollment page first" while
  new); list Duplicate guarded; list Type badge reads `workshoptype`.
- Deliberately kept `detailpage.type` defaulting to `workshop` on patch (operator
  directive) although the review flagged it as a value change for empty legacy types.
- Earlier in the session: Settings tab built + reviewed (15 findings fixed),
  Challenges tab built + reviewed (20 fixed), Enrollment fixes after operator
  review, `/create-workshop` bypassed. All WHY in the journal.

## Pending
- **Operator runtime pass of the popup banner** — never run: save once with
  everything blank, upload all three images, reopen to confirm they round-trip,
  toggle `enable`. Also confirm the artwork sizes are right: desktop is portrait
  (1356×1467) while tablet and mobile are landscape, which is unusual.
- **Operator runtime pass of the Diagnose dialog** — it has never run: check one
  known-refused profile and one enrolled profile on a real workshop, and confirm
  the derived new/existing verdict matches reality.
- **Operator runtime pass**: type into both new Messages textareas, save and
  reload to confirm they round-trip; header badge + buttons side by side, section-head
  heights, tab strip, a link in a description editor, Tab-focus on Save (the
  global-CSS fixes); all three tabs on an existing workshop; the
  new-workshop flow (New Workshop → pick type → save Enrollment → Challenges →
  Settings); Discard and leave-guard on a new workshop; `/workshops` Type badge and
  Duplicate; reload of an existing workshop while offline. Then manual commit.
- Decide D1: keep the legacy evergreen quirk (disabled children dropped from
  `evergreenWorkshopMeta`) or always write the 4-key map. v2 reproduces legacy.
- Next feature the operator hinted at: type-dependent creation (what a live /
  evergreen / CP workshop shows). Nothing designed yet — design in plain HTML/CSS
  first, get a yes, then build (standing workflow).
- Retire `/workshopconfigold` only after the operator pass. graphify not installed
  here (rebuild skipped). Carried: `/eiflixhomeconfig` + `/videodashboard` visual
  pass, eiflix consumers/backfills, episode-delete gaps.
