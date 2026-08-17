# 2026-08-14 — Auto-PiP on tab switch: root cause pinned (browser-side gate)

**Context:** Operator test in live room `PWZ80SL1BF6ijSfXmDem` (2 participants: Chrome +
Safari), Chrome 150, localhost:4200. Manual pop-out (Video menu) works; tab-change auto-PiP
does not. Diagnosed live via the `[pip]` console instrumentation from 2026-07-18 plus an
in-tab state dump at the exact hide moment.

## Evidence (all captured live)
- Chrome 150 capability probe: `enterpictureinpicture` mediaSession action supported
  (≥134 ✓), `requestPictureInPicture` ✓, Document-PiP ✓. NOTE: `autoPictureInPicture` is
  NOT in `HTMLVideoElement.prototype` even in Chrome 150 — the HTML attribute path is dead;
  the mediaSession action is the only auto path.
- State at `document.hidden === true` with a remote present: pip video found, `paused:
  false`, `readyState: 4`, srcObject = `remote video` track, `autoPictureInPicture: true`,
  `disablePictureInPicture: false`, `pictureInPictureEnabled: true`, mediaSession
  `playbackState: 'playing'` + metadata set, `armed A` logged.
- Result: `[pip] tab hidden` snapshot logged, **no `[pip] mediaSession … FIRED` ever
  follows** (reproduced twice). So the page fulfilled every controllable prerequisite and
  **Chrome declined to fire the action**.
- Not the solo case: source was attached & playing (solo-skip is a different, by-design
  path: `enterPipAuto` is remote-only).

## Root cause
Chrome's automatic-PiP for video conferencing is gated by a **user-level permission /
site setting ("Automatic picture-in-picture") plus Chrome-internal eligibility (site
engagement)** that JavaScript cannot force or reliably query (the
`automatic-picture-in-picture` permission name is not queryable in Chrome 150).
localhost:4200 has effectively zero site engagement and the setting was never granted, so
Chrome silently ignores the registered handler. No code change can make Chrome fire it.

## What to try / next
1. In the meeting tab: address-bar PiP icon → enable "Automatically enter
   picture-in-picture" for the site; or `chrome://settings/content/automaticPictureInPicture`
   → allow localhost:4200. Retest A1 (tab switch with a remote).
2. If granted+retest works → ship as-is; the permission will behave better on the real
   deployed origin (engagement accrues) than on localhost.
3. If Chrome still declines → fall back to the 2026-07-18 open-thread options: manual-only
   [recommended], one-time "pop out" nudge toast, or Document-PiP (also gesture-gated, so
   it cannot auto-open either — it only improves the manual experience).

## Addendum (same session) — Safari manual-PiP bug FIXED + Open Journey Plan button

- **Safari manual pop-out failed** with "The request is not triggered by a user
  activation": `togglePip` awaited `el.play()` (+ up to 1s loadeddata wait) BEFORE
  `requestPictureInPicture()`, and Safari's transient activation does not survive awaits
  (Chrome is lenient). FIX: `play()` fire-and-forget; when `readyState >= 2` (the normal
  case — the pip video plays continuously) the request now runs in the same task as the
  click. Operator to retest pop-out in Safari.
- **Auto-PiP on tab switch, per browser** (operator wants both):
  Chrome = code-complete, gated on the user-level "Automatic picture-in-picture" site
  permission (see root cause above). Safari = NO web API can enter PiP without a gesture;
  the only auto path is the `autoPictureInPicture` WebKit attribute (already set in
  `setupAutoPip`), which Safari may honor for capture pages — retest after the manual fix,
  cannot be forced programmatically.
- **New feature: "Open Journey Plan"** bottom-center toolbar button in join-livekit-call.
  Twin of appointment-studio's button (same .journeyplanbtn style, same target
  `/journeysupport/<bookedby.id>`, new tab). Gated: `appointments/<roomId>` doc has
  `journeycoach` or `onboarding` true (non-appointment rooms: no doc → hidden), AND the
  viewer is a HOST (`roomDetail.hosts.includes(loggedinProfileid)` — hosts strictly, not
  the developer/tester roles the End-Meeting button also accepts; operator directive).
  Absolutely centered in `.zoom-toolbar`; compact variant ≤760px. VERIFIED live: button
  rendered in room PWZ80SL1BF6ijSfXmDem and opened Journey Support for the booked client.

## Also observed (minor, code-side)
- `setupAutoPip` re-ran during the call (eligibility snapshot + "armed A" logged twice) —
  harmless (handler re-registration is idempotent) but noisy.
- Recurrent benign warning: `[pip] play failed: AbortError … interrupted by a new load
  request` whenever the source re-attaches.
- Test-plan matrix (M1–M5 manual, A1–A7 auto, E1–E3 environment) delivered in-session;
  A1/A2 executed live: A1 = Chrome declined (this journal), A2 untestable until A1 passes.
