# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-20 (campaign dashboard: New Campaign create flow)_
· **New session? Read `specs/ORIENTATION.md` first**, then journals
`2026-08-18-eiflix-operations-dashboard.md` and
`2026-08-20-campaign-dashboard.md`.

## Current state
- Branch `nanda-development`, uncommitted working tree (operator commits
  manually — standing directive). Production build green. Not pushed.
- `/eiflixoperationsdashboard` feature-complete (see 2026-08-18/19
  journals): Users / Engagement / Hot Leads / Non-Active / Device
  Breakdown cards, shared side panel with search-filter-sort-export,
  `eiflixdailywatchers` register spine.
- NEW `/campaigndashboard` (unguarded, like siblings): header + **New
  Campaign** button → `NewCampaignDialogComponent` saving to Firestore
  `eiflixcampaign`. All field names lowercase (`campaignname`,
  `startdate`, `enddate`, `segment` = `newusertags` doc id,
  `expectedsalevalue`, `achievedsalesvalue`, `numberofsales`,
  `channels[]`, `manualnotes[]`, `campaignassets[{type,name,url}]`,
  `created`/`updated` serverTimestamp). Light-theme UI matching the
  operator's reference screenshot (gradient Create button, chip notes,
  asset rows).

## Last session changes (2026-08-20)
- Built campaigndashboard + new-campaign-dialog from the empty CLI stub;
  operator approved the data structure with a lowercase-field rename and
  `created`/`updated` naming.
- Fixed `app.routes.ts` collision: campaigndashboard route had duplicated
  path `eiflixoperationsdashboard` (unreachable) → now `campaigndashboard`.
- Verified in browser on port 4300 (`.claude/launch.json` added; ng serve
  ignores PORT env var, wrapped with `sh -c`). Segment select confirmed
  loading live `newusertags`. No test save — production Firebase.
- Round 2: dialog widened to 950px; Start/End/Segment share one 3-col
  row, asset entry is one row (Type | name | URL | + Add); stacks below
  700px viewports.

## Pending
- Campaign list/cards on `/campaigndashboard` (create flow only so far).
- Route guards for `/campaigndashboard`, `/eiflixoperationsdashboard`,
  `/newusersprofile` (Firestore `dashboard` route-config entries FIRST).
- Operator: run `node backfillEiflixDailyWatchers.js` (v2) for 90-day
  register backfill; script's `__proto__` exposure still open (hands-off).
