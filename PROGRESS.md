# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-18 (session 5 — Audio menu: mic-check, output fix, NC two options)_ · **New session? Read `specs/ORIENTATION.md` first**, then `specs/journals/2026-07-18-call-ui-audio-pip.md` (§10 = this session).

## Current state
- Branch **`videoconference`**; working tree has UNCOMMITTED changes in
  `src/app/LiveKit/join-livekit-call/` (git commit permission-blocked all session).
- Call screen Audio menu (`/joinlivekit`, `/joinroom`): mic list · speaker list · **Noise
  Cancellation two options** — "In-Built Noise Cancellation" (browser NS/EC/AGC, DFN off) vs
  "Deep Filter Noise" (DFN on raw capture). Mode flip re-acquires the mic via
  `restartTrack({deviceId, EC/NS/AGC})` (applyConstraints is ignored live by Chrome).
- **No code auto-toggles DFN anymore** (Bluetooth/HFP auto-disable removed). Input state is
  observe-only: `[mic-check]` console line on mic set/change says RAW vs PROCESSED
  (browser-level only; on-device DSP is invisible and reads RAW).
- Speaker switching: LiveKit path + direct `setSinkId` on every rendered `<audio>`, with a
  `[speaker]` console line showing each element's resulting sinkId. Safari can't support
  output switching at all (library + no audiooutput enumeration).
- `ng build --configuration production` clean (pre-existing CSS warnings only).

## Last session changes — why
- Operator wants to VALIDATE what each input device delivers before designing any DFN device
  policy → auto-disable removed, console evidence added instead.
- Output switching observed broken in Chrome despite a statically-correct livekit-client
  2.19.1 chain → belt-and-braces direct element setSinkId + evidence logging.
- NC toggle → two explicit options (same underlying `dfnEnabled` binary); `toggleDfn` (diag
  panel) delegates to `setNcMode`. restartTrack MUST get deviceId or it silently drops the
  NS/EC/AGC constraints (verified in livekit source).

## Pending / next
- **Operator to runtime-test all three**: `[mic-check]` verdicts per device (esp. Bluetooth),
  speaker switching in Chrome (check the `[speaker]` sinkId line if audio doesn't move), NC
  mode flip mid-call (expect sub-second mic gap).
- Decide DFN policy for PROCESSED inputs from the collected `[mic-check]` evidence.
- Open threads from §9/§3 of the journal: PiP decision (manual-only vs nudge vs Document-PiP),
  backend multi-provider threads (2026-07-17 journal), OpenVidu AWS migration items (memory).
- **Commit the working tree** once git is permitted; push stays operator-gated.
