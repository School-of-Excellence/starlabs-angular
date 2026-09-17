# 2026-07-11 — Phase 2: arena-board reads webhook presence

**Plan:** [2026-07-11-webhook-presence-screen-migration.md](../plans/2026-07-11-webhook-presence-screen-migration.md). Follows [Phase 1](2026-07-11-phase1-webhook-presence-screens.md).
**Scope:** arena-board ONLY (operator: leave event-opportunity-dashboard untouched). NOT deployed (operator tests locally). NOT committed.

## What changed — arena-board.component.ts
Arena is **list-based** (all live assignments for a queue+stage), so instead of a single-doc overlay it subscribes to the log docs for the currently-listed assignments and overlays per row.

- Import: added `documentId`.
- Props: `logByLaId` (map id→log doc), `logSubs` (Subscription[]), `logSubKey`.
- `subscribeLiveAssignmentLogs()` — called after the live-assignment list updates. Subscribes to `live assignment log` via `where(documentId(), 'in', chunk)` in chunks of 30; re-subscribes only when the id set changes; keeps `logByLaId` current. Chose documentId()-IN (no webhook change) to keep this self-contained to the arena screen.
- `presenceOf(a)` — overlays the row's log doc (participant in-call/left, specialist joined/left collapsed from the `specialists` map, timestamps preserved for `.toDate()/.toMillis()`); `participantReadyAt` NOT overridden (pre-Zoom, client-only). Falls back to the raw row when no log doc.
- Repointed presence helpers to `presenceOf(a)`: `joinedAssignments`, `activeAssignments`, `sessionElapsed`, `callStartedClock`, `callEndedClock`, `participantPresent`, `specialistInCall`, `participantInCall`, `callEnded`.
- Teardown: `logSubs` unsubscribed in `ngOnDestroy` (also under `takeUntil(destroy$)`).

Build: `ng build --configuration production` clean (only pre-existing CSS warnings).

## Revert guide (arena-board only)
- Remove `logByLaId`/`logSubs`/`logSubKey`, `subscribeLiveAssignmentLogs()`, `presenceOf()`, the `subscribeLiveAssignmentLogs()` call, and the `logSubs` teardown.
- Repoint the 9 helpers back to reading `a.<field>` directly (drop the `const p = this.presenceOf(a)` lines).
- Remove `documentId` from the import if unused elsewhere.

## event-opportunity-dashboard — "call started + how long ago" migrated (operator asked after)
Only the studio-watch join-time logic (uses just `specialistJoinedAt`).
- Added `subscribeStudioWatchLogs()` (documentId() IN chunks over the selected queues' live assignments), wired in `handleEventData`; cleaned up in `ngOnDestroy`.
- Added `specialistJoinedMs(a)` → earliest specialist join from the log (log present but no join → null = "not started"); legacy fallback when no log doc.
- `studioWatchItems` now computes `joinedMs` via `specialistJoinedMs(a)` → ACTIVE/JOINED + elapsed timer come from the log.
- Revert: remove those two methods + the `handleEventData` call + `ngOnDestroy` cleanup + `logByLaId/logSubs/logSubKey`; restore line to `this.tsToMillis(a?.['specialistJoinedAt'])`; drop `documentId` import.
- Build clean.

## Follow-up — per-specialist joined status (operator asked)
- Added `specialistPresentById(a, profileid)` + `specialistJoinedById(a, profileid)` reading the log `specialists` map (keyed by profile id).
- Active card: each pairing + bonus specialist shows its OWN status icon (check_circle/remove_circle) + tooltip (In the call / Left the call / Not joined yet). Removed the single collapsed "Specialist" badge; kept the Participant badge. Added `.kc__role-pres` CSS.
- Revert: remove the two methods, restore the collapsed `specialistInCall(a)` "Specialist" badge in `.kc__presence`, drop the per-role `.kc__role-pres` spans + CSS.

## Pending
- Phase 3: QueueWebVersion1, list-openvidu-room, dynamic-studio v1 (+ event-opportunity-dashboard when ready).
- Phase 4: stop writing the 4 legacy fields once all readers migrated.
- Trim verbose `[presence]` webhook logs.
