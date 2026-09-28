# 2026-07-11 — Phase 4: remove legacy presence-field writes (pure log)

**Plan:** [2026-07-11-webhook-presence-screen-migration.md](../plans/2026-07-11-webhook-presence-screen-migration.md). Final phase.
**Decision:** operator chose **pure log** — remove all 4 fields (`specialistJoinedAt`, `specialistLeftAt`, `participantInCallAt`, `participantLeftAt`), keep only `participantReadyAt`. Lobby release is now webhook-driven (~2–4s after the specialist joins) instead of instant.
**Not deployed (operator tests locally). Not committed.**

## Why safe now
All READERS were migrated in Phases 1–2 (dynamic-studio-v2, arena-board, event-opportunity-dashboard, zoom-clientview wait-gate) — they read `live assignment log`. QueueWebVersion1 / dynamic-studio v1 don't use these fields; list-openvidu-room uses only `participantReadyAt`. So stopping the writes breaks nothing.

## zoom-clientview.component.ts — removed
- **Properties:** `specialistUnloadHandler`, `specialistLeaving`, `specialistPageShowHandler`, `specialistPresenceSub`.
- **Whole subsystems deleted:** `startSpecialistHeartbeat`, `stopSpecialistHeartbeat`, `startSpecialistPresenceSelfHeal`, `stopSpecialistPresenceSelfHeal` (they existed only to keep the fragile `specialistLeftAt` accurate — the log now does this).
- **Participant heartbeat** (`startParticipantHeartbeat`): write reduced to `{ participantReadyAt: null }` (dropped participantInCallAt/participantLeftAt).
- **`isSpecialistPresent`:** now log-only (`isSpecialistPresentInLog(latestLog)`); legacy one-shot check removed.
- **`wireMeetingEndListener`:** host branch drops the specialistLeftAt+participantLeftAt stamps (webhook `meeting.ended` records it), keeps `returnToStudioTab()`; participant branch removed entirely.
- **`ngOnDestroy`:** route-change leave block reduced to clearing `participantReadyAt` (participant only); removed `stopSpecialistHeartbeat()` + specialist/participant leave stamps.
- **Host-join success:** removed the specialistJoinedAt/specialistLeftAt stamp + heartbeat/self-heal starts.
- **Participant-join success & participant-ready write:** keep only `participantReadyAt` handling.

## dynamic-studio-v2.component.ts — regenerate reset
- `regenerateZoomLink()` reset write reduced to `{ participantReadyAt: null }` (the log doc is already deleted there, resetting in-call/leave presence).

## Result
`live assignment` now carries only `participantReadyAt` (+ zoom link data) for presence. The 4 in-call/leave fields are 100% server-derived from `live assignment log`. Build: `ng build --configuration production` clean.

## Revert guide (Phase 4)
Phase 4 is the git-diff of zoom-clientview.component.ts + the dynamic-studio-v2 regenerate-reset hunk. To restore the client-stamped model: re-add the 4 properties, the two specialist subsystems (heartbeat + self-heal + bfcache handlers), and the field stamps in startParticipantHeartbeat / wireMeetingEndListener / ngOnDestroy / host-join / participant-join / participant-ready / regenerate reset; restore `isSpecialistPresent` to check `specialistJoinedAt && !specialistLeftAt` first. (Simplest: `git checkout` those two files to pre-Phase-4, but that also drops Phases 1 & the wait-gate log fallback — so revert by hunk, not whole-file.)

## Behavior change to watch in testing
- **Lobby release** now waits for the webhook (~2–4s) when the specialist joins AFTER the participant is waiting. If the specialist is already in, the log doc exists → release is immediate.
- Studio/arena "specialist in call", "participant in call", "call ended", timers — all now reflect the webhook log exclusively.

## Pending (whole effort)
- Trim verbose `[presence]` webhook debug logs (backend redeploy).
- Optional backend-safety check: confirm no cloud function reads the 4 removed fields.
