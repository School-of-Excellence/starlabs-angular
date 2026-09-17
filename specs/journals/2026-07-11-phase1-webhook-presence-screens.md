# 2026-07-11 — Phase 1: screens read webhook presence + gated safe regenerate

**Plan:** [2026-07-11-webhook-presence-screen-migration.md](../plans/2026-07-11-webhook-presence-screen-migration.md). Backend Phase 0 in [2026-07-09 journal](2026-07-09-zoom-regenerate-conflict-and-webhook-presence.md).
**Deployed:** functions → `starlabs-test`; frontend → `breakthroughs-test.web.app` (project `starlabs-test`). NOT committed.

## What shipped

### Backend (functions repo, `queuesystem.js` / `service.js`)
- **Safe regenerate** (Phase 0): `studioZoomLinkRegenerate` ends the old meeting first (`PUT /meetings/{oldId}/status {action:"end"}`). Needed the Zoom S2S app scope **`meeting:update:status:admin`** (operator added it — error 4711 until then). Verified: `[regenerate] ended old meeting <id>`.
- **`linkExpiresAt`** written by both generators (from shared `ZOOM_SIGNATURE_TTL_SECONDS` = 12h via `signatureExpiryDate()`).
- **`endedMeetingId`** added to the webhook `meeting.ended` write — so the studio can ignore an OLD meeting's end after a regenerate.

### Frontend — dynamic-studio-v2 (specialist studio)
- New `liveAssignmentLog` subscription (`live assignment log/{docid}`, wired in `selectStudio`, torn down in `ngOnDestroy`).
- `presenceView` getter overlays webhook truth onto `liveAssignment`: `participantInCallAt`/`participantLeftAt`, specialist present (collapsed from the `specialists` map), `meetingEndedAt` (only when `endedMeetingId === current zoomdata.id`). `participantReadyAt` stays client-stamped.
- Presence getters repointed to `presenceView`: `participantInWaitingRoom`, `participantHasJoinedCall`, `topBarStatus`, `callEnded` (now also true on `meetingEndedAt`), `specialistInMeeting`.
- Regenerate gating: new `canRegenerate` (= `callEnded || linkExpired || isZoomLinkBroken`) + `linkExpired` getter; button/title in HTML gated on it (was always-enabled). `regenerateZoomLink()` now `deleteDoc`s the log so the new session starts fresh.

### Frontend — zoom-clientview (participant wait-gate)
- Additive reliability fallback: parallel `waitingLogSub` on `live assignment log`; `isSpecialistPresent()` now returns true on the client one-shot **or** any specialist present in the log. Release logic extracted to `releaseSpecialistGate()`. Cleaned up in both early-exit branches + `ngOnDestroy`.
- (`customerKey = profileid` for all joiners, from earlier, is now DEPLOYED — specialists are identified in the log.)

## Revert guide (per-screen)
- **dynamic-studio-v2.component.ts**: remove `liveAssignmentLog`/`liveAssignmentLogSub`/`subscribeLiveAssignmentLog`/`presenceView`/`canRegenerate`/`linkExpired`; repoint the 5 getters' `const la` back to `this.liveAssignment || {}`; drop the `deleteDoc(live assignment log)` in `regenerateZoomLink`; remove the `subscribeLiveAssignmentLog()` call and the `ngOnDestroy` unsub; restore `docData` import removal if desired.
- **dynamic-studio-v2.component.html**: restore the regen title to `isZoomLinkBroken` and the button bindings to `!isZoomLinkBroken && !callEnded` / `isZoomLinkBroken || callEnded`.
- **zoom-clientview.component.ts**: restore `isSpecialistPresent` to the two-line one-shot check; remove `waitingLogSub`/`latestLog`/`isSpecialistPresentInLog`/`releaseSpecialistGate` and the parallel sub; inline the original release block.
- **Backend**: remove `endedMeetingId`; (Phase 0 revert in its own journal).

## How to test (starlabs-test)
1. Start a studio call from Dynamic Studio; participant joins.
2. Studio presence pills should track join/leave from the webhook log; specialists shown by name (customerKey live).
3. While the call is healthy → **regenerate button disabled** (ghost); when the meeting ends / link expires / breaks → **enabled** (primary).
4. Regenerate → no "other meeting in progress"; old meeting ends; log resets; new session shows fresh presence.

## Known/pending
- Latency: webhook presence lands ~seconds late; wait-gate keeps the fast client path as primary, log as fallback.
- Phases 2–4 pending: arena-board, event-opportunity-dashboard, QueueWebVersion1, list-openvidu-room; then stop writing the 4 legacy fields from zoom-clientview.
- Verbose `[presence]` webhook logs still on — trim before finishing.
