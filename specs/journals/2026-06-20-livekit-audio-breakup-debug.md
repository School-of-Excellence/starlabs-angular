# 2026-06-20 — Debugging LiveKit call audio breakup ("unintelligible") after DFN integration

**Ask:** audio in the Starlabs LiveKit call (`join-livekit-call.component.ts`) is very
unclear / breaks up / unintelligible, vs. clean in the `videoconference` reference repo.
Verify the integration, find root cause (instance type? composite recording? other?), fix.

## What was verified (evidence, not assumption)

- **Client DFN integration is a faithful port** of the videoconference reference:
  - `applyDfnProcessor()` mirrors `DfnControls.tsx` exactly — same 48 kHz AudioContext
    clock-domain force, same processor opts (`noiseReductionLevel:80`, `makeupGain:1.2`,
    `gateEnabled`, `gateThresholdDb:-45`), same `voiceIsolation:false` on the DFN-ON path.
  - `jitter-buffer.ts` and `dfn-state.service.ts` are line-for-line ports of `jitterBuffer.ts`
    / `DfnState.tsx`.
  - DFN model assets ARE present & correctly structured: `src/assets/df3/v2/pkg/df_bg.wasm`
    (9.2 MB) + `src/assets/df3/v2/models/DeepFilterNet3_onnx.tar.gz` (7.6 MB), served at
    `/assets/df3` (matches `assetConfig.cdnUrl`). `src/assets` is in `angular.json` assets.
  → The DFN code/config is NOT the cause.

- **Instance type — hypothesis RULED OUT by direct AWS inspection** (account 968234051275,
  ap-south-1):
  - Master `i-05b2c332ec7c9e4ca` = **c6a.xlarge** (currently *stopped*).
  - Media ASG `…OpenViduElastic` LT `lt-01b10fe1469bffaee` v1 ($Default) = **c6a.xlarge**.
  - ASG currently **Min/Max/Desired = 0** (fleet spun down per the TLS-fix journal).
  - c6a is fixed-performance (AMD sibling of c6i). The journal #1 rule ("never t3/burstable,
    a t3 SFU sounds like echo") is satisfied. **Not the lower-instance problem.**

- **UDP media path is open** — media SG `sg-0362dbbf7af82f129` has `udp 50000-60000`,
  `udp 443`, `udp 7885`, `tcp 7881` all to `0.0.0.0/0`. So media is NOT forced onto TCP by
  a blocked SG. (No `udp 3478` — expected: OpenVidu Elastic muxes TURN over 443.)

## LIVE TEST RESULTS (2026-06-20, fleet brought up, ap-south-1, room WLBYpSr6Js8LbMibg74H)

Joined the live call in Chrome (via `ng.getComponent` → `audioDiag()`), measured WebRTC stats
directly. All suspects tested empirically:

| metric (uplink mic→SFU) | recording ON | recording OFF |
|---|---|---|
| ICE candidate pair | `prflx ↔ host` (**direct, NOT relay**) | `prflx ↔ host` (direct) |
| RTT | 30 ms | 30 ms |
| packet loss | 0.00 % | 0.00 % |
| jitter | 3.1 ms | 2.8 ms |
| nacks (retransmits) | 0 | 0 |
| DTX | off (continuous ~50 pps) | off (continuous) |

DFN runtime (live): processor **attached** (`deepfilternet3-noise-filter`), AudioContext
**running at 48 000 Hz**, makeupGain 1.2, gate −45 dBFS, atten 80 — i.e. EXACTLY the
oracle-validated config.

**Conclusions, evidence-based:**
- **Composite recording is NOT the cause** — A/B shows zero transport impact (identical
  loss/RTT/jitter/nacks ON vs OFF). The user's hypothesis is ruled out. (Recording auto-starts
  on participant_join via `onEventOpenVidu`; it's `startRoomCompositeEgress`.)
- **No TURN-relay fallback** — pair is direct (`prflx↔host`), so the LIVEKIT-AWS-CONFIG §3
  `node_ip`/`use_external_ip` rules are effectively satisfied; media SG opens udp 50000-60000.
- **Instance class fine** — c6a.xlarge (verified earlier).
- **DFN is correct & healthy** — attached, 48 kHz, oracle config.

## Root cause of the original breakup

The one real deviation from the videoconference reference was the **audio publish config**:
Starlabs' `getRoomConfig()` set only video defaults, so **DTX defaulted ON**. With DTX on +
the DFN −45 dBFS gate (which forces gated silences truly silent), the Opus encoder stopped
transmitting during every silence/word-gap and produced clipped, choppy speech onsets on
resume — heard as "unclear / breaking up / unintelligible". The reference deliberately sets
`dtx:false` (+ explicit `red:true` RED redundancy). **Fix applied** in
`adaptive-quality.service.ts`; verified live (`dtx active: no`, continuous ~50 pps).

## Noise-filter control decision (oracle)

videoconference `Results.md` benchmark (real speech, 5 noise profiles, ITU-T PESQ/STOI):
**DeepFilterNet is the winner** — PESQ 2.81, **STOI 0.97 ✓** (only method clearing STOI≥0.92);
spectral gating/Wiener score STOI 0.42. Starlabs also ships **PicoVoice Koala** and
**AI Coustics** services, but both are **inactive dead code** in the LiveKit call path
(ai-coustics was archived/blocked on a license key per SETUP-JOURNAL §6). DFN is correctly the
single active NR; Koala/aic stay disabled in production.

## Fix applied (client, concrete deviation from "configure exactly as videoconference")

`AdaptiveQuality.getRoomConfig()` set ONLY video publish defaults; the reference
`PageClientImpl.tsx` also sets **audio** defaults. Added to `publishDefaults`:
- `red: true` (RED redundant Opus — the key packet-loss-resistance knob; was relying on default)
- `dtx: false` (was effectively true → with the DFN −45 dBFS gate, encoder cut transmission
  during gated silence → choppy onsets / breakup. Reference deliberately disables DTX.)
- `audioCaptureDefaults: {}` to match reference shape.
File: `src/app/Service/AdaptiveQuality/adaptive-quality.service.ts`. Type-checked against
livekit-client (`red`/`dtx` ∈ TrackPublishDefaults, `audioCaptureDefaults` ∈ RoomOptions).

Also added a read-only dev diagnostic `audioDiag()` on the call component (run via
`ng.getComponent($0).audioDiag()` or `__lk.audioDiag()` in dev) — prints DFN status, uplink
candidate-pair/RTT/loss, and downlink conceal/loss/jitter. Kept as an ops tool; the `__lk`
window handle is `!environment.production`-gated.

## Tooling note
- In this `ng serve`, `environment.production === true` (so the `__lk` hook is suppressed);
  use `window.ng.getComponent(document.querySelector('app-join-livekit-call'))` to reach the
  component. (Angular debug API is still present → not a true prod build.)

## Pending / not yet done
- **Downlink (listener side) not measured live** — only 1 participant could join (single Chrome
  profile = single LiveKit identity). Uplink + transport are pristine and the DTX fix is verified,
  so downlink is expected clean, but a true 2-person A-hears-B test is still worth doing.
- **Individual-file recording NOT implemented** — composite was proven harmless, so it was left
  as-is. If per-speaker files are wanted (better for ATC transcription), switch
  `startRoomCompositeEgress` → per-participant `startTrackCompositeEgress` (ffmpeg, no headless
  Chrome) in `Starlabs Functions - VideoConference/functions/components/openVidu.js:331`; requires
  a functions deploy (restore `package.json main` after).
