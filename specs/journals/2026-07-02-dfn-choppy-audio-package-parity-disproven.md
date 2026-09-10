# 2026-07-02 — DFN "choppy voice" investigation: the "package bug fix" lead is disproven

## TL;DR
The working hypothesis for the choppy DeepFilterNet3 audio on `join-livekit-call` was that the
reference project (`fresh-livekit-dfn/meet` + `mezon-noise-suppression`) had patched a bug *inside
the DeepFilter package* that our port was missing. **That is false, proven by byte-identical hashes.**
Our DFN package glue, WASM, and ONNX model are the exact gold-standard fixed artifacts. The
choppiness is not in the DFN code path. Several TODO §1–3 assumptions are also stale/wrong.

## Evidence (hard)
- **`df_bg.wasm`**: our `src/assets/df3/v2/pkg/df_bg.wasm` md5 `9bdc12340a91b2a0c27e228f8061a8d7`
  === the reference's live CDN `https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3/v2/pkg/df_bg.wasm`
  (etag `9bdc1234…`, 9 622 975 B). **Identical.**
- **`DeepFilterNet3_onnx.tar.gz`**: our md5 `f37cd201a575b61685c002fd915d1183` === CDN etag
  `f37cd201…` (7 983 136 B). **Identical.**
- **`index.esm.js`** (the JS/worklet/gate/makeupGain glue): reference actually runs
  `meet/node_modules/deepfilternet3-noise-filter/dist/index.esm.js` (md5 `3ae35fe…`, === the
  `mezon-noise-suppression/dist` build). Our vendored copy is that **same build plus one benign
  Angular-only helper** (`ensureGzippedModel`, re-gzips the model when a host serves the `.tar.gz`
  with `Content-Encoding: gzip`). No gate/makeupGain/frame/overlap-add logic differs.
- The reference `meet` has `NEXT_PUBLIC_DFN_CDN_URL` **unset** → `assetConfig` undefined →
  `AssetLoader` defaults to the mezon CDN. So the reference's "gold" assets ARE those CDN bytes,
  which we matched.

## Stale/wrong TODO assumptions corrected
- **livekit-client is NOT behind.** TODO §3 said 1.15.13 vs 2.19.1. The app is **already on 2.19.1**
  (both `package.json` and `node_modules`). `setAudioContext` exists and is used. Non-issue.
- **Cross-origin isolation (TODO §2 "highest-leverage COEP fix") is irrelevant to DFN.** The WASM is
  built with Rust's `no_threads` std (`sys/sync/mutex/no_threads.rs`, `no_threads` TLS). Zero
  SharedArrayBuffer / Atomics / pthread / rayon in the wasm or glue. It is single-threaded WASM in an
  AudioWorklet — needs no `crossOriginIsolated`. Adding COEP `credentialless` would not help audio and
  could break cross-origin media. **Do not chase COEP for DFN.**
- Audio publish config is already anti-breakup and deliberate: `red:true` (Opus redundancy),
  `dtx:false` (avoids the DTX×−45 dBFS-gate cut-out interaction). `AdaptiveQuality.getRoomConfig`.
- Mic lifecycle is clean: preview stream stopped before LiveKit opens the device; PicoKoala fully
  commented out on the LiveKit flow (no double-capture).

## What actually differs from the bare reference (surviving causes)
1. **CPU load starving the single-threaded DFN AudioWorklet.** Our app carries video background blur,
   VP8 3-layer simulcast, and adaptive-quality monitoring; the reference `meet` is a bare demo. If the
   renderer is starved the worklet underruns → choppy DFN. **Correction found mid-investigation:** blur
   is **not** auto-on for a fresh join (class default `'none'`; `applyBlur` only fires from the blur
   menu or a camera off→on toggle). The one place forcing `'high'` was the leave/reset path
   (`join-livekit-call.component.ts` ~line 552) with a self-contradictory comment — a latent bug that
   re-forced heavy blur on rejoin. **Fixed:** reset now sets `blurLevel='none'` (matches class default +
   reference; blur stays manual/opt-in).
2. **Media server / network** — OpenVidu-hosted LiveKit vs the reference's server (possible TURN relay,
   loss). Only diagnosable from a live 2-participant call via `audioDiag` (`conceal ms/s`, ICE pair).

## Changes made this session
- `join-livekit-call.component.ts`: leave/reset no longer forces `blurLevel='high'` → `'none'`.
- `audioDiag()`: added a `client` block (blurLevel, cpuPressure, hardwareConcurrency,
  crossOriginIsolated) so the blur off-vs-on A/B is quantitative against downlink `conceal ms/s`.

## Objective verification done autonomously (live deployed host `breakthroughs-test.web.app`)
Curled the deployed route/assets (no auth needed — headers precede any auth redirect):
- `/joinlivekit/*` serves `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy:
  credentialless` — **matches reference `next.config.js` exactly** → `crossOriginIsolated === true` holds.
  (And DFN doesn't even need it — single-threaded wasm.) TODO §2 objectively satisfied.
- `df_bg.wasm` → `content-type: application/wasm`, 9 622 975 B (correct MIME, no artifact risk).
- `DeepFilterNet3_onnx.tar.gz` → `content-type: application/gzip`, **no** `Content-Encoding: gzip`,
  7 983 136 B → `df_create` inflates correctly; `ensureGzippedModel` passes through. No serving bug.

## LIVE verification via Chrome remote-control (2026-07-03, localhost dev, operator's browser)
Drove the operator's Chrome (claude-in-chrome MCP): opened a 3rd controlled tab `?diag=1`, joined the
running `joinlivekit` room (auth session carried over — pre-join reachable when the profile is logged in),
and measured the pipeline live. Findings (all objective metrics measured **inside the running call**):
- `crossOriginIsolated: true` (localhost, via coi-serviceworker) ✅
- `micSampleRate: 48000` ✅ (48 kHz forcing works; `setAudioContext` present on livekit-client 2.19.1)
- DFN processor attached: `deepfilternet3-noise-filter` ✅; `blurLevel` starts `none` ✅ (blur fix confirmed)
- ICE pair: `prflx-host` = **direct, no relay** ✅
- Downlink `conceal`: **0 ms/s while packets flow** (idle window ~50 pps, DTX off) ✅
- **CPU-starvation did NOT reproduce**: applied **Blur High + DFN together** for 8 s → `cpuPressure`
  stayed **`nominal`** (10-core machine). Blur can't starve the single-threaded worklet on capable HW.
- Log artifact noted: `conceal ~1000 ms/s` with `pps 0` occurs when a sender tab is **backgrounded**
  (Chrome throttles background-tab media encoding to ~0). Not network loss, not DFN.
- Two minor runtime findings (both benign, both shared with the reference's code path):
  (a) `applyConstraints({voiceIsolation:false})` throws `OverconstrainedError` on this browser/mic — caught,
      no effect; (b) `applyBlur` throws if the camera track is disabled (`Input track cannot be ended`) —
      re-enable camera first. Neither causes choppiness.

**Tooling note for the diag:** `await __lk.audioDiag()` only attaches `__lk` when `!environment.production`
OR the URL has `?diag=1`. BOTH env files ship `production:true`, so without `?diag=1` the diagnostic is
unreachable — this was fixed (`join-livekit-call.component.ts` ~line 473). Also: the claude-in-chrome
`javascript_tool` does NOT unwrap async-IIFE Promises (returns `{}`) and times out internal awaits >~2 s —
use **top-level await** and split long samples across two calls (snapshot → wait → snapshot).

## Conclusion after live testing
On capable hardware over a clean (localhost) path, the DFN client pipeline is **objectively clean and
reproduces none of the choppiness** — consistent with the byte-identical-to-reference proof. The DFN
client code is verified clean three ways: byte-identical assets, faithful wiring, healthy live metrics.
Remaining real-world choppiness (if any) is therefore **environmental**: real-network conditions via the
OpenVidu/LiveKit media server (TODO §4), or **CPU starvation on a weak client** (few cores) — the latter is
why gating blur/simulcast under `cpuPressure` is still worthwhile as a robustness measure, pending sign-off.

## What still requires the operator (hard limit)
A real 2-participant call over the **actual network** with **foreground tabs** + **subjective A/B listening**.
Localhost bypasses the network and one machine + backgrounded tabs can't produce a valid subjective test.
The `subjective A/B` success-criterion is inherently human-in-the-loop and cannot be automated.

## Pending / next (needs the operator — live call)
- Run a 2-participant `/joinlivekit` call. `await __lk.audioDiag()` with **blur OFF**, then toggle
  **blur HIGH** and re-run. If `conceal ms/s` and subjective choppiness rise with blur/CPU pressure →
  starvation confirmed → consider core-gating blur like DFN, or capping simulcast layers under CPU load.
- If choppiness persists with blur OFF and `conceal` is already high (or ICE pair = relay) → it's the
  media server/network path (TODO §4), not the client. A/B the same numbers against the reference app.
- Objective PRE-network capture (PESQ/STOI) is the only way to fully separate processing from transport.
