# 2026-11-14 — OpenVidu Phase 1: server reliability (wake-on-join, pre-order, shrink fix, sign-in)

**Plan:** `specs/plans/2026-11-14-openvidu-call-fixes.md` → Phase 1 (items 1.1–1.6).
**Status:** written + tested locally (mocked), **uncommitted, not deployed**.

| Repo | Where | Branch |
|---|---|---|
| starlabs-cloud-function | main folder, **moved 2026-11-15** onto `fix/oci-controller-memory` (operator: one backend branch for all phases). Original worktree `starlabs-cloud-function-phase1` / `fix/oci-server-reliability` is now redundant | `fix/oci-controller-memory` |
| starlabs-angular | worktree `starlabs-angular-openvidu` | `feature/openvidu-call-fixes` |

Phase 0 (memory fix) stays separate on `fix/oci-controller-memory` in the main functions folder, so
the operator's Phase 0 deploy is unaffected. Both touch `OCI_endpoint.js` in different places
(Phase 0: profile lookup in `createOciRoomForMeeting` + `memory` option on the schedule line); expect a
small, mechanical merge when the second one lands.

---

## What changed and WHY

### Cloud Functions — `functions/components/OCI_endpoint.js`

| Item | Change | Why |
|---|---|---|
| 1.2 wake-on-join (D2) | `CheckOciNodeStatus`: when the master is `stopped`, it now also starts it for **rooms someone opened in the last 30 min** (`findRoomsWaitingForServer`: active, `mediaProvider` = `oci` or missing, doc updated ≤ 30 min ago). Woken rooms get `mediaProvider: 'oci'` + `wokeServerAt`. | Before, only appointments in the next 15 min woke the server; queue/studio sessions, instant meetings and late joiners saw "Server Failed" until an admin pressed Start. |
| 1.2 freshness rule | Only rooms updated ≤ 30 min ago count. | Prod still has old rooms flagged `active` (e.g. cancelled meeting `DEjSuwtXUrM1WeeLK3pB`). Waking for every active room would keep the server on all day. |
| 1.2 watch-out | `houseKeepOciRooms` skips a room for 30 min after `wokeServerAt`. | People wait ≤5 min (next run) + ~10 min (boot). Without this, cleanup marks their room inactive at 15 min and the server stops just as it comes up. |
| 1.2 state guard | Lifecycle actions only from a clean `stopped` state; `starting` / `stopping` → wait for the next run. | Avoids issuing START on an instance already starting or still soft-stopping. |
| 1.5 pre-order | `startOciMaster(clients, poolSize)` and the end-of-run top-up use `mediaNodesNeeded()` = active rooms + upcoming meetings not active yet (counted once), capped at `MAX_MEDIA_NODES`. | Before, starting always ordered 1 node and then added one at a time as rooms appeared → a burst of meetings waited ~10 min per node and piled onto node 1. |
| 1.6 shrink fix | The top-up re-reads the pool size from Oracle and only ever raises it. | The old top-up compared against the size read at the start of the run; if pre-create grew the pool in between, it set a smaller number and Oracle deleted a booting node (prod Fri 06 Nov 16:55: 2 → 3 → 2). |
| 1.4 fewer Oracle calls | `refreshOciStatus(clients, known)` writes the status collected at the start of the run when nothing changed on the Oracle side. | Halves Oracle calls on quiet runs (most of the day); prod logged "Too many requests". |
| 1.3 sign-in | `startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes` require a Firebase ID token (`requireSignedIn`); 401 otherwise; caller uid logged. | They were open to anyone with the URL and start / stop paid servers. |
| 1.3 deviation from plan | **Signed-in user, not admin-only.** | The instant-meeting screen (`openvidu-recording`) also calls `startOciMasterHTTP` for whoever creates the room; admin-only would break instant meetings. |

Unchanged on purpose: the 15-min "upcoming" window, stop-to-zero rule and pre-create timing (D3 parked:
operator wants today's schedule kept); `MAX_MEDIA_NODES = 5` (D4 parked — note the 13-OCPU quota);
AWS twins (`AWS_endpoint.js`, D10: standby).

### Angular

| Item | File | Change |
|---|---|---|
| 1.1 (D1) | `src/app/authguard.service.ts` | `createOpenViduRoom()` stamps `mediaProvider` from `openvidu server/mediaprovider` when the caller didn't pass one (new helper `getActiveMediaProvider()`, default `oci`). Covers appointment studio, participant studio, dynamic studio, dynamic studio v2. |
| 1.3 | `src/app/instance-status.service.ts` | OCI start / stop / scale calls send `Authorization: Bearer <Firebase ID token>` (`postWithAuth`). AWS calls unchanged. |
| 1.3 | `src/app/OpenVidu/openvidu-recording/openvidu-recording.component.ts` (instant meeting) | OCI wake call goes through `infraService.startOciMaster()` so it carries the token. AWS path unchanged. |

---

## ⚠️ Deploy order (1.3)

**Release the Angular changes BEFORE deploying the Cloud Functions change.** The new functions reject
calls without a token. If the functions go first, the monitor's Start / Stop / Scale buttons and the
instant-meeting wake return 401 until the Angular release is live. Sending the header to the old
functions is harmless, so Angular-first is safe.

---

## Tests run (local)

- `node --check` + module load: 12 exports, same as before.
- Scenario test with mocked Oracle / LiveKit / Firestore (script kept in the session scratchpad, not
  in the repo): **12/12 pass** on the new code. Against the old code, 9 of them fail (the new
  behaviours) and 3 pass (unchanged behaviours) — so the test really exercises the changes.
  Scenarios: stopped + nothing due (no start, one Oracle read) · stopped + fresh room + stale room
  (wakes for fresh only, stamps it) · 5 meetings (orders 5) · 7 meetings (capped 5) · running, 2 rooms
  + 3 upcoming (pool 3 → 4) · pool 5 with 1 room (no shrink) · idle (stop) · master starting (no action)
  · woken room 20 min (kept) · woken room 40 min (cleaned, stop) · start/stop/scale without token (401)
  · start with token (starts, 1 node).
- Angular: `ng build --configuration production` — see summary below.
- **Not run yet:** real deploy on `starlabs-test`. Plan Phase 1 test: 5 appointments at once → 5 nodes
  ordered at −15 min; server stopped → open a queue/instant room → wakes at the next run, call works
  ~10–15 min later; appointment-studio room gets `mediaProvider: "oci"`.
- **Before push (CLAUDE.md):** e2e coverage for the changed screen `openvidu-recording` (and run the
  affected suites once, right before pushing).

---

## Revert guide (per file / screen)

| What to undo | How |
|---|---|
| Whole backend Phase 1 | Now shares `fix/oci-controller-memory` with the other phases: revert the Phase 1 hunks by hand (sections below), redeploy `CheckOciNodeStatus`, `startOciMasterHTTP`, `stopOciMasterHTTP`, `scaleOciMediaNodes`. |
| Only the sign-in check (1.3, backend) | Remove the `requireSignedIn(...)` line at the top of the three handlers; keep the helper or delete it. |
| Only wake-on-join (1.2) | In `CheckOciNodeStatus` step 3, drop `findRoomsWaitingForServer()` (treat `waiting` as `[]`); remove the `wokeServerAt` skip in `houseKeepOciRooms`. |
| Only pre-order (1.5) | Call `startOciMaster(clients)` without a size; in step 7 use `Math.min(Math.max(activeRoomIds.size, 1), MAX_MEDIA_NODES)` as the target. |
| `createOpenViduRoom` stamping (1.1) — affects appointment studio, participant studio, dynamic studio (+v2) | Restore the two-line body: `doc(..., roomData["roomid"])` + `setDoc(roomDoc, roomData, {merge: true})`; `getActiveMediaProvider()` can stay unused. |
| Monitor screen token (1.3) — `monitor-liveassignment` via `instance-status.service.ts` | OCI methods back to `this.http.post(url, body)`; remove `postWithAuth` / `authHeaders` and the `getAuth`, `from`, `switchMap` imports. Only safe if the backend sign-in check is also reverted. |
| Instant meeting screen (1.3) — `openvidu-recording` | Restore the single `this.httpClient.post(.../${startFn}, {})` call. Only safe if the backend sign-in check is also reverted. |
