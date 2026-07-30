# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-30 (npm ERESOLVE fix: dead react/redux deps removed)_ · **New session? Read `specs/ORIENTATION.md` first**, then today's journal `specs/journals/2026-07-30-npm-peer-conflict-react-removal.md`.

## Current state
- **Plain `npm install` (no flags) and `ng build --configuration production`
  are both green** on branch `nanda-development`. The lockfile was regenerated;
  Zoom's peer subtree (react 18.2.0, react-dom 18.2.0, redux 4.2.1,
  react-redux 8.1.2, redux-thunk 2.4.2, lodash 4.18.1) is npm-auto-installed,
  **not** declared in package.json — see the journal's constraint note.
- live-event-dashboard-v3 panel-filter work from 2026-07-28 unchanged
  (see that day's journal); push remains operator-gated.
- **Everything from today is UNCOMMITTED by operator instruction** ("I'll
  commit manually"): `package.json`, `package-lock.json`, today's journal,
  this file, plus a pre-session edit to
  `src/app/Events/locationlog/map-picker.component.ts` that is the operator's
  own work.

## Last session changes (2026-07-30) — why
- `npm install` ERESOLVE'd: commit `65e0e36` (2026-07-30, Charan Reddy) had
  added react ^19.2.8 / react-dom ^19.2.8 / redux ^5 / redux-thunk ^3 as
  direct deps though **nothing in src/ imports them**, and every
  @zoom/meetingsdk 6.x exact-pins react@18.2.0 (+ redux 4.2.1 etc.) — React 19
  can never coexist with Zoom under strict npm. Removed the four dead entries,
  restoring the pre-`65e0e36` baseline where npm satisfies Zoom's peers
  automatically. Verified: dry-run + real install + prod build, all flag-free;
  full 73-package peer sweep shows no other conflict.
- Found in passing (not fixed): dead `@ai-coustics/aic-sdk` asset rule in
  angular.json (ships empty `/assets/aic/`), accidental `common` dep,
  `@types/*` hygiene — task chip spawned; 58 npm audit vulns pre-existing.

## Pending / next
- **Operator: review & commit** today's dependency fix (and push when ready —
  CI runs plain `npm install`, so the fix must land before any fresh CI run).
- Heads-up for Charan Reddy: their `65e0e36` react/redux additions were
  removed as unused; coordinate if they had a planned use.
- Deferred items from 2026-07-28 journal (live cell count vs panel grouping,
  ATC-prescribed universe on live beneficiary cell, listener consolidation).
