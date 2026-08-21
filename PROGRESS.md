# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-21 (Upload Studio)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-21-upload-studio.md`.

## Current state
- Branch `nanda-development`. UNCOMMITTED working tree: the new **Upload
  Studio** (5 new files under `src/app/content/episodes-dashboard/upload-studio/`
  + redesigned `episodes-dashboard.*` + `app.routes.ts`), plus earlier
  uncommitted work from other sessions (campaigndashboard, wccalendar,
  newusersprofile, styles.css). Operator commits manually — standing
  directive. NOT pushed, NOT deployed.
- `/videodashboard` = redesigned light-premium Episodes library (stats,
  search, chip filters, thumbnails). `/videodashboard/upload` = new
  route-based Upload Studio: multi-video parallel uploads (3 slots +
  auto-queue), live network speed + ETA + sparkline, pause/resume/cancel/
  retry, canDeactivate + beforeunload lock. Also mounted under
  `/content-upload-v2/videodashboard[/upload]`. Prod build passes.

## Last session changes (2026-08-21, Upload Studio session)
- Replaced the accidental-close-prone "Upload New Episode" **dialog** with
  the Upload Studio **route**. Round 2: **Edit** also moved into the studio
  (`/videodashboard/upload?edit=<id>` — prefilled job, replace-file support,
  metadata-only instant save, replaced files cleaned up after save); only
  Delete still uses a dialog. `upload-episode-dialog/` is now dead code.
- Episode Firestore docs keep the exact legacy field set (operator's hard
  rule — no new fields); `convertedtohls` untouched (backend-owned).
  Storage paths unchanged (`eiflix_episodes/`, `eiflix_images/`,
  `eiflix_srt/`).
- Gotchas fixed en route: blob: preview URLs need
  `bypassSecurityTrustUrl` (cached per job); MatTableDataSource ignores
  filterPredicate on empty filter string; Firebase callbacks wrapped in
  `zone.run`. Dead reconvertEpisodesHLS UI code removed (git history has
  it). WHY-details: `specs/journals/2026-08-21-upload-studio.md`.

## Pending
- **Operator visual pass + real upload test** of `/videodashboard` and
  `/videodashboard/upload` behind login (Claude verified compile only —
  no prod login available). Then commit & deploy when satisfied.
- Carried: newusertags backfill decision (11 prod docs lack `type`;
  profile/assign-tags screens list zero tags until backfilled);
  `eiflixcampaign` Firestore rules unverified; eiflix register backfill +
  `/eiflixoperationsdashboard` route guard + backfill-script `__proto__`
  exposure (2026-08-19 journal).
- Pre-existing episode-delete gaps (not touched): SRT file never deleted
  from Storage on episode delete; delete-dialog Cancel button has no
  click handler.
