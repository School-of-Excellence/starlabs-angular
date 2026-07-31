# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-30 (panel-UX arc · perf audit · H1+H3 perf fixes · sharednotes)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-07-30-proc-tracking-totals-panel.md` (the whole day's arc, 5 addenda) and `specs/2026-07-30-perf-audit-live-event-dashboard-v3.md` (the performance report).

## Current state
- Branch `nanda-development`. Plain `npm install` (no flags) and
  `ng build --configuration production` both green.
- **Committed & pushed** (operator): the morning npm ERESOLVE fix (dead
  react/redux deps removed — never re-add them; Zoom auto-installs its peers).
- **UNCOMMITTED** (operator commits manually after Chrome testing): the entire
  live-event-dashboard-v3 day — panel features (totals panels + badges,
  row-click participant popup, camera avatars, dual ⇅/◷ sorts, DONE pills,
  live timers, back-to-top, popup sharednotes cards [As Doer side] + time-saved
  lines [As Beneficiary side]) AND two perf fixes from
  the audit: **H3** (zero `profile_data` reads — staff names + popup photo now
  from participant metadata; additive `[src]` input on ProfilePicture) and
  **H1** (init() waterfall → 8-task parallel batch; selector paints
  immediately; selectEvent still strictly last; journey/procedures reads now
  fail-soft). Plus journals, the perf report, this file, and the operator's
  own `map-picker.component.ts` edit.

## Last session changes (2026-07-30) — why
- Full detail in the day's journal. Highlights: the drill-down panel became the
  hub (popup, badges, sorts, timers, notes); a 25-agent read-only perf audit
  (every High/Medium finding adversarially verified) identified the load-time
  structure: serial init waterfall × unbounded platform-wide scans × CD burst.
  H1+H3 fixed same day; each change build-verified and adversarially reviewed
  (one real bug caught and fixed: popup-backdrop double-click fall-through;
  one hardening: init reads fail-soft).

## Pending / next
- **Operator Chrome pass** (checklists at the end of the journal's addenda),
  then commit manually.
- **Perf audit remaining**: H2 (scope the unbounded `participant metadata`
  scan — biggest single win; needs the out-of-universe fallback for
  caller/assignee/staff names), H4 (bound `temporary_ATC` by lastupdated),
  then Phase 2 (changed$ coalescing + Set-based membership + memoization) and
  Phase 3 (limits, skeleton, trackBy, subscription hygiene). Report has the
  ordered plan.
- Cleanup chip pending (dead @ai-coustics asset rule, `common` dep, @types
  hygiene); 58 pre-existing npm audit vulns; deferred 2026-07-28 items
  (livechangework listener consolidation — now also perf M1).
