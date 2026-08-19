# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-19 (EiFlix operations dashboard: full build-out)_
· **New session? Read `specs/ORIENTATION.md` first**, then the journal
`specs/journals/2026-08-18-eiflix-operations-dashboard.md` (16 rounds).

## Current state
- Branch `nanda-development`, HEAD `2eef4fd4` + large UNCOMMITTED working
  tree (operator commits manually — standing directive). Production build
  green. Not pushed/deployed.
- `/eiflixoperationsdashboard` now has: Users section (3 stat cards incl.
  Total B!G Participants w/ journey chips); Engagement (shared
  Today/7D/30D+custom filter, Total Watch Hours w/ cohort tiles + trend
  graph, Top Performing Content top-10 pager); 🔥 Hot Leads Today
  (config dialog via shared EodDialogService, expandable video rows);
  Non-Active Users (3 cards, one full-width row, cohort chip clicks,
  register-based); Device Breakdown (donut + legend, 1M/2M/3M, platform
  viewer panels). One shared side panel serves every card.
- Data spine: one realtime listener each on new_user_data + participant
  metadata; one-shot episodes + journey names; `eiflixdailywatchers`
  register (one page/day: profileids + platforms maps) written by the
  dashboard for today (+7-day heal) and backfilled 90 days by the
  operator's manual script (script dir is HANDS-OFF for Claude).

## Last session changes (2026-08-19)
- Device Breakdown + platform panels; register platforms capture;
  Non-Active restored to 3-in-a-row full width after a layout misread.
- Review-workflow fixes incl. a REPRODUCED '__proto__' prototype-pollution
  vector via client-writable platform_name/profileid (null-proto
  accumulators + reserved-name guards). The operator's backfill script
  shares this exposure — flagged, not fixed (hands-off).

## Pending
- Operator: run `node backfillEiflixDailyWatchers.js` (v2) to fill 90
  days of platforms/profileids; then Device Breakdown + Non-Active fill.
- Route still unguarded (needs Firestore `dashboard` route-config entry
  BEFORE adding authGuard); PII listed — pre-production requirement.
- Script's '__proto__' exposure — operator to patch or authorize.
