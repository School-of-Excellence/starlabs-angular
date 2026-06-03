# LIVE-STUDIOS.md — Dynamic studios (runtime-assembled live sessions)

> Subsystem reference (data-first, config-aware, evidence-backed). Dynamic studios are the **runtime session layer** the queue feeds: when a participant reaches an interactive (Activity) stage, the engine **assembles a live session on the fly** — binding the participant to a studio, provisioning a Zoom or LiveKit room, and wiring the recording. Almost nothing here is config; it is **runtime state** derived from the queue + space config.
>
> Evidence: `specs/LIVE-STUDIOS-evidence/evidence.json`. Upstream config + the queue that feeds this: `QUEUE-AND-BIG.md`. Conferencing stack overview: `DESIGN.md`. Graph communities: [queue system](../graphify-out/wiki/queue_system.md) (127 nodes) + [authguard](../graphify-out/wiki/authguard.md) (83 nodes — `createOpenViduRoom` lives in the hub service). Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Turn "this participant is ready for a live Diagnostics/Implementation/Changework session" into an actual joinable room with a host, a recording, and a back-link to the queue — **assembled at runtime, not pre-booked**. One participant can be paired, the session provisioned, joined, recorded, and the binding cleared, all driven by the queue board.

## 2. Operator screens (from `operator-screens.md`)
- `dynamicstudio` (`DynamicStudioComponent`) 🚫ATC-excluded — the assembly engine.
- `arenastudioactivity` (`ArenastudioactivityComponent`) — studio activity / close-out.
- `participantstudio` (`ListOpenviduRoomComponent`), `monitorliveassignment`, `openvidurecordings`, `joinroom/:roomid` (`JoinOpenviduCallComponent`) — the OpenVidu/LiveKit room screens.
- `appointmentstudio`, `openmeeting/:id/:collectiontype` (`ZoomClientviewComponent`) — appointment-driven sessions.
- `arena_space` (`CreateArenaSpaceComponent`) — authors the space config.

> 🚫 `dynamicstudio` integrates ATC reads (`atc_to_validate`, `atc_alpha`, `atc_notes`, `triple atc`, `pick_for_mentoring`) → **CI-excluded**. The studio-assembly + conferencing logic documented here is from the **non-ATC** code paths only.

## 3. Collections by ROLE × reliability tier (all Tier-A)
| ROLE | Collection | Count | Note |
|---|---|---|---|
| **CONFIG** | `arenaspace` | 93 | studio-space defs (`spaceid`, `mentor[]`, `pivottype`, `eventref`, `participantslist[]`, `validated`). ⚠️ live name is `arenaspace`; `arena space`=0 (empty). |
| **RUNTIME-STATE** | `live assignment` | 12,787 | the dynamic studio binding (participant→studio→provisioned session) |
| **RUNTIME-STATE** | `arena participant` | 1,239 | pairing readiness (`pairingmode`, `stagerole[]`, `liveassignmentstatus`) |
| **RUNTIME-STATE** | `queue studio pairing` | 2,335 | token↔studio link + `openvidu` flag (LiveKit-vs-Zoom selector) |
| **RUNTIME-STATE** | `openviduroom` | 102 | the live LiveKit room (`sessionid`, `egressInfo{}`, `participantjoined[]`, `roomstatus`, `recordingstatus`) |

## 4. Configuration model
The only true CONFIG here is **`arenaspace`** (93) — a studio-space definition: `{spaceid, mentor[], pivottype, eventref, participantslist[], cohortsid[], validated, delete, date}` (all top-level fields 100% fill). Authored by [create-arena-space.component.ts:723,740](../src/app/big/create-arena-space/create-arena-space.component.ts#L723); read at `:172`. Everything else in this subsystem is **runtime-state**, derived from the queue (`QUEUE-AND-BIG.md`) + space config. **Note:** `arenaspace`'s last write is 2025-09 (validated spaces are stable); the live binding churns on `live assignment` instead.

## 5. Dynamic assembly / the runtime studio flow
The studio is assembled by `dynamic-studio.component.ts` when a ready token is paired into a stage:
```
1. PICK a ready participant      token.status=="ready" && currentstage==stage && liveassignmentid==null   (dynamic-studio.ts:787)
2. MINT a live assignment id      doc(collection('live assignment')).id                                    (:1074)
3. BUILD the binding              {participantid, queueid, stagename, studioid, pairing[], status:'live'}    (:1098)
4. PERSIST it                     setDoc('live assignment/'+id, data, {merge:true})                         (:1115)
5. WRITE BACK onto the token      {liveassignmentid, studioid, status:'instudio'} → updateDoc('queue_token') (:1090, :1124)
6. PROVISION the room:
     • LiveKit path (studio.openvidu==true on queue studio pairing, :410)
         createOpenViduRoom({roomid: liveAssignmentID, sessiontype:'live assignment', …})                  (:2490; helper authguard.service.ts:1792)
         token minted by cloud fn createOpenViduToken                                                       (join-openvidu-call.ts:593)
     • Zoom path (otherwise)
         zoomdata is provisioned BACKEND (Firestore trigger on live-assignment create); the client only READS
         zoomdata.join_url (:422) and can trigger regen via cloud fn studioZoomLinkRegenerate (:1611)
7. RECORD (LiveKit)               openViduStartRecording / openViduStopRecording (egressId)                  (join-openvidu-call.ts:859/877)
8. COMPLETE                       status:'completed'; clear token {liveassignmentid:null, studioid:null}     (:1286; arenastudioactivity.ts:137)
```
**The join key:** for LiveKit studios the `openviduroom` **doc id == the `live assignment` doc id == `queue_token.liveassignmentid`** ([dynamic-studio.component.ts:2486](../src/app/queue%20system/dynamic-studio/dynamic-studio.component.ts#L2486) `roomid: liveAssignmentID`). That triple-equality is how the binding, the room, and the token are tied together.

**Two important corrections (verified):**
- **`zoomdata` is NOT written client-side.** The Angular app only reads it / triggers regeneration; initial provisioning is a backend Cloud Function / Firestore trigger (not in this repo). So `live assignment.zoomdata` (87% fill) is server-populated.
- **`arena participant` is NOT read to decide pairing.** Pairing is driven by `queue_token.status=="ready"`. `arena participant.liveassignmentstatus` is *written* (mirrored from the live-assignment status) by the queue-manager ([dynamic-queue-manager.component.ts:1604](../src/app/queue%20system/dynamic-queue-manager/dynamic-queue-manager.component.ts#L1604)); its `pairingmode`/`stagerole` fields have **no reader** in the repo.

## 6. Data flow
`queue_token` (ready, Activity stage) → `dynamic-studio` mints `live assignment` (binds participant→studio, provisions Zoom/LiveKit) → `studioid`/`liveassignmentid` written back to `queue_token` → participant joins via `openviduroom` (LiveKit) or `zoomdata.join_url` (Zoom) → session recorded (`egressInfo` / cloud-fn egress) → on completion, `live assignment.status='completed'` and the token's binding is cleared → the move is logged in `queue stage log` (`QUEUE-AND-BIG.md`).

## 7. Worked example — a real studio binding
**`live assignment/nB91BRzO3kxQFYZvg1LV`** (sampled 2026-06-02):
- `participantid: biGk1k7F8FZKr3sGFe5n`, `queueid: bk2Fx9B41cGUv4DhrDi0`, `stagename: "Diagnostics"`, `studioid: WU0KYrffrWcbDW6U3GnL`, `status: "completed"`, created 2026-05-27 10:33, updated 2026-06-02 08:08, `pairing[1]`.
- **Zoom-path studio:** `zoomdata` present (server-provisioned), with `join_url` + `start_url` (+ `id`, `host_id`, `host_email`, `password`, `topic`, `settings`, … — 19 keys; URLs/passwords **redacted by the probe**). Consistent with §5: a `live assignment` with `zoomdata` and **no** `openviduroom` (`openviduroom` with id == this assignment id does **not** exist → confirms the Zoom path has no LiveKit room).
- `linkedToken` is currently empty — the token's `liveassignmentid`/`studioid` were **cleared on completion** (§5 step 8), exactly as the code does at `dynamic-studio.ts:1286`. The historical binding lives on in `live assignment`.

**LiveKit-path contrast:** `openviduroom/IV72tcdHPBno7BTz9o00` — `sessiontype:"appointment"`, `roomstatus:"finished"`, `recordingstatus:"ended"`, `egressInfo` present (a recorded LiveKit session). **Space config sample:** `arenaspace/0DQMrBO9bwnGmECMefeU` — `spaceid`, `pivottype`, 1 mentor, 1 participant, `validated:false`.

## 8. Known caveats
- `dynamicstudio` is **ATC-integrating → CI-excluded**; seed/test only the non-ATC studio-assembly path.
- Conferencing (LiveKit/Zoom/Chime/Picovoice) depends on **live external servers + Cloud Functions** → not deterministically testable; CI treats it as mount-and-stub smoke (`DESIGN.md`, D-002).
- `live assignment.studioid` only 71% filled and `signature` 55% — bindings vary by stage type (some stages don't allocate a studio id / Zoom signature).
- `arena participant.liveassignmentstatus` only 21% filled — most rows are readiness placeholders, not active bindings.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| Studio binding is runtime-assembled | `live assignment/nB91BRzO3kxQFYZvg1LV` (participant→studio, status completed) | 12,787 | evidence.json `.traces.studioTrace`; dynamic-studio.ts:1074-1115 |
| zoomdata server-provisioned, client read-only | live assignment has zoomdata{join_url,start_url}; no client write | — | dynamic-studio.ts:422,1611 (code audit) |
| Zoom-path has no openviduroom | no `openviduroom` with id==liveassignmentid for this binding | — | evidence.json `.traces.studioTrace.openviduroomByLiveAssignmentId` |
| LiveKit room id == live-assignment id | `createOpenViduRoom({roomid: liveAssignmentID})` | 102 | dynamic-studio.ts:2486; authguard.service.ts:1792 |
| studioid/liveassignmentid written back to token | `updateDoc('queue_token', {liveassignmentid, studioid})` then cleared on complete | 7,046 | dynamic-studio.ts:1124,1286 |
| pairing by token readiness, not arena participant | `token.status=="ready"` gate | 1,239 | dynamic-studio.ts:787 (code audit) |
| LiveKit recording via cloud fn | openViduStartRecording / openViduStopRecording | — | join-openvidu-call.ts:859,877 |

## 10. Open questions (engineer validation)
1. What server-side trigger provisions `live assignment.zoomdata`? (Confirm it's a Firestore-create trigger; out of this repo.)
2. Is `arena participant` (pairingmode/stagerole) deprecated, or used by a backend pairer?
3. Should `queue studio pairing.openvidu` (the LiveKit-vs-Zoom flag, 28% fill) default to LiveKit when absent?
4. Recording retention: `egressInfo.file.filename` (`openvidu-recording.ts:193`) — where are recordings stored/retained?
