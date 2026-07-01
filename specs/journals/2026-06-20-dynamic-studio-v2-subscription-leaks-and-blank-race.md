# 2026-06-20 — Dynamic Studio v2: subscription leaks + "blank then loads" race

## Symptoms
- Collaborators auto-entering a studio: for some it opens straight into the
  studio, for others it shows **blank and fills in a moment later**.
- Suspected memory/leak growth over a session.

## Root cause
All inside the outer `queue studio pairing` subscription callback
(`getStudio()`, `dynamic-studio-v2.component.ts`), which re-fires on every
studio check-in/out. Three nested subscriptions had **dead guards** — their
handles were never stored, so the guard condition never tripped and a brand-new
listener was created on every emission:

1. **`live assignment`** (~L1459) — `if(this.liveassignmentSubscription == null)`
   but the result was discarded. Every pairing emission added another
   live-assignment listener, and **each one independently re-ran the auto-enter
   block** (onStudioSelect / ensureTokenForAssignment / loadAssignmentWidgetData).
   This is what amplified the blank-then-loads race — the studio was being
   (re)initialised by N duplicate listeners at once.
2. **`studioinvitation` (stagegrouping)** (~L1427) — guard commented out; new
   listener every emission, each able to re-open the accept-invitation dialog.
3. **`studioinvitation` (specialist pairing)** (~L1531) — handle never stored, so
   the `if(!handle)` guard always passed → new listener every emission.

The blank itself: the studio panel renders on `liveAssignment != null`
(html L223), but the auto-enter inline block set `liveAssignment` and then
fired `ensureTokenForAssignment()` / `loadAssignmentWidgetData()`
**un-awaited** — so the first render had no token/widgets and flashed blank.

## Fix
- **Leaks:** store every handle.
  - `live assignment`: assign to `this.liveassignmentSubscription` so the
    existing `== null` guard subscribes exactly once.
  - stagegrouping + specialist-pairing invitations: `?.unsubscribe()` the
    previous handle, then re-subscribe and store the new handle (params like
    `studioID`/`involvedStudio` can change between emissions, so rebuild rather
    than once-guard; the specialist-pairing one also nulls the handle in the
    pre-existing unsubscribe block so it actually rebuilds).
- **Blank race:** made the live-assignment callback `async` and `await
  this.ensureTokenForAssignment()` BEFORE `loadAssignmentWidgetData()`, so the
  first render already has product/variation/forms data. Combined with the leak
  fix (no more duplicate auto-enter runs), the blank window shrinks sharply.

Verified with `tsc --noEmit -p tsconfig.app.json` — clean.

## Pending / not done
- Not browser-verified (app is Firebase-auth gated). Needs a live check:
  collaborator auto-enter should open populated (no blank flash), and a long
  session with repeated check-in/out should not accumulate listeners.
- A hard "studio data ready" template gate (spinner until token present) was
  considered but NOT added — risk of hanging on legitimately token-less states.
  Revisit if a blank flash still shows after these fixes.
- Zoom Safari gallery-view crash is still open (separate thread; SDK upgrade
  deferred, awaiting `crossOriginIsolated` console value).
