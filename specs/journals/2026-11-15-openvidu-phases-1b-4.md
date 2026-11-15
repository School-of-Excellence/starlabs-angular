# 2026-11-15 — OpenVidu Phases 1b, 2, 3, 4: host controls, call screen, ready servers, cleanup

**Plan:** `specs/plans/2026-11-14-openvidu-call-fixes.md`. **Status:** written + tested locally,
**uncommitted, not deployed**.

| Repo | Where | Branch |
|---|---|---|
| starlabs-cloud-function | main folder `/Users/macbook/Projects/Functions/starlabs-cloud-function` | `fix/oci-controller-memory` — **all backend phases (0, 1, 1b, 3) on this one branch** (operator, 2026-11-15) |
| starlabs-angular | worktree `starlabs-angular-openvidu` | `feature/openvidu-call-fixes` |
| starlabs-e2e-tests | worktree `/Users/macbook/Projects/Functions/starlabs-e2e-tests-openvidu` | `test/openvidu-call-fixes` (from `origin/main`) |

**Branch change (operator, 2026-11-15):** "one branch per phase" for the backend is dropped. Phase 1
was copied from `fix/oci-server-reliability` (worktree `starlabs-cloud-function-phase1`) onto
`fix/oci-controller-memory` with `git apply` (same base `dbb2960`, applied cleanly). The phase1
worktree + branch still exist, untouched, and are now redundant.

---

## What changed and WHY

### Backend (`starlabs-cloud-function`, `fix/oci-controller-memory`)

| Item | File | Change | Why |
|---|---|---|---|
| 1b (4.1–4.3) | `components/openVidu.js` | New `roomServiceForRoom(roomName)`: reads `openviduroom/{room}.mediaProvider` server-side (missing = `oci`, same default as token/recording), picks creds with `getCredsFor()`. Used by `muteParticipant`, `kickParticipant`, `openViduCloseRoom`; all three now bind `...OCI_endpoint.SECRETS`. | They always used the AWS credentials, so on every OCI call (all calls since 12 Aug) mute / remove / end room did nothing. Server-side lookup: the app can't fake it and needs no change. |
| 3.1 (Option A) | `components/OCI_endpoint.js` | `MEDIA_NODE_READY_AFTER_MS = 8 min` + `isMediaNodeReady()`: a pool instance is ready when `Running` and created ≥ 8 min ago. `checkOciCapacity` allows a room only on **ready** nodes and returns `needsNode` (orders one more only when even the *ordered* nodes are full). `prepareRoom` / pre-create order a node only on `needsNode`, otherwise "please wait". Status doc gets `instanceStates.ready` and per-instance `isReady`. | Capacity counted *ordered* nodes, so a 2nd call was let in while its node was booting and landed next to call 1 (lag). OpenVidu 3 has no readiness API → time-based. 8 min = the 5–8 min bootstrap measured 2026-07-16 (journal `2026-07-16-oci-recording-and-webhook.md`). **Tune after measuring boots in Grafana**; Option B (boot-script callback) if not enough. |
| 3.1 side effect | same | Pre-create no longer scales up when the capacity check *throws* (Oracle error). | Ordering paid servers on an API error was never intended; the 1.5 top-up handles node count anyway. |
| 4 (dropped) | `components/appointment.js` | **No change.** A guard skipping the Zoom fields on OpenVidu bookings was written, then reverted (operator, 2026-11-15: keep writing them as before). | Harmless: it only copies the host's stored link from `EISzoomcontact` (no Zoom API call, no cost); nothing reads it for OpenVidu bookings. |

**Found, NOT changed (operator decision needed):** the same trigger's confirmation email sets
`meetingurl` = the host's **Zoom URL** for every non-journeycoach booking — including OpenVidu
bookings. Those participants get a Zoom link for an OpenVidu call. Changing customer email content is
outward-facing, so it is left as is.

### Angular (`feature/openvidu-call-fixes`)

| Item | File | Change | Why |
|---|---|---|---|
| 2.1 + 3.1 | `LiveKit/join-livekit-call` `checkServer()` + html | Waits for a **ready** node (`instanceStates.ready`, falls back to `healthy` for old status docs). Stopped / starting → "Starting the video server, about 10 minutes…" + elapsed time; the real error only after **20 min** (`SERVER_WAIT_LIMIT_MS`). Moves on to the pre-join by itself. | "Server Failed to start" showed whenever the server was off — but the 5-min job now wakes it (1.2). |
| 2.1 wake touch | same | While the OCI server is stopped, writes `openviduroom/{id}.waitingForServerAt` (once, then every 10 min). | Wake-on-join only counts rooms updated in the last 30 min; an older room (e.g. pre-created long before) would never wake the server. The touch keeps it fresh. |
| 2.1b | same, `getTokenWithRetry()` | 503 `SCALING_IN_PROGRESS` retried for up to **12 min** (gap ≤ 30 s), "Getting a video server ready for you…" + elapsed; leaving stops it; failure text shown on the "left" screen (`joinError`). | Was 3 tries over ~3 min — shorter than a node boot (the 2026-07-16 "known UX gap"). |
| 2.2 | join screen + `openvidu-audio-element` | "Tap to enable sound" button on `RoomEvent.AudioPlaybackStatusChanged` / `room.canPlaybackAudio`, and when an audio element's `play()` is refused (`playbackBlocked` output). Tap → `room.startAudio()` + play every `<audio>`. | Safari / iPhone block sound until a tap; the app only logged it → "can't hear the other side from the start". |
| 2.3 (D8) | join screen | **Echo cancellation ON** with the noise filter (`micCaptureOptions()`; `applyDfnProcessor` and `setNcMode` too). NS + AGC stay OFF with DFN (July fix). | DFN removes noise, not echo; EC was switched off with NS/AGC but never shown to be the cause of choppiness. |
| 2.4 | join screen | Speaker follows the OS default output when earphones / Bluetooth come or go (auto mode, until the person picks in the menu). On LiveKit's automatic mic restart (mic unplugged) → re-acquire with our constraints + fresh DFN (`TrackEvent.Restarted`, skipped for our own restarts via `switchingMic`). Mic audio processing resumed if the browser pauses it. | The call never followed the device; LiveKit's restart drops our capture settings (it restarts with only a deviceId → browser NS/AGC back on, DFN fed pre-gated audio). |
| 2.4 deviation | same | A newly plugged headset does **not** take over the mic (plan said "follow the default mic"). Mic switches only when the one in use disappears (→ built-in). | Consistent with the existing join rule (prefer built-in mic: a Bluetooth mic forces low-quality HFP). Earphones stop echo with no mic change; the "can't hear" bug is the speaker side. |
| 3.3 | `Service/AdaptiveQuality` | Medium 960×540, 800 kbps, layers [h180, h360, h540] (was 720p / 1 Mbps / h720); warm-up 20 s (was 45 s, set for Koala, which is gone). Unit spec updated to the new pinned values. | Lighter on the sender's CPU (blur + DFN share it) and on the media node. |
| 4 | `appointment-studio`, `list-openvidu-room` | `// TODO: Check Server` replaced with a pointer to where the check now lives. | 1.2 + 2.1 are the server check. |

Not done: **3.0 / plan 3.1 "measure"** needs OCI console / Grafana access (server shape, CPU with 1 vs
2 recorded calls, real boot time for `MEDIA_NODE_READY_AFTER_MS`). **LiveKit `node_selector`** on the
master and the **13-OCPU quota** still need someone with OCI access.

---

## Tests run (local)

- **Backend controller** (mocked Oracle / LiveKit / Firestore, scratchpad `oci-controller-test/test.js`):
  **16/16** — the 12 Phase 1 scenarios on the merged branch + 4 new: booting 2nd node → 2nd call waits,
  nothing ordered · node ready → allowed · all busy → orders one, waits · status doc carries `ready`.
- **Host controls** (`hostctl.test.js`): **12/12** — oci room → OCI creds, aws room → AWS creds, room
  without `mediaProvider` → OCI, OCI secrets bound, for all three functions. Old code fails 9 (the OCI cases).
- `node --check` on all three changed CF files.
- **Angular:** `ng build --configuration production` ✅; `adaptive-quality.service.unit.spec.ts` **78/78**.
- **e2e:** `queue/join-livekit-server-wait.spec.ts` (LKJ-01..03 + ADDR1) in the hub worktree; `--list`
  registers 4; hook-diff aligned (LiveKit + OpenVidu). **Never executed** — runs once before push.
- **Not tested:** anything on a real browser call / `starlabs-test` deploy (audio by ear, device
  plug/unplug, Safari tap, 5 simultaneous appointments). The plan's two-laptop test is still to do.

## ⚠️ Deploy order

1. Angular release first (it sends the sign-in token, 1.3; and understands `ready`).
2. Then the backend functions: `CheckOciNodeStatus`, `startOciMasterHTTP`, `stopOciMasterHTTP`,
   `scaleOciMediaNodes`, `createOpenViduToken` (capacity gate lives in `OCI_endpoint.prepareRoom`),
   `muteParticipant`, `kickParticipant`, `openViduCloseRoom`.
3. Old Angular + new backend: monitor buttons 401 (1.3). New Angular + old backend: fine (`ready`
   missing → falls back to `healthy`).

---

## Revert guide (per file / screen)

| What to undo | How |
|---|---|
| Host controls (1b) — `openVidu.js` | Restore the inline `new livekitServer.RoomServiceClient(LIVEKIT_URL.value(), LIVEKIT_API_KEY.value(), LIVEKIT_API_SECRET.value())` in the 3 functions, drop `...OCI_endpoint.SECRETS` from their secrets, delete `roomServiceForRoom`. |
| Ready-node capacity (3.1, backend) | In `checkOciCapacity` set `maxRooms = totalInstances * CONFIG.maxRoomsPerInstance` and `needsNode = !allowed`; or set `MEDIA_NODE_READY_AFTER_MS = 0` (ready = Running) as a quick soften. |
| **Join screen `/joinroom`** — server wait (2.1/3.1) | `checkServer()`: back to `healthy > 0` → prepare, `running/starting` → serverstarting, else serverfailed; drop the ticker/touch helpers; html: the three original one-line blocks. |
| **Join screen** — token wait (2.1b) | `getTokenWithRetry()`: back to `while (retryCount <= 3)` with `retryAfter` waits; remove the `tokenWait` template branch and `joinError` block. |
| **Join screen** — echo (2.3) | `micCaptureOptions()` → `echoCancellation: !this.dfnEnabled`; `applyDfnProcessor` DFN constraints → `echoCancellation: false`. |
| **Join screen** — device following (2.4) | Remove the `MediaDevicesChanged` listener, `watchMicTrack()` call and the helper methods; `selectMic/selectSpeaker` keep working (the `byUser` param is harmless). |
| **Join screen** — tap for sound (2.2) | Remove the `AudioPlaybackStatusChanged` listener, `enableSound()`, the button + CSS; audio element: drop `playbackBlocked`. |
| Adaptive quality (3.3) — every call | `TIER_CONFIG.medium` → `{ width: 1280, height: 720, frameRate: 20, maxBitrate: 1_000_000, simulcastLayers: [h180, h360, h720] }`, `WARMUP_MS = 45_000`; revert the spec lines. |
| TODO comments (appointment studio, list-openvidu-room) | Cosmetic, nothing to revert. |
| e2e | Drop `queue/join-livekit-server-wait.spec.ts` + the `OCI_System` seed block (hub branch `test/openvidu-call-fixes`). |

---

## Test round 1 on starlabs-test (2026-11-15, 2:50–3:45 IST) → fixes 1–7

Operator test: laptop A = Mac + Chrome (host), B = second laptop, a third device for Room 2.
Rooms: Room 1 `mh2b3wEEdc9sehLghCDI`, Room 2 `p0CCLAZbd4ptsmPoPuJB`, Room 3 `h4NT6SxKYF3o3u5PxTXQ`.
Evidence from `firebase functions:log` (NB: the CLI's `-n` returns a ~10-min SLICE, not the
latest N — a wrong slice once made it look as if `openViduCloseRoom` was never deployed; it was,
and it closed Room 1 at 3:33:02 IST and Room 3 at 3:43:02 IST).

What worked: wait screen + auto move to pre-join; host controls reach OCI; Room 2 waited ~9 min
for its own node (3:17 → 3:26) and had no lag; End call closed the room on OCI.

| # | Seen | Cause | Fix (file) |
|---|---|---|---|
| 1 | B heard echo while A (Mac Chrome) used laptop speakers; none once A used earphones or Safari | Speaker-follow (2.4) set a SPECIFIC output device id. Chrome's echo cancellation is unreliable on a non-default output (LiveKit's own code notes it); Safari cannot pick outputs → default → no echo. Not proven — retest by ear. | Auto mode plays to `"default"`, which follows the OS by itself; a picked device that disappears → back to auto (`onDevicesChanged`, join screen) |
| 2 | Mute not instant | Cold start: a new function instance per click (mute 2:54:41 IST), nothing on screen | "Muting {name}…" note + menu label, repeat clicks ignored (`hostActionBusy`, join screen) |
| 3 | Remove: 1st click "did nothing", 2nd removed + "Failed to remove participant" | 1st request was cold-starting and did remove; the 2nd hit LiveKit `not_found` → 500 → generic alert | Same busy state; `kickParticipant` returns 200 "already left" on `not_found`/404 (`openVidu.js`); client shows the server's `error` text |
| 4 | Rejoined with earphones in → mic "Default" (= earphone mic) → unplugged → B heard nothing | "Default" never counted as unplugged, so nothing recovered; LiveKit's own restart drops our capture settings | `recoverMic()`: when the physical device behind the raw track is gone (groupId / ended), restart on the built-in mic WITH our settings, keep LiveKit's device map in step, re-attach DFN, `checkForSilence()` → one fallback to the OS default. Also used by the Restarted handler |
| 5 | Waiting clock started at "open link" | As built | Counts from room `createddate` when < 30 min old, else from opening (`recentCreationMs`, `waitElapsed`) |
| 6 | Charan's Room 2 tab (behind the Room 1 call) asked once at 3:18 and never again | Retry slept in 1 s steps; Chrome runs background-tab timers ~once a minute → 30 s became ~30 min | One timer per wait; tab coming to the front or leaving ends it early (`waitForRetry`, `retryWake`) |
| 7 | "Create new room" slow to redirect | Waited for `startOciMasterHTTP` (cold start + Oracle) before navigating | Navigate first, wake call in the background; OCI failure only logged (the 5-min job wakes a fresh room) (`openvidu-recording`) |

Test-step corrections (my errors in the test script, not app bugs): End call closes only its
own room; "Cannot stop: N active room(s)" is the existing safety rule in `stopOciMasterHTTP`, so
the wake-on-join test must wait for rooms to close and the server to stop by itself, then set a
room `active: true` in the starlabs-test console and open its link.

Observed, not changed: every active room orders a media node (1.5 pre-order) — a room created and
never joined held a node until housekeeping closed it after 15 min (pool went to 3).

Checks: `ng build --configuration production` ✅; host-control test 14/14 (+ kick "already left"
→ 200, other errors → 500); controller test 16/16. Not re-tested on a call yet.

### Revert guide (fixes 1–7)

| What to undo | How |
|---|---|
| 1 Speaker to default — join screen | `onDevicesChanged` speaker block: back to following the default output's `groupId` with the concrete device id (`lastDefaultOutputGroup` + `defaultOutputGroup()`) |
| 2/3 Busy state — join screen | Remove `hostActionBusy`/`hostActionNote`, `startHostAction`/`endHostAction` calls, the `[disabled]` + label bindings and `.host-action-note` |
| 3 Kick "already left" — `openVidu.js` | Drop the inner try/catch around `removeParticipant`; redeploy `kickParticipant` |
| 4 Mic recovery — join screen | `onMicRestartedByLiveKit` back to restartTrack on the track's own deviceId; remove `recoverMic`/`preferredMic`; `onDevicesChanged` mic block back to the `micGone` (id) check + `selectMic` |
| 5 Clock from creation — join screen | Remove `roomCreatedAt` / `recentCreationMs`; `waitElapsed` counts from `startedAt` |
| 6 Background retry — join screen | Back to the 1 s sleep loop; remove `waitForRetry`/`retryWake` |
| 7 Create room — `openvidu-recording` | Await the wake call before `router.navigate` (restore the alert) |

---

## Test round 2 on starlabs-test (2026-11-15, ~10:45–11:05 PM IST, room `7hQvjCqhjXetiL9BGY4s`) → fixes A–E

Passed: 1 create-room redirect, 2 clock from creation, 3/3b background tab, 4 echo on speakers
(fix 1 holds), 6 unplug → back to the MacBook mic, 10 remove after leaving.

| # | Finding | Cause (evidence) | Fix |
|---|---|---|---|
| A | Mute ~20 s, remove 5–10 s, end call slow; "only happens after a tap" | Cold start, not the network or the screen. Logs (UTC): mute request 17:25:06 → instance ready 17:25:21 → done 17:25:24; kick 17:26:58 → 17:27:04 → 17:27:07; close 17:35:20 → 17:35:29 → 17:35:32. Each function loads the whole codebase on start. The screen updated when the server answered; no code path waits for a tap | Host's call screen POSTs `{warmup: true}` to `muteParticipant`, `kickParticipant`, `openViduCloseRoom` on join and every 10 min (`startHostWarmup`/`stopHostWarmup`); each function returns 204 first thing (`openVidu.js`). ≈ $0.70/month at 20 calls/day vs ~$21 for `minInstances: 1` on all three (operator chose pings) |
| B | Rejoin with earphones → unplug → both sides heard distortion; mute/unmute cleared it | Console `2 [devices] mic in use disappeared` = two recoveries at once. The `switchingMic` guard was set after `await refreshDevices()`, so two device-change events both passed; both restarted the mic + attached DFN, both saw "silence" (just-opened mic), both fell back again → stacked noise-filter graphs on one AudioContext | `micRecovering` taken synchronously; a trigger during a recovery sets `micRecheckPending` → one `checkMicStillPresent()` afterwards. Silence check waits 0.5 s and needs two silent checks before the OS-default fallback (`recoverMic` → `restartMicOn`) |
| C | Logs said "RAW (echo cancellation off)" and "applyConstraints failed: OverconstrainedError" | Both read `micTrack.mediaStreamTrack`, which with DFN attached is the filter's output (`MediaStreamAudioDestinationNode`), not the mic. EC was on at capture | `rawMicTrack()` (LiveKit's `_mediaStreamTrack`) for the mic check and the constraint step. Behaviour note: the constraint step now really reaches the mic (same values as capture, so a no-op in practice; before, it always failed) |
| D | "deepfilter-audio-processor is already registered" on every DFN re-attach | The DFN vendor code re-added its worklet module to the reused AudioContext | `createWorkletModule` loads once per AudioContext (`WeakSet`) and revokes the blob URL (`dfn/vendor/deepfilternet3-noise-filter/index.esm.js`) |
| E | USB-C earphones listed in the menu but sound stayed on the speakers; Bluetooth switched fine | macOS kept "MacBook Pro Speakers" as the system output for the USB-C earphones (operator checked the Sound menu), and auto mode follows the system output | A NEW output plugged in during the call (not HDMI/DisplayPort/AirPlay/display/TV/monitor) takes the call's sound in auto mode; unplugged → back to default; a menu pick turns it off for the call (`knownOutputIds`, `autoSpeakerId`, `onDevicesChanged`). Mic unchanged (built-in stays). Risk: a newly plugged loudspeaker gets a specific sink → round-1 echo setup |

Not done: earphones plugged in BEFORE joining are not auto-picked (offered, not asked for).

Checks: `ng build --configuration production` ✅; host-control test 17/17 (+ warm-up → 204 with no
LiveKit call, ×3); controller test unchanged. Not re-tested on a call yet.

Deploy: Angular, then `muteParticipant`, `kickParticipant`, `openViduCloseRoom` (pings to the old
functions just get a 400 — harmless, so either order works).

### Revert guide (fixes A–E)

| What to undo | How |
|---|---|
| A Warm-up — join screen | Remove `startHostWarmup`/`stopHostWarmup`, their 3 call sites, `hostWarmTimer`, `HOST_WARMUP_EVERY_MS`, `HOST_CONTROL_FUNCTIONS` |
| A Warm-up — `openVidu.js` | Delete the `if (req.body && req.body.warmup) return res.status(204).end();` line in the 3 handlers; redeploy them |
| B One recovery — join screen | Merge `restartMicOn` back into `recoverMic(reason, fallbackToDefault)` with the recursive fallback; drop `micRecovering`/`micRecheckPending`; inline `checkMicStillPresent` into `onDevicesChanged` |
| C Raw mic — join screen | `logMicProcessingState` and `applyDfnProcessor` back to `micTrack.mediaStreamTrack`; remove `rawMicTrack` (also used by `checkMicStillPresent` → `(micTrack as any)._mediaStreamTrack`) |
| D Worklet once — DFN vendor | `createWorkletModule` back to the plain 3-line `addModule` |
| E New output — join screen | `onDevicesChanged` speaker block back to the fix-1 version (picked-gone + default); remove `knownOutputIds`, `autoSpeakerId`, `NOT_EARPHONES`, the init line after the join `refreshDevices()`, and `autoSpeakerId = null` in `selectSpeaker` |

---

## Test round 3 on starlabs-test (2026-11-16, ~12:00–12:21 AM IST, room `N4ATwkSzsdjNlXm374ZZ`) → fix E2

Passed: clean mic logs (C, D), mute / remove / end call fast, echo on speakers, menu pick wins (8),
mic unplug without distortion (9 → fix B holds), still fast after 20 min (10).

- **A warm-up confirmed from logs** (operator saw nothing in the Network tab — it only records while
  DevTools is open, and the pings fire on join): `muteParticipant` instance started 18:30:30 UTC (host
  joined), mutes at 18:34:51 and 18:50:36, kick 18:35:18 and close 18:51:14 ran with no new instance.
- **Test 6 (E) failed:** console showed `newly plugged "AB13X USB Audio (12d1:3a07)"` and the output
  set to it, but A still heard the call on the laptop. Replugging in test 8 did move it. Likely (not
  proven): the switch ran the instant macOS listed the USB-C device, before it could play, and Chrome
  kept the old output. **Fix E2:** wait 1.5 s (`NEW_OUTPUT_SETTLE_MS`), re-check the device is still
  listed and still auto mode, then switch (`switchToPluggedSpeaker`, `autoSpeakerTimer`, cleared on
  leave). The `[speaker] output →` log is now one line: each `<audio>` element `=OK` or its actual
  sinkId.
- Mic stayed on the MacBook in test 6 — by design (E moves only the speaker).
- Test 7: B heard a short echo for ~10 s after A unplugged — Chrome's echo canceller re-adapting to
  the new speaker; expected, not changed.

Checks: `ng build --configuration production` ✅. Retest: test 6 three times (unplug, wait 5 s, plug).

| What to undo | How |
|---|---|
| E2 delay — join screen | In `onDevicesChanged` set `autoSpeakerId` and `await this.selectSpeaker(target.deviceId, false)` directly; remove `switchToPluggedSpeaker`, `autoSpeakerTimer` (+ its clear in `leaveRoom`), `NEW_OUTPUT_SETTLE_MS` |
| One-line speaker log — join screen | Restore `console.log(\`[speaker] output → "${label}"\`, els.map(el => ({ element: el.id \|\| '?', sinkId: el.sinkId })))` |
