# Plan — Remove presence heartbeats from `live assignment` (Firestore-only)

**Date:** 2026-06-24
**Status:** IMPLEMENTED on branch `feature/remove-presence-heartbeats` (builds clean, dev config). NOT committed — pending E2E test in logged-in browser. Heartbeats 1, 2, 3 + `callEndedAt` all removed.
**Owner:** operator (appexperience@soexcellence.com)

## Problem

Three 10s heartbeats (`participantLastSeenAt`, `specialistLastSeenAt`,
`specialistAtStudioLastSeenAt`) are written to the **`live assignment`**
document. The studio (dynamic-studio-v2), arena board, and zoom-clientview all
subscribe to that doc, so every 10s write re-emits the heavy business payload →
re-render → studio hangs. Root cause = high-frequency presence churn coupled to
a heavily-subscribed business document.

## Decision (constraints)

- **No RTDB.** Solve with Firestore + Angular lifecycle only.
- Accept the **browser-kill / OS-sleep / network-drop-with-tab-open** phantom
  cases (rare; recover on refresh/rejoin). We are NOT solving these now.
- Trade-off accepted: removing the heartbeat removes the ~25s staleness
  auto-recovery backstop. A missed leave becomes a *sticky* phantom (until
  refresh/rejoin) instead of self-clearing in 25s.

---

## Heartbeat 1 — `participantLastSeenAt` — LOCKED

**Remove the field entirely** (write + all reads). Derive presence purely from
the three one-shots: `participantReadyAt`, `participantInCallAt`,
`participantLeftAt`.

### Derived states (one-shot only)

| State    | readyAt | inCallAt | leftAt |
|----------|---------|----------|--------|
| Waiting  | set     | null     | null   |
| In call  | null    | set      | null   |
| Left     | —       | —        | set    |

### Write changes — zoom-clientview

| Site | Action |
|------|--------|
| `:175` 10s heartbeat write | **Delete** |
| `startParticipantHeartbeat`/`stopParticipantHeartbeat` (~168–207) | Drop `setInterval`/`beat`; **keep** the `pagehide` listener wiring (relocate out of the heartbeat fn) |
| `:658` markReady update | Remove `participantLastSeenAt`; **add `participantLeftAt: null`** so refresh self-heals |
| `:832` in-call update | Remove `participantLastSeenAt` (keep `participantInCallAt`, `participantReadyAt:null`, `participantLeftAt:null`) |
| `ngOnDestroy` (`:583`) | **Add participant branch**: null `participantReadyAt`/`participantInCallAt`, stamp `participantLeftAt`. Guard: `!profileHost && collectiontype==='queue' && documentId && status==='live'` |

### Read changes — strip `lastSeen` freshness, use one-shots only

| File | Sites |
|------|-------|
| dynamic-studio-v2 | `participantReady` (`:650`), `topBarStatus` (`:673`), helpers `:472`/`:487` |
| arena-board | `participantPresent` (`:490`), `participantInCall` (`:516`), interface field `:63` |

### Routes covered

| Route | Handling | Status |
|-------|----------|--------|
| Enter wait screen | markReady: readyAt set, leftAt null | ✅ |
| Join Zoom | inCallAt set, readyAt/leftAt null | ✅ |
| Clean route change | ngOnDestroy: null ready/inCall, stamp left | ✅ (new) |
| Clean tab close | pagehide (`:189`) | ✅ |
| Refresh | pagehide → re-init (readyAt set, leftAt null) | ✅ self-heals |
| Browser kill / OS sleep | nothing fires | ➖ accepted |
| Network drop, tab open | nothing fires | ➖ accepted |

### Two mandatory additions (else routes 3 & 5 break)

1. `participantLeftAt: null` in the init markReady update (`:656`).
2. Participant branch in `ngOnDestroy`.

### Break risk

Nothing breaks on clean paths **iff** (a) all 6 readers migrated together, and
(b) both cleanup paths (ngOnDestroy + pagehide) wired. A missed reader = that
path shows "not present" forever.

---

## Heartbeat 2 — `specialistLastSeenAt` — LOCKED

**Remove the field entirely.** Derive specialist presence from one-shots:
- **In call / present** = `specialistJoinedAt` set **AND** no `specialistLeftAt`
- **Left** = `specialistLeftAt` set

No "ready/in-call" split — specialist has only join/left.

### Write changes — zoom-clientview

| Site | Action |
|------|--------|
| `:220` 10s heartbeat write | **Delete** |
| `startSpecialistHeartbeat`/`stop…` (~214–252) | Drop `setInterval`/`beat`; **keep** pagehide wiring |
| `:809` rejoin (Zoom join success) | Remove `specialistLastSeenAt` (keep `specialistLeftAt:null`, set-if-unset `specialistJoinedAt`) |
| `:603` ngOnDestroy | Remove `specialistLastSeenAt:null` line (keep `specialistLeftAt` stamp) |
| `:235` pagehide | Remove `specialistLastSeenAt:null` line (keep `specialistLeftAt` stamp) |

### Read changes

| Site | Action |
|------|--------|
| `isSpecialistPresent()` `:257` | **Rewrite** → `specialistJoinedAt && !specialistLeftAt`. Drop freshness AND the legacy fallback (legacy branch ignores `specialistLeftAt` → would read "present" after a clean leave) |
| arena `specialistInCall` `:502` | Drop lastSeen check → `specialistJoinedAt && !specialistLeftAt` |
| arena interface `:60` | Remove field |

### Init / destroy (differs from Heartbeat 1)

- **Destroy:** already wired (ngOnDestroy `:603` + pagehide `:235` both stamp `specialistLeftAt`). No new code — just remove the lastSeen null line.
- **Init/self-heal:** the re-affirm (`specialistLeftAt:null`, `specialistJoinedAt` set-if-unset) lives in the **Zoom join-success callback** `:809`, NOT ngOnInit. Deliberate — "present" should track actual Zoom membership, not page load. Do NOT add an early ngOnInit null (would re-introduce the empty-room risk).

### Routes

| Route | Handling | Status |
|-------|----------|--------|
| Join Zoom | `specialistJoinedAt` set, `specialistLeftAt` null | ✅ |
| Clean route change | ngOnDestroy stamps `specialistLeftAt` | ✅ already wired |
| Clean tab close | pagehide stamps `specialistLeftAt` | ✅ already wired |
| Rejoin | `specialistLeftAt` null, `specialistJoinedAt` preserved (`:809`) | ✅ |
| Refresh | pagehide stamps left → host re-join nulls it | ✅ self-heals (longer flicker — waits for Zoom rejoin) |
| Crash / sleep / drop | nothing fires → gate stays "present" | ⚠️ **empty-room risk** (accepted) |

### Accepted consequence (costlier than Heartbeat 1)

`isSpecialistPresent()` is the participant entry gate. Without the heartbeat, a
specialist crash/sleep/drop (no `specialistLeftAt`) leaves the gate reading
"present" → participant may **join an empty Zoom room** until the specialist
rejoins. Accepted, consistent with the no-RTDB / accept-gaps stance.
Mitigations: Zoom itself shows meeting membership; rejoin self-heals.

### `callEnded` after removal

Still derived, unchanged shape — inputs switch to one-shot:
`callEnded = !specialistInCall && !participantInCall && (specialistJoinedAt || participantInCallAt)`.
Effectively: **both parties have a `leftAt`** (and at least one joined).

---

## Cleanup — remove `callEndedAt` — LOCKED

Repo-wide grep confirms **no positive write anywhere** (Cloud Functions / v1
studio included). Only ever set to `null`; read in 3 arena spots as a legacy
fallback. Dead for all current data.

### Delete

| Site | Action |
|------|--------|
| zoom-clientview `:811` | Remove `callEndedAt: null` line (+ comment `:802`) |
| arena interface `:68` | Remove field |
| arena `:299` | `!a.specialistJoinedAt && !a.callEndedAt` → `!a.specialistJoinedAt` |
| arena `:442` & `:465` | Drop the `legacy` const from the `max(...)` candidates |

### Residual (data, not code)

Old `live assignment` docs *may* still carry a populated `callEndedAt` (a past,
now-deleted code path wrote it — per the `:68` comment). After removal, their
end-clock falls back to `max(specialistLeftAt, participantLeftAt)`; an old doc
with ONLY `callEndedAt` and no leave stamps would show `—`. Cosmetic, historical
sessions only. Optional zero-risk gate: run `where('callEndedAt','!=',null)`
once — if empty, remove with zero impact.

---

## Heartbeat 3 — `specialistAtStudioLastSeenAt` — LOCKED

**Remove entirely + remove `returnedToStudioAt`.** Decision: the "Returned to
studio · awaiting completion" vs "Awaiting specialist to return to studio"
distinction is NOT worth keeping — **"Call ended" alone is enough**. Nothing
participant-facing depends on it → cleanest removal of the three.

Note: `returnedToStudioAt` today is stamped on the first studio beat after
`specialistJoinedAt` is set — it does NOT require `specialistLeftAt`, so it can
fire mid-call (studio tab open in background). It never meant "returned after
leaving." With the distinction dropped it has no consumer → remove.

### Write changes — dynamic-studio-v2

| Site | Action |
|------|--------|
| `:734` `specialistAtStudioLastSeenAt` beat | **Delete** |
| `:741` `returnedToStudioAt` stamp | **Delete** |
| `startStudioPresence`/`beatStudioPresence`/`stopStudioPresence` (~718–753) + `studioPresenceTimer`/`STUDIO_PRESENCE_HEARTBEAT_MS`/`studioReturnStampedFor` | **Delete** the whole presence block |

### Read changes

| Site | Action |
|------|--------|
| arena `specialistAtStudio()` `:542` | **Delete** the method |
| arena interface `:66` (`specialistAtStudioLastSeenAt`), `:67` (`returnedToStudioAt`) | Remove fields |
| arena HTML `:335`–`:336` | Remove both `*ngIf` sub-lines; keep the "Call ended" box (`:323`–`:334`) |

### Rejoin note (verified)

On rejoin via start-meeting, `specialistJoinedAt` is **NOT** re-stamped — guarded
by `if (!specialistJoinedAt)` (`:813`), preserving the original call-start time.
Only `specialistLeftAt` is nulled (`:810`), which restores `specialistInCall`
(= `specialistJoinedAt && !specialistLeftAt`). Duration spans the whole session
including any drop gap — intended.

---

## Final field disposition

| Field | Fate |
|-------|------|
| `participantLastSeenAt` | ❌ removed |
| `specialistLastSeenAt` | ❌ removed |
| `specialistAtStudioLastSeenAt` | ❌ removed |
| `returnedToStudioAt` | ❌ removed |
| `callEndedAt` | ❌ removed (legacy-doc check optional) |
| `participantReadyAt` / `participantInCallAt` / `participantLeftAt` | ✅ kept (one-shots) |
| `specialistJoinedAt` / `specialistLeftAt` | ✅ kept (one-shots) |
| `created` | ✅ kept (studio-entry clock) |

## Required additions (else routes break)

1. zoom-clientview markReady (`:656`): add `participantLeftAt: null` (refresh self-heal).
2. zoom-clientview `ngOnDestroy` (`:583`): add participant branch — null `participantReadyAt`/`participantInCallAt`, stamp `participantLeftAt` (guarded `!profileHost && collectiontype==='queue' && documentId && status==='live'`).
3. Rewrite `isSpecialistPresent()` (`:257`): `specialistJoinedAt && !specialistLeftAt` (drop freshness + legacy fallback).

## Accepted gaps (all heartbeats)

- Browser kill / OS sleep / network-drop-with-tab-open → no leave fires →
  sticky phantom until refresh/rejoin. No 25s auto-recovery anymore.
- Heartbeat 2 specifically: empty-room risk (participant gate reads "present"
  when specialist crashed). Mitigated by Zoom membership + rejoin self-heal.
