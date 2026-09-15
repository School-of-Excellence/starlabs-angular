# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-09-15 (Interim Report Dashboard: tagging, notes, month default, calendar dots, wording)_
· **New session? Read `specs/ORIENTATION.md` first**, then the journal below.
⚠️ `/specs` is gitignored (`.gitignore:8`) — the journals and plans exist only on this machine.

Journal: `specs/journals/2026-09-11-interim-report-dashboard-tab.md` (09-11 → 09-15, with revert guide).
Plans: `specs/plans/2026-09-1{1,2,5}-interim-dashboard-*.md`.

## Current state
- Branch `dynamic-studio-update`. Last commit `6cbc736f interim dashboard` (operator). **UNCOMMITTED**: 6 files —
  the 4 `interim-report-dashboard/` files, `interim-report-log.component.html` (`[profileId]`), `src/styles.css`
  (calendar dot). NOT pushed.
- `/interimreportlog` → "Interim Report Dashboard" tab: every section reads Firestore; love letter / ask AH tags,
  resolved and notes are now **written** from the dashboard (same fields as the Love Letter / Ask A&H tabs).
- Dev server (`ng serve`, development config) = **starlabs-test**. `tsc --noEmit` green.

## Last session changes (2026-09-15)
- Operator's 7 points: "member" → "participant" everywhere; Evolution "All members" row and Love Letter
  "In progress" card removed; tag / mark resolved / notes in the lists and By participant; date default = current
  month with a dot under days that have an `interimreport log`; Evolution dialog shows the adjustments behind the %;
  four explanatory notes removed.
- E2E on starlabs-test: **21/21 pass** (evidence report + 6 screenshots sent to the operator). Writes cross-checked in
  the Love Letter / Ask A&H tabs; tags restored afterwards. Two "E2E test note" notes remain on Vignesh S's docs.
- Bug found by the E2E and fixed: note Save read a hidden duplicate textarea (same record rendered in the list and in
  By participant) → did nothing. Also fixed "1 participants".
- Gotchas: macOS has no `timeout` (a piped `tsc` silently printed nothing); `graphify` Python module is not installed,
  so the post-edit graph rebuild could not run.

## Pending
- Operator: review + approve the commit (6 files above).
- Calendar repaint uses Material internals (`_componentRef.instance._calendar`) — re-check on a Material upgrade.
- Carried: Journey / Event filter sources; Evolution on production once the new Flutter build ships; product call on
  uncapped hours/day totals; the dashboard is not live (reads once per range / tab open).
