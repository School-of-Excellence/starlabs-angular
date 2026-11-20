# 2026-11-18 — Zoom recordings filed by participant (zoom-dropbox-migration)

**Repo changed:** `~/Projects/AngularProjects/zoom-dropbox-migration` only (branch `feature/participant-folders`, uncommitted). starlabs-angular and Cloud Functions untouched.
**Spec:** operator doc "Dropbox Recording Folder Structure & Automation Requirements" (17 Nov 2026), adjusted in conversation. Approved plan: `~/.claude/plans/2026-11-17-zoom-recordings-by-participant.md`.

## What landed (new recordings only)
```
/GoogleToDropbox/Participant Zoom Recordings/<Name> (<profileid>)/
  Scope Enhancement/<DD Mon YYYY> - <queuename>
  <Queue product> - <initiated>/<Stage> NN - <date>
  <DFU product> - <initiated>/<Appt type> NN - <date> - <Specialists>
  <Appt type> NN - <date> - <Specialists>                (no product)
```
Everything else → unchanged `/GoogleToDropbox/ZoomRecording/Zoom <YYYY> Backup/...`. File names = Zoom's, unchanged.

## Why each constraint
- **Appointments matched by personal-room id + time.** Prod: appointments never get their own meeting (0 `zoomdata` since Feb 2026; `appointmentLinkRegenarate` not deployed). `appointments.zoomid` = the specialist's PMI (17 distinct ids over 274 appts/30d), so time picks the appointment (±15 min; wider windows only add ties). No zoomid → specialist via `EISzoomcontact`/`profile_data` email (1 doc).
- **Queue slot bookings excluded from appointment matching** (`queuetokenref`): they run in the studio and match the live assignment.
- **"Scope Enhancement" exact stage only;** "Scope Enhancement Changework" is a normal queue stage (operator).
- **NN = session order from Firestore**, not arrival order — deterministic on re-runs; recordings of one session share a folder; gaps possible.
- **No new Firestore collection** (operator): profile id in the folder name is the key; folder found by listing the root.
- **Rename at next recording + nightly** (Cloud Scheduler 02:30 IST → `/tasks/rename-participant-folders`); skipped while another upload for that participant runs (moving under it breaks the upload). After a rename, that participant's backup docs (`dropboxFolderPath`, `files.*.dropboxPath`) are re-pointed so Verify / open-in-Dropbox keep working.
- **Existing backups keep their folder** (top-up/repair reuses `previous.dropboxFolderPath`, re-pointed if renamed) → old recordings never move.
- **Lookup failure ⇒ date folder + Slack alert**, never a lost backup.
- **Reads:** single docs / `limit 1` lookups only; never all of `profile_data`.
- **IST dates** for the new folders only; the date structure keeps its old (server-UTC) dates so "same structure" holds.

## Found / surprised
- `manualbackup.js` requires a missing `src/config` — can't run; left untouched (old-recording backfill, out of scope).
- `verifyTask` audience was hard-coded to `/tasks/process-recording`; now `SERVICE_URL + req.path` (same value for that route).
- Reliability suite needs `JAVA_HOME=/opt/homebrew/opt/openjdk@21` (default JAVA_HOME is 17 → "emulator did not start").
- Running `test:e2e` rewrites the tracked `e2e/evidence/*` files.

## Verification
`npm run test:e2e` ✅ · `npm run test:routing` (new, 27 checks) ✅ · `npm run test:reliability` (emulator) ✅ · read-only prod preview `scripts/preview-routing.js --days 3`: 38/66 recordings → participant folders (14 SE, 21 DFU, 3 no-product), 28 → date folders; no query/index errors.

## Revert
Branch `feature/participant-folders` holds all of it. Deployed? — NO (pending operator). To roll back after a deploy: redeploy the previous revision; delete Cloud Scheduler job `zoom-participant-folder-renames`. Recordings already filed under the new root stay valid (backup docs point at them).

## Pending
Operator approval to commit → deploy (`deploy-with-secrets.sh`, prod `fir-sample-aae4a`) → watch first day. Old recordings: separate plan later.
