# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-20 (Audio Library download button)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-20-audio-download-button.md`.

## Current state
- Branch `production` (HEAD `871ccc3c`). UNCOMMITTED: the download
  feature (3 files in `src/app/content/audio-dashboard/`) + the
  operator's own staged edit to `ah-notification.component.html`.
  Operator commits manually — standing directive. NOT pushed.
- `/audiodashboard` rows now have Download → Edit → Delete actions.
  Download streams the storage file with a live %, saves it locally
  with a clean filename, and falls back to opening the URL on failure.

## Last session changes (2026-08-20)
- Added per-row audio download: fetch → streamed blob → object-URL
  anchor. WHY blob: the `download` attribute is ignored cross-origin
  and Firebase serves inline. CORS proven by the existing fetch in
  `prescribe-atc.component.ts:1157`; COEP `require-corp` is scoped to
  Zoom routes only, so this route is clear.
- New scoped `audio-dashboard.component.css` (col-act 124px for three
  buttons, a-down styles) so shared `content-upload-shared.css` stays
  untouched for the other dashboards.
- graphify rebuild skipped — no `graphify-out/` or python package on
  this machine.

## Pending
- Confirm `ng build --configuration production` result (running at
  session end); operator to review, commit, and deploy when ready.
- Carried from 2026-08-19 (`nanda-development`, status unknown on this
  branch): eiflix register backfill, `/eiflixoperationsdashboard`
  route guard, backfill script `__proto__` exposure — see that journal.
