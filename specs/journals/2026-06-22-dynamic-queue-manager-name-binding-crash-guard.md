# 2026-06-22 — Dynamic Queue Manager: name disappears (unguarded profile binding crash)

## Symptoms (operator report, with screenshot)
- On the **Dynamic Queue Manager** arena board, participant **names suddenly
  stop showing** — every card's `Name:` field goes blank across the whole board
  (only the status suffix like `(Queued)`/`(ready)`/`(invited)` remains).
- A **page refresh** restores the names, but **after some time the issue
  reappears** and names blank out again.

## Root cause
The card name (and the email/number/people-involved/preassigned/moved-by
spots) are rendered with **no null-guard**:

```html
{{ mapProfileData[token.profile_id]['name'] }}   <!-- :449 (and 89,93,115,116,117,194,455,472,585) -->
```

Two facts collide:
1. **`mapProfileData` is a one-shot, 10-min-cached snapshot.** It's set once in
   the constructor (`dynamic-queue-manager.component.ts:147` →
   `guard.getProfileMap()`), which returns an IndexedDB-cached map with a
   **10-minute TTL** (`authguard.service.ts:365,510`). It is **not** a live
   subscription and there is **no lazy backfill** in this component (its sibling
   `dynamic-studio-v2` has `ensureProfileLoaded()` for exactly this — this
   component never got it).
2. **The token list is realtime.** `queue_token` streams in live
   (`dynamic-queue-manager.component.ts:419`).

So when a participant who enrolled/was created **after** the snapshot was built
gets a token streamed in, their `profile_id` is **not a key** in
`mapProfileData`. `mapProfileData[id]` is `undefined`, and `undefined['name']`
**throws a `TypeError` inside Angular change detection**. That aborts the whole
change-detection tick and every subsequent tick re-throws → **all** names on the
board freeze/blank, not just the one unknown participant. A hard refresh that
lands after the 10-min TTL re-fetches the full profile list (now including the
new joiner) → names return — until the next new joiner repeats the cycle.

`cache_profileMap` is only ever written by `getProfileMap` itself (no other
writer poisons the shape), and `mapProfileData` is assigned in exactly one place
— so the snapshot-vs-live mismatch is the whole story.

## Fix (operator chose "Fix 1 only")
Add optional chaining to **all 10** unguarded `mapProfileData[...]['...']`
template accesses: `mapProfileData[id]?.['name']`. Now a missing profile renders
an **empty name** instead of throwing, so one unknown participant can no longer
crash the entire board's change detection.

**Scope of Fix 1:** this is the *crash seatbelt only*. It stops the
whole-board blank-out, but the genuinely-unknown participant still shows a blank
name until a refresh rebuilds the snapshot. The real cure (Fix 2 — port
`ensureProfileLoaded()` lazy backfill, and/or make `mapProfileData` a live
`profile_data` subscription) was **deferred** by operator decision.

## Files touched
- `src/app/queue system/dynamic-queue-manager/dynamic-queue-manager.component.html`
  — 10 bindings, `]['` → `]?.['` (lines 89, 93, 115, 116, 117, 194, 449, 455,
  472, 585).

Build: `ng build --configuration development` succeeds (pre-existing CSS/unused-
import warnings only, no errors). Template-only change; `.ts` untouched.

## Revert guide (per-screen)
Single file, single screen (Dynamic Queue Manager board). To revert, in
`dynamic-queue-manager.component.html` replace every `]?.['` back to `][` on the
`mapProfileData` bindings (10 occurrences):
- `mapProfileData[token.profile_id]?.['name']`   → `['name']`   (×3: L89, L115, L449)
- `mapProfileData[token.profile_id]?.['email']`  → `['email']`  (×2: L93, L116)
- `mapProfileData[token.profile_id]?.['number']` → `['number']` (L117)
- `mapProfileData[list['senderprofileid']]?.['name']` → `['name']` (L194)
- `mapProfileData[specialist]?.['name']`         → `['name']`   (L455)
- `mapProfileData[participant]?.['name']`        → `['name']`   (L472)
- `mapProfileData[list['movedby']]?.['name']`    → `['name']`   (L585)

Or simply: `git revert 29097e0`.

## ⚠️ Correction (same day) — Fix 1 landed on the DEAD file
The LIVE route `/dynamicqueuemanager` loads **`dynamic-queue-manager-clone`**
(`app.routes.ts:182`), NOT this `dynamic-queue-manager` (its route is commented
out at `:181`; only the spec references the class → dead). So commit `29097e0`
guarded a **dead file**. The live **clone** already carried `?.` guards on nearly
all its `mapProfileData` bindings; the only unguarded one (chat sender ~L345) was
fixed on the clone in commit `7c876f5`. Net: the live screen is protected. The
root-cause analysis above still holds for both files (same one-shot cached-snapshot
pattern); the symptom on the *clone* manifests as a blank name for not-yet-cached
participants (no whole-board crash, since the guards prevent the throw) — so **Fix 2
(lazy backfill) is the real outstanding cure for the live screen.**

## Pending / next
- **Fix 2 (the actual cure)** still open: add `ensureProfileLoaded(profileid)`
  lazy backfill driven by the `queue_token` subscription (mirror
  `dynamic-studio-v2.component.ts:872`), and/or convert `mapProfileData` to a
  live `profile_data` subscription so new participants appear without a refresh.
- The same unguarded pattern likely exists in `dynamic-queue-manager-clone` and
  other boards that read `mapProfileData[...]['...']` — worth a sweep.
