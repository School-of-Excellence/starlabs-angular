# OpenVidu call fixes: causes, examples, plan

**Status:** ✅ APPROVED by operator 2026-11-14 · Phases 0, 1, 1b, 2, 3, 4 written 2026-11-15 (uncommitted, not deployed) — journals `2026-11-14-openvidu-phase1-server-reliability.md` + `2026-11-15-openvidu-phases-1b-4.md`. Open: 3.0 measurement (needs OCI access), real-call testing.
**Repos:** starlabs-angular (`development`) and starlabs-cloud-function (`development`)
**Production today:** OCI is the active cloud (since 12 Aug). The AWS cluster is stopped and kept as a backup.

---

## How a call works

```
Studio / appointment screen ──creates──▶ openviduroom/{id}  (Firestore)
                                                │
Participant opens /joinroom/{id} ──▶ checks "is the server up?"  (OCI_System/instance_status)
                                                │ yes
                                   createOpenViduToken  ──▶ connects to the OCI media server
                                                │
          A background job runs every 5 min (CheckOciNodeStatus) and decides
          when to START and STOP the OCI server, to save money
```

All three problems sit on this path: the 5-minute job (problem 2), the browser's audio handling
(problem 1) and the media server itself (problem 3).

---

## Problem 2: "Server Failed to start" ✅ proven with production logs

### What's happening

The 5-minute job is meant to start the server 15 minutes before a meeting and stop it when nobody is using it.
**But it often stops the server at the exact minute the meeting starts.**

### Real examples from last week

| Meeting (IST) | Server started | Server stopped | What the user saw |
|---|---|---|---|
| Thu 12 Nov, 15:00 | 14:45 | **15:00** | Opened the call at 15:04 → "Server Failed to start". Nobody ever connected. |
| Thu 12 Nov, 17:30 | 17:15 | **17:30** | Opened the call at 17:38 → same. Nobody ever connected. |
| Tue 10 Nov, 11:00 | 10:45 | **11:00** | Opened the call at 11:03 → same. |

### Why: four causes that stack

**Cause A: the job runs out of memory.**
To give the room a title like *"Ravi - Diagnostics (Coach Priya)"*, the job loads **every profile in
the database** (`profile_data.get()`, `OCI_endpoint.js` ~line 511) just to read 2–3 names. It does this
once per meeting. The job has only 256 MB, so it crashes mid-way. Logs: *"Memory limit of 256 MiB
exceeded"* at **14:55** and **17:25** on Thu 12, five minutes before each shutdown.
> Like printing the whole phone book to look up two numbers.

**Cause B: rooms made by the app don't record which cloud they're on.**
The job only counts a room as "in use" if it is marked `mediaProvider: "oci"`. Rooms created by the
appointment studio, dynamic studio and participant studio screens (`createOpenViduRoom`) don't carry
that mark, so the job thinks nothing is happening.
> Example: room `7KAPKbyUwYwGAQDzxMzJ` was created by the app at 15:04. It has no `mediaProvider`, so it was invisible to the job.

**Cause C: once a meeting starts, it no longer counts as "upcoming".**
The job keeps the server on only for meetings with `starttime > now`. At 15:00:03 a 15:00 meeting
fails that check. With no "upcoming" meeting and no counted room (causes A and B), the job decides the
server is idle and **shuts it down**.
> Like a shop that closes because the next customer is "not due yet", at the moment they're due.

**Cause D: only appointments wake the server.**
The job looks only at the `appointments` collection. Queue and dynamic-studio sessions and instant
meetings **never start the server**. If it's off, those users just see "Server Failed".

**Also:**
- The server takes **about 10 minutes** to boot. Room preparation at :50 always failed with "LiveKit not ready".
- Oracle's API sometimes answers "Too many requests", because the job asks for the full status up to 3 times per run.

### Fix plan, backend first

| # | Change | Where | Fixes |
|---|---|---|---|
| 2.1 ✅ | Look up only the 2–3 profiles needed (`getAll`), not the whole collection | `OCI_endpoint.js` `createOciRoomForMeeting` | A |
| 2.2 ✅ | Give the job more memory (512 MiB) as a safety margin | `CheckOciNodeStatus` options | A |
| 2.3 ⏸ | Keep the server on through the meeting: count meetings with `starttime` from **now − 60 min** to **now + 25 min**, not just "upcoming" | `CheckOciNodeStatus` meetings query | C |
| 2.4 ⏸ | Start the server **25 min** before a meeting instead of 15 (boot takes ~10) | same query | boot time |
| 2.4b ⏸ | Write the `openviduroom` record **before** creating the video-server room, so a crash still leaves a counted room | `createOciRoomForMeeting` | A |
| 2.5 | Stamp `mediaProvider` (the active cloud) when the app creates a room | `authguard.service.ts` `createOpenViduRoom` | B |
| 2.6 | **Wake-on-join (D2):** the existing 5-minute job starts the server when it finds an active room marked with its cloud (≤5 min + ~10 min boot); the call tab shows the 2.9 / 2.1b messages meanwhile | `CheckOciNodeStatus` | D |
| 2.7 | Add an admin login check to the manual start / stop / scale functions (today `startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes` are open to anyone with the URL) | `OCI_endpoint.js` | safety |
| 2.8 | Fetch Oracle status once per run and reuse it | `CheckOciNodeStatus` | "Too many requests" |
| 2.9 | **Replace "Server Failed to start"** with "Starting the video server, about 10 minutes…" plus a progress note. The call tab already watches `OCI_System/instance_status`, so it continues to the pre-join screen automatically when the server is ready. Keep a real error only if the server hasn't come up after ~20 min. | `join-livekit-call.component.html` (servercheck / serverstarting / serverfailed blocks) + `checkServer()` state mapping | what the user sees |

**Status key:** ✅ done (branch `fix/oci-controller-memory`, starlabs-cloud-function, not committed) ·
⏸ parked, see journal `specs/journals/2026-11-14-after-todo-openvidu.md`.

**2.9 note:** on its own, the new message only helps while the server is *actually* starting. If the
server is stopped and nothing wakes it (cause D), the user would wait forever. So ship 2.9 together with 2.6 (wake-on-join),
or show "Starting…" only when the status is `starting` and the old error when it's `stopped`.

**2.5 reverses a decision from 14 Aug** (journal `2026-08-14-default-provider-oci.md`: fallback routing
instead of stamping). Approved 2026-11-14 as D1, because production logs showed the cost of the old choice.

**How we'll test it:** see the Phase 0 and Phase 1 test rows in the build plan below.

---

## Problem 1: audio ⚠️ from reading the code (happens inside the browser, so not in server logs)

### 1a. Echo

**Cause:** the app runs its own noise filter (DFN). On any computer with 4+ CPU cores the filter is
**on by default**, and turning it on also **switches off Chrome's echo cancellation**
(`join-livekit-call.component.ts:602-605`). The filter removes background noise, **not echo**.

> **Example:** a coach on laptop speakers. The participant says "hello". It plays from the coach's speakers,
> the coach's mic picks it up, and it goes back to the participant, who hears their own "hello"
> a moment later. With earphones there's no echo, because the mic can't hear the earphones.

Why it was done: on 6 July we found that Chrome's *noise suppression* and *auto-gain* made the
filtered voice choppy (journal `2026-07-06-dfn-choppy-FIXED-raw-capture.md`). Echo
cancellation was switched off along with them; it was never shown to be the problem.

### 1b. Plugging in or removing earphones means no sound until both people rejoin

**Cause:** when a device changes, the app only **refreshes the device menu** (`:629`). It never
moves the call's mic or speaker to the new device.
- On Chrome, LiveKit only **announces** "default device changed". Nothing in the app listens for that.
- When the old device disappears, LiveKit restarts the mic on its own. That path **skips the app's
  noise-filter re-attach step**, so the filter's audio pipeline can end up sending silence.
- Nothing ever resumes paused audio processing.
- **Rejoining rebuilds everything**, which is why only a rejoin fixes it.

> **Example:** a participant joins on laptop speakers, then plugs in Bluetooth earbuds. The
> earbuds connect, but the call is still tied to the old mic and its filter pipeline, so the coach hears nothing. Taking
> the earbuds out doesn't help, because the call never followed the device in the first place.

### 1c. Can't hear the other side from the start (mainly Safari / iPhone)

**Cause:** browsers block sound that starts without a tap. The app only **logs** the block
(`openvidu-audio-element.component.ts`). There's no "Tap to enable sound" button.

### Fix plan

| # | Change | Where | Fixes |
|---|---|---|---|
| 1.1 | Keep **echo cancellation ON** when the noise filter is on (noise suppression and auto-gain stay off, as the July fix requires) | `setMicrophoneEnabled`, `applyDfnProcessor`, `setNoiseMode` | 1a |
| 1.2 | Listen for `MediaDevicesChanged` / `ActiveDeviceChanged`. In "auto" mode (no manual pick), when the default mic changes or the current one disappears, call `selectMic(newDevice)` (switches the mic and re-attaches the filter); same for the speaker via `selectSpeaker()`. Stop auto-switching once the person picks a device by hand | join screen | 1b (plug in) |
| 1.3 | On the local mic track's `TrackEvent.Restarted` (LiveKit's automatic restart after an unplug), clear `dfnProc` and run `applyDfnProcessor()` again with the 1.1 mic settings | join screen | 1b (unplug) |
| 1.4 | Watch the filter's audio processing (`AudioContext` state); if the browser pauses it, resume it | join screen | 1b |
| 1.5 | Show a "Tap to enable sound" button when the browser blocks sound (`AudioPlaybackStatusChanged` / `room.canPlaybackAudio` → `room.startAudio()` inside the tap); `openvidu-audio-element` reports a refused `play()` instead of only logging it | join screen + audio element | 1c |

**How we'll test it:** two laptops on `starlabs-test`.
- (a) Speakers, no earphones: there should be no echo, and the filtered voice must still not be choppy (the July test, by ear).
- (b) Plug in and remove wired earphones and Bluetooth buds mid-call: sound should continue both ways without rejoining.
- (c) Safari: the sound button should appear, and tapping it should start audio.

> Risk to check by ear: echo cancellation can briefly duck the voice when both people talk at once. If 1.1
> brings back choppiness, fall back to: filter ON + echo cancellation ON only when no headset is detected.

---

## Problem 3: laggy video ⚠️ likely causes, not yet measured

### Causes

**3a. Two calls end up on one media server.** The design is *one room per media server*. But
the capacity check counts servers **ordered**, not servers **ready**.
> **Example:** room 1 is running on server 1. Room 2 asks to join, so the system orders server 2 (10 min
> to boot). Room 3 asks a minute later: "2 servers, 2 rooms, fine". But server 2 isn't up yet, so
> rooms 2 and 3 land on server 1. Three calls now share one server's CPU, and video stutters for everyone.
> Fri 06 Nov reached the 5-server limit, so this happened at peak.

**3b. Every call records automatically on the same server.** Each room's recording (a combined
video of the room) runs on the same media server as the call itself. Two recorded rooms on one server compete
for CPU. Our June test ruled recording out with only **one** room, and on AWS, not OCI.

**3c. Video is held back on purpose.** To keep lips in sync with the audio buffer, video is
delayed 120–300 ms (`jitter-buffer.ts`). That's not a stutter, but people notice a delay.

**3d. The user's own computer.** The camera captures 720p even at "medium" quality, and blur and the noise filter
use the same CPU. Quality drops only after a 45-second warm-up, with a 60-second wait between steps.

### Fix plan (measure first, then change)

| # | Change | Where | Fixes |
|---|---|---|---|
| 3.0 | **Measure:** install the Oracle CLI read-only, check the media server size (OCPUs) and its CPU during a recorded call | OCI console / CLI | evidence |
| 3.1 | Capacity check counts **ready** servers, not ordered ones; return "please wait" until the new one is up (detail below) | `OCI_endpoint.js` `checkOciCapacity` | 3a |
| 3.2 | ~~Recording policy~~: recording stays as today (D7) | – | 3b |
| 3.3 | Lower "medium" to 540p and shorten the warm-up to about 20 s | `adaptive-quality.service.ts` | 3d |
| 3.4 | Leave the 3c delay as is unless people complain about delay specifically | – | 3c |

### 3.1 in detail: ordered vs ready

**Where each number comes from today:**

| Number | Source | Meaning |
|---|---|---|
| **Ordered** | `instancePool.size` (Oracle's pool size), stored as `media.desiredCapacity` | How many media servers we've **asked** Oracle for |
| **VM running** | Pool instances in state `Running`, stored as `media.instanceStates.healthy` (`collectOciStatus`) | The virtual machine is on, **but the video software may still be installing** (a few more minutes) |
| **Ready** | ❌ not tracked anywhere | The media server has joined the cluster and can take a call |

`checkOciCapacity()` uses **ordered** (`instancePool.size`). That's why a second call is let in while
the new server is still booting.

**Change:**
1. **Count ready servers.** *Checked 2026-11-14:* OpenVidu 3 **removed** the v2 "list media nodes" API (`GET /openvidu/api/media-nodes`), its health check no longer returns nodes, and the 3.8 Oracle/Elastic admin docs give no readiness endpoint. Oracle's `Running` and our `ociEventWebhook` only see the *machine*. So "ready" must come from us:
   - **Option A (start here, no server change):** ready = pool instance `Running` for **N minutes**. Measure N first from the media node logs in Grafana (`https://<master>/grafana`, "OpenVidu Cluster Nodes Logs") across a few boots, then add a margin.
   - **Option B (precise, later if A isn't enough):** add a last step to the media-node boot script (the Terraform template we already patch): when the `openvidu` service is up, call a new Cloud Function with the instance id and a shared secret, which records it as ready in `OCI_System/instance_status`. Remove it when the instance leaves the pool.
   - Rejected: reading the master's internal metrics (Mimir via Grafana) is fragile and needs admin credentials; probing media-node ports is blocked by the firewall.
2. `checkOciCapacity`: `allowed = otherRooms < readyServers × maxRoomsPerInstance`. Still order a new
   server when `otherRooms ≥ ordered`, but answer 503 "please wait" until it's **ready**.
3. Write the ready count into `OCI_System/instance_status` too, and make the call tab's `checkServer()`
   wait for **ready ≥ 1** instead of "VM running ≥ 1". Today it can let someone in while the media
   software is still installing, and they then hit "Media node not ready" retries.
4. ~~Spare server in working hours~~: parked (D5, journal).

---

## Problem 4: host controls (mute / remove / end room) don't reach OCI

**Cause:** `muteParticipant`, `kickParticipant` and `openViduCloseRoom` (`openVidu.js`) always use the **AWS**
credentials (`LIVEKIT_URL/KEY/SECRET`). On an OCI call (every call since 12 Aug) they talk to the AWS server,
which has no such room, so the host's mute, remove or end click does nothing.

> **Example:** Priya clicks "Mute Ravi". The function asks the *AWS* server to mute Ravi in room
> `7KAP…`. AWS doesn't know that room (it's stopped anyway), so the request fails and Ravi stays unmuted.

| # | Change | Where |
|---|---|---|
| 4.1 | Each function reads `openviduroom/{roomName}.mediaProvider` itself (empty = `oci`). Server-side, so it can't be faked and **no app change** is needed | `openVidu.js`: `muteParticipant`, `kickParticipant`, `openViduCloseRoom` |
| 4.2 | Pick credentials with the existing `getCredsFor(provider)` (recording already does this) | same |
| 4.3 | Give the 3 functions access to the OCI secrets: add `...OCI_endpoint.SECRETS` to their `secrets` list | same |
| 4.4 | Test on `starlabs-test` OCI: mute → participant's mic goes off; remove → they're disconnected; end room → everyone disconnected and the record shows `roomstatus: "finished"` | – |

Risk is low: the AWS path is unchanged when `mediaProvider == "aws"`.

---

## Suggested order

Superseded by the **Build plan** below (Phases 0 → 1 → 1b → 2 → 3 → 4).

---

## Decisions (revised 2026-11-14)

| # | Decision | Status |
|---|---|---|
| **D1** | Mark every room with its cloud (`openviduroom.mediaProvider`). **Revised:** set it inside `createOpenViduRoom()` (`authguard.service.ts`), reading `openvidu server/mediaprovider`, the same way the instant-meeting screen already does. No new function | ✅ **Approved** 2026-11-14 |
| D2 | A join wakes a stopped server | ✅ **Approved** 2026-11-14: **extend the existing 5-minute job** (no new function): when it finds an active room marked with its cloud and that server is stopped, it starts it. Wake within ≤5 min + ~10 min boot |
| D3 | Server on/off schedule around meetings | ⏸ **Parked**: keep today's behaviour; journal TODO 3. Don't raise it until the operator says so |
| D4 | Raise the max media servers | ⏸ **Parked**: journal TODO D4 |
| D5 | Spare server in working hours | ⏸ **Parked**: journal TODO D5 |
| D6 | Calls per media server | ✅ **Keep 1** (`CONFIG.maxRoomsPerInstance: 1`, `OCI_endpoint.js`, no change). The "ordered, not ready" fix (3.1) makes it hold: `checkOciCapacity()` + a new ready count in `OCI_System/instance_status` + the call tab's `checkServer()` |
| D7 | Recording policy | ✅ **Keep as today**: automatic from the first person in, stops when the last leaves |
| D8 | Echo / audio fix | ✅ **Approved** 2026-11-14: echo cancellation ON with the noise filter (noise suppression and auto-gain stay off); test by ear |
| D9 | Mobile app join button | ❌ Not needed |
| D10 | AWS | **Keep as standby.** Idle; only affects OCI through the host controls (Problem 4) |
| D11 | Deploys | **Operator deploys by hand** |
| D12 | Angular branch | ✅ Existing worktree `../starlabs-angular-openvidu`, now on branch `feature/openvidu-call-fixes` from `origin/development` (no upstream set) |

---

## Build plan (revised)

Effort: S ≈ under ½ day · M ≈ 1–2 days · L ≈ 3+ days, including testing.

### Phase 0: ship what's done (S) · ready now
| Step | Work | Done when |
|---|---|---|
| 0.1 | Code ready on `fix/oci-controller-memory` (starlabs-cloud-function): profile lookup + memory 512 MiB | ✅ written, uncommitted |
| 0.2 | **Operator deploys** `CheckOciNodeStatus` to `starlabs-test` | Deploy succeeds |
| 0.3 | Book a test OpenVidu appointment 20 min out; watch the logs | Room record written ~1 s after the video-server room; no memory error |
| 0.4 | Commit (on your OK) → merge to `development` → **operator deploys** to `fir-sample-aae4a` | Production logs show no memory errors from this job |

### Phase 1: server reliability, backend (M) · D1 + D2 approved · ✅ written 2026-11-14 (uncommitted, not deployed; journal `2026-11-14-openvidu-phase1-server-reliability.md`)
| Step | Item | Change |
|---|---|---|
| 1.1 | 2.5 (D1) | `createOpenViduRoom()` (Angular, `authguard.service.ts`): read `openvidu server/mediaprovider.activeprovider` and save it as `mediaProvider` on the room record (pattern already used by `openvidu-recording.component.ts`) |
| 1.2 | 2.6 (D2) | **Extend `CheckOciNodeStatus`:** count active OCI rooms even when the server is stopped; if any exist, start it (master + pool sized per 1.5). Relies on 1.1 (rooms marked with their cloud) |
| 1.3 | 2.7 | `startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes`: require a logged-in admin |
| 1.4 | 2.8 | `CheckOciNodeStatus`: fetch Oracle status once per run |
| 1.5 | new | **Order servers for upcoming meetings.** When the job starts the server (or on any run), set the media pool to the number of meetings starting in the next 15 min (capped at the max), instead of always 1 (`startOciMaster` → `setPoolSize(1)`) and then adding one at a time as rooms appear. Example: 5 meetings at 15:00 → 5 servers ordered at 14:45, all ready by ~14:55 |
| 1.6 | new | **Fix the shrink bug.** The end-of-run top-up (step 5 in `CheckOciNodeStatus`) uses the server count read at the *start* of the run; if room preparation ordered more servers during the run, the top-up sets a lower number and Oracle deletes a booting server (seen Fri 06 Nov 16:55: pool 2 → 3 → 2). Re-read the pool size before topping up, and never lower it there |
| **Test** | | 5 test appointments at the same time → 5 servers ordered at −15 min, each call on its own server, pool never shrinks mid-run. Server stopped → open a queue or instant room → the server starts at the next 5-minute run and the call works ~10–15 min later; a room created by appointment studio gets `mediaProvider: "oci"` within seconds |

> **Watch-out for D2:** the 5-minute job's cleanup marks a room inactive when it has been empty and unchanged for 15 min. A person waiting ~10–15 min for a cold boot could have their room switched off just as the server comes up. The build must keep a waiting room active, e.g. skip cleanup for rooms created in the last 30 min while the server is starting.

### Phase 1b: host controls on OCI (S) · ✅ written 2026-11-15
| Step | Item | Change |
|---|---|---|
| 1b.1 | 4.1–4.3 | `muteParticipant`, `kickParticipant`, `openViduCloseRoom` read the room's `mediaProvider`, use `getCredsFor()`, and get access to the OCI secrets |
| **Test** | 4.4 | OCI test call: mute, remove and end room work |

### Phase 2: call screen, Angular, in the `starlabs-angular-openvidu` worktree (M–L) · ✅ written 2026-11-15 (2.4 mic deviation: see journal)
| Step | Item | Change |
|---|---|---|
| 2.1 | 2.9 | "Starting the video server, about 10 minutes…", continues automatically (ship with Phase 1.2) |
| 2.1b | new | **Wait longer with a clear message.** When the token request gets "Media node not ready" (a media server is booting or all are busy), keep retrying for up to ~12 min instead of 3 tries over 3 min (`getTokenWithRetry`), showing "Getting a video server ready for you…" with elapsed time; show an error only after that. Covers calls waiting for a booting server and the 6th simultaneous call waiting for a free one |
| 2.2 | 1.5 | "Tap to enable sound" button |
| 2.3 | 1.1 | Echo fix: approach per D8 |
| 2.4 | 1.2–1.4 | Follow device changes; re-attach the noise filter; resume paused audio processing |
| 2.5 | – | e2e hooks and spec for the join screen; journal with revert guide |

### Phase 3: lag (M) · ✅ 3.2 + 3.4 written 2026-11-15 (ready = Running ≥ 8 min, Option A); 3.1 measure still open
| Step | Item | Change |
|---|---|---|
| 3.1 | 3.0 | Measure server shape and CPU with 1 vs 2 recorded calls |
| 3.2 | 3.1 | Count **ready** servers: capacity check, status doc, call tab |
| 3.3 | 3.2 | ~~Apply the recording policy~~: not needed, recording stays as today (D7) |
| 3.4 | 3.3 | "Medium" quality to 540p, warm-up ~20 s |

### Phase 4: cleanup (S, optional) · ✅ written 2026-11-15
- Stop writing unused Zoom fields on OpenVidu bookings. — **dropped 2026-11-15** (operator: keep writing them; harmless).
- Remove the `// TODO: Check Server` comments once 1.2 is live.

### Parked (journal `specs/journals/2026-11-14-after-todo-openvidu.md`, in the `starlabs-angular-openvidu` worktree)
TODO 3 / D3 meeting window · TODO 4 write the room record first · TODO D4 more servers · TODO D5 spare server.


**⚠️ Oracle CPU quota (check before 1.5):** `scripts/oci/README.md` (2026-08-17) says the account is limited to **13 E5 OCPUs** in Mumbai: master 2 + each media server 3. With the dev cluster also running, production fits the master + **2 media servers = 2 calls at once**; with dev stopped, 3. So ordering 5 servers would fail past the quota. Check the current limit in the OCI console (Limits, Quotas and Usage) and raise it, or cap 1.5 at what the quota allows.

**Check outside our code (Phase 1.5):** which server a call lands on is chosen by LiveKit (`node_selector` in `livekit.yaml` on the OCI master), not by us. Confirm with someone who has master access that it spreads rooms across idle servers; otherwise two calls can still share one server even with enough servers ready.

---

## Branches (decided 2026-11-14)

| Repo | Phase | Branch | Base → merge into |
|---|---|---|---|
| starlabs-cloud-function | 0: memory fix | `fix/oci-controller-memory` (written) | `development` → `development` |
| starlabs-cloud-function | 1: server reliability | `fix/oci-server-reliability` | latest `development` → `development` |
| starlabs-cloud-function | 1b: host controls on OCI | `fix/oci-host-controls` | latest `development` → `development` |
| starlabs-cloud-function | 3: ready-server count | `fix/oci-ready-capacity` | latest `development` → `development` |
| starlabs-angular | 1.1, 2, 3 (screens) + plan + journal | `feature/openvidu-call-fixes` (worktree `starlabs-angular-openvidu`) | `development` → `charan-release` → PR to `development` |

**Superseded 2026-11-15 (operator):** all backend phases live on **`fix/oci-controller-memory`** only; the per-phase backend branches above are not used (`fix/oci-server-reliability` exists but is redundant).

~~**Backend: one branch per phase** (operator's choice), so each phase deploys, tests and reverts on its own.~~
Each new branch starts from the latest `development` after the previous phase merged. Not touched: `openvidu`, `openvidu-oci`, `main`, `production`.
Commit only on the operator's OK, push only when asked, deploys by the operator.
