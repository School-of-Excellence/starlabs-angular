# 2026-11-17 — OpenVidu/OCI change audit: every change and the logic behind it

**Operator ask:** after pulling `feature/openvidu-call-fixes`, list each code change across Angular and
Cloud Functions with the exact reasoning, and say what is still missing.

**Source of truth for intent:** `specs/plans/2026-11-14-openvidu-call-fixes.md` (approved 2026-11-14,
decisions D1–D12). This audit verifies what actually landed against that plan.

**Nothing was changed by this session.** Read-only audit.

---

## Where the code lives

| Repo | Commits | Deployed? |
|---|---|---|
| starlabs-angular (`signedURL-media`) | `5a0e9999` (call fixes), `0e6d3466` (monitor default), `70c0d79d` (merge) | n/a — ship with the app |
| starlabs-cloud-function `Starlabs Functions` | `8032556` (OCI controller), `a54aaef` (host controls) | **yes** — prod `CheckOciNodeStatus` reads 512 MiB, the memory bump from `8032556` |
| `Starlabs Functions - VideoConference` | none — **stale checkout**, same 5 files, no new commits | — |

Verified against prod with `firebase functions:list --project fir-sample-aae4a`: 168 functions,
`CheckOciNodeStatus` at 512 MiB / asia-south1 (vs `CheckMasternodeStatus` still at the 256 MiB default).
No function matching `livekit` → LiveKit Cloud is exported in `index.js` but never deployed.

---

## The incident this fixes

Three prod meetings (Thu 12 Nov 15:00 and 17:30, Tue 10 Nov 11:00) had the server **stopped at the
exact minute the meeting started**. Four causes stacked:

| Cause | Mechanism |
|---|---|
| A | `createOciRoomForMeeting` loaded all of `profile_data` to read 2–3 names → 256 MiB exceeded at 14:55 / 17:25 → the `openviduroom` doc was never written |
| B | Client-created rooms carried no `mediaProvider`, so `getOciActiveRoomsCount` (`mediaProvider == 'oci'`) counted 0 |
| C | At 15:00:03 a 15:00 meeting fails `starttime > now` → no longer "upcoming" |
| D | Only `appointments` could wake the server — queue, dynamic studio and instant meetings never did |

A + B + C together ⇒ "no active rooms, nothing upcoming" ⇒ stop-to-zero at meeting start.
D ⇒ nothing could bring it back.

---

## Cloud Functions — `OCI_endpoint.js` (commit `8032556`, +203/−46)

| # | Lines | Change | Logic |
|---|---|---|---|
| 1 | 63–73 | `MEDIA_NODE_READY_AFTER_MS = 8 min` + `isMediaNodeReady(poolInstance)` | OpenVidu 3 removed the v2 `GET /openvidu/api/media-nodes` API and has no readiness endpoint, so readiness is time-based (plan 3.1 Option A). 8 min = the 5–8 min bootstrap seen 2026-07-16. Requires `state === "Running"` **and** `timeCreated` ≥ 8 min ago |
| 2 | 78 | `WAKE_WINDOW_MS = 30 min` | Two jobs: how fresh a room must be to wake the server, and how long housekeeping leaves a woken room alone |
| 3 | 233–262 | `collectOciStatus`: adds `instanceStates.ready` and per-instance `isReady` | Splits "VM is on" from "can take a call". `healthy` was the only signal, so the call tab admitted people while media software was still installing |
| 4 | 260 | Log line adds `ready=` | Diagnosability |
| 5 | 278–283 | `refreshOciStatus(clients, known)` — writes a status already collected this run instead of re-asking Oracle | Prod hit Oracle "Too many requests"; the job asked for full status up to 3× per run (plan 1.4) |
| 6 | 301–313 | `startOciMaster(clients, poolSize = 1)` — orders `poolSize` media nodes with the master | Was always `setPoolSize(1)`, then grew one node at a time as rooms appeared, each taking ~10 min. A burst of meetings queued behind that (plan 1.5) |
| 7 | 318–323 | `mediaNodesNeeded(activeRoomIds, meetings)` | `ceil((activeRooms + meetings-not-yet-active) / 1)`, capped at `MAX_MEDIA_NODES = 5`. Counts a pre-created meeting room once (it is in both lists) |
| 8 | 338–362 | `checkOciCapacity`: `allowed = otherRooms < readyInstances`, new `needsNode = otherRooms >= orderedRooms` | **The lag bug.** It counted *ordered* nodes, so call 3 was admitted against a node still booting and landed on node 1 beside call 1 — three calls on one CPU. Now ready gates admission; ordered gates whether to order another |
| 9 | 400–408 | `prepareRoom`: `needsNode` → scale up; otherwise log "Media node still booting - asking the caller to wait" | Stops ordering a node on every retry while one is already on its way |
| 10 | 465–472 | `houseKeepOciRooms`: `if (wokeMs && now - wokeMs < WAKE_WINDOW_MS) continue;` | A room the server was woken for looks empty and idle for ~15 min. Without this, housekeeping would close it just as the cluster came up — the watch-out flagged under D2 in the plan |
| 11 | 504–515 | `getOciActiveRoomIds()` returns a `Set` (or `null` on read failure) | The controller now needs *which* rooms, not just how many, to size the pool. `null` ⇒ treat as busy, take no stop decision |
| 12 | 521–531 | **`findRoomsWaitingForServer()`** — queries `active == true` with **no `mediaProvider` clause**, then filters in memory: `if (provider && provider !== 'oci') return false` | **Fixes cause B retroactively.** Absent now means "mine" instead of "not mine". A Firestore equality filter cannot match a missing field, which is why this must filter in code — the same shape `AWS_endpoint.js:805` already used. The `updateTime ≤ 30 min` test stops old still-active rooms (cancelled meetings) from holding the server up all day |
| 13 | 561–573 | `createOciRoomForMeeting`: `needsNode` branch, and the catch sets `{allowed:false, needsNode:false}` | Same ordered-vs-ready distinction on the pre-create path |
| 14 | 600–617 | Profile lookup: `admin.firestore().getAll(...profileIds.map(...))` instead of `collection('profile_data').get()` | **Fixes cause A.** Reads the 2–3 named profiles instead of the whole collection |
| 15 | 689 | `memory: "512MiB"` on `CheckOciNodeStatus` | Safety margin for cause A (OCI SDK clients + pre-create) |
| 16 | 697–706 | Keeps `masterState` (not just the boolean) and adds `let changed = false` | Enables the `stopped`-only gate (#17) and the conditional status write (#21) |
| 17 | 723–756 | **Step 3 — wake-on-join.** If not running: bail unless `masterState === 'stopped'`; else `findRoomsWaitingForServer()`; start with `mediaNodesNeeded(...)`; then stamp every waiting room with `mediaProvider: 'oci'` + `wokeServerAt` | **Fixes cause D.** Any active room — appointment, queue, dynamic studio, instant — now wakes the server, not only `appointments`. The `stopped` gate avoids issuing a second START while one is in flight. The stamp is a **backfill**: it repairs legacy unstamped docs so later runs count them |
| 18 | 758–766 | Step 4 pre-create no longer re-tests `masterRunning` | Unreachable when stopped — step 3 always returns |
| 19 | 769–772 | Step 5 housekeeping + `getOciActiveRoomIds` run unconditionally | Same reason |
| 20 | 775–780 | Step 6 stop-to-zero guarded by `activeRoomIds !== null` | A Firestore read failure used to look like "0 rooms" and stop the cluster |
| 21 | 782–795 | **Step 7 pool top-up** re-reads `instancePool.size` fresh and only grows (`if (size < target)`) | **The shrink bug.** It compared against the size read at the *start* of the run, so when pre-create had already grown the pool mid-run it set a smaller number and Oracle deleted a booting node (prod Fri 06 Nov 16:55: 2 → 3 → 2). Scale-down now happens only via stop-to-zero |
| 22 | 797 | `refreshOciStatus(clients, changed ? null : status)` | Re-read Oracle only when this run changed something |
| 23 | 811–831 | `requireSignedIn(req, res, action)` — verifies a Firebase ID token | `startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes` were open to anyone with the URL and start/stop/resize **paid** servers. Signed-in, not admin-only, because the instant-meeting screen calls start for whoever creates the room (plan 1.3) |
| 24 | 851, 877, + scale | The three endpoints call it first | — |

## Cloud Functions — `openVidu.js` (commit `a54aaef`, +39/−24)

Problem 4 in the plan: every call since 12 Aug is on OCI, but these three functions always built a
`RoomServiceClient` from the **AWS** credentials. They asked the stopped AWS cluster to mute/kick/close
a room it had never heard of, so the host's click silently did nothing.

| # | Change | Logic |
|---|---|---|
| 25 | New `roomServiceForRoom(roomName)` — reads `openviduroom/{roomName}.mediaProvider` (missing ⇒ `oci`), picks creds via the existing `getCredsFor(provider)`, returns `{provider, roomDoc, roomService}` | Read **server-side** so the app cannot fake the cloud and no app change is needed (plan 4.1–4.2) |
| 26 | `openViduCloseRoom`, `muteParticipant`, `kickParticipant`: `secrets: [...AWS, ...OCI_endpoint.SECRETS]` | The functions need access to the OCI secrets to use them (plan 4.3) |
| 27 | All three use `roomServiceForRoom()` instead of the AWS client | This also unblocks the `active: false` write in `openViduCloseRoom`: `deleteRoom` threw first, so the line after it never ran |
| 28 | `kickParticipant` returns 200 when LiveKit says the participant is already gone | Double-click after a cold start was surfacing as an error |
| 29 | All three answer `{warmup: true}` with 204 | The host's call screen pings them every 10 min to keep the instance loaded, so the real click is fast |

## Angular (commits `5a0e9999`, `0e6d3466`)

| # | File / line | Change | Logic |
|---|---|---|---|
| 30 | `authguard.service.ts:1874` | `const data = { ...roomData, mediaProvider: roomData.mediaProvider || await this.getActiveMediaProvider() }` | **Fixes cause B at the source** (plan 1.1 / D1). Reverses the 14 Aug "fallback routing instead of stamping" decision, because prod logs showed its cost. Spread into a new object, so the caller's literal is not mutated |
| 31 | `authguard.service.ts` | New `getActiveMediaProvider(): Promise<'aws'\|'oci'>` reading `openvidu server/mediaprovider.activeprovider`, `oci` on error | Same source the instant-meeting screen already used — no new function, per D1. Dynamic, so the stamp stays truthful if the operator flips the active cloud |
| 32 | `instance-status.service.ts` | `postWithAuth()` + `authHeaders()` attach `Authorization: Bearer <idToken>` to start/stop/scale | Client half of #23 |
| 33 | `join-livekit-call.component.ts:94–106` | `SERVER_WAIT_LIMIT_MS = 20 min`, `TOKEN_WAIT_LIMIT_MS = 12 min`, `WAKE_TOUCH_EVERY_MS = 10 min`, `WAIT_FROM_CREATION_MAX_MS = 30 min` | Boot is ~10 min, so the old ~3 min token window and the instant "serverfailed" could never succeed |
| 34 | `checkServer()` | `const readyNodes = (states["ready"] ?? states["healthy"]) \|\| 0` and admit on `masterStatus == "running" && readyNodes > 0` | Waits for a **ready** node (plan 3.1 step 3). `?? healthy` keeps older status docs working |
| 35 | `checkServer()` | `this.meetingRoomStatus = this.serverWaitExpired() ? "serverfailed" : "serverstarting"` | **This is the "unable to connect server" fix.** A stopped master used to go straight to the error; now it shows "Starting the video server…" for up to 20 min |
| 36 | `touchRoomForWake()` | While the master is `stopped`/`stopping`, merge `waitingForServerAt: serverTimestamp()` onto the room doc, at most every 10 min | **Client half of wake-on-join.** Refreshes the doc's `updateTime` so it stays inside `findRoomsWaitingForServer`'s 30-min window while the person waits through a boot. Also why an unstamped legacy doc gets backfilled simply by someone opening it |
| 37 | `startWaitTicker()` / `waitElapsed()` | 1 s ticker; elapsed clock on screen; flips to `serverfailed` when the limit passes even if the status doc is unchanged | The status doc can sit still for minutes; the UI must not look frozen |
| 38 | `getTokenWithRetry` | Retries a 503 "Media node not ready" for up to `TOKEN_WAIT_LIMIT_MS` (12 min) instead of 3 tries over 3 min; aborts if the user leaves | Covers both a booting node and the 6th simultaneous call waiting for a free one (plan 2.1b) |
| 39 | `micCaptureOptions()` | Echo cancellation **ON** with the DFN noise filter; noise suppression and auto-gain stay off | The July fix switched all three off to cure choppiness; only NS/AGC were ever implicated. Leaving AEC off caused the echo on laptop speakers (D8) |
| 40 | `selectMic(deviceId, byUser)`, `watchMicTrack()`, `preferredMic()` | Follow `MediaDevicesChanged` / `ActiveDeviceChanged` and the mic track's `Restarted` event; re-attach the DFN processor; stop auto-switching once the user picks by hand | Plugging in earphones only refreshed the device menu — the call never moved, and LiveKit's own restart skipped the filter re-attach, so the pipeline sent silence until both sides rejoined (plan 1.2–1.4) |
| 41 | `audioBlocked` + `openvidu-audio-element.component.ts` `playbackBlocked` output | The audio element emits on `NotAllowedError`; the call screen shows "Tap to enable sound" and calls `room.startAudio()` inside the tap | Safari/iPhone block autoplay; the old code only logged it (plan 1.5 / 2.2) |
| 42 | `startHostWarmup()` | Hosts ping mute/kick/close every 10 min | Client half of #29 |
| 43 | `adaptive-quality.service.ts` | `medium` 1280×720/1 Mbps/h720 → **960×540/800 kbps/h540**; `WARMUP_MS` 45 s → **20 s** | Capture, blur and the noise filter share the sender's CPU. 45 s was set when Koala was in the pipeline; Koala is gone, so a struggling device can step down sooner (plan 3.3) |
| 44 | `monitor-liveassignment.component.ts` (`0e6d3466`) | `activeProvider: 'aws' \| 'oci' = 'oci'` (was `'aws'`) | The monitor screen's own default now matches production, where OCI has been the active cloud since 12 Aug |
| 45 | `list-openvidu-room.component.ts:169`, `appointment-studio.component.ts:696` | `// TODO: Check Server` replaced with a pointer to /joinroom + the 5-min job | Plan Phase 4 cleanup. **Comment only — no behaviour change** |

---

## Still missing

| # | Gap | Severity |
|---|---|---|
| M1 | **4 client reactivate lines** add no stamp: `appointment-studio:691`, `list-openvidu-room:164`, `dynamic-studio-v2:5095`, `dynamic-studio:2627` (all bare `updateDoc(roomDoc, {active: true})`). Both Cloud Functions reactivators restamp (`OCI_endpoint.js:651`, `AWS_endpoint.js:739`); the client does not. Narrowed by #36 + #17, which backfill when the master is **stopped** — but the wake path sits inside `if (!masterRunning)`, so a legacy doc reactivated while the master is **up** stays unstamped and invisible to `houseKeepOciRooms` (`:450`), `getOciActiveRoomsCount` (`:493`) and `getOciActiveRoomIds` (`:507`), all still `where('mediaProvider','==','oci')` | **live, narrow** |
| M2 | The rooms already stuck `active: true` from the original incident. `findRoomsWaitingForServer` needs `updateTime` within 30 min; those docs are days old, so they are never woken, never stamped, and housekeeping only runs while the master is up — which it will not be on their account. Needs a one-time close | **needs a manual action** |
| M3 | `houseKeepOciRooms` still has no `provider === 'livekit-cloud'` guard (`AWS_endpoint.js:507` has one). It relies on Cloud rooms lacking `mediaProvider` — but #30 now stamps every client-created room, so a room later opened as a Cloud room would carry both and could be auto-closed mid-call | dormant (Cloud not deployed) |
| M4 | `DO_endpoint.js` has zero `mediaProvider` / housekeeping references — a `'do'` room would have no janitor at all | dormant (DO parked) |
| M5 | `OCI_endpoint.js:390` and `:398` still log bare `error.message`, which produced the blank `Could not check room existence (oci):` and `OCI capacity check failed:` in the incident logs | diagnosability |
| M6 | Plan items parked, not missed: 2.3/2.4 meeting window (D3), 2.4b write the room doc before the LiveKit room, D4 more nodes, D5 spare node, 3.1 measurement (needs OCI access) | by decision |
| M7 | `Starlabs Functions - VideoConference` is a stale second checkout of the same five files that write `openviduroom`. Decide whether to keep it | housekeeping |

**Oracle quota watch-out (from the plan):** the Mumbai account is limited to 13 E5 OCPUs — master 2 +
3 per media node. With the dev cluster up, production fits master + 2 nodes; with dev stopped, 3. So
`mediaNodesNeeded` returning 4–5 (#7) can exceed the quota and the order will fail. Confirm the current
limit before relying on `MAX_MEDIA_NODES = 5`.

**Also outside our code:** which node a call lands on is LiveKit's `node_selector` in `livekit.yaml` on
the OCI master, not ours. Even with enough ready nodes, two calls can share one unless that spreads them.

---

## Appendix A — what the boot time actually is (investigated 2026-11-18)

**The master is NOT reinstalled on start.** `stopOciMaster` issues `SOFTSTOP` and `startOciMaster` issues
`START` — an OCI power cycle. The boot volume persists, cloud-init does **not** re-run, and the ephemeral
public IP survives (verified 2026-07-16, blueprint). So master start = OS boot + docker containers
restarting. Minutes, not tens of minutes.

**The media nodes ARE built from scratch, every time.** `stopOciMaster` calls `setPoolSize(0)`, which
**terminates** them. `setPoolSize(n)` creates **brand-new** instances, and each one runs its cloud-init
`user_data` from zero: apt update, install, docker pull the OpenVidu/LiveKit images, register with the
master. That is the 5–8 min in `MEDIA_NODE_READY_AFTER_MS`, and it is paid on every single cold start.

Proof it runs per instance creation: journal `2026-07-16-oci-recording-and-webhook.md` records a fresh
pool node (0→1) coming up **bare** because its cloud-init `user_data` lost the first-boot apt-lists lock
race against Ubuntu 24.04's automatic apt jobs. A pre-baked image could not fail that way.

**So the user-visible 8–10 min is the media node's cloud-init, not the master, and not LiveKit
connection latency.** `[Pre-create oci] LiveKit not ready ()` is the master's LiveKit API not yet
answering during its own container restart; the long tail after that is waiting for a node.

### Making it faster — ranked
| Option | Effect | Cost |
|---|---|---|
| **Bake a custom OCI image for the media node** (configure one instance, capture it, point the pool at it) | 5–8 min → ~1–2 min. The single biggest win; removes apt + docker pull from the hot path, and removes the apt-lock failure mode | one-time build, re-bake on upgrades |
| **Keep the master always on** | Removes master container restart and every `LiveKit not ready` defer | ~$2–3/night (blueprint) |
| **Keep 1 media node warm** (D5, parked) | First call of the day is instant | 3 E5 OCPUs always on — does not fit today's quota alongside dev |
| Pre-boot 25 min ahead instead of 15 (plan 2.4, parked) | Hides the boot behind the booking | none |
| Plan 3.1 Option B (boot-script callback) | Makes readiness *exact*, replacing the 8-min guess | small; does not make boot faster |

### ⚠️ `mediaNodesNeeded` can exceed the tenancy quota
`scripts/oci/README.md`: 13 E5 OCPUs in ap-mumbai-1; master 2 + 3 per media node. Dev running = 5, prod
master + 1 media = 10/13, a second prod media node lands exactly on 13, **a third fails to launch**.
Effective prod ceiling is **2 concurrent calls**. `MAX_MEDIA_NODES = 5` and `mediaNodesNeeded()` returning
3–5 therefore order nodes Oracle will refuse. Cap it at the real quota or raise the service limit.

## Appendix B — why the host controls (mute / kick / end) were slow

Three causes stacked, only one of which the fix addresses:

1. **They were failing, not merely slow.** Before `a54aaef` all three built the LiveKit client from the
   **AWS** credentials while every call since 12 Aug has been on OCI. The request went to a cluster that
   was stopped and had never heard of the room, so the host waited for an error. Fixed by #25–27.
2. **Cold start.** They are `onRequest` gen2 functions with no `minInstances`. An idle instance is
   reclaimed, so the first click of a call paid a container start plus secret mounting. Addressed by the
   `{warmup:true}` → 204 ping (#29/#42), which the host screen sends every 10 min.
3. **Region — not addressed.** All three are deployed in **us-central1** (confirmed via
   `firebase functions:list`), while the cluster is **ap-mumbai-1** and the users are in India. Every
   click is browser (IN) → Iowa → Mumbai → Iowa → browser. That is the largest remaining component and
   no change touches it. `CheckOciNodeStatus` already runs in `asia-south1`; these could move too.

### Drawbacks of the warm-up approach
- **Secret mounting got heavier:** the `secrets` list went from 3 (AWS trio) to 6 (+ `OCI_endpoint.SECRETS`).
  More secrets to resolve at instance start, so a *cold* start is now slightly slower than before — the fix
  trades a worse cold start for fewer cold starts.
- **One extra Firestore read per action** for `muteParticipant` and `openViduCloseRoom`: `roomServiceForRoom()`
  does a `get()` they did not do before. `kickParticipant` is unchanged (it already read the doc to verify
  the host). The read is the price of server-side provider resolution, which is the right call — the app
  cannot lie about which cloud a room is on.
- **The ping is unauthenticated.** The `if (req.body && req.body.warmup) return 204` short-circuit sits
  *before* the method check and before any host verification, so anyone with the URL can hold instances
  warm. Low impact (204, no work done), but it is a free way to keep three containers alive.
- **10 min vs the idle window.** Cloud Run reclaims idle instances on its own schedule; a 10-minute ping
  usually holds one but is not a guarantee. `minInstances: 1` would be deterministic, at continuous cost.
- It does not help the **first** click of a call that starts more than 10 min after the host screen opened
  — the warm-up only begins when the host screen loads and `isHost()` is true.

---

## Appendix C — Scope verification: which systems create OpenVidu rooms (2026-11-18)

Operator question: "we set this up only for the appointment-based system — have we integrated it
with anything else?" Answer: **no, it is not appointment-only.** Three session types exist.

| `sessiontype` | Created by | Route | `mediaProvider` stamped at creation? |
|---|---|---|---|
| `appointment` | `appointment-studio.component.ts:660` | `/appointmentstudio` (specialist side) | yes — via the helper's dynamic read |
| `appointment` | `list-openvidu-room.component.ts:133` | **`/participantstudio`** (`app.routes.ts:350`) | yes — same helper |
| `live assignment` | `dynamic-studio-v2.component.ts:5064`, `dynamic-studio.component.ts:2596` | `/dynamicstudio` (queue) | yes — same helper |
| `private` | `openvidu-recording.component.ts:248` | instant meeting ("create a New Room") | yes — explicit `mediaProvider: activeProvider` |

Note: `/participantstudio` loads `ListOpenviduRoomComponent` — the participant studio and the
OpenVidu room list are the **same component**, which is why it writes `sessiontype: "appointment"`.
All five creators go through `guard.createOpenViduRoom()`; none writes the doc directly any more
(the old inline `setDoc(roomData)` blocks are commented out beside each call).

### Asymmetry that still matters

The 5-minute controller (`CheckOciNodeStatus`) has **two** inputs, and they do not cover the same ground:

- **Pre-create / stop-to-zero gate** (`OCI_endpoint.js:712`) queries the `appointments`
  collection only (`platform == openvidu`, `starttime` in the next 15 min, `cancelled == false`,
  `attended == false`). Queue sessions and instant rooms have **no appointment doc**, so they are
  invisible here — they can never pre-warm the server, and they never count as "something upcoming"
  in the stop decision at step 6.
- **Wake-on-join** (`findRoomsWaitingForServer`, `:521`) queries `openviduroom` for
  `active == true` touched in the last 30 min, treating a missing `mediaProvider` as OCI. This is
  collection-agnostic, so it covers **all three** session types. It is the only path by which a
  queue session or an instant room can start the server.

So: pre-warming is appointment-only by design; recovery is universal. A queue or instant call on a
cold server always pays the boot — it is never pre-warmed, only woken. Raising that to "queue
sessions pre-warm too" would need a second query (e.g. on the live-queue doc) and is **not** in the
2026-11-14 plan — not proposed, recorded here only as a known limit.

### Where the server stops, per type

- **Scheduled appointment** — stop can only happen >15 min before the meeting (step 2 keeps it
  alive inside the window). The 12 Nov incident was this plus cause A: the pre-create crashed, so
  no room doc existed, and at 15:00:03 `starttime > now` dropped the meeting from the window →
  step 6 fired with 0 rooms + 0 meetings.
- **Instant (private)** — the room doc is created and the app calls `startOciMaster` immediately,
  so a stop happens only if nobody is in it 15 idle minutes later (housekeeping), which is correct.
- **Queue (live assignment)** — nothing in `appointments`, so step 2 contributes 0. The only thing
  keeping the server up is the room being counted active at step 5/6. Before the `mediaProvider`
  stamp, those rooms were not counted → **step 6 could stop the master with a live queue call
  running.** This is the exact combination that made cause B visible, and it is why the stamp
  (not the janitor) is the load-bearing fix.

### Part 3 status

Part 3 (boot time: why 8–10 min, master vs media node, can it be instant) is already written up in
**Appendix A** above, including the ranked speed-up table and the 13-OCPU quota finding. Parked at
the operator's request on 2026-11-18 — to be picked up after Part 1 closes.

---

## Appendix D — Scope decision and backlog (2026-11-18)

Operator decision: the **appointment** flow is done and stays as it is. Queue and instant were
built on the appointment system's assumptions and were never designed for; the gaps are now
recorded in **`specs/plans/2026-11-18-openvidu-queue-instant-backlog.md`** (backlog, not an
approved plan — nothing implemented).

Two things that came out of writing it, both load-bearing:

1. **"Keep the master always running" is not a config change.** `stopOciMaster()` does
   `setPoolSize(0)` then `SOFTSTOP`, and controller step 7 never lowers the pool — "scale-down
   only happens via stop-to-zero". So not stopping the master also means never draining the pool:
   master + every node ever ordered stay billed. Decoupling the two needs a **new idle scale-down
   path**, which does not exist today. That is the real work item behind the operator's direction.

2. **The 8-minute media-node wait is a heuristic, not a measurement.**
   `MEDIA_NODE_READY_AFTER_MS = 8 * 60 * 1000` with its own TODO to tune it; OpenVidu 3 exposes no
   media-node readiness API. If cloud-init finishes in 5 min we still wait 8. So "make the boot
   faster" (custom image) and "stop guessing when it finished" (boot-script callback) are two
   separate wins, and after the first one the second becomes the binding constraint.

Corrected timing for the record: **instant ≈ 8–10 min** (the app issues `START` ~1 s after the
click), **queue ≈ 8–15 min** (0–5 min waiting for the next cron tick, because nothing in the queue
path calls `startOciMaster`). The 8–15 figure belongs to queue, not instant.
