# 2026-08-21 — /videodashboard rework: "Upload Studio" (analysis + UI mockup, awaiting approval)

## What was done
1. **Full code-flow analysis of `/videodashboard`** (read-only, per operator request):
   - Route (declared twice: top-level and under `/content-upload-v2`) lazy-loads
     `EpisodesDashboardComponent` (`src/app/content/episodes-dashboard/`), guarded by `authGuard`.
   - Table = realtime `collectionSnapshots` on `episodes` ordered by `date desc`;
     tags map from `atc taxonomy` (reference-only, safe).
   - Upload/Edit = `UploadEpisodeDialogComponent` (MatDialog); Delete confirm =
     `AddEpisodeComponent` in `delete` mode.
   - Storage paths: `eiflix_episodes/`, `eiflix_images/`, `eiflix_srt/`.
     Doc write: `setDoc(episodes/<id>, {...}, {merge:true})`.
   - Findings noted in passing: delete flow never removes the SRT object; the
     delete dialog's Cancel button has no click handler; `convertedtohls` is set
     by backend processing OUTSIDE this repo (operator confirmed: leave alone).

2. **Operator redesign directive** (verbatim intent):
   - No dialog for "add new" — accidental close kills uploads → **route-based screen**.
   - Multiple videos uploading **simultaneously** (not one after another).
   - Show **network speed**, **remaining time (ETA)** computed from live speed.
   - **Block closing/navigation while uploading.**
   - World-class premium UI/UX; rework CSS for this component.
   - `convertedtohls`: do nothing.
   - **"Show the UI only 1st and ill confirm once its ok to develop."**

3. **Interactive UI mockup built and delivered** (no app code touched):
   - File: scratchpad `eiflix-upload-studio-mockup.html`, served at
     `http://localhost:8787/eiflix-upload-studio-mockup.html`
     (added a git-ignored `mockup-preview` entry to `.claude/launch.json`).
   - Two views: redesigned **Episodes Library** (stat cards, search/filter chips,
     thumbnail table) and **Upload Studio** (`/videodashboard/upload` concept).
   - Live simulation verified in the preview pane: 3 parallel uploads + auto-queue
     (slot limit), mission-control bar (progress ring, live MB/s + sparkline,
     ETA from live speed, transferred), per-file telemetry with pause/cancel,
     simulated mid-upload failure demonstrating resumable recovery, lock banner,
     and a navigation-guard modal that blocks leaving during uploads.
   - Aesthetic: dark cinematic studio, Bricolage Grotesque / Schibsted Grotesk /
     Spline Sans Mono, indigo brand accent evolved from `--primary: #5a6acf`.

## Why these design decisions
- **Route + canDeactivate guard + beforeunload** is the only reliable
  accidental-close protection; a modal can always be dismissed by misclick.
- **Parallel slots (~3)** rather than unlimited: concurrent
  `uploadBytesResumable` streams share bandwidth; 3 slots keeps the pipe
  saturated without starving any single stream.
- **Speed/ETA honesty:** speed must be measured from `bytesTransferred` deltas
  (EMA-smoothed); ETA = remaining bytes ÷ aggregate live speed. Told operator
  plainly that total throughput is capped by their uplink — the real wins are
  utilization (parallelism), resumability (no restart-from-zero), and
  transparency (visible speed/ETA).

## Surprises
- The preview pane renders scratchpad (outside-project) files as static
  snapshots without tool access — had to serve over `python3 -m http.server`
  via launch.json to drive/verify the interactive simulation.
- Python 3.9's `http.server --directory` still calls `os.getcwd()` at startup
  and died with `PermissionError` under the sandboxed cwd; fixed by `sh -c "cd … && python3 -m http.server"`.

## Pending
- **Operator has NOT yet approved the mockup** — no implementation may start
  until they confirm ("show the UI only 1st"). Open questions put to them:
  dark vs light theme, layout/metric tweaks.
- Draft implementation plan written to `~/.claude/plans/2026-08-21-upload-studio.md`
  (stays a draft until approval; then move to `specs/plans/`).
- Out-of-scope bugs to consider spinning off later: SRT object not deleted on
  episode delete; delete-dialog Cancel button dead.
