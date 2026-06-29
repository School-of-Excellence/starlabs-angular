# Journal — 2026-06-24 — Remove presence heartbeats from `live assignment`

## What & why

The studio (dynamic-studio-v2) was hanging. Root cause: three 10s presence
heartbeats (`participantLastSeenAt`, `specialistLastSeenAt`,
`specialistAtStudioLastSeenAt`) were written to the **`live assignment`**
document — the same doc the studio, arena board, and zoom-clientview all
subscribe to. Every 10s write re-emitted the heavy business payload → re-render
→ hang. Classic anti-pattern: high-frequency ephemeral presence coupled to a
heavily-subscribed business document.

## Decision (the WHY behind the constraints)

- **No RTDB.** Operator chose to solve with Firestore + Angular lifecycle only,
  even though RTDB `onDisconnect` is the textbook fix. So the solution is
  *removal*, not relocation: drop the heartbeats entirely and derive presence
  from the existing one-shot event stamps.
- **Accept the crash/sleep/network-drop gap.** Removing the heartbeat removes
  the ~25s staleness auto-recovery. A missed leave (browser kill, OS sleep,
  network drop with tab open) becomes a *sticky* phantom until refresh/rejoin,
  instead of self-clearing in 25s. Operator explicitly accepted this — "we know
  the call has ended and that is enough."
- **Heartbeat 2 is costlier than 1.** `specialistLastSeenAt` fed
  `isSpecialistPresent()`, the gate that tells the participant the specialist is
  in. Without it, a specialist crash leaves the gate reading "present" →
  participant can join an empty Zoom room. Accepted; mitigated by Zoom's own
  membership view + rejoin self-heal.
- **Heartbeat 3 dropped wholesale.** `specialistAtStudioLastSeenAt` +
  `returnedToStudioAt` only powered the arena sub-line "Returned to studio ·
  awaiting completion" vs "Awaiting specialist to return to studio". Operator
  decided "Call ended" alone is enough → both fields removed, sub-line collapsed
  to "Awaiting completion".
- **`callEndedAt` removed.** Repo-wide grep proved zero positive writes anywhere
  (only ever nulled); it was a vestigial legacy field read as a fallback. Gone.

## Key correctness points discovered

1. **Refresh self-heal needed an explicit fix.** markReady stamped
   `participantReadyAt` but did NOT clear `participantLeftAt` (pagehide stamps it
   on the unload half of a refresh). Without the heartbeat masking it, the stale
   `leftAt` would stick the UI on "left". Fix: added `participantLeftAt: null` to
   the markReady update (zoom-clientview).
2. **Route-change gap for the participant.** ngOnDestroy cleaned up the
   specialist but NOT the participant (it only stopped the heartbeat + removed
   the pagehide listener). Added a participant branch to ngOnDestroy mirroring
   pagehide (null ready/inCall, stamp left). Specialist already had both paths.
3. **`isSpecialistPresent()` legacy trap.** Its legacy fallback returned `true`
   on `specialistJoinedAt` alone — *ignoring* `specialistLeftAt`. Once the
   heartbeat field is gone, every doc would hit that branch and read "present"
   even after a clean leave. Rewrote it to `specialistJoinedAt && !specialistLeftAt`.
4. **specialistJoinedAt is preserved across rejoin** (guarded `if (!set)`), so
   duration spans the whole session including any drop gap — intended. Rejoin
   restores presence by nulling `specialistLeftAt`, not by re-stamping join.

## Final state of presence

Derived purely from one-shots:
- Participant: `participantReadyAt` (waiting), `participantInCallAt` (in call),
  `participantLeftAt` (left). Cleared/stamped on init markReady, Zoom join,
  pagehide, ngOnDestroy.
- Specialist: `specialistJoinedAt` (start, preserved), `specialistLeftAt` (left).
- Studio-screen presence + returned distinction: gone.
- `callEnded` still derived (both parties left + at least one joined).

## Files touched

- `zoom-clientview.component.ts` — removed both heartbeats (kept pagehide
  wiring), rewrote `isSpecialistPresent`, markReady `participantLeftAt:null`,
  ngOnDestroy participant branch, dropped `*LastSeenAt`/`callEndedAt` writes.
- `dynamic-studio-v2.component.ts` — removed studio-presence heartbeat block
  (`startStudioPresence`/`stopStudioPresence` now no-ops), stripped lastSeen
  freshness from `participantInWaitingRoom`/`participantHasJoinedCall`/
  `participantReady`/`topBarStatus`.
- `arena-board.component.ts` — removed 5 interface fields; `participantPresent`/
  `specialistInCall`/`participantInCall` now one-shot only; removed
  `specialistAtStudio`; dropped `callEndedAt` from `joinedAssignments`/
  `sessionElapsed`/`callEndedClock`.
- `arena-board.component.html` — collapsed the two studio sub-lines to a single
  "Awaiting completion".

## State / pending

- Builds clean (`ng build --configuration development`; only pre-existing
  unrelated warnings). On branch `feature/remove-presence-heartbeats`.
- **NOT committed** — operator wants to E2E test in a logged-in browser first.
- E2E scenarios to verify: participant waiting → in-call → left; refresh
  self-heal; route-change cleanup; specialist join gate release; arena
  waiting/in-call/call-ended states.
- Optional later: one-time `where('callEndedAt','!=',null)` check before
  considering the legacy field fully retired in data.
