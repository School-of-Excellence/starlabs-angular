# 2026-06-22 — Zoom Meeting SDK 3.13.2 → 6.1.0 upgrade + recording-prompt false-alarm fix

Branch: `zoom-sdk-update` (off `development`). **Uncommitted** at time of writing — operator review pending.

## What & why

### 1. Zoom Meeting SDK bump 3.13.2 → 6.1.0 (SELF-HOSTED)
- Operator wants the latest stable Meeting SDK in the **zoom-clientview** screen.
- **Key finding (researched):** the Meeting SDK *Client View* (`ZoomMtg`) has **no programmatic noise-suppression API in any version** — it's on by default ("Auto") and user-toggleable in Zoom's own in-meeting Audio settings UI. Programmatic `enableBackgroundNoiseSuppression()` exists **only in the Video SDK** (`@zoom/videosdk`), which would require a full custom-UI rewrite. So 6.x gives no extra noise-cancellation over 3.x; operator still chose the latest engine.
- **CDN dead-end (load-bearing):** Zoom's public CDN `source.zoom.us` **stopped publishing the Client View `/ui` bundle for every version ≥ 4.0.0** (probed: `3.13.2 ui=200`, `4.0.0…6.1.0 ui=403`; `/lib` is still 200 for all). So 6.1.0 over the CDN 403s on the UI chunks (WASM loads, UI doesn't). **The only way to run 4.x+ Client View is to self-host the SDK's `dist/`.**
- **Self-host implementation:** added an `angular.json` build-asset glob `node_modules/@zoom/meetingsdk/dist` → output `/zoom/` (mirrors the existing `@ai-coustics` glob). All 3 components now call `ZoomMtg.setZoomJSLib(`${window.location.origin}/zoom/lib`, '/av')` — same-origin, so cross-origin isolation is even cleaner. `/ui` loads as a sibling of `/lib` under `/zoom/`.
- **Why all 3 components moved, not just clientview:** `@zoom/meetingsdk` is a **single shared npm dep** (`import { ZoomMtg }` in all 3). Bumping the package to 6.1.0 forces the runtime wrapper to 6.x everywhere, so all 3 `setZoomJSLib` calls had to move to the self-host path in lockstep. `zoom-meeting` + `appointment-zoom-view` got **no logic change** — only the lib-path string.
- 4.0.0 deprecated passing `sdkKey` inside `join()` (all 3 still pass it). Deprecated ≠ removed — confirmed at runtime the SDK only warns ("you can remove sdkKey from join params since v4.0.0") and still joins. Left as-is.
- **Verified live (specialist, Browser 1, ng serve):** self-hosted assets serve 200 (`/zoom/lib/av/*.wasm`, `/zoom/ui/*.css|*.js`); client view loaded 6.1.0 with **no 403 and no chunk errors** — console showed `pre load wasm success: …/zoom/lib/av/audio.simd.wasm`, lang loaded from `/zoom/lib/lang`, and the v4.0.0 sdkKey deprecation warning (proves 6.1.0 running). The only stop was a reused meeting's **expired JWT signature** (stale link, orthogonal to the upgrade) — a fresh launch generates a fresh signature. `ng build` green.

### 2. Recording-prompt false alarm (host-only overlay in zoom-clientview)
- **Bug:** the "Recording is not running / paused" overlay appeared **even while recording was ON**.
- **Root cause:** `evaluateRecordingPrompt()` treated `recordingStatus === 'unknown'` as "off" after an 8s grace (`RECORDING_GRACE_MS`). Several Zoom SDK builds never emit the initial `'Recording'`/started event when recording is already running, so status stayed `'unknown'` → grace expired → host nagged while recording.
- **Fix:** prompt only on a **positive off-signal** — explicit `'paused'` or `'stopped'`. Removed the `unknown`-as-off branch and the now-dead `RECORDING_GRACE_MS` + `recordingListenersWiredAt` fields.
- **Behavioral trade-off:** if recording was *never started* AND the SDK stays silent, the host is no longer auto-nagged to start it. This matches operator's stated intent ("notify when stopped or paused"). The manual `confirmRecordingOn()` escape-hatch button is now redundant but left in place (harmless safety net).

### 3. Capture-clip chip UI (zoom-clientview, host-only slider)
- Operator feedback after live 6.1.0 test: chips overlapped the video tiles, never cleared mid-call, and aren't playable.
- **Clarified behaviour:** each chip is a *still screenshot* (html2canvas PNG), NOT a video — only the clip *timing* is saved to Firestore (`cliptimings`) for later cut from the cloud recording. So nothing to "play."
- **Changes:** moved `.slider-container` from bottom-left → **top-left** (`top:60px`), and shrank it from `width:900px` → `116px` (the old 900px transparent overlay was intercepting clicks over the Zoom UI). Added **auto-remove: each chip disappears 10s after capture** (`CLIP_CHIP_TTL_MS`, tracked in `clipChipTimers`, cleared in `clearScreenshots()`/teardown). Previously chips only cleared on `ngOnDestroy`.
- **Noise suppression note:** confirmed in a live 6.1.0 call that "Background noise suppression" is ON by default (Zoom's audio menu, ✓). Still NO programmatic toggle in Client View — operator's "auto-enable by default" is already satisfied by Zoom's default; no code added.

## Files touched
- `package.json` — `@zoom/meetingsdk` `^3.13.2` → `^6.1.0` (+ `package-lock.json`)
- `angular.json` — added build-asset glob: `node_modules/@zoom/meetingsdk/dist` → `/zoom/` (serves self-hosted SDK)
- `src/app/queue system/zoom-clientview/zoom-clientview.component.ts` — `setZoomJSLib` → self-host `/zoom/lib`; recording-prompt fix; dead-field cleanup
- `src/app/big/zoom-meeting/zoom-meeting.component.ts` — `setZoomJSLib` → self-host `/zoom/lib` (lockstep only)
- `src/app/Scheduling/appointment-zoom-view/appointment-zoom-view.component.ts` — `setZoomJSLib` → self-host `/zoom/lib` (lockstep only)

## DEPLOYMENT NOTE (critical for hosting)
Self-hosting works on `ng serve` because the asset glob is served by the dev server. For a **production deploy** confirm the `/zoom/**` assets land in `dist/atctranscription/` and are served by Firebase Hosting at `/zoom/...` (they should, via the build-asset glob). The `setZoomJSLib` path uses `window.location.origin`, so it follows whatever host serves the app. Same-origin assets keep COOP/COEP cross-origin isolation intact (needed for gallery + WASM).

## Per-screen revert guide
- **Whole SDK upgrade → back to working 3.13.2 (CDN):** `package.json` `^6.1.0`→`^3.13.2` + reinstall; remove the `/zoom/` glob from `angular.json`; set all 3 `setZoomJSLib` back to `'https://source.zoom.us/3.13.2/lib'`. (Must do all together — shared npm dep; mixed wrapper/lib versions break.)
- **zoom-clientview** (`openmeeting/:id/:collectiontype`): SDK path is `setZoomJSLib(`${window.location.origin}/zoom/lib`,'/av')`. Recording fix lives in `evaluateRecordingPrompt()` — to revert, restore the `unknown`-after-grace branch + `RECORDING_GRACE_MS` (8000) / `recordingListenersWiredAt` fields + assignment in `wireRecordingListeners()`.
- **Capture-clip chips** (zoom-clientview): to revert placement → `.slider-container` back to `bottom:50px; left:10px; width:900px; overflow-x:auto` in the CSS. To revert auto-remove → delete the `setTimeout` block in `updateSlider()`, the `clipChipTimers`/`CLIP_CHIP_TTL_MS` fields, and the `clipChipTimers.forEach(clearTimeout)` line in `clearScreenshots()`.
- **zoom-meeting** (`zoommeeting_bigparticipants`) / **appointment-zoom-view** (`openappointmentzoom/:id`): single-line `setZoomJSLib` each (revert only with the whole SDK bump).
- Full revert: `git checkout development -- package.json package-lock.json angular.json` + the 3 component files, or delete branch `zoom-sdk-update`.

## Verified this session (specialist side, Browser 1)
- ✅ 6.1.0 self-host loads with **no 403 / no chunk errors** (console: wasm + lang + ui from `/zoom/…`; v4.0.0 sdkKey deprecation warning confirms 6.1.0).
- ✅ Earlier on 3.13.2: full client-view tap-through — launch/join, capture button + Tab clip (2 PNGs), recording-prompt truth table (started/unknown→hidden; paused/stopped→shown; alone/confirmed→hidden) + both overlay buttons, wait-screen, all 4 ended states.

## Pending (operator hosts & tests)
- Live **fresh** host+participant join on 6.1.0 self-host (fresh JWT signature) — confirm 2-party gallery video + audio.
- Recording prompt firing from a **real** cloud-recording stop/pause with a participant present.
- Production deploy: confirm `/zoom/**` assets served at the deployed origin.
