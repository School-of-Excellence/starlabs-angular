# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-20 (LiveKit call audio debug + fix)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-06-20-livekit-audio-breakup-debug.md` (WHY + live test data).

## Current state
- **LiveKit call audio is fixed and verified live.** The DeepFilterNet3 (DFN) noise filter is correctly integrated into `src/app/LiveKit/join-livekit-call/` — processor attached, AudioContext 48 kHz, oracle-validated config (atten 80 / makeup 1.2 / gate −45 dBFS). DFN is the right NR per the videoconference oracle (`Results.md`: PESQ 2.81, STOI 0.97 — beats all alternatives). PicoVoice Koala + AI Coustics services exist but are **inactive dead code** in the call path; DFN stays the single active NR.
- **AWS (ap-south-1, acct 968234051275):** OpenVidu Elastic, master `i-05b2c332ec7c9e4ca` + media ASG, both **c6a.xlarge** (fixed-perf, correct). Fleet was brought up for the test; LE TLS cert valid.

## Last session changes (2026-06-20) — why
- **Root cause of "audio breaks up / unintelligible": DTX.** `AdaptiveQuality.getRoomConfig()` set only video publish defaults, so audio DTX defaulted ON; combined with the DFN −45 dBFS gate, the Opus encoder cut transmission during every silence → choppy speech onsets. **Fix:** added `dtx: false` + explicit `red: true` (RED redundancy) to `publishDefaults` in `src/app/Service/AdaptiveQuality/adaptive-quality.service.ts`, matching the videoconference reference. Verified live (continuous ~50 pps, `dtx active: no`).
- **Composite recording ruled OUT empirically.** Joined the live call (`ng.getComponent → audioDiag()`) and ran a record-ON vs record-OFF A/B: uplink identical and pristine both ways (0% loss, 30 ms RTT, ~3 ms jitter, 0 nacks, **direct** `prflx↔host` candidate pair — no TURN relay). So recording is not the cause; instance class and relay also ruled out.
- Added a read-only dev diagnostic `audioDiag()` to the call component (DFN status + uplink/downlink WebRTC health). `__lk` window handle is `!environment.production`-gated.

## Pending / next
- **Working tree is uncommitted** (entangled with the prior-session DFN integration under the untracked `src/app/LiveKit/` tree + modified `adaptive-quality.service.ts`). Commit the audio fix when ready (branch `videoconference`; push is operator-gated).
- **Downlink not measured live** — only 1 participant could join (single Chrome profile = single LiveKit identity). Uplink/transport are clean and the DTX fix is verified, but a true 2-person "A hears B" test is still worth doing.
- **Optional:** per-speaker recording (better for ATC transcription) — switch `startRoomCompositeEgress` → per-participant `startTrackCompositeEgress` in `Starlabs Functions - VideoConference/functions/components/openVidu.js:331` (ffmpeg, no headless Chrome). Not needed for audio quality; needs a functions deploy.
