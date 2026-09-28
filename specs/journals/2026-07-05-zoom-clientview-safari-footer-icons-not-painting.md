# Zoom ClientView — Safari control-bar icons not painting (2026-07-05, session 2)

Supersedes the "displaced controls" theory in
[[2026-07-05-zoom-clientview-safari-footer-grey-strip]]. Same symptom, deeper cause.

## Symptom
Safari only: the bottom Zoom control bar (Mute / Video / Participants / Chat / Share / Leave)
shows as an indistinct **black strip** — the buttons are present and **clickable but invisible**.
Chrome renders the bar fine.

## What was ruled OUT (measured live, not guessed)
Added a temporary on-screen geometry readout + red debug paint to the component and read it from
Safari screenshots (the view is Firebase-auth + live-Zoom gated, so no devtools/Chromium repro).
Findings at full window:
- `#zmmtg-root [0,0,1512,860] pos=fixed` — fills the viewport correctly.
- `.footer [0,808,1512,52] pos=fixed z=2147482000` — the bar is at the true viewport bottom.
- `.footer__inner op=1 kids=5`, `.footer-button-base__button [0,810,90,48]`,
  `elementFromPoint(mid) = BUTTON.footer-button-base__button` — the buttons EXIST, are the topmost
  element (nothing covering them), and are on-screen.

So it is **NOT** a position, z-order, opacity, or auto-hide problem. The bar is in the right place
and on top; Safari just won't **paint** its icon subtree.

## Root cause
Safari does not paint the SDK 6.1.0 control-bar's icons at the fixed viewport bottom until a
**repaint/reflow is forced**. Confirmed directly: the icons appeared the instant the viewport was
reflowed — opening Web Inspector, resizing the window, or the debug loop calling
`getBoundingClientRect()` every 500ms (the red debug bar clearly showed mic/video/participants/chat/
share/leave once the forced-layout loop was running). Static CSS (visibility/opacity, `translateZ(0)`
GPU layer, even a `transform` keyframe animation) does NOT trigger a content repaint, so none fixed it.

## Regression chain (why it used to work)
- `1a7269f` added the Safari `@supports(-webkit-hyphens:none)` footer fix (`.footer.main-footer`,
  which still matches in 6.1.0 — the class is applied in JS: `className: a()("footer main-footer",…)`).
- `a31bdbc` "Upgrade Zoom Meeting SDK to 6.1.0" changed the client-view internals; the paint bug is a
  6.1.0 behaviour.
- `b0e04b2` "drop footer @supports hack" REMOVED the footer block entirely → controls fully invisible.

## Fix (Safari-only; Chrome untouched)
1. **`src/styles.css`** — restored + retargeted the footer block (`@supports (-webkit-hyphens:none)`):
   pin `.footer` `position:fixed; bottom:0`, `z-index:2147482000`, `visibility:visible`, `opacity:1`,
   `pointer-events:auto`, and force `visibility`/`opacity` on children + `svg`/`.footer-button-base__img-layer`.
   (Positions + reveals the bar. No `transform`/GPU-layer tricks — they didn't help.)
2. **`zoom-clientview.component.ts`** — `startSafariFooterRepaint()` called right after
   `isJoined = true` in the `ZoomMtg.join` success callback (Safari-UA-gated, runs outside Angular).
   A `requestAnimationFrame` loop toggles an imperceptible bg-alpha on `.footer`
   (`rgba(0,0,0,.698)`↔`.699`) and forces a synchronous reflow each frame → Safari keeps the bar and
   its icons painted. Stopped via `stopSafariFooterRepaint()` in `ngOnDestroy` (rAF also auto-pauses
   when the tab is backgrounded). This is the part that actually makes the icons render.

The existing `html,body:has(#zmmtg-root){background:#000}` + `@supports{#zmmtg-root{bottom:0;
height:100dvh}}` from `b0e04b2` are left as-is.

## SDK 6.2.0 upgrade attempt — BLOCKED (build-incompatible)

Since the paint bug arrived with the 3.13.2→6.1.0 upgrade (`a31bdbc`), tried bumping to the
latest stable, **6.2.0** (`npm dist-tags`: `latest: 6.2.0`). It does NOT build in this project:
`@zoom/meetingsdk@6.2.0`'s `dist/zoomus-websdk.umd.min.js` does `require("react")` /
`require("redux")` / `require("redux-thunk")`, and installing 6.2.0 **removed 13 packages**
(react@18.2.0, redux@4.2.1, redux-thunk@2.4.2 and friends that 6.1.0 pulled in transitively). esbuild
then can't resolve them → `✘ ERROR: Could not resolve "react"/"redux"/"redux-thunk"` → the dev-server
build FAILS (this crashed `ng serve` and made the live Safari call show Zoom's generic "Unknown
Error"). 6.2.0 expects a React host app; it is not drop-in for this Angular project.

**Rolled back** to 6.1.0: `git checkout package.json package-lock.json && npm install
--legacy-peer-deps` (restores react/redux/redux-thunk), then restarted `ng serve` (it had crashed on
the failed build). Build green again on 6.1.0.

**Untried path (needs approval — changes declared deps):** add `react`/`redux`/`redux-thunk` as
EXPLICIT `package.json` dependencies so they survive a 6.2.0 install and esbuild can bundle them, then
retest whether 6.2.0 fixes the Safari paint. Uncertain it fixes the paint; pulls React into an Angular
bundle.

## Outcome (2026-07-05 session 2)
UNRESOLVED. The Safari control-bar paint bug is a Zoom Web SDK 6.1.0 rendering issue; no CSS/JS
workaround forced the repaint, and the 6.2.0 upgrade is build-incompatible. Environment restored to
working 6.1.0. `src/styles.css` still carries the `.footer` `@supports` positioning block (harmless,
Safari-only; positions/forces-visible the real bar but does NOT paint its icons alone). Known manual
workaround for users: resize the Safari window once (or open/close devtools) and the controls appear.

## Session 3 (2026-07-06) — operator: strip is a REGRESSION of the last 2 days; don't touch SDK

Operator clarified: the Zoom SDK was upgraded long ago and was FINE (no strip) — the strip only
appeared in the LAST 2 DAYS. So the SDK is NOT the trigger (rolled 6.2.0 back to 6.1.0, kept there).
Diffed the rendering files from before the window (base `40aa80a^` = `d05e644`, 2026-07-03) to HEAD:
ALL the zoom-meeting CSS in `styles.css` was ADDED in this window — `html,body:has(#zmmtg-root)
{background:#000}` (1a7269f) and `@supports{#zmmtg-root{bottom:0;height:100dvh}}` (b0e04b2). Removed
all of it → the black strip turned WHITE (structural gap confirmed), controls STILL hidden.

### Decisive DOM diagnostics (painted elements from the component, read via screenshots)
- Painted `#zmmtg-root .footer` bright BLUE → the bottom strip stayed BLACK. So the visible strip is
  NOT the `.footer` control bar, and `.footer` is not rendering visibly anywhere.
- Hit-tested the visible bottom strip (`elementFromPoint` at several y) and painted whatever's there
  → NOTHING turned blue. So the strip is the PAGE/#zmmtg-root background GAP — there is no control
  element at the visible strip at all.

Conclusion: (a) the strip = a page-background gap (Safari sizes the gallery short); recolouring it is
trivial, but CLOSING it requires resizing #zmmtg-root, which displaces the control bar (that was the
original "black strip over controls"). (b) The native control bar does not render visibly in Safari
(SDK 6.1.0). No CSS/JS forces it; the ONLY thing that paints it is a real window resize (not
scriptable). This is a Zoom-Web-SDK-6.1.0 + Safari rendering bug, unfixable from the app.

### FINAL state shipped this session
`src/styles.css`: ONLY the colour-blend paint remains —
`html:has(#zmmtg-root),body:has(#zmmtg-root){background:#000}` (gap reads black, not white). ALL other
zoom CSS (the `#zmmtg-root` height override + every `.footer` @supports hack) and ALL component JS
(repaint loops, resize nudges) were REVERTED. Component TS + HTML are back at HEAD.

### Options for actually giving Safari users visible controls (operator decision pending)
1. Custom control bar (mute/unmute, video on/off, leave) on the black strip, wired to `ZoomMtg` API
   (`ZoomMtg.mute` / `muteVideo` / `leaveMeeting`) — the only reliable way to VISIBLE Safari controls.
2. Use Chrome for the host/specialist side (renders correctly there).
3. Accept + document the window-resize workaround.
4. Future SDK: 6.2.0 needs a React host (build-incompatible here); a later 6.x + explicit react deps
   might work — unverified.

### Screen — Zoom ClientView · Safari bottom strip · 2026-07-06
- **File:** `src/styles.css` — single rule `html:has(#zmmtg-root),body:has(#zmmtg-root){background:#000}`.
- **Revert:** delete that one rule to restore the white gap. (Everything else already reverted to HEAD.)
- **Risk:** none — colour only, Safari gap only; Chrome unaffected.

## RESOLUTION (2026-07-06) — custom Safari control bar

Bisect proved it is NOT a code regression (3-days-ago code still hid the controls) → inherent Zoom
SDK 6.1.0 + Safari paint bug. No CSS/JS makes the SDK bar paint. So instead of fighting it, we render
our OWN control bar on Safari (plain Angular DOM paints reliably) and drive Zoom's real actions.

**Implementation (all in `zoom-clientview` component + `styles.css`):**
- `styles.css`: kept ONLY `html:has(#zmmtg-root),body:has(#zmmtg-root){background:#000}` (blend the gap
  to black). Removed the `#zmmtg-root` height override (it displaced the bar and never helped).
- Component: `isSafariBrowser` (reliable UA check — the old negative-lookahead regex mis-fired),
  `initSafariControls()` called after join (reads mute/video state via `ZoomMtg.getCurrentUser` +
  `onUserAudioStatusChange`/`onUserVideoStatusChange` listeners), and a `.sx-zoom-controls` bar shown
  via `*ngIf="isJoined && isSafariBrowser"`.
- Actions: Mute (`ZoomMtg.mute`), Leave (`leaveMeeting`), End-all host (`endMeeting`), Record host
  (`record`), Mute-All host (`muteAll`), Raise/Lower hand (`raiseHand`/`lowerHand`). Controls with NO
  Client-View API — **Camera on/off**, Participants panel, Chat panel, Share — are driven by
  `clickNativeControl(regex)`, which finds the (invisible-but-present) native `.footer-button-base__button`
  by label text and `.click()`s it, so Zoom's own handler runs. Camera reads real state via `bVideoOn`
  and re-syncs after each toggle (an optimistic flip read in reverse — fixed).
- **Positioning gotcha:** `bottom:0` is OFF-SCREEN in this Safari (the viewport bottom sits below the
  visible edge; innerHeight/visualViewport both over-report so it's not measurable from JS). The bar is
  a centered pill at `bottom:88px` (same level as the reliably-visible host Capture button).

**Known limits (told operator):** the native caret DROP-DOWNS (mic/camera device pickers, the "More …"
menu, per-button sub-menus) are the same native popups Safari won't paint — replicating them needs
fully-custom UI (device picker via `navigator.mediaDevices`, reactions picker, etc.) or a migration to
Zoom Component View — deferred as a separate effort.

**⚠️ Side effect from the bisect:** temporarily reverting `coi-serviceworker.js` (then restoring it)
left Safari's service worker flaky → intermittent blank meeting page. Recovery: Safari Develop → Empty
Caches, quit+reopen Safari, fresh meeting. Watch for this if the SW is ever swapped again.

## Device menus (mic/camera) — added 2026-07-06

Operator wanted the mic/camera device dropdowns too. Key discovery: **Zoom's own option
POPUP menus DO paint in Safari** — only the bottom control *bar* had the paint bug. But the native
menu opens *dislocated* from our custom bar. So each caret (▾ next to Mute/Video):
- clicks the native **"More audio controls" / "More video controls"** button (label match — there is
  NO `.footer-button-base__floating-toggle` in this build) to open Zoom's menu,
- reads the items from the kind's OWN subtree (`.audio-option-menu` / `.video-option-menu` — searching
  generic `.dropdown-menu`/`[role=menu]` cross-matched the wrong menu, so it's strict per-kind),
- hides the dislocated native menu (`visibility:hidden`) and renders a copy (`.sx-zc-menu`) anchored
  above the clicked caret (`menuLeft`/`menuBottom` from the caret's rect),
- clicking a copied row un-hides + `.click()`s the real native item (so the device actually switches),
- closes on outside click (`@HostListener('document:click')`; the pill + menu `stopPropagation`).
VERIFIED: both carets show the right devices (mic/speaker vs camera+video options) and selecting works.
Device state (mute/video) mirrors the native button labels on a 500ms poll (see `syncNativeState`) —
`getCurrentUser`/`bVideoOn` was unreliable and made the toggle UI reverse/flicker.

### Screen — Zoom ClientView · Safari custom control bar · VERIFIED 2026-07-06
- **Files:** `zoom-clientview.component.{ts,html,css}` (the `.sx-zoom-controls` bar + `initSafariControls`
  / `toggleCustomMute` / `toggleVideo` / `clickNativeControl` / `shareScreen` / `toggleParticipants` /
  `toggleChat` / `toggleHand` / `toggleRecord` / `toggleMuteAll` / `leaveCall` / `endForAll` and the
  `isSafariBrowser`/`customMuted`/`customVideoOn`/… fields); `src/styles.css` (black-gap paint).
- **Revert (per-screen):** delete the `.sx-zoom-controls` block from the template, its CSS, and the
  Safari-control methods/fields + the `initSafariControls()` call in join-success; delete the
  `html,body{background:#000}` rule. Chrome is untouched throughout (`isSafariBrowser` gate).
- **Risk:** low — entirely Safari-gated; Chrome uses the native bar. If a label-based `clickNativeControl`
  match ever breaks (SDK update / non-English), that specific button no-ops (others unaffected).

## Verification status
Mechanism CONFIRMED live: during debugging, the icons painted whenever a continuous forced-reflow was
active (Inspector open / debug loop) and were invisible otherwise. The final clean build (rAF loop, no
debug) compiled and is served, but a last visual confirm on a live Safari call is PENDING — the user
navigated Safari away from the meeting before the clean-build screenshot. Re-verify: join an
`/openmeeting/.../queue` call in Safari as host → the real Zoom control bar is visible at the bottom,
icons and all; regression check (per [[reference_zoom-clientview-template-load-bearing]]) that
video-off name labels are not clipped.

### Screen — Zoom ClientView · Safari control bar · PENDING SAFARI VERIFY 2026-07-05
- **Files:** (1) `src/styles.css` — `@supports(-webkit-hyphens:none)` `.footer` block (position/reveal).
  (2) `zoom-clientview.component.ts` — `safariFooterRepaintOn` field, `startSafariFooterRepaint()` /
  `stopSafariFooterRepaint()`, the call after `isJoined = true`, and the `stopSafariFooterRepaint()`
  line in `ngOnDestroy`.
- **Revert (per-screen):** (2) delete the two methods + the field + the call in join-success + the
  `stopSafariFooterRepaint()` in `ngOnDestroy`. (1) delete the `.footer` `@supports` block. Leave the
  `html,body{background:#000}` and `#zmmtg-root{100dvh}` blocks (separate, from `b0e04b2`).
- **Risk:** low. Both parts are Safari-UA / `@supports`-gated, so Chrome is untouched. The rAF loop is
  a per-frame layout read + imperceptible style toggle on one 52px element; if it ever costs too much
  on low-end Safari, throttle it (e.g. every 2nd–3rd frame) rather than removing it.
