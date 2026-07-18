# 2026-07-18 (session 4) — Call UI, A/V sync, blur, toolbar, PiP, device handling

**Repo:** Angular app only (`Starlabs - VideoConference`). All changes are **client-side**
(no Cloud Functions). Component: `src/app/LiveKit/join-livekit-call/` unless noted. Every
change verified with `ng build --configuration production` (templates compiled).

Context: after the OCI multi-provider backend work, the operator drove a long pass over the
**call experience itself** in `join-livekit-call` (now the component behind BOTH `/joinlivekit`
and `/joinroom` since session 3's redirect). Items below are roughly chronological.

---

## 1. Screenshare layout fixes
- **Local screenshare stop via the browser's native "Stop sharing"** left the layout frozen on
  a blank screen-share box: the browser ends the capture track without calling our
  `stopScreenShare()`, so `isLocalScreenSharing` stayed true. Fix: attach a
  `track.mediaStreamTrack 'ended'` listener in `startScreenShare` (the local twin of the remote
  `TrackUnsubscribed` path) + made `stopScreenShare()` always reset the signal (idempotent).
- **Draggable resize** between the screen and the participant sidebar: a `col-resize` divider
  with three grey grip dots, drags the sidebar width (signal `screenSidebarWidth`, 180–700px).
- Layout modes recap: `screen-share` (any share) · `spotlight` (exactly 2) · `grid` (1 or 3+).

## 2. Audio/Video sync — the big investigation (RESOLVED)
Operator reported ~500 ms lip-sync drift (audio behind video), only on Chrome-ish paths.
Methodical isolation (documented so we don't re-derive):
- Built an A/B into `__lk.audioDiag()` (jitter ceiling + live playout targets) and a receiver
  console snippet reading per-track `jitterBufferDelay/jitterBufferEmittedCount`.
- **Ruled out** the jitter buffer (measured audio target at its 120 ms floor, 0 conceal) and
  **ruled out DFN** (DFN-off gave identical numbers).
- **Root cause:** our jitter controller forces the AUDIO `jitterBufferTarget` (~120 ms) but
  nothing held VIDEO back (browser default ~19 ms), and forcing the target DISABLES Chrome's
  native A/V sync (`estimatedPlayoutTimestamp: undefined`). So audio rendered ~115 ms behind
  video, uncompensated. (The "500 ms" was ~115 ms measured + perceptual rounding.)
- **Fix (jitter-buffer.ts):** the controller now MIRRORS its playout delay onto the paired
  camera track (`getVideoTrack` accessor threaded from the component's `remoteVideoTracks` map).
  Video is held to the same delay as audio → they render together. Delays VIDEO (cheap), never
  shrinks the audio buffer → **ZERO risk to the anti-choppy DFN audio**. Adaptive: video tracks
  the audio target at every level. Verified: video buffer rose 19→108 ms, offset 115→~26 ms
  (imperceptible). Also did Option-1 tuning earlier (ceiling 600→300, faster ease-down) — kept.
- **Why not Meet-tight:** Meet uses libwebrtc's continuous native RTCP sync; we can't (we force
  the buffer for anti-choppy), so we reconstruct a 1-s-cadence mirror. 26 ms residual is fine.
  Future option (deferred): release the override when conceal==0 for native sync on clean nets.

## 3. Monitor screen (`monitor-liveassignment`)
- **Couldn't monitor OCI rooms:** `getToken()` posted to `createOpenViduToken` WITHOUT
  `provider`, so the server defaulted to aws → issued an AWS token → tried to join OCI rooms on
  the AWS master → never connected. Fix: send `provider` from the room's `mediaProvider`.
  Badge label now reflects the real backend (`OpenVidu OCI` / `OpenVidu AWS`).
- **Badge redesign** (also applied to the call screen's 3 remote badges): order is now
  **Name → Mute(only if muted) → NR chip → Network**. NR is a `graphic_eq` icon (green + atten
  number when on, dim when off) instead of the old "🔇 NR 12 · 1.0×" text. The monitor had no
  NR data source (shared DfnStateService tracks one room; monitor watches many) → added a
  per-room `participantsDfn` map fed by a `RoomEvent.DataReceived` listener (same pattern as
  mute/quality), with cleanup on disconnect/leave.

## 4. Toolbar → 4 Zoom-style buttons
Rebuilt to **Audio · Video · Share · Full Screen** (labelled), two with caret (^) menus:
- **Audio** menu: Select a Microphone · Select a Speaker · **Noise Cancellation Enable/Disable**
  (last option). Menus open right + up (`xPosition=after yPosition=above`), caret top-aligned.
- **Video** menu: Background Blur (None/Mid/High) · Select a Camera · **Picture-in-Picture →
  Pop out video** (manual).
- Device switching is NEW: `enumerateDevices()` + `room.switchActiveDevice(...)`, refreshed on
  `devicechange`, ✓ on the active device. Speaker = `audiooutput`/setSinkId (Chrome/Edge).
- **Advanced DFN sliders** (attenuation/normalize/gate + on/off) moved to a leftmost **NR Tune**
  panel gated behind **`?diag=1` / `#diag`** (ops only). `__lk` and diag UI share that flag.
- **Default to the built-in mic on join** (label match `built-in|internal|macbook`) so joins
  don't land on a Bluetooth headset.
- **Menu styling** lives in global `src/styles.css` (mat-menu renders in the CDK overlay):
  black bg, bold white headings, clean white text, green ✓.

## 5. Fullscreen menus not working (PROPER fix, not the old hack)
Root cause: fullscreening a SUB-element (`meetingContainer`) leaves `.cdk-overlay-container` in
`<body>` — outside the fullscreen element — so mat-menus were invisible/unclickable (the old
"disable fullscreen on the end-call button" was a patch around this). Fix: on `fullscreenchange`
**relocate `.cdk-overlay-container` INTO the fullscreen element**, back to `<body>` on exit.
Canonical Angular Material solution; all menus now work in fullscreen.

## 6. Background blur freeze (root cause = COEP)
Applying blur froze the video + stopped publishing; 2nd/3rd apply froze the whole tab.
- **Root cause A (COEP):** the page runs under **COEP require-corp** (`coi-serviceworker`, for
  cross-origin isolation), which BLOCKS the MediaPipe wasm/model that `BackgroundProcessor`
  fetches from a CDN → `setProcessor` stalls. Fix: **self-hosted** the assets (copied
  `@mediapipe/tasks-vision/wasm/*` + downloaded `selfie_segmenter.tflite` into
  `src/assets/mediapipe/`) and passed `assetPaths` → COEP-immune, like DFN's assets.
- **Root cause B (stacking):** every blur change created a NEW `BackgroundProcessor` +
  `setProcessor`, stacking multiple per-frame ML pipelines → CPU exhaustion → tab freeze. Fix:
  reuse the running processor via **`switchTo()`**; `if (level===blurLevel) return` (ignore
  re-selecting same) + a `blurBusy` guard against double-clicks.

## 7. Video cropped in Chrome, fine in Safari
Tiles used `object-fit: cover` (fills + crops); Chrome and Safari capture the camera at
different aspect ratios for the same constraints, so Chrome cropped more. Operator chose:
preserve the camera's **real transmitted ratio, contained in the grid** → changed grid +
small-tile `object-fit` to **contain** (letterbox, no crop, identical in both browsers).

## 8. Device-switch choppiness / raw audio (PARTIAL — revisit)
- Switching mic via `switchActiveDevice` makes a NEW track; `applyDfnProcessor` skipped
  re-attaching because `dfnProc` pointed at the OLD track → new mic published with Chrome NS/AGC
  + no DFN → choppy. Fix: `selectMic` drops `dfnProc` and re-applies DFN (raw capture) to the
  new track.
- **Bluetooth headset can't provide raw audio** (HFP forces its own NS): the raw
  `applyConstraints` throws `OverconstrainedError`. Turned that into an **auto-disable of DFN**
  (let the device's own NC be the sole processor — avoids double-processing choppiness).
- **False positive fixed:** the non-standard **`voiceIsolation`** constraint threw
  OverconstrainedError on the MacBook mic too (which CAN do raw), wrongly disabling DFN.
  Removed `voiceIsolation`; the auto-disable now fires ONLY when a CORE constraint
  (`noiseSuppression`/`echoCancellation`/`autoGainControl`) fails (via `ce.constraint`) or the
  device reports NS still on. Laptop → DFN stays; Bluetooth → DFN hands off. **Operator to
  re-verify both paths.** OPEN THREAD.

## 9. Picture-in-Picture (INCOMPLETE — revisit)
Goal: auto-PiP the active remote on tab switch. Built:
- Hidden off-screen `<video autopictureinpicture>` (real size — Chrome rejects 1px/hidden),
  source chosen by priority: remote screen share → active speaker (hold last) → name-card
  canvas if camera off → no PiP when solo. Re-resolves on speaker/track/share changes.
- **Manual "Pop out video"** button — WORKS (Chrome/Edge/Safari; falls back to local video).
- **Auto-on-tab-switch does NOT work and CANNOT be forced cross-browser.** Confirmed
  `NotAllowedError: requestPictureInPicture must be handling a user gesture` — a `visibilitychange`
  has no gesture, so that path is impossible (removed it; kept exit-on-return only). The only
  gesture-free auto paths are Chrome-134+ `enterpictureinpicture` mediaSession action or an
  installed PWA — neither universal. **Decision deferred.** Options on the table: (a) ship manual
  only [recommended], (b) one-time "pop out" nudge toast, (c) Document PiP (Chrome 116+).
  OpenVidu has NO built-in PiP (it's a browser feature). OPEN THREAD.

## Verification
Every change: `ng build --configuration production` clean (pre-existing CSS `--sm`/`--active`
warnings only). Runtime-verified by operator: A/V sync (26 ms), blur (self-hosted), laptop-mic
DFN, monitor OCI, toolbar, manual PiP. NOT resolved: auto-PiP (browser gate), Bluetooth-vs-laptop
DFN edge cases (operator re-verifying).

## Open threads / next
1. **PiP** — decide manual-only vs nudge vs Document-PiP; auto is Chrome-134+/PWA only.
2. **DFN device handling** — re-verify laptop (DFN on) vs Bluetooth (DFN auto-off) after the
   voiceIsolation fix; consider surfacing "NC handled by device" in the UI.
3. Backend multi-provider threads still open in the 2026-07-17 journal (deploy, ONS confirm,
   acceptance matrix, commits — git still permission-blocked for Claude all session).
