# 2026-11-27 — OpenVidu call: retry, weak-connection banner, reconnect, waiting room

Plan: `specs/plans/2026-11-27-openvidu-call-resilience.md` (approved "build it"). Branch
`feature/openvidu-call-resilience` (worktree `starlabs-angular-resilience`, based on
`feature/join-ready-check`). Cloud Functions: branch `feature/waiting-room` in
`starlabs-cloud-function-deploy`. **Nothing committed** (operator: not until told).

## What changed
| Phase | Where | Change |
|---|---|---|
| 1 | `join-livekit-call` `getTokenWithRetry()` | Network (0) / 502 / 503-without-code / 504 retried 2→4→8→15→30 s for up to 3 min, same "Getting a video server ready…" screen; wakes early on `online` |
| 2 | `join-livekit-call` | `poorNet` banner after 5 s Poor/Lost, off after 10 s good; **Turn off my video**; "Connection weak" chip on a remote tile whose quality is Lost |
| 3 | `join-livekit-call` | LiveKit's silent retry → "Reconnecting…" overlay over the call. `Disconnected` for any reason other than Leave / End all (ROOM_DELETED) / Remove / same account elsewhere / room closed → `rejoin()`: tear down, new token, `joinCall(true)`, restore camera-off / mic-muted / blur, ≤ 2 min, waits for `online`. Then "You were disconnected" + **Rejoin** |
| 3 | `ready-check/precheck-recorder.ts` | `setPhase('waiting' \| 'reconnecting' \| 'disconnected')` writes the participant's entry; later check changes no longer overwrite it |
| 3 | `join-livekit-call` Not-joined panel | "Lost contact — last seen hh:mm" when the entry's `updatedAt` is > 3 min old (no new field) |
| 4 | `join-livekit-call` | `403 WAITING` → waiting screen, writes `waiting.<me>`, joins by itself when `admitted.<me>` appears; `403 DENIED` → denied screen (still joins if the host later presses Let in). Specialist: waiting-room panel (Admit / Admit all / Deny / Let in), chime + browser notification (click → call tab to the front). Token request sends `Authorization: Bearer <Firebase ID token>`. End all also clears `waiting` / `admitted` / `denied` |
| 4 | `monitor-liveassignment` `getToken()` | Sends the same sign-in header |
| 4 | appointment-studio (2 places), list-openvidu-room, dynamic-studio-v2, dynamic-studio | Reopening a room also deletes `waiting` / `admitted` / `denied` (fresh waiting room) |
| 4 | Functions `components/waitingRoom.js` (new) + `openVidu.js` | `createOpenViduToken`: gate before `prepareRoom()`; Ghost ids skip the wait but get `canPublish:false`; `openViduCloseRoom` clears the four fields; `kickParticipant` deletes `admitted.<id>` |

## Why
- **The wait is enforced on the server**: the page alone can be skipped by calling the function. The check runs before `prepareRoom()` so a waiting participant never orders media nodes.
- **Sign-in check**: the function trusted the browser's `participantId`; anyone could claim a host's id (ids are readable on the room doc). Now the ID token's uid must be the `user_ref` of `profile_data/<participantId>` (Ghost suffix stripped).
- **Hosts = room `hosts` as saved** + admin / developer / tester role (operator: reassigning appointments isn't possible — only cancel + create).
- **Ghost = listen-only** (operator): the monitor never publishes, so nothing changes for it, and faking " - Ghost" can't put anyone on camera unadmitted. This applies as soon as the function is deployed (not behind the switch).
- **Switches** `openvidu server/waitingroom` `{enabled, verifySignIn}` (missing = off): a participant on an old cached app would get a 403 it doesn't understand, so the app ships first and the switches go on after.
- **Admitted kept for the whole call** so a rejoin after a drop doesn't wait again; Remove withdraws it.
- **Lost contact uses the existing 60-s heartbeat** — an offline page can't say "I'm gone"; silence is the only signal.

## Deviations from the plan
- During our own rebuild (after LiveKit gives up) the page shows a full "Reconnecting…" screen, not the overlay — the old room object is gone, so the call layout can't stay. The overlay is used for LiveKit's silent retry.
- Waiting-room alerts fire only once the specialist is **in** the call (the panel lives on the call screen), plus once on connect for anyone already waiting.
- Studio reopen clears the waiting-room fields (plan said "cleared on reopen"); auto-close paths (5-min job, live assignment completed) were left alone (operator: decision 6).

## Revert guide (per screen)
| Screen | Revert |
|---|---|
| /joinroom (all phases) | `git checkout feature/join-ready-check -- src/app/LiveKit/join-livekit-call/ src/app/LiveKit/ready-check/precheck-recorder.ts` |
| Waiting room only (server) | Set `openvidu server/waitingroom.enabled = false` (instant), or redeploy `createOpenViduToken` from `origin/development` |
| Sign-in check only | `verifySignIn = false` |
| Ghost listen-only | Redeploy `createOpenViduToken` from `origin/development` |
| Monitor screen | `git checkout feature/join-ready-check -- src/app/OpenVidu/monitor-liveassignment/monitor-liveassignment.component.ts` |
| Studio reopen cleanup | Replace `{active: true, waiting: deleteField(), …}` with `{active: true}` in the 4 studio files |

## New test hooks (prefix `lkj`)
`lkj-waiting`, `lkj-waiting-elapsed`, `lkj-waiting-leave-btn`, `lkj-denied`, `lkj-rejoining`, `lkj-rejoining-elapsed`, `lkj-disconnected`, `lkj-rejoin-btn`, `lkj-reconnecting`, `lkj-poor-net`, `lkj-poor-net-video-off-btn`, `lkj-poor-net-close-btn`, `lkj-weak-chip`, `lkj-wr-panel`, `lkj-wr-toggle-btn`, `lkj-wr-row`, `lkj-wr-admit-btn`, `lkj-wr-deny-btn`, `lkj-wr-admit-all-btn`, `lkj-wr-denied-row`, `lkj-wr-letin-btn`. e2e spec: only when the operator asks.

## Verification
- `tsc -p tsconfig.app.json --noEmit` clean; `ng build --configuration development` OK.
- Functions: `node --check` OK; deployed `createOpenViduToken`, `openViduCloseRoom`, `kickParticipant` to **starlabs-test** (2026-11-27, from the uncommitted `feature/waiting-room` branch). Switch doc `openvidu server/waitingroom` created there with `enabled:false`, `verifySignIn:false`. Production untouched.
- **Not yet run in a browser.** To test on starlabs-test: see the plan's Verification list.

## Same day — specialist sees a drop even when the participant is fully offline (operator)
Gap found while writing the test steps: with the participant's Wi-Fi completely off, their page
can't write `precheck.<id>` ("reconnecting"), so the specialist saw nothing but a vanished tile.
Fix — on the **specialist's own screen**, no participant write needed:
- LiveKit `ParticipantDisconnected` for a participant (not a Ghost, not already back) → row in the
  Not-joined panel: "Connection dropped — reconnecting · since hh:mm"; after 2.5 min (their page
  gives up at 2) → "Dropped and not back yet"; ✕ dismisses. Back in the call → row gone.
- **Leave on purpose is not a drop:** the leaving page sends a `{type:'bye'}` data message
  (≤ 0.4 s) before disconnecting; Remove is marked by the specialist's own click.
- If the participant's own entry exists (partial outage → "reconnecting" written), the dropped row
  is hidden to avoid two rows.
- LiveKit notices a fully offline participant after its timeout (~15–30 s), so the row appears then.
Hooks: `lkj-dropped-row`, `lkj-dropped-dismiss-btn`.
Revert: remove `noteDropped` / `clearDropped` / DataReceived listener / `sendBye()` call and the
`lkj-dropped-row` block.

## 2026-11-28 — waiting-room alerts: no pop-up seen, one beep too easy to miss (operator test)
- **Pop-up:** the permission was only asked inside the Join click; if that prompt was missed,
  dismissed or auto-quieted by Chrome, nothing told the specialist. Now the call screen shows a
  chip while permission isn't granted: **Turn on** (asks + fires a sample pop-up), or — if
  blocked — how to allow it in the address bar. Notifications now `requireInteraction` (stay until
  clicked). The waiting panel has **Test sound & pop-up**, with a hint about the computer's own
  notification settings / Focus mode (a page can't detect an OS-level block).
- **Sound:** the 2-note beep (0.35 s) is replaced by a doorbell ringtone (E5-G#5-B5 played twice,
  ~2 s), repeated every 8 s while someone waits, for up to 1 min; any click on the panel, Admit,
  Deny or clicking the pop-up silences it.
Hooks: `lkj-wr-alerts-chip`, `lkj-wr-alerts-on-btn`, `lkj-wr-alerts-close-btn`, `lkj-wr-test-alert-btn`.
Revert: restore `prepareHostAlerts` / `alertWaiting` / `playChime` from 3e085042 and drop the chip.

## 2026-11-28 — Deep Filter: robotic voice in noise + voice leveller (offline tests)
**Offline harness** (scratchpad, not in repo): the shipped worklet code + `df_bg.wasm` + model, driven
128 samples at a time in Node; synthetic voice (macOS `say`) + generated babble / fan noise.
- **Robotic in noise = the 80 dB removal limit.** Loud mixed room: today (80 dB, gate, ×1.2) cut
  10.9 % of speech frames by > 15 dB; 20 dB / gate off cut 4.9 % with the same noise left (−31/−32
  dBFS). DFN can't remove other people's voices (~7 dB whatever the setting). The gate barely acts
  in loud noise. Recommendation: removal 20–30 dB, gate off — **not yet applied** (operator to decide).
- **DFN lowers the voice ~7 dB** (the fixed ×1.2 boost only gives back 1.6 dB).

**Voice leveller** (vendor worklet, after the gate; `levelerEnabled` / `setLevelerEnabled`; app
`dfnLevelOn`, **off by default**, diag toggle "Voice leveller" `lkj-dfn-leveller-toggle`; when on, the
fixed boost is 1.0):
- 10 ms blocks; speech = above a tracked noise floor (+9 dB), above −50 dBFS and within 10 dB of the
  speaker's level; speaker level rises fast (0.25 s) / falls slowly (2 s) so it locks onto the
  person at the mic; gain −6…+12 dB toward −18 dB on that estimate (≈ −20 dBFS RMS out), 3 dB/s up
  / 6 dB/s down (faster and capped at +6 dB during the first 3 s of speech); held in silence;
  digital silence ignored; instant peak guard at −1 dBFS.
- Bugs found while testing and fixed: DFN's start-up zeros set the noise floor to −120 dB (all
  background then counted as speech); background chatter steered the level; 3 ms limiter let
  104 samples clip → peak guard.
- Result: speech level −20…−21 dBFS in every room/speaker except a very soft one (−26, gain cap);
  today −17…−37. After the first ~3 s the voice-to-noise gap equals Test C (±0.5 dB) — no noise
  pumping. Side effect: chatter before the first words can be lifted up to +6 dB for ~2 s.
Revert: `dfnLevelOn` stays false = no change; remove the `lev*` code from the worklet string.
**Defaults changed (operator 2026-11-28 "make it default"):** `dfnAtten` 80 → 20, `dfnGateOn` true → false,
`dfnLevelOn` false → true (fixed boost held at 1.0 while the leveller is on). Applies whenever a person
switches Deep Filter on; the in-built noise cancellation stays the overall default. Sliders in the
`?diag=1` panel still override. Revert: set the three fields back.
