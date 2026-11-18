# 2026-11-16 — Session wrap (2026-11-12 → 11-16): workshop dashboard, Clear access, New Users, EiFlix Confirmed

One long session, compacted once and cut off once. This entry ties the topic journals together. The detail and
the "why" live in each linked journal.

## What was done
| Area | Change | Journal | Hub tests |
|---|---|---|---|
| Workshop dashboard | Total Enrolled export: Enrollment Date (with time) | `2026-11-12-total-enrolled-export-enrollment-date` | WNE-03 |
| Workshop dashboard | New / Exist filter; `movedtoexist` counts as Exist everywhere; export Tags | `2026-11-12-new-exist-and-export-tags` | WNE-01..03 |
| Workshop dashboard | Tag pills on Total Enrolled cards; Tag filter | same | WNE-04, WNE-05 |
| Workshop dashboard | Total Enrolled sort (newest enrolled first by default); tags in Participant Data | `2026-11-13-total-enrolled-sort-and-pd-tags` | WNE-06, WNE-07 |
| Workshop access | Clear only from `clearworkshop` or the workshop's tick; grants save replaces the map | `2026-11-12-clear-button-access` | WCA-01..06, WDA updates |
| New Users | Tag rename, column chooser, layout and UX pass, review fixes, operator follow-ups | `2026-11-12-new-users-screen` (+ plan) | NUS-01..11 |
| EiFlix home config | Confirmed counts the responses (same as View); stored number untouched | `2026-11-13-eiflix-confirmed-vs-responses` | UCC-01, UCC-02 |
| (read-only) | `/routeconfiguration`: who touched it recently, from git | none | none |

All hub specs are pushed (`main` through `69bd71c`), after a full workshops suite: 169 passed, 0 failed, 33
skipped. The angular changes are uncommitted; the operator commits them.

## What we found
- **The Tags dialog's manage mode was a dead end.** `toggle()` returned at once, so clicking a tag did nothing.
  Renaming is safe because every reader keys tags by id, including the EiFlix `?segment=` links. Only the
  workshop dashboard's Tag filter keys by name, which is why duplicate names are refused.
- **"Confirmed" and View counted different things.** The column showed a number stored on the widget; View
  counts response docs. Only EiFlix's Notify Me changes them, together in one transaction. A gap therefore
  means a hand edit or deleted responses; the production rules let anyone delete responses.
- **The access editor's grants save deep-merged.** `merge: true` meant a person set to None kept their stored
  actions. WDA-12 had missed it because it only ever removed the last person.
- **The New Users side panel caused the layout jump.** It appeared on the first tick and reflowed the table
  under the cursor.

## What surprised us
- **The hub-ahead guard only skips a spec file that references a hook missing from the app branch.** A
  behaviour-only change with no new hook would make older branches go red. So each change got a new hook, and
  its cases went in a separate gated file.
- **Material puts every `mat-icon` inside a button before the label** unless it is marked `iconPositionEnd`. The
  dropdown arrows had been sitting between icon and label on this screen for a long time.
- **CDK's sticky table header carries z-index 100** and painted over the selection bar until the scroll box got
  `isolation: isolate`.
- **An "enrolled, not started" person has no progress-table row**, so they can't open Participant Data.
  WNE-07's first negative control failed on that.
- WS-40 (`eiflix-home-config.spec.ts`) timed out once in a full run and passed on rerun. Watch it if it
  happens again.

## Process notes
- Never edit app source while an e2e run uses the 4201 dev server: it rebuilds on save. Edits waited for runs.
- A read-only workflow audited the New Users screen first. A second workflow reviewed the diff with two lenses,
  and a separate skeptic checked each finding: 10 confirmed and fixed, 4 refuted (most already fixed).
- The production SA key lives only in the hands-off `script` folder, so no production data was read.

## Pending
See `PROGRESS.md` → Pending. The big ones:
- the operator commits the angular files together;
- before deploying, fill `clearworkshop` in production and confirm the rules allow updating `newusertags`;
- the stored EiFlix `confirmed` repair (option 3) needs a decision.
