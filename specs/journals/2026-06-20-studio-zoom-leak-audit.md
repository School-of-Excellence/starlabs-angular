# 2026-06-20 — Leak audit & fix: dynamic-studio-v2, participant studio, zoom-clientview

## Why this session
Operator reported the three live-studio screens (`/dynamicstudio`, `/participantstudio`,
`/openmeeting/:id/:collectiontype`) crashing "in the background, not logically" — i.e. resource
leaks accumulating across navigations, not a functional bug. Asked for e2e + evidence of no leaks.

## Method
Static teardown audit (the authoritative proof for lifecycle leaks): for each component, enumerate
every acquired resource (RxJS subscriptions, `setInterval`, DOM/global event listeners, Firestore
realtime `collectionData`/`onSnapshot` streams, SDK instances) and verify a matching release in
`ngOnDestroy`. Full browser heap-profiling e2e is impractical here — all three screens are
auth-gated and need live queue tokens / a live Zoom meeting / paired participants to reach.

## Findings (all confirmed) + fixes

1. **dynamic-studio-v2 — `ngOnDestroy` teardown order (🔴 critical).**
   `subscriptionHandle.complete()` ran BEFORE `.next()`. RxJS `takeUntil` only completes its output
   on a notifier **`next`** (notifier `complete` → `noop` in the operator source). After `complete()`
   the subject is closed, so `.next()` is a no-op → **none** of the ~18 `takeUntil(subscriptionHandle)`
   realtime Firestore listeners unsubscribed. Each studio mount/unmount leaked ~18 live snapshots.
   Also `resetSubscription()` (the only teardown for `tripleATCSubscription` at `:3593`, which has
   **no** `takeUntil`) was never called on destroy.
   **Fix:** emit `next()` then `complete()` on both `subscriptionHandle` and `otherStudioInvitationHandle`,
   and call `resetSubscription()` from `ngOnDestroy`.

2. **zoom-clientview — un-removable global `keydown` listener (🔴 critical).**
   `addEventListener('keydown', this.handleKeyDown.bind(this))` and the matching `removeEventListener`
   each created a FRESH bound function, so remove never matched add. The `window` keydown listener was
   never removed → it retained the dead component **and its Zoom Web SDK instance** on every visit to
   `/openmeeting`. **Fix:** single stable `boundKeyDown` arrow field used at both add and remove sites.
   (Secondary, NOT changed: no `ZoomMtg.leave()` on destroy — left as-is to avoid double-leave with the
   leaveUrl flow; with the keydown leak gone the component is now GC-eligible.)

3. **participant studio (`list-openvidu-room`) — leaked 1s interval (🟠 moderate).**
   `timerSub = interval(1000).subscribe(...)` (`:226`) is not piped through `takeUntil(this.subscription)`
   and `ngOnDestroy` only completed the subject — so leaving mid-countdown left a 1s timer calling
   `checkLiveAppointment()` (which re-runs `loadAppointments()`) on a destroyed component forever.
   **Fix:** `timerSub?.unsubscribe()` + null in `ngOnDestroy`.

## Evidence
- `tsc -p tsconfig.app.json --noEmit` → exit 0, 0 errors (whole-app type-check post-fix).
- Post-fix acquire→release ledger: every subscription / timer / listener in all three components now
  has a matching teardown on destroy (table in session summary).

## Follow-up: 3 Zoom complaints resolved against legacy v1 as the spec
Operator directive: "no new inventions — the legacy `dynamic-studio` (v1) component gives the answers."
So v1 is the behavioural spec; v2 regressions were aligned back to it.

- **#1 "link generation only for 1 person / not for collaborators (paired specialists)".**
  Terminology (operator): *collaborator* = paired specialists (studio `participants` / live-assignment
  `pairing`); *invite more* = `bonusactivityparticipant` (the "Visit Other Studio" → `join_url` path).
  The link data is on the SHARED live-assignment doc, keyed by `studioid` (`:1460`), identical in v1 and
  v2 — so it was never limited to one person in logic. The real regression: **v2 had the visible Zoom
  link + copy row COMMENTED OUT** (html `:614-624`); v1 shows the link to every paired specialist
  (`dynamic-studio.html:235`). **Fix:** un-commented the `zoom-link-row` (CSS classes already present).
- **#2 "shows error but the link actually generates".** v1's `regenerateZoomLink` is fire-and-forget,
  swallows errors, shows NO toast (`dynamic-studio.ts:1640-1648`). v2 had rewritten it with `cloudErr`
  detection + 8s polling + error snackbars that fired on a CORS/`status 0` response even though the
  function regenerates the link server-side. **Fix:** reverted to v1's silent behaviour (kept
  `responseType:'text'` only to avoid a spurious parse error; no user-facing toast).
- **#3 "Zoom closing automatically".** NOT a studio difference — v1's `navigateMeeting` opens the SAME
  `/openmeeting/:id/queue` view (`dynamic-studio.ts:2284`) as v2. The instability lives in the shared
  `zoom-clientview`; addressed by this session's leak fixes (esp. the `keydown` listener that retained
  the component + Zoom SDK on every visit). Needs a concrete repro (host vs participant; tab-crash vs
  meeting-drop vs redirect) to confirm fully.

Verification: `tsc -p tsconfig.app.json --noEmit` → exit 0, 0 errors after all edits.

## Runtime verification (2026-06-20, local ng serve, operator's browser)
Reproduced all three live in a real 3-specialist paired studio (participant "Vignesh S"):
- **#1 ✅** Zoom Session step shows the full link + copy button (the restored `zoom-link-row`).
- **#2 ✅** "Generate New Link" → loading dialog → closes with NO error toast; link refreshed
  (meeting number 91489881337 → 95986118083). Old code would have shown a false error here.
- **#3 ✅ root-caused** Starting the meeting on the STALE link produced the Zoom SDK dialog
  "Joining Meeting Timeout or Browser restriction — The signature has expired"; on OK/timeout the SDK
  redirects via `leaveUrl` back to `/dynamicstudio` = "closing automatically". `crossOriginIsolated:true`
  (isolation ruled out). After "Generate New Link" (fresh signature) the SAME meeting joined normally to
  the Zoom preview screen. Root cause: SDK signatures are minted server-side at link-creation and STORED
  in `zoomdata.hostsignature`/`participantsignature` (read at `zoom-clientview:783-785`); being short-lived
  JWTs they expire before the call.

**Operator decision on #3:** rely on the existing **Generate New Link** button — no server-side
signature-on-join change and no client auto-regenerate. The button is already visible whenever a link
exists, so users regenerate when a meeting fails. (Permanent server-side option, deferred: mint the SDK
signature fresh on join in the `starlabs-cloud-function` repo instead of persisting it.)

## Pending / not done
- No runtime heap-trace captured (auth + live-meeting gating). If wanted, drive `/openmeeting` repeatedly
  against `starlabs-cicd` with Chrome DevTools `performance.memory` / listener-count snapshots before vs
  after — expect flat listener count post-fix vs monotonic growth pre-fix.
- `dynamic-studio-v2.component.ts` also carries a pre-existing, unrelated uncommitted WIP hunk
  (transfer-chain form loading, ~`:361-410`) authored before this session — NOT committed/bundled here.
- Optional hardening: call `ZoomMtg.leave()`/end on `zoom-clientview` destroy when still in-meeting.
