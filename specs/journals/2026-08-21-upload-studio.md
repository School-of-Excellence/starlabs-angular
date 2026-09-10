# 2026-08-21 — Upload Studio: /videodashboard rework

## What was done

Replaced the EiFlix episode **upload dialog** with a dedicated route and redesigned the
episodes dashboard (light premium theme). Plan: `specs/plans/2026-08-21-upload-studio.md`
(operator approved the interactive HTML mockup, then directed: white theme + **no new
Firestore fields**).

New files:
- `src/app/content/episodes-dashboard/upload-studio/upload-studio.component.{ts,html,css}`
- `src/app/content/episodes-dashboard/upload-studio/pending-uploads.guard.ts`

Changed files:
- `src/app/app.routes.ts` — `videodashboard/upload` added top-level **and** under
  `content-upload-v2` children, both `canActivate:[authGuard]` +
  `canDeactivate:[pendingUploadsGuard]`.
- `src/app/content/episodes-dashboard/episodes-dashboard.component.{ts,html,css}` —
  redesigned (stats cards, search + chip filters, thumbnail column, own scoped CSS).

## Decisions and WHY

- **Route instead of dialog** because the operator lost uploads to accidental dialog
  closes. Protection is three-layered: `canDeactivate` guard (ConfirmComponent asks
  "Abort & leave / Keep uploading"), `window:beforeunload` while uploads are pending,
  and a visible lock banner + lock badge on the back button.
- **Parallelism = 3 concurrent episode jobs** (`MAX_PARALLEL_JOBS`), the rest auto-queue
  (`fillSlots()`); within a job, video + thumbnail + screenshot + SRT upload
  concurrently — same as the old dialog. Rationale: parallel streams keep the uplink
  utilized without starving any single transfer; total throughput is still bounded by
  the operator's network (told the operator this honestly).
- **Telemetry without new fields**: speed is measured client-side from
  `bytesTransferred` deltas on a 500 ms tick, EMA-smoothed (0.7/0.3); ETA =
  remaining bytes / live speed (per job and aggregate); aggregate speed drawn as a
  canvas sparkline. Nothing persisted.
- **Firestore doc shape is byte-for-byte the legacy set**: `id, title, reftitle,
  videoUrl, imageUrl, imagesize, videoSizeBytes, videoSize, srt, screenshot,
  description, date, tags, duration` — operator's hard constraint. `convertedtohls`
  stays backend-owned and is only *displayed*.
- **Create-only studio**: no `deleteObject` replace logic (that only matters for
  edits). **Edit and Delete keep the old dialogs** — operator only objected to the
  add-new dialog.
- **Duration auto-detect at file pick** (object URL + video metadata) instead of the
  legacy post-upload detection — fills the field before upload even starts; still
  manually editable.
- **Metadata editable during upload**: the Firestore save happens at job completion and
  reads the fields at that moment. Title is required before Start (the only
  validation); everything else may stay null exactly like the legacy dialog allowed.
- **Fonts/palette**: only already-loaded families (Outfit / DM Sans / DM Mono) and the
  app's indigo `#5a6acf` — no new global deps, shared
  `content-upload-shared.css` untouched (other dashboards still use it).

## Surprises / gotchas

- Angular's URL sanitizer rejects `blob:` URLs on `<video [src]>` → the preview would
  render `unsafe:blob:`. Fixed with `DomSanitizer.bypassSecurityTrustUrl`, cached once
  per job (`videoPreviewSafe`) — NOT a method call in the template, which would return
  a new SafeUrl every CD cycle and can re-trigger video loads (the legacy dialog does
  exactly that; worked, but not worth copying).
- `MatTableDataSource` skips `filterPredicate` entirely when `filter === ''` — chip
  filters must feed a composite non-empty key (`refreshFilter()`).
- Firebase task callbacks can fire outside the Angular zone → all state mutations are
  wrapped in `zone.run`; the 500 ms telemetry tick also runs through `zone.run`.
- The **reconvertEpisodesHLS** dead code (commented-out UI + `reconvertSelected()`,
  HttpClient) was removed from the dashboard in the rewrite — recoverable from git
  history if the reconvert feature returns.
- graphify: not installed on this machine (`ModuleNotFoundError`), rebuild skipped —
  same as 2026-08-20 session.

## Verification

- `ng build --configuration production` passes (twice; remaining warnings are
  pre-existing: canvg/leaflet CommonJS, bootstrap selectors,
  journey-onboarding-detail CSS nesting).
- Visual pass behind login is NOT done — routes are authGuarded against production
  Firebase and no test session was available. Operator should sanity-check
  `/videodashboard` and `/videodashboard/upload` after login before deploying.

## Round 2 (same day) — Edit moved into the studio

Operator: Edit still opened the old dialog; wanted it route-based too. Done:

- Dashboard Edit now navigates to `/videodashboard/upload?edit=<id>`
  (`openEditInStudio`); `UploadEpisodeDialogComponent` is no longer referenced
  anywhere (file kept for git history / manual removal).
- Studio reads the `edit` query param, `getDoc`s the episode, and creates a
  prefilled job with `editMode` + `sourceDoc`. WHY re-fetch instead of passing the
  row: survives refreshes/deep links and always edits fresh data.
- Save semantics: only newly picked files upload; unreplaced values carry over from
  `sourceDoc`; original `date` preserved; **metadata-only edits save instantly**
  (Start button relabels to "Save changes"). After a successful save,
  `cleanupReplaced()` deletes replaced/removed old Storage objects (delete AFTER
  `setDoc`, unlike the legacy dialog which deleted before — safer if the save fails).
- Replace video via a dashed "Replace video" chip; existing SRT removable via an ×
  on its chip (`srtRemoved`); existing thumbnail/screenshot/video previews shown
  from their https URLs (no sanitizer issue — only blob: needs bypass).
- Same document field set as ever — no new fields.
- `ng build --configuration production` passes.

## Pending

- Operator visual check + a real multi-file upload test AND an edit test
  (metadata-only + file-replace) behind login.
- Operator commits manually (standing directive) — nothing committed this session.
- **Correction (found while documenting /workshopconfig):** `upload-episode-dialog/`
  is NOT dead code — `WorkshopConfigurationComponent` still opens it via its
  "Upload Zoom Call" button (`openUploadDialog()`, workshop-configuration.component.ts
  ~line 3088). Do NOT delete the dialog component.
- Cleanup candidates:
  delete-SRT gap in `AddEpisodeComponent.onDelete` (SRT never removed from Storage —
  pre-existing, task chip raised); delete-dialog Cancel button has no click handler
  (pre-existing).
