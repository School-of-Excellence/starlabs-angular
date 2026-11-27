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
