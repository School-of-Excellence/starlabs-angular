# Zoom ClientView — "Prescribe ATC" in-call bubble → Dynamic Studio deep-link (2026-07-03)

**Branch:** `dynamic-studio-update`
**Goal:** while a specialist (host) is inside the Zoom Meeting SDK client view, show a floating "Prescribe ATC" bubble. Clicking it takes them to the **Prescribe ATC** step of Dynamic Studio (`dynamic-studio-v2`).
**Scope:** UI + client-side router deep-link only. **No Firestore reads/writes, no ATC data touched, no schema changes.**

## What changed

Two surfaces, one new query-param contract (`?step=<stepId>`) between them.

1. **Zoom ClientView** (`src/app/queue system/zoom-clientview/`) — a host-only pill button (`add_circle` icon + "Prescribe ATC" label), shown under the same `*ngIf="profileHost && isJoined"` gate as the existing `capture` button, stacked just above it (bottom-right, left of Zoom's End control). Click calls a new `goToPrescribeAtc()` which does `router.navigate(['/dynamicstudio'], { queryParams: { step: 'prescribe-atc' } })`.

2. **Dynamic Studio v2** (`src/app/queue system/dynamic-studio-v2/`) — reads the new `step` query param and jumps the stepper to it once the step exists.

## Why a deep-link param (not setting `activeStepId` directly)

The stepper (`visibleSteps` getter) is built **asynchronously** — it only has steps once `liveAssignment` loads, and its re-sync block snaps `activeStepId` back to `steps[0]` whenever the step list signature changes and the user hasn't navigated. So setting `activeStepId` in the constructor would be overwritten.

Instead the constructor stashes the request in `pendingDeepLinkStep`, and the `visibleSteps` re-sync block applies it **once** the requested step id actually appears in the list (sets `activeStepId`, marks `userNavigated = true`, then clears the pending value so subsequent step-list changes fall back to normal rules). Placing it inside the existing signature block means the existing `if (activeStepId === 'prescribe-atc') checkAiAtcAvailability()` line (a few lines down) fires naturally on arrival — no duplicate wiring.

**Note:** `prescribe-atc` is only a visible step when the stage's `studiowidgets` include `addunvalidatedatc` / `addvalidatedatc` / `assignprocedure`. If the specialist's current live assignment stage has none of those, the step won't exist and the deep-link is a no-op (stepper stays on step 0) — expected.

**UX note (superseded — see cross-tab section below):** the first cut navigated same-tab (matching `leaveUrl → /dynamicstudio`), which tore down the Zoom call. Now it never leaves the Zoom route: it reuses an already-open studio tab or opens a new one.

## Cross-tab hand-off (never leave the Zoom call)

Requirement: clicking the bubble must **not** navigate the Zoom route. If Dynamic Studio is already open, jump *that* tab to the step; otherwise open a new tab.

Mechanism: a same-origin `BroadcastChannel('starlabs-dynamic-studio')`.
- **Zoom `goToPrescribeAtc()`** posts `{type:'goto-step', step:'prescribe-atc'}`, listens ~350ms for a `{type:'studio-here'}` ack. Ack received → an open studio tab is handling it, do nothing else. No ack → `window.open('/dynamicstudio?step=prescribe-atc', '_blank')`. The current Zoom route is never touched. (`Router` injection removed — no longer used.)
- **Studio `wireStudioChannel()`** (called in `ngOnInit`) listens; on a `goto-step` it acks, calls `jumpToStep(step)` (→ `setActiveStep` if the step exists, else stash as `pendingDeepLinkStep`), and `window.focus()`. Channel closed in `ngOnDestroy`.

**Caveat:** programmatic `window.focus()` of a background tab is blocked by most browsers, so the studio tab may not auto-surface — but it *does* switch to the step, so it's correct when the user brings it forward. Both the ack path and the new-tab path deep-link through the same `?step=` / `pendingDeepLinkStep` machinery.

---

## Per-screen revert guide

### Screen — Zoom ClientView · Prescribe ATC bubble · DONE 2026-07-03
Files under `src/app/queue system/zoom-clientview/`.

**TS** (`zoom-clientview.component.ts`):
| Change | Where | Revert |
|---|---|---|
| Router import | `import { ActivatedRoute, Router } from '@angular/router';` | drop `, Router` |
| Router inject | `private router: Router,` after `private route: ActivatedRoute,` in constructor | delete that line |
| Nav method | `goToPrescribeAtc()` inserted just before `handleKeyDown(...)` | delete that method |

**HTML** (`zoom-clientview.component.html`): the `<!-- Host-only quick jump ... -->` `<button class="prescribe-bubble" ...>` block inserted right after the `capture` button. Revert = delete that block.

**CSS** (`zoom-clientview.component.css`): the `.prescribe-bubble` (+`:hover`, ` mat-icon`) block inserted after `.float {}`. Revert = delete that block.

### Screen — Dynamic Studio v2 · step deep-link · DONE 2026-07-03
File `src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts`.
| Change | Where | Revert |
|---|---|---|
| `pendingDeepLinkStep` field | after `activeStepId = ''` | delete field + comment |
| Read `?step=` | after `const overrideProfileId = ...` in constructor | delete that line + comment |
| Apply pending step | new `if (this.pendingDeepLinkStep ...) { ... } else if` inside the `visibleSteps` signature re-sync block (was a plain `if`) | restore the plain `if (!this.userNavigated || ...)` and delete the deep-link branch |

**Full revert of this feature:**
`git checkout <pre-branch> -- "src/app/queue system/zoom-clientview/zoom-clientview.component.ts" "src/app/queue system/zoom-clientview/zoom-clientview.component.html" "src/app/queue system/zoom-clientview/zoom-clientview.component.css" "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts"`

Build: `npx tsc --noEmit -p tsconfig.app.json` → exit 0 (clean).

### Screen — Zoom ClientView · gate in-call controls on real join · DONE 2026-07-03
Both the `capture` and `prescribe-bubble` buttons are gated by `*ngIf="profileHost && isJoined"`. `isJoined` was being set at **`ZoomMtg.init` success** (SDK ready) — so the buttons appeared before the user actually entered the call. Moved the flag to reflect true in-call state.

`zoom-clientview.component.ts`:
| Change | Where | Revert |
|---|---|---|
| Removed early set | `ZoomMtg.init` success no longer sets `isJoined = true` (replaced with a NOTE comment) | re-add `this.ngZone.run(() => { this.isJoined = true; });` at top of init success |
| Set on real join | `ZoomMtg.join` success (after "zoom successfully joined" log) now does `ngZone.run(() => this.isJoined = true)` | delete that block |
| Clear on end | `wireMeetingEndListener` `onMeetingStatus` handler: on status `3` sets `isJoined = false` before the `meetingEndStamped` early-return | remove the `ngZone.run(() => this.isJoined = false)` line and restore the combined `if (status !== 3 || this.meetingEndStamped) return;` |

No HTML/CSS change — the `*ngIf` gate was already correct; only the timing of `isJoined` moved.

### Screen — Zoom + Studio · cross-tab step hand-off · DONE 2026-07-03
`zoom-clientview.component.ts`:
| Change | Where | Revert |
|---|---|---|
| Removed `Router` | import + constructor param | (only if restoring same-tab nav) re-add `Router` |
| `goToPrescribeAtc()` | now BroadcastChannel ping + `window.open` fallback (no router) | restore the one-line `this.router.navigate([...])` version |

`dynamic-studio-v2.component.ts`:
| Change | Where | Revert |
|---|---|---|
| `studioChannel` field | after `pendingDeepLinkStep` | delete field + comment |
| `wireStudioChannel()` call | end of `ngOnInit` | delete the call |
| `wireStudioChannel()` + `jumpToStep()` methods | after `ngOnInit` | delete both methods |
| channel cleanup | `ngOnDestroy` (`studioChannel?.close()`) | delete the two lines |

### Screen — Zoom ClientView · 3 fixes (popup-block, capture latency, slider scroll) · DONE 2026-07-03
Reported: Prescribe ATC did nothing; Capture was slow to show the snackbar; the top-left capture slider scrolled.

**1. Prescribe ATC did nothing — popup blocker.** The fallback `window.open(url, '_blank')` ran inside a `setTimeout(350ms)`, i.e. outside the click gesture, so browsers blocked it. Fix (`goToPrescribeAtc`): pre-open a spare tab **synchronously** in the click (`window.open('', '_blank')`); if a studio tab acks, `spare.close()`; otherwise point the spare at the URL (`spare.location.href = url`). Revert = restore the deferred-`window.open` version.
- Tradeoff: when a studio tab IS open, the spare blank tab flashes briefly before it closes. Acceptable vs. the button silently failing.

**2. Capture slow.** `onClick` awaited `getDoc` + `updateDoc` BEFORE `showPopup()`/`captureScreenshot()`, so feedback waited on two Firestore round-trips. Fix: `onClick` is now sync — `showPopup()` + `captureScreenshot()` fire immediately; the clip timing persists in the background via `updateDoc(..., { cliptimings: arrayUnion(clipTiming) })` (added `arrayUnion` import), which also drops the read-modify-write `getDoc`. Revert = restore the `async onClick` read-modify-write body and drop the `arrayUnion` import.

**3. Slider scrollable.** `.slider-container` had `overflow-y: auto` + `max-height: calc(100vh - 140px)`. Fix (`zoom-clientview.component.css`): `overflow: visible`, `max-height` removed. Chips auto-remove after 10s (`CLIP_CHIP_TTL_MS`) so they don't pile up. Revert = restore both lines.

### Screen — Zoom ClientView · move buttons off the End control · DONE 2026-07-03
Reported: Capture + Prescribe ATC overlapped Zoom's **End** button and the **"End Meeting for All"** popup. Both were anchored bottom-right (`right: 90px`, `bottom: 12/56px`) — directly under the End button and inside the region where its upward popup opens.

Fix (`zoom-clientview.component.css`): moved both to the bottom-**left**, above the control bar — `.float` `left: 16px; bottom: 88px`, `.prescribe-bubble` `left: 16px; bottom: 132px` (removed the `right: 90px` anchors). Revert = restore `right: 90px` + `bottom: 12/56px` and drop the `left`.

**Verified with a harness** (not a live call — auth/Zoom-SDK gated). Built `src/assets/zoom-btn-harness.html` (real button CSS + a mock Zoom footer with End button and the "End Meeting for All" popup), served via `ng serve`, screenshotted old vs new at 1280×760. Old: `prescribe_vs_popup: true` (overlap reproduced). New: every overlap test (`vs_end`, `vs_popup`, `vs_footer`) `false`. Harness file deleted after verification (it would otherwise ship as an asset).

### Screen — Prescribe ATC · drop cross-tab reuse, always open a foregrounded new tab · DONE 2026-07-03
Reported: clicking Prescribe ATC showed a "flashy animation but nothing happened."

**Root cause.** Studio launches the Zoom view via `window.open(joinurl, '_blank')` (dynamic-studio-v2:1645), so the studio tab stays open in the background during the call — making the BroadcastChannel "reuse existing tab" path the common case. But that path is fatally limited: a background tab **cannot bring itself to the foreground** (`window.focus()` cross-tab is browser-blocked). So on click, the pre-opened spare blank tab flashed open then closed (the "flashy animation"), the studio tab silently switched step **in the background where the user couldn't see it**, and the user stayed on Zoom → "nothing happened."

**Fix.** Abandon reuse+focus (undefeatable browser restriction) and just open a foregrounded new tab, which the browser *does* bring forward — actually taking the user to the step. `goToPrescribeAtc()` is now one line: `window.open('/dynamicstudio?step=prescribe-atc', 'starlabsDynamicStudio')` (+ best-effort `focus()`). The stable window name means repeated clicks reuse+refocus that one tab instead of piling up. Removed all BroadcastChannel code from BOTH files: zoom (`goToPrescribeAtc` rewritten) and studio (`studioChannel` field, `wireStudioChannel()`, `jumpToStep()`, the `ngOnInit` call, and the `ngOnDestroy` close). The `?step=` deep-link (constructor read + `pendingDeepLinkStep` apply in `visibleSteps`) is UNCHANGED — it's what lands the new tab on the step.

Revert = restore the BroadcastChannel version from git (commit before this one).

Note: opening a new studio tab reloads the studio (queue/assignment re-fetch) and lands on prescribe-atc only if the auto-selected live assignment's stage actually exposes a prescribe/assign widget; otherwise the deep-link is a no-op and it stays on step 0 (expected).

### Screen — Zoom ClientView · fix recording-paused prompt never opening · DONE 2026-07-03
Reported: pausing the recording never opened the "resume recording" prompt.

**Root cause (verified against the bundled SDK, not a guess).** `wireRecordingListeners` registered `onRecordingStatusChange` and `onRecordChange`. Grepping `node_modules/@zoom/meetingsdk/dist/zoom-meeting-6.1.0.min.js`: neither string exists. The real Client-View event is **`onRecordingChange`** (the only quoted recording event in the bundle), and it carries a NUMERIC action from the SDK's own enum `{stop:0, start:1, pause:2}`. So no recording event ever fired → `recordingStatus` stayed `'unknown'` → `evaluateRecordingPrompt` (which by design only prompts on an explicit `paused`/`stopped`) never showed the dialog.

**Fix (`zoom-clientview.component.ts`, `wireRecordingListeners`):**
1. Register `onRecordingChange` (kept the two wrong names as harmless fallbacks).
2. `handleRecordingChange` now reads a numeric code first (`2→paused, 1→started, 0→stopped`, via `data`/`data.state`/`data.action`) before the existing string classifier.

Revert = restore the two-listener registration and drop the numeric branch.

**Testing note / second gate:** the prompt ALSO requires `remoteParticipantCount >= 1` (at least one OTHER attendee, via `getAttendeeslist` — that method DOES exist in the SDK). So it will still not open when the host is alone in the room — that's by design.

### Screen — Zoom ClientView · recording-paused prompt · LIVE-TESTED + payload correction · 2026-07-03
Drove a real meeting via Claude-in-Chrome (host joined `/openmeeting/…/queue`, recording on) and captured the ACTUAL `onRecordingChange` payload:
```
running: { recording: 'recording', hasLocalRecord: false }
paused : { recording: 'pause',     hasLocalRecord: false }
```
So the state lives on **`data.recording`** as a STRING — NOT `data.state`, and NOT numeric. The prior fix (numeric `data.state`) still logged `raw= (empty) → unknown`, so pause was detected as the event firing but classified as unknown → still no prompt. **Correction:** the string extractor now reads `data.recording` first (`'pause'`→paused via `includes('paus')`, `'recording'`→started, `'none'`/`'stop'`→stopped). Verified the fixed classifier against the exact captured payloads (pure-function check in-page): pause→`paused`, recording→`started`, none→`stopped`. Kept the numeric branch as a fallback for other SDK builds.

**Also verified live in the same session:** Prescribe ATC bubble → opened a new tab at `/dynamicstudio?step=prescribe-atc` and the stepper landed on the active "5 Prescribe ATC" step (Zoom call untouched); and the button-overlap fix — capture/Prescribe ATC render bottom-left while Zoom's real End button is far bottom-right (no overlap).

**Still unconfirmed visually:** the dialog actually popping requires a 2nd participant in the room (we tested host-alone). The detection→classification→gating chain is proven; the final visual pop is a follow-up when a participant is present.

### Screen — Zoom ClientView · recording prompt: remove "recording is on" escape hatch · DONE 2026-07-03
Operator: the host must actually resume recording — drop the "Recording is on — stop reminding me" button; leave only "Dismiss for 30s"; after 30s still-paused, re-show.

Changes (`zoom-clientview.component.*`):
- HTML: removed the `rec-prompt-card__btn--primary` "Recording is on…" button; only the Dismiss button remains.
- TS: deleted `confirmRecordingOn()`, the `recordingConfirmedByHost` field, its guard block in `evaluateRecordingPrompt`, and its reset in `handleRecordingChange`. With no escape hatch, the prompt now closes ONLY when a real `onRecordingChange` → `started` (resume) arrives, or transiently on Dismiss.
- Re-prompt-after-30s already existed and is unchanged: `dismissRecordingPrompt()` stamps `recordingPromptDismissedAt`; the 5s `recordingPromptTimer` poll re-shows once `Date.now() - dismissedAt >= RECORDING_PROMPT_COOLDOWN_MS` (30000) while still paused + a participant present.

Revert = restore the primary button + `confirmRecordingOn` + `recordingConfirmedByHost` from git. (`.rec-prompt-card__btn--primary` CSS left in place, now unused — harmless.)

### Screen — Prescribe ATC reuse + Resume-recording button · 2026-07-03
Two operator asks: (1) a popup button that actually resumes the Zoom recording; (2) Prescribe ATC should reuse an already-open Studio tab, not open a new one.

**(1) Resume recording button.** `ZoomMtg.record` is a **no-op stub** in SDK 6.1.0 (verified in the bundle) — no programmatic record API. BUT the Client View renders its toolbar into `#zmmtg-root` in THIS document (not an iframe), so `resumeRecordingNow()` finds Zoom's own control (`[aria-label="Resume Recording"]`, or Start/Record when stopped) and `.click()`s it — proven to resume in the earlier live session. Popup now has: primary **Resume/Start recording** + **Dismiss for 30s**.

**(2) Prescribe ATC reuse — platform limits, tested live via Claude-in-Chrome:**
- The Zoom page is `crossOriginIsolated: true` (coi service worker, scope = whole origin) and its `window.opener` is severed → the Zoom tab is in its own browsing-context group, so **`window.open(url, name)` cannot reach/reuse the Studio tab** (named reuse is dead here).
- A background tab **cannot foreground itself**: armed the Studio tab, pinged it — it ran `window.focus()` but stayed `visibilityState: "hidden"`. So there is NO way to programmatically switch the user to their existing Studio tab.
- Therefore reuse must be **BroadcastChannel** (works across groups). Re-added `wireStudioChannel()`/`jumpToStep()` on Studio (acks `studio-here`, switches step). Verified live: pinging `goto-step` got `acksReceived: 2` from the open Studio tabs.
- Zoom `goToPrescribeAtc()`: pre-opens a spare tab synchronously (dodges popup-block; the about:blank popup stays same-group so its handle is usable under COOP), broadcasts `goto-step`; on `studio-here` → closes the spare (NO duplicate) + shows a snackbar "Prescribe ATC is ready in your Dynamic Studio tab — switch to it"; on no ack within 350ms → the spare becomes a fresh Studio tab. `?step=` deep-link unchanged.

**Honest limitation:** because the browser won't let the Zoom tab foreground the Studio tab, "reuse" means the Studio tab silently switches to the step and the host is told (snackbar) to click over to it — we cannot auto-switch them. Trade-off accepted per the operator directive to not open a new tab when Studio is open.

**Auto-focus is impossible — exhausted every mechanism (live-tested):** operator pushed back wanting the existing Studio tab brought to the FRONT. Tested all three platform paths and all fail:
1. `window.focus()` cross-tab → tab stayed `visibilityState:"hidden"`.
2. Named `window.open(url, name)` reuse → Zoom page is `crossOriginIsolated:true` with `opener` severed (own browsing-context group) → can't target the Studio tab.
3. Service-worker `WindowClient.focus()` → only permitted from a `notificationclick` (user-activated), NOT from a `message` event; live test forwarded nothing + tab stayed hidden. (Temporarily added a `focus-studio` handler to `coi-serviceworker.js` to test, then REVERTED it — file is back to vendored original.)
**Operator decision (asked, given it's a real trade-off):** keep **"reuse in background + hint"** (option A) — no duplicate tab, Studio switches step, snackbar tells the host to switch. The only way to surface the *existing* tab would be a click-to-focus notification (declined).

**Surfacing enhancement (added after):** since the tab can't foreground itself, the Studio tab now **flashes its tab-bar title** (`🔔 Prescribe ATC — Studio`) when it receives the ping while `document.hidden`, auto-stopping on focus or after 30s (`flashStudioTab()`). Live-verified: title samples toggled `Dynamic Studio` ↔ `🔔 Prescribe ATC — Studio`.

**Click-to-focus notification (added — the ONE way to actually front the existing tab):** a service worker CAN focus a `WindowClient` from a `notificationclick` (unlike from a `message` — that's the distinction that makes this work where the earlier SW `focus-studio` message test failed). Implemented:
- `coi-serviceworker.js`: `message` handler `notify-focus-studio` → `showNotification('Prescribe ATC', …)`; `notificationclick` handler → `matchAll` → focus the `/dynamicstudio` client (+ postMessage `goto-step`), else `openWindow`.
- Zoom `surfaceOpenStudioTab()`: on reuse ack, if `Notification.permission === 'granted'`, ask the controller SW to show the click-to-focus notification; else snackbar.
- Studio also listens on `navigator.serviceWorker` `message` for `goto-step` (so a later notification click still switches the step).
- Live-verified: notification permission `granted`, `showNotification` displays (SW file served with both handlers). Not fully click-tested end-to-end because (a) the dev SW-update lifecycle kept the old worker active during rapid edits and (b) an OS notification click isn't drivable via the browser MCP — but `notificationclick → WindowClient.focus()` is the canonical web-push "open the app tab" pattern.

**Net Prescribe-ATC behavior:** no new tab when Studio is open (fixes the literal complaint); Studio reused + switched to the step; and it IS surfaced — a click-to-focus notification brings the existing tab to front (when notifications are granted), with snackbar + flashing tab title as fallback.

### Screen — Prescribe ATC · FINAL: direct foregrounded open · DONE 2026-07-04
After all the reuse/focus/notification iterations, operator's final call: clicking Prescribe ATC must **directly open the tab**. The reuse-in-background (studio silently switches, no visible open) read as "not opening the tab."

`goToPrescribeAtc()` is now one line: `window.open('/dynamicstudio?step=prescribe-atc', 'starlabsDynamicStudio')` — synchronous in the click gesture, so the browser foregrounds it immediately every click; the stable window name makes repeat clicks reuse+refocus that same tab (no pile-up). It's a dedicated Prescribe-ATC Studio tab (can't reuse the host's independent Studio tab — Zoom page is COOP-isolated), but it opens **directly and visibly**, which is the requirement.

Removed all the now-dead reuse machinery: zoom BroadcastChannel + spare-tab; studio `wireStudioChannel`/`jumpToStep`/`flashStudioTab` + fields; and the `coi-serviceworker.js` `notify-focus-studio`/`notificationclick` handlers (SW back to vendored original). `?step=` deep-link (constructor read + `pendingDeepLinkStep` apply) unchanged — it lands the opened tab on the step. Typecheck clean.

## Pending / follow-ups
- **Cross-tab focus** — `window.focus()` on a background studio tab is browser-blocked in most cases; the tab switches step but may not surface. No reliable pure-web fix without a user gesture in the target tab.
- **Not verified in a live browser** — the bubble only renders for a host (`profileHost && isJoined`) inside an active Zoom meeting, which the Firebase-auth-gated preview can't reach without a real live session. Verified via clean typecheck only.
- Same-tab navigation drops the live call (see UX note). Revisit if the operator wants the call to stay up (→ `window.open` new tab).
- The `?step=` param is now a small general contract into `dynamic-studio-v2`; other surfaces could reuse it to deep-link any step id from `visibleSteps`.
