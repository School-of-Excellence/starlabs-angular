# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-30 end of day (npm fix · perf audit + H1/H3 · 24-round dashboard arc)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-07-30-proc-tracking-totals-panel.md` (the whole day — per-round WHYs, a "Day wrap" index after round 18, rounds 19-24 after it) and `specs/2026-07-30-perf-audit-live-event-dashboard-v3.md`.

## Current state
- Branch `nanda-development`. Plain `npm install` (no flags) and
  `ng build --configuration production` both green.
- **Committed & pushed**: morning npm ERESOLVE fix (dead react/redux deps
  removed — never re-add them; Zoom auto-installs its exact-pinned peers).
- **UNCOMMITTED** (operator commits manually after Chrome testing): the entire
  live-event-dashboard-v3 day, rounds 1-24 — totals panels/badges/sorts,
  participant popup → RICH card (880px, stat tiles, full changework history
  list, cohort badges), changework popup (680px, per-doc cards + REST
  updateTime "Last update", stacked Adjustment), camera/row click split, D/B
  chips, live timers, lead-only search, panel stats block ("No. of
  changeworks / unique beneficiaries / unique doers"), header: table-head
  DONE pills (UNIQUE people) + blue/green/red totals tags (tooltips with %,
  click → all-procedures panels with per-procedure badge breakdowns) +
  day-based COMPLETED chip with docs panel, zero-opportunity rows hidden,
  Participant Data: ADJ % rename + Proc % column + PROC % filter. Perf fixes
  H3 (zero profile_data reads) and H1 (parallel init, fail-soft).
  Files: dashboard component (ts/html/css), live-event-data.service.ts,
  profile-picture.component.ts (additive), journals, perf report, this file,
  operator's own map-picker edit.

## Last session changes (2026-07-30) — why
Full round-by-round WHYs in the day journal. Discipline held throughout:
every round production-build-verified; 3 adversarial workflows + 3 single
verifiers; 1 real bug found & fixed (popup-backdrop double-click
fall-through); counts semantics documented (COMPLETED counts DOCS, DONE
pills count unique gated PEOPLE — legitimately differ).

## Pending / next
- **Operator: Chrome pass over the day, then commit manually.**
- Perf audit remaining: **H2** (scope the unbounded participant-metadata scan
  — biggest win; needs out-of-universe name fallback for caller/assignee/
  staff/unregistered), **H4** (bound temporary_ATC by lastupdated), Phase 2
  (changed$ coalescing, Set membership, memoization), Phase 3 (limits,
  loading skeleton, trackBy, subscription hygiene).
- Offered, not built: DONE-pill tooltips with doc counts ("150 doers · 199
  changeworks").
- Cleanup chip (@ai-coustics rule, `common` dep, @types hygiene); 58 npm
  audit vulns; livechangework listener consolidation (= perf M1); dropped
  debug of /livechangework/blkWuqSNB2XNco10GSDI (checklist in journal
  round 12).
