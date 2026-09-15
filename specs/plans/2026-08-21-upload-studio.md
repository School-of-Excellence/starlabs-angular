# Upload Studio — /videodashboard rework (approved 2026-08-21)

**Operator approval:** UI mockup approved with two amendments — (1) white/light theme, not dark; (2) **strictly no new fields in the `episodes` collection documents**. "Start developing."

## Scope

1. **Replace the "Upload New Episode" dialog with a route-based screen** (`/videodashboard/upload`, also reachable as `/content-upload-v2/videodashboard/upload`) so an accidental dialog-close can never kill an upload. The **Edit** and **Delete** dialogs stay unchanged.
2. **Parallel uploads**: multiple videos staged at once; up to 3 episode jobs upload simultaneously, the rest auto-queue and start when a slot frees. Within a job, video + thumbnail + screenshot + SRT upload concurrently (same as today's dialog).
3. **Live telemetry**: per-job and aggregate network speed (EMA-smoothed from real `bytesTransferred` deltas), remaining-time estimate computed from live speed, transferred/total bytes, sparkline of aggregate speed.
4. **Upload protection**: `canDeactivate` route guard (ConfirmComponent) + `window:beforeunload` while any upload is active. Pause/resume/cancel per job (Firebase `UploadTask.pause()/resume()/cancel()`), retry restarts failed files.
5. **Episodes dashboard redesign** (light premium): stats cards (count, library size, HLS %, SRT %) computed client-side from existing docs; search + filter chips (All / HLS pending / Missing SRT); thumbnail column from existing `imageUrl`; own component CSS.

## Hard constraints

- **Firestore `episodes` docs keep the exact current field set**: `id, title, reftitle, videoUrl, imageUrl, imagesize, videoSizeBytes, videoSize, srt, screenshot, description, date, tags, duration`. No additions, no renames. `convertedtohls` remains backend-owned — untouched.
- Storage paths unchanged: `eiflix_episodes/`, `eiflix_images/`, `eiflix_srt/` with `${Date.now()}_${filename}`.
- `atc taxonomy` stays read-only reference data for tags.
- Fonts: only the already-loaded families (Outfit, DM Sans, DM Mono) — no new global deps.
- Honest speed claims: throughput is bounded by the operator's uplink; gains come from parallel slot utilization, SDK auto-retry on transient drops, and visibility (speed/ETA) — not magic.

## Deliverables

- `src/app/content/episodes-dashboard/upload-studio/upload-studio.component.{ts,html,css}`
- `src/app/content/episodes-dashboard/upload-studio/pending-uploads.guard.ts`
- Route entries in `src/app/app.routes.ts` (top-level + content-upload-v2 child)
- Redesigned `episodes-dashboard.component.{ts,html,css}`
- Journal entry + PROGRESS.md update. Commits left to the operator (manual-commit directive).
