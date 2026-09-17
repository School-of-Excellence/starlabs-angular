# Journal — participant stuck on the wait screen when the specialist joins first

**Date:** 2026-07-10
**Status:** Fixed in working tree (NOT committed, per operator)
**Touched:** `src/app/queue system/zoom-clientview/zoom-clientview.component.ts` (only)
**Related:** [2026-07-08-zoom-clientview-full-flow.md](2026-07-08-zoom-clientview-full-flow.md), [2026-06-24-presence-heartbeat-removal.md](../plans/2026-06-24-presence-heartbeat-removal.md)

## Symptom (operator report)

- **Scenario A (worked):** participant sits on the `/openmeeting` wait screen → specialist joins → wait screen closes, participant enters Zoom.
- **Scenario B (broken):** specialist joins from the studio *first*; participant is still on `/participantstudio`. Participant then clicks "Join Meeting Now" → lands on the wait screen and **stays there forever**, even though the specialist is demonstrably inside the Zoom call.

## Root cause

The participant's wait gate is `isSpecialistPresent()` = `specialistJoinedAt && !specialistLeftAt` on the `live assignment` doc.

`specialistLeftAt` was **written by tab-lifecycle events, not by leaving the meeting**:
- `pagehide` (fires on bfcache entry and on mobile tab backgrounding — neither means "left the call"),
- `ngOnDestroy` (fires on any in-app route change / component re-creation),
- the Zoom `meetingStatus === 3` listener (also fires on a transient disconnect).

It was **cleared in exactly one place**: the `ZoomMtg.join` success callback. Nothing else ever nulled it.

That asymmetry is the whole bug. In scenario A the participant is released *by the join event itself*, and that same write clears any stale leave a millisecond earlier — so the stale flag is invisible. In scenario B the participant arrives *after* the join. By then the specialist's meeting tab may have fired `pagehide`/destroy and re-stamped `specialistLeftAt`, and since the specialist is not going to re-join, **nothing will ever clear it**. The gate watches a field that can no longer flip.

Two aggravating factors made it unrecoverable:
1. The 10s presence heartbeats were deliberately removed (see the 2026-06-24 plan), so these one-shot timestamps are the only source of truth — a spurious or lost write cannot self-correct.
2. `callEnded` requires `participantLeftAt` **as well**, so a stale `specialistLeftAt` alone does not trip the "meeting ended" guard. The specialist sees no warning; only the participant is punished.

## Fix

Make "the host is inside the call" (`isJoined`) the source of truth, rather than a leave stamp that only a fresh join can undo.

1. **Self-heal listener** (`startSpecialistPresenceSelfHeal`) — while the host is joined, watch the doc; if `specialistLeftAt` appears, clear it. Covers *every* spurious writer, including ones we could not reproduce (transient `meetingStatus === 3`, HMR-driven destroy).
2. **bfcache restore** — a page restored from the back/forward cache never re-runs `ZoomMtg.join`, so a `pageshow` handler with `ev.persisted` undoes the leave the matching `pagehide` stamped.
3. **`specialistLeaving` guard** — raised by all three genuine-leave paths (pagehide, host meeting-end, `ngOnDestroy`) *before* they stamp, so a real leave is never undone by the self-heal.

Deliberately kept: `pagehide` still stamps on bfcache entry. Skipping it there would have created the opposite failure — a phantom "present" specialist and a participant dropped into an empty room. Stamping and then undoing on restore is correct in both directions.

## Not fixed (separate bug, same symptom)

`/participantstudio` queries `where("status","==","live") && where("participantid","==",…)` with **no dedup** ([list-openvidu-room.component.ts:56](../../src/app/OpenVidu/list-openvidu-room/list-openvidu-room.component.ts)) and renders one "Join Meeting Now" per result. If a participant has two `status: "live"` docs, they can open doc P while the specialist joined doc S — identical stuck-on-wait symptom, completely different fix. Rule this out by counting live docs for the participant before assuming a regression here.

## Verification status

- `npx tsc -p tsconfig.app.json --noEmit` — clean.
- **Scenario B confirmed working by the operator** (2026-07-10, manual run): specialist joins first, participant then clicks "Join Meeting Now" → wait screen releases into Zoom. Previously it hung forever.
- No automated coverage. The repo's Playwright suite (`e2e/`) covers the OpenVidu grid tests only, not the Zoom studio gate. Reproducing this needs an authenticated specialist *and* participant plus a real Zoom join.

### What we still do NOT know

The fix was validated by its **effect**, not by catching the culprit in the act. Temporary `[presence]` probes were added to the pagehide / `ngOnDestroy` stamp sites and then removed once scenario B passed — the operator confirmed the fix before the probe output was read back. So:

- We never identified **which** writer stamped the spurious `specialistLeftAt` (`pagehide` on bfcache/backgrounding, `ngOnDestroy` on route change, or a transient `meetingStatus === 3`).
- The self-heal listener masks all three by design, so the symptom disappears regardless of which one it was.
- **Consequence:** the stamp is still being written at the source; we only clear it afterwards. There is a sub-second window after a spurious stamp, before the host's listener clears it, in which a participant loading the wait screen reads "specialist left" and waits. The `docData` listener then releases them on the clearing write, so this self-corrects — but if the wait screen is ever reported as "released after a beat", this is why.

If it recurs, re-add the probes (git history of this file) and read the specialist tab's console; the stamp site logs itself.

## Revert guide

Single file, four hunks — revert all of them together:

- `git checkout -- "src/app/queue system/zoom-clientview/zoom-clientview.component.ts"`

Or by hand, remove: the `specialistLeaving` / `specialistPageShowHandler` / `specialistPresenceSub` fields; the `pageshow` wiring and the `stopSpecialistPresenceSelfHeal()` call inside `startSpecialistHeartbeat`; the two new methods `startSpecialistPresenceSelfHeal` / `stopSpecialistPresenceSelfHeal`; the `stopSpecialistPresenceSelfHeal()` calls in `stopSpecialistHeartbeat` and in the host branch of `wireMeetingEndListener`; and the `startSpecialistPresenceSelfHeal()` call in the `ZoomMtg.join` success handler. No template or CSS changed.
