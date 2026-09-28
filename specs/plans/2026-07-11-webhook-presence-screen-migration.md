# Plan — Migrate screens to webhook presence + safe regenerate

**Date:** 2026-07-11
**Status:** DRAFT — awaiting operator approval to start Phase 1
**Depends on:** `live assignment log` webhook (shipped, [2026-07-09 journal](../journals/2026-07-09-zoom-regenerate-conflict-and-webhook-presence.md)); `customerKey` for all joiners (edited, not yet deployed).
**Decisions locked:** Robust regenerate (end old meeting first). Participant surfaces: zoom-clientview, QueueWebVersion1, list-openvidu-room.

## Goal
1. Replace the 4 client-stamped presence fields with webhook truth from `live assignment log`.
2. Make regenerate safe (server ends the old meeting first) and gate its visibility on real meeting state.

## Presence model (read from `live assignment log/{liveassignmentid}`)
Derive, from the log doc:
- `specialistPresent` = any `specialists[pid].joinedAt && !leftAt`
- `specialistJoinedAt` = earliest `specialists[pid].joinedAt`
- `participantInCall` = `participantInCallAt && !participantLeftAt`
- `meetingEnded` = `!!meetingEndedAt`; `durationSeconds` available
- **`participantReadyAt` stays client-stamped** (pre-Zoom wait-screen state; not in webhook).

Latency note: webhook lands ~seconds late. For the participant wait-gate release, keep a fast optimistic client signal; treat the log as authoritative correction.

## Regenerate availability (specialist)
Show **Rejoin** (same meeting, fresh token) while the call is healthy/live.
Show **Generate New Link** only when the link is unusable: `meetingEnded` OR `linkExpiresAt < now` OR broken (`start_url` missing/"Link Broken").
With the robust backend change, regenerate is always safe even if pressed while an old meeting lingers.

## Backend (functions repo — deploy to starlabs-test)
- **B1.** `studioZoomLink` + `studioZoomLinkRegenerate`: write `linkExpiresAt` (= token `exp` in ms) alongside signatures. Enables the "expired" state.
- **B2.** `studioZoomLinkRegenerate`: before creating the new meeting, `PUT https://api.zoom.us/v2/meetings/{oldId}/status {action:"end"}` (S2S token already minted there) to free the account. Then create as today.

## Frontend (Angular repo)
Shared helper (new): `livePresence(logDoc)` → the derived booleans/timestamps above. Each surface subscribes to `live assignment log/{id}` and reads via the helper.

Surfaces:
- **dynamic-studio-v2** (primary specialist studio): presence display + Rejoin/Regenerate gating.
- **dynamic-studio** (v1): same, if still in use.
- **arena-board**: presence pills from log.
- **event-opportunity-dashboard**: presence reads → log.
- **zoom-clientview**: wait-gate release reads `specialistPresent` from log (keep optimistic client fallback). Stop relying on self-written fields for gating (keep writing them one release for safety, then drop).
- **QueueWebVersion1** (participant queue-web): presence reads → log.
- **list-openvidu-room** (participantstudio): presence reads → log.

## Phasing (each independently shippable + revertible; journal every screen)
- **Phase 0 (backend):** B1 + B2, deploy to test. Deploy the pending `customerKey` frontend so specialists are identified.
- **Phase 1 (core pair):** dynamic-studio-v2 (specialist) + zoom-clientview (participant wait-gate) reading from log; Rejoin/Regenerate gating in v2. Validate a real studio call end-to-end.
- **Phase 2:** arena-board + event-opportunity-dashboard presence.
- **Phase 3:** QueueWebVersion1 + list-openvidu-room + dynamic-studio v1.
- **Phase 4:** stop writing the 4 legacy fields from zoom-clientview (after all readers migrated).

## Risks
- Live-call gating logic — a wrong presence read could strand a participant. Mitigate with optimistic client fallback + phased rollout + real-call verification each phase.
- Latency on wait-gate release (seconds) — optimistic signal mitigates.
- Existing calls created before `linkExpiresAt`/`zoomMeetingIds` won't have those fields — guard for undefined.

## Verify
Real studio call on test per phase: presence pills track join/leave; regenerate hidden while live, shown when ended; regenerate after a lingering meeting no longer says "other meeting in progress".
