# 2026-11-27 — Join "Ready check" (plan `specs/plans/2026-11-27-join-ready-check.md`)

Branch `feature/join-ready-check` (worktree `starlabs-angular-readycheck`), one branch for all phases (operator).

## What changed
| Phase | Screen / file | Change |
|---|---|---|
| 1 | `LiveKit/ready-check/call-tab.service.ts` + `call-tab-blocked-dialog.component.ts` (new) | Join opens a blank tab **inside the click**, does the room work, then points the tab at `/joinroom/<id>`. Still blocked → dialog with **Open meeting** (fresh click) + "always allow pop-ups" steps for the detected browser. Room setup fails → blank tab closed |
| 1 | `appointment-studio`, `list-openvidu-room` (appointment join), `dynamic-studio-v2` (live-assignment join) | Use `CallTabService` (replaces the 2026-11-24 same-tab `router.navigate`); appointment handlers now have try/catch |
| 1 | `join-livekit-call.component.html` | Host "ended" text back to "Close and Join Meeting…" |
| 2–4 | `LiveKit/ready-check/ready-check.component.*` (new, hooks `rck-`) | Check panel: browser, camera, mic (+level meter), speaker (test sound + "did you hear it?"), network, computer. Each camera/mic error gets its own message + fix |
| 2 | `LiveKit/ready-check/device-help.ts`, `browser-info.ts` (new) | Help text per error × browser × OS; Mac/Windows privacy-settings deep links |
| 3 | `join-livekit-call.component.*` | One block from page open until Join; checks run during the server wait (was: only after the server was ready). Old `prepareParticipant()` getUserMedia + status row removed; "Enable Access" re-runs the checks |
| 4 | `LiveKit/ready-check/precheck-recorder.ts` (new), `join-livekit-call` | Participant entry on the room doc, field `precheck.<profileId>` (openviduroom/<room>), until connect; host "Not joined yet" panel (`lkj-notjoined`) on the call screen reads it from the room snapshot it already listens to |

## Why (the constraints)
- **A page cannot change browser or OS settings** — so: avoid the pop-up block (open in the click), detect + one-click fallback, and explain / deep-link the rest.
- **Camera / mic errors are distinguished by the browser's error**: `NotAllowedError` + Permissions API state → site block vs OS block vs dismissed ("denied by system" = OS); `NotReadableError` → busy, then each device tried alone to name the busy one; `NotFoundError` → enumerate devices for missing camera/mic.
- **Camera stays mandatory** (operator). Mic "can't hear you yet" and speaker problems only warn.
- **Checks run during the server wait** so the 10–15 min wait isn't wasted.
- **Records: participants only, only before the call** (operator): removed on connect, on End all (host deletes the room's `precheck` field) and when the room goes inactive; tab closed → `state:'left'` + `leftAt`; heartbeat every 60 s. Hosts (room `hosts`) never written. Join failing after checks → `state:'stuck', step:'connect'`.
- **Specialist sees it on the call screen only** (operator) — not in appointment studio.
- `joinroom-prejoin` still appears **only once the server is ready**, with Enable Access + Join inside — LKJ-01/02/03 and studio-session SS-11 rely on that.
- Mic picked on the Ready check is used in the call (else the built-in-mic default stays); a picked speaker too.

## Not done / deviations from the plan
- **Network test against the media server: not run before joining.** livekit-client 2.19.1 has `ConnectionCheck`, but it needs a call token (our token function can order media nodes) and it joins the room as the person (they'd appear to the host). Instead: online/offline + round-trip time to our own site + `navigator.connection` where available.
- Chrome's experimental in-page permission button: not used (experimental, Chrome-only).
- No history of problems (records are deleted on join, by design).
- **Stored on the room doc, not a sub-collection** (operator, 2026-11-27 "put in the main collection only"): the first version wrote `openviduroom/<room>/precheck/<id>`, which the DEPLOYED rules on starlabs-test AND production deny — they only cover `match/openviduroom/{doc}` (the repo's `firestore.rules` allow-all file is NOT what is deployed; the real rules live in the Firebase console). Now `updateDoc(room, {'precheck.<id>': …})` — per-participant field paths, so two participants never overwrite each other. Side effect: each check change / 60 s heartbeat rewrites the room doc every call page listens to (small, and it keeps the room "fresh" for wake-on-join).

## Revert guide (per screen)
| Screen | Revert |
|---|---|
| Studios' Join (3 handlers) | Replace `this.callTab.open()/go()/abort()` with `this.router.navigate(['/joinroom', id])` (same tab) or the original `window.open(url,'_blank')` after the awaits; drop the `CallTabService` import/inject |
| /joinroom pre-join | `git checkout charan-release -- src/app/LiveKit/join-livekit-call/` and delete `src/app/LiveKit/ready-check/` |
| Specialist panel only | Remove the `lkj-notjoined` block in the template + `watchNotJoined()` call after connect |
| Records only | Remove `startPrecheckRecord(...)` call in the room snapshot handler |

## Verification
- `tsc -p tsconfig.app.json --noEmit` clean; `ng build --configuration development` OK (CSS warnings are pre-existing, journey-coach-health-dashboard).
- **Not yet run in a browser / on starlabs-test.** To do: Safari Join (pop-ups default Block); block camera for the site; block Chrome in macOS Privacy; camera held by Zoom; participant stuck → host panel; participant joins → doc gone; host never written.

## Same day — Join needs mic + speaker ticked (operator)
Operator: Join was enabled before the mic and speaker showed a tick. Now Join needs ALL of camera ✓,
microphone ✓ (the level meter heard a voice) and speaker ✓ (test sound played and answered "Yes").
Picking another mic or speaker resets that tick. Under the disabled button `lkj-join-hint` says exactly
what is missing. The specialist's record now names the first un-ticked item.
**e2e impact:** hub `queue/join-livekit-server-wait.spec.ts` LKJ-03 clicks Enable Access → Join Call; Join
now stays disabled until the speaker test is answered, so LKJ-03 must click `rck-test-sound-btn` and
`rck-heard-yes-btn` first (and rely on Chrome's fake mic beep for the mic tick). Not updated yet.
Revert: `updateReady()` in `ready-check.component.ts` back to camera ok + mic not fail.

## Same day — Ready check redesign (operator: buttons went below the viewport)
| Change | Why |
|---|---|
| One card, `max-height: 100dvh − 32px` (full-bleed `100dvh` under 900 px): header · scrolling body · footer | The footer (server status while waiting, then Check again / Join Call) can never leave the screen; only the checks scroll |
| Server status moved into the footer (same `lkj-server-*` hooks) | Join appears in the same place the wait message was — no jump |
| Two columns ≥ 900 px: preview (mic level bar over the video, device pickers under it) · checks | Fits a laptop screen without scrolling; one column with a 30 vh preview below 900 px |
| Required checks as 3 rows + "N of 3 ready to join" bar; browser / network / computer as small tiles that widen only to explain a problem | Puts what blocks Join first; healthy system checks take one line |
Checked with a static harness of the real CSS at 1440×900, 1280×620, 768×1024 and 375×812 (ready + waiting footers): footer visible in all.
Revert: `git checkout 7665319a -- src/app/LiveKit/ready-check/ready-check.component.{html,css} src/app/LiveKit/join-livekit-call/join-livekit-call.component.{html,css}` (+ drop `requiredDone()`).
