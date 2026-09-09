# LiveKit + DeepFilterNet3 — Angular Integration TODO & Handoff

> **Purpose:** self-contained checklist to integrate / finish the LiveKit + DeepFilterNet3 (DFN)
> voice-isolation setup in this Angular app so it matches the reference's audio clarity.
> Written for a fresh session — assume no prior conversation context.

## 0. Repos & key paths
- **This app (Angular):** `/Users/m1/Documents/Angular Projects/Version 19/Starlabs - VideoConference`
  - LiveKit call flow: `src/app/LiveKit/join-livekit-call/join-livekit-call.component.ts`
  - DFN helpers: `src/app/LiveKit/dfn/{jitter-buffer.ts, dfn-state.service.ts}`
  - Patched DFN package (vendored): `src/app/LiveKit/dfn/vendor/deepfilternet3-noise-filter/`
  - DFN model assets: `src/assets/df3/v2/{models/DeepFilterNet3_onnx.tar.gz, pkg/df_bg.wasm}`
  - Route: `src/app/app.routes.ts` → `joinlivekit/:roomid`
  - Hosting headers: `firebase.json`
- **Backend (Cloud Functions):** `/Users/m1/Documents/Firebase Functions/Starlabs Functions - VideoConference/functions`
  - OpenVidu/LiveKit logic: `functions/components/openVidu` · token fn = `createOpenViduToken`
- **Reference implementation (gold standard, Next.js):** `/Users/m1/Documents/Angular Projects/Version 19/videoconference/fresh-livekit-dfn/meet`
  - DFN control: `lib/DfnControls.tsx` · headers: `next.config.js` · patched DFN source: `../mezon-noise-suppression/`

## 1. Status snapshot (UPDATED 2026-07-02 — byte-level parity proven; see Journal/2026-07-02-dfn-choppy-audio-package-parity-disproven.md)
The DFN client port is **faithful and correct — now PROVEN byte-identical to the reference**, not just
audited. The "reference patched a bug inside the DeepFilter package that we lack" lead is **DISPROVEN**:
- `df_bg.wasm` md5 `9bdc1234…` === reference live CDN etag (cdn.mezon.ai). **Identical.**
- `DeepFilterNet3_onnx.tar.gz` md5 `f37cd201…` === CDN etag. **Identical.**
- `index.esm.js` glue === reference `dist`/node_modules build (`3ae35fe…`) + one benign Angular-only
  `ensureGzippedModel` helper. Gate/makeupGain/frame/overlap-add logic **identical**.
- `jitter-buffer.ts` === `meet/lib/jitterBuffer.ts` (identical logic). Processor config === `DfnControls.tsx`.

**Two suspects below are STALE/WRONG — do not chase:**
1. ~~Cross-origin isolation not on `/joinlivekit`~~ — `firebase.json` **already** sets COOP same-origin +
   COEP credentialless for `/joinlivekit/**` (matches reference). AND the DFN WASM is single-threaded
   (Rust `no_threads` std; no SharedArrayBuffer/Atomics) so isolation is **irrelevant to DFN audio**. §2 void.
3. ~~`livekit-client` behind (1.15.13)~~ — app is **already on 2.19.1** (package.json + node_modules), same
   as the reference. `setAudioContext` present & used. §3 void.

**Remaining real causes of choppiness (both runtime/environmental, need a live 2-participant call):**
- **CPU starvation** of the single-threaded DFN AudioWorklet by video blur + VP8 simulcast + monitoring
  (the bare reference has none). FIXED the one auto-force bug: leave/reset no longer sets `blurLevel='high'`.
  `audioDiag()` now prints a `client` block (blur/cpu/cores/isolation) to A/B this.
- **Media server / network** (OpenVidu-hosted LiveKit; possible TURN relay / loss) — see §4.

Run §6 diagnostics on a LIVE 2-participant call to localize which of the two applies.

---

## 2. Frontend (Angular) — TODO

### Dependencies & build
- [DONE] `livekit-client@1.15.13`, `@livekit/track-processors@0.7.2` installed
- [DECISION] Consider upgrading `livekit-client` → **2.x** (reference = 2.19.1). Cloud Functions already use
  `livekit-server-sdk@^2.6.1`, so the server speaks v2 → client v2 is likely compatible. **Confirm the
  OpenVidu-embedded LiveKit server version first.**
- [DONE] Patched DFN vendored at `src/app/LiveKit/dfn/vendor/...` (verified contains makeupGain + gate;
  npm `deepfilternet3-noise-filter@1.2.1` lacks these — never swap to npm build for the LiveKit flow)
- [VERIFY] `angular.json` includes `src/assets`; `.wasm` served as `application/wasm`

### Cross-origin isolation — HIGHEST-LEVERAGE FIX
- [TODO] Make `/joinlivekit` cross-origin isolated.
  - Reference (`next.config.js`) sets for ALL routes: `COOP: same-origin` + **`COEP: credentialless`**.
  - This app's `firebase.json` global `**` rule sets **COOP only — no COEP**; COEP exists only for
    `/openmeeting/**` and `/zoommeeting_bigparticipants/**`. `/joinlivekit` is NOT covered.
  - `coi-serviceworker.js` is registered (`src/index.html`) and retrofits COEP `require-corp`, but needs a
    reload to activate and is stricter than the reference.
  - **Action:** add a `firebase.json` header block for the call route with `COOP: same-origin` +
    `COEP: credentialless` (match reference), OR verify the service worker isolates it.
  - **Done when:** `window.crossOriginIsolated === true` on `/joinlivekit`.

### DFN audio pipeline (`join-livekit-call.component.ts`) — mostly DONE
- [DONE] `applyDfnProcessor()`: `DeepFilterNoiseFilterProcessor({ sampleRate:48000, noiseReductionLevel:80,
  makeupGain:1.2, gateEnabled:true, gateThresholdDb:-45, assetConfig:{cdnUrl:'/assets/df3'} })` →
  `micTrack.setProcessor()`
- [DONE] Clock-domain: force mic onto 48 kHz `AudioContext` (`setAudioContext`) before processor
- [DONE] Input constraints: `voiceIsolation:false` when DFN ON; full NS/EC/AGC+voiceIsolation when OFF
- [DONE] Auto-enable only on ≥4-core devices

### Receive-side & UX
- [DONE] `startJitterController` on each remote audio track (adaptive 200 ms, 120–600)
- [DONE] `dfn-state.service` broadcasts settings via `publishData` (per-tile badges)
- [VERIFY] DFN control panel (atten / normalize / gate / gate-threshold sliders) wired in
  `join-livekit-call.component.html` with reference ranges (atten 0–100, norm 1.0–2.5, gate −70…−25)

### Routing / token
- [DONE] Route `joinlivekit/:roomid` → `JoinLivekitCallComponent` (authGuard)
- [DONE] Token via `createOpenViduToken` → `{ url, token }` → `room.connect()`
- [TODO] Switch primary nav from `joinroom` (OpenVidu) → `joinlivekit` once validated

---

## 3. LiveKit client SDK version (secondary)
- Reference `livekit-client` 2.19.1 vs this app 1.15.13. On v1, some v2 methods (`setPlayoutDelay`,
  `setAudioContext`) are guarded and silently fall back, so behavior diverges from the validated env.
- If audio is still muddy on a clean, isolated network → upgrade to v2.x (after confirming OpenVidu compat).

---

## 4. Backend — TODO

### Cloud Functions (`functions/components/openVidu`)
- [DONE] `createOpenViduToken` (returns `url` = LIVEKIT_URL + `token`), `openViduStart/StopRecording`,
  `onEventOpenVidu` (webhook), `openViduCloseRoom`, `CheckMasternodeStatus`, `mute/kickParticipant`,
  `scaleMediaNodes`, `start/stopMasterNodeHTTP`; `livekit-server-sdk@^2.6.1`
- [VERIFY] Token grants: `roomJoin`, `canPublish`, `canSubscribe`; identity = profileid; name set

### OpenVidu / AWS media server (decides "breaks up")
- [VERIFY] Media nodes on **fixed-performance** instances (c6a.xlarge ✓) — never t-family (jitter)
- [VERIFY] LiveKit ICE on media nodes: **`use_external_ip:true`, NO pinned `node_ip`** (avoids TURN relay)
- [VERIFY] SG opens UDP **50000–60000 + 7881** and TURN **3478**
- [VERIFY] TLS via Let's Encrypt (not self-signed) for browser join
- [DONE] Recording → S3 `openvidu-meet-recordings` via Egress
- [TODO — if new AWS account] Deploy OpenVidu Pro Elastic CF stack (params + Pro license + vCPU quota)

### Hosting headers (`firebase.json`) — serving config
- [TODO] Add COOP `same-origin` + COEP `credentialless` for the `/joinlivekit` route (§2)

---

## 5. Validation metrics (after integration)

### Runtime — `await __lk.audioDiag()` + console (2-participant call)
| Metric | Good | Breakup / bad |
|---|---|---|
| `window.crossOriginIsolated` | `true` | `false` → DFN WASM degraded |
| `dfn.processorAttached` / `processorName` | `true` / `deepfilternet3-noise-filter` | not attached |
| `dfn.micSampleRate` | **48000** | ≠ 48000 → clock drift |
| Uplink loss | < 1% | > 2% |
| Jitter | < 30 ms | — |
| RTT | < 120 ms | > 250 ms |
| ICE `pair` | host / srflx (direct) | contains **`relay`** |
| Downlink **conceal** | **< 15 ms/s** | **> 50 ms/s** |

### Objective audio quality (offline, capture PRE-network — gold standard)
- PESQ (narrowband) **≥ 3.2** · STOI **≥ 0.95** · Segmental noise reduction **≥ 8 dB**
- ⚠️ Capture the processed mic track BEFORE WebRTC/Opus; receiver-side capture is invalid (jitter/drift)

### Performance
- DFN **RTF < 0.3** (comfortably real-time); auto-disabled < 4 cores

### Subjective A/B (journal protocol)
- Side-by-side vs reference app; ≥ 2 min/listen; ONE server at a time, ALL other tabs closed;
  judge clarity, background suppression, no metallic tone, no dropouts

### Functional
- 2-user connect; audio/video/screen-share/chat; recording start/stop → S3 `.mp4`;
  mute/kick/host controls; reconnect; DFN badges reflect state

---

## 6. First actions in the new session (do BEFORE any code change)
1. Run the app, join a **2-participant** `/joinlivekit` call.
2. Console: `window.crossOriginIsolated` — if `false` → §2 is the issue.
3. Console: `await __lk.audioDiag()` — check `micSampleRate` (48000?), `conceal ms/s`, `loss`, ICE `pair`.
4. A/B the same numbers on the reference app (`videoconference/fresh-livekit-dfn/meet`, run locally).
5. Apply fixes in order: §2 (COEP) → §4 media/ICE → §3 SDK upgrade.
