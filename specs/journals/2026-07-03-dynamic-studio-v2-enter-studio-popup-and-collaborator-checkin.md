# Dynamic Studio V2 — "Participant accepted" popup + collaborator check-in block (2026-07-03)

**Branch:** `dynamic-studio-update` (dynamic-studio-v2). **Not committed** — operator reviews before commit.
**Design reference:** operator screenshot (green check card, "Participant accepted the invitation", "Select mentor(s)", "Invite more specialist(s) · optional", purple "Enter Studio" button).

## What changed & why

### 0. Build was broken (blocker, fixed first)
`node_modules/livekit-client` was **2.19.1** while the lockfile pins **1.15.13**. 2.x renamed
`LocalParticipant.videoTracks`→`videoTrackPublications`, `Room.participants`→`remoteParticipants`,
so OpenVidu/AdaptiveQuality/monitor-liveassignment failed to compile → `ng serve` served a **stale
bundle** (matches memory `project_prod-build-preexisting-errors`). Fix: `npm install --legacy-peer-deps`
resynced livekit-client to 1.15.13, then a preview restart. Build now green (warnings only).
**This was operator task #1 ("error in the console").**

### 1. New "Enter Studio" accept popup (replaces AssignQueueStudioComponent in the accept flow only)
- New standalone component `enter-studio-assign` (ts/html/css). It is a **restyled sibling** of
  `AssignQueueStudioComponent`, which is **left untouched** (still used by the invite/update flow at
  `inviteParticipant` → `openAssignQueueStudio`, line ~3016).
- Supersedes the 2026-07-01 reskin decision ("keep OLD assign dialog"). Operator now wants the new design
  for the post-accept step.
- **Same result contract** so `assignStudio()`'s `afterClosed` handler is unchanged: closes with the
  studio object + `participants` (selected mentors) + optional `bonusactivity` map (participantId→activityId).
- Content per operator clarification: mentors = the studio's own `participants` (selectable pills, all
  selected by default, ≥1 required); studio `mandatoryactivities` seeded as locked required rows; optional
  "Add Other Specialists" reveals activity+specialist select rows. No separate "invite-more" chip list.
- Opened via new `openEnterStudioAssign()` with `panelClass:'enter-studio-dialog'` (global CSS in
  `src/styles.css` rounds the dialog surface to 24px).

### 2. Collaborator check-in conflict (hard block)
- Scenario: I'm a specialist live in studio A **and** a collaborator (co-`participant`) on studio B.
  When studio B's primary toggles check-in, block it because collaborator (me) is busy in A.
- New `findCollaboratorConflicts(studio)` in `dynamic-studio-v2.component.ts`: for each other
  participant of the studio, query `live assignment` by `pairing array-contains <collab>` (single-field
  index, no composite needed), filter client-side for `status==='live'` && `studioid !== thisStudio`.
- Wired at the top of `checkinStudio()` (before the existing self-conflict check). On conflict it opens
  new `#collaboratorBusyTpl` (OK-only, hard block), reverts the toggle, returns. Distinct from the
  self-conflict dialog which offers "check out & continue" (collaborator busyness can't be self-resolved).

## Per-screen revert guide

### Screen — Post-accept "Enter Studio" popup · NEW 2026-07-03
| Change | Where | Revert to |
|---|---|---|
| New component | `src/app/queue system/enter-studio-assign/*` (ts/html/css) | delete the folder |
| Accept flow opens new popup | `dynamic-studio-v2.component.ts` `assignStudio()` (~2405) | restore `openAssignQueueStudio({data:{title:"Update Specialist and Activity in the Studio", studiolist:[this.selectedStudio], ...}})` block |
| Loader method | `dynamic-studio-v2.component.ts` `openEnterStudioAssign()` (near `openAssignQueueStudio`) | remove the method |
| Dialog rounding | `src/styles.css` `.enter-studio-dialog` rule | remove the rule |

### Screen — Collaborator check-in block · NEW 2026-07-03
| Change | Where | Revert to |
|---|---|---|
| ViewChild | `dynamic-studio-v2.component.ts` `collaboratorBusyTpl` | remove line |
| Conflict finder | `dynamic-studio-v2.component.ts` `findCollaboratorConflicts()` | remove method |
| Check-in guard | `checkinStudio()` first `if (value === true)` block | remove the `collaboratorConflicts` block (keep the `findActiveCheckins` block after it) |
| Alert template | `dynamic-studio-v2.component.html` `#collaboratorBusyTpl` (after `#checkinConflictTpl`) | remove the ng-template |

**Full revert:** `git checkout <pre> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.ts" "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.html" src/styles.css` and `rm -rf "src/app/queue system/enter-studio-assign"`.

## Iteration 2 (2026-07-03, operator feedback on the live popup)

Feedback: (a) content clipped when specialist rows added; (b) logged-in profile auto-ticked as mentor —
not wanted; (c) after picking an activity show its specialists as chips; (d) source those specialists
from cohorts (per big-planner).

- **Component rewritten to a plain model** (dropped ReactiveForms). `requiredRows`/`optionalRows` are
  `{activity, mandatory, locked, selected:Set}`. Specialists per activity render as toggleable **chips**
  (reusing `.esa__pill`) instead of a mat-select; selecting toggles the row's `selected` set.
- **Mentors no longer pre-selected** — `selectedMentors` starts empty; ≥1 still required.
- **Cohort sourcing:** `dynamic-studio-v2` now loads `big cohorts` in `ngOnInit` (next to the `bigactivity`
  load) and builds `activitySpecialistMap = {activityId: [profileId]}` by unioning `participantidlist`
  across cohorts whose `bigactivity` matches (skips cohorts with a non-`active` status). Passed into the
  popup as `activityspecialists`. Names via `mapProfile` (full profile_data is loaded, so coverage is complete).
- **Overflow fix:** `.esa` gets `max-height:88vh; overflow-y:auto` so the card scrolls internally
  (dialog surface stays `overflow:hidden` to keep the 24px radius).
- **Optional rows relocated** under the "Invite more specialist(s)" heading (where the Add button is),
  instead of rendering above it.

### Revert-guide delta for Iteration 2
| Change | Where | Revert to |
|---|---|---|
| Cohort map load + field | `dynamic-studio-v2.component.ts` `activitySpecialistMap` prop + `big cohorts` `collectionData` in `ngOnInit` | remove the prop and the subscribe block |
| Pass to dialog | `assignStudio()` data `activityspecialists:` line | remove the line |
| Popup component | `enter-studio-assign.component.{ts,html,css}` | this is the current version; Iteration-1 (ReactiveForms) version is in git history if a straight revert is wanted |

## Iteration 3 (2026-07-03) — froze the tab on "Add Other Specialists"

Symptom (operator): clicking "Add Other Specialists" did nothing. Reproduced via a throwaway
`/enter-studio-demo` route (mock data, no auth) driven through the preview browser: the click **froze
the renderer** (synchronous change-detection loop — even read-only `preview_eval`s timed out).

Root cause: I had put `<ngx-mat-select-search>` inside the **activity** `<mat-select>` whose options
came from an **impure** `activityOptions()` method. The search component + impure options regenerated the
option list on every CD tick → infinite loop. (The original assign-queue-studio only used search on the
specialist multiselect, not the activity select.)

Fix: activity dropdowns now use a pure `mapActivity | keyvalue` pipe (activity lists are short — no search
needed). Removed `activityOptions()`, `activityFilter`, and the `NgxMatSelectSearchModule` import from the
component. Verified in the preview harness: add row → pick activity → cohort specialists appear as chips →
selecting a mandatory + optional specialist + a mentor enables "Enter Studio". Demo route/component then
deleted (were never committed).

Lesson for [[project_prod-build-preexisting-errors]]: a green build can still hard-freeze at runtime;
drive the actual component (temp unguarded route) rather than trusting a clean compile.

## Iteration 4 (2026-07-03) — compact pass

Operator: chips too big, popup needs ~50% more compact; also confused whether the "Charan Reddy P" mentor
pill belongs to the Changework Shadow activity (it doesn't — mentors = studio.participants; activity chips
= cohort specialists; two separate things sitting adjacent).

CSS-only rewrite of `enter-studio-assign.component.css`: card max-width 640→460, padding 32→18, title
24→18, sub 16→13, halved section/gap spacing, pills 11×22 / 15px → 6×13 / 12.5px, mandatory tag + add
button shrunk, footer buttons smaller. Added `subscriptSizing="dynamic"` to the activity mat-form-fields
(drops the reserved error row). No logic/HTML-structure change beyond that attribute.

Note: after deleting the temp demo route, esbuild's incremental cache kept erroring on the removed import
(`app.routes.ts:… enter-studio-demo`) even though the source was clean — a **preview restart** cleared it.

## Iteration 5 (2026-07-03) — mentor = you (no toggle), wider

Operator: don't make me select the logged-in specialist ("that toggle in place of Charan Reddy"); widen +
show more chips.

- `assignStudio()` now passes `currentprofileid: this.profileid` into the popup.
- Popup: the logged-in specialist is **always included** and rendered as a read-only "<name> · You" chip
  (`.esa__pill--you`), never a toggle. Other studio participants (excluding self) remain **optional**
  co-mentor pills. `canEnter` no longer requires a mentor selection — only the required activity rows.
  `enterStudio()` sets `participants = unique([currentProfileId, ...selectedCoMentors])`.
- Width: `.esa` back to `width:640px; max-width:92vw` (was 460 compact) so more chips per row.
- Heading "Select mentor(s)" → "Mentor(s)"; subtitle now "You're mentoring this session…".

## Iteration 6 (2026-07-03) — drop mentor block entirely + zoom hardening

Operator: remove the "<name> · You" chip, the "Mentor(s)" heading and its subtitle; optimise for
175%/200% browser zoom.

- **Mentor section deleted** from the HTML. All the mentor state/methods removed from the TS
  (`mentorList`, `selectedMentors`, `currentMentorName`, `toggleMentor`, `isMentorSelected`). `enterStudio()`
  now sets `participants = unique([...studio.participants, currentProfileId])` — every studio specialist
  (incl. you) is a participant automatically; there is no in-popup mentor picker. `canEnter` unchanged
  (only the required activity rows gate it). `.esa__pill--you` CSS left as harmless dead style.
- **Zoom:** `.esa__rowhead` now `flex-wrap`. Added `@media (max-width:640px)` (activity field + actlabel go
  full-width, padding/title shrink) and `@media (max-width:440px)` (footer buttons wrap + stretch). High
  browser zoom shrinks the CSS viewport, so these media queries trigger; combined with the existing
  `max-width:92vw / max-height:88vh` scroll, nothing clips at 175–200%.
- Verified: build green, no dangling mentor refs (grep). The temp `/enter-studio-demo` route couldn't be
  re-driven this round (preview browser's Firebase session had lapsed → redirects to /login); relied on the
  green compile + unchanged chip logic + widget mockups for the visual.

## Iteration 7 (2026-07-03) — invitation timer zoom responsiveness

Operator: the **invitation countdown dialog** (`QueueInvitationApprovalComponent`, opened from
dynamic-studio-v2 `openQueueInvitationApproval`, maxWidth 95vw / maxHeight 90vh) is not responsive at high
browser zoom. Root cause in its CSS: `.container` was `width:900px; height:max-content; overflow:hidden` —
so at high zoom (shrunken viewport) the two-panel content exceeded the 90vh dialog and got **clipped**
(overflow:hidden), and the only media queries were width-based (900/600) with nothing for reduced height.

Fix (CSS only, `queue-invitation-approval.component.css`):
- `.container` → `max-height:90vh; overflow-x:hidden; overflow-y:auto` so it scrolls instead of clipping.
- Added `@media (max-height:820px)` and `@media (max-height:620px)` to shrink the timer ring, header,
  status box and game `min-height` (and hide the pulsing icon at the smallest) — these fire under zoom
  because zoom shrinks the vh viewport.

Verified via temp `/qia-demo` route driven in the preview at 720×560 (≈200% zoom): dialog reflows to a
scrollable column, timer shrinks, `.container` scrollHeight 742 > clientHeight 504 (scrolls, nothing
clipped), cancel button reachable. Demo route/component then deleted.

Design-check note: operator asked to use the Chrome browser MCP on their live session. Avoided triggering
the real timer there (clicking "Bring To Studio" sends a real studioinvitation to a participant — a
side-effect on their account); verified in the isolated preview demo instead.

## Iteration 8 (2026-07-03) — Prescribe ATC opens tab directly (no notification)

Operator: clicking Prescribe ATC should just open the tab — no push/click-to-focus notification.

First pass removed reuse entirely (always new tab). Operator corrected: **reuse if a Studio tab is open,
else new tab — just no push notification.**

Final `zoom-clientview.component.ts` `goToPrescribeAtc()`: keeps the BroadcastChannel reuse ping + spare
tab. On a `studio-here` reply → drop the spare (the Studio tab jumps to the step and self-foregrounds via
its existing `wireStudioChannel` handler: `window.focus()` + tab-title flash). No `studio-here` in 350ms →
open the spare/new tab. Deleted `surfaceOpenStudioTab()` entirely (the SW `notify-focus-studio` push +
snackbar) — that was the only thing operator wanted gone.

Caveat (honest): from the cross-origin-isolated Zoom tab, the browser won't let the background Studio tab
truly foreground itself without a user gesture — `window.focus()` is best-effort. The removed notification
was the *only* reliable cross-tab focus mechanism (notificationclick → WindowClient.focus). So "go to that
tab" now = the Studio tab switches to the step + flashes its title; whether it visually comes to front
depends on the browser. If reliable auto-focus is needed, the click-to-focus notification has to come back.
Build green.

## Iteration 9 (2026-07-04) — Zoom template was a full HTML document (white "mark")

Operator: a white mark overlaps on some screens (Zoom screen, per their first screenshot). Investigated via
the Chrome MCP / read-only screen access: their app runs on **localhost:4200** (their own `ng serve`, not
the 4310 preview); the currently-open Dynamic Studio / Prescribe ATC pages looked clean.

Found a concrete defect: `zoom-clientview.component.html` was authored as a **full HTML document** —
`<!DOCTYPE html><html><head><script>…</script></head><body>… </body></html>` — with a stray
`<div class="d-flex flex-row justify-content-center"><h1>Zoom ClientView Component</h1></div>` header.
Angular renders that as junk inside `<app-zoom-clientview>` (a nested `<body>` element + a visible white
heading block), the most likely "white mark". Removed the whole document scaffolding + the stray heading;
kept every functional node (`#zmmtg-root` Zoom mount, both wait-screens, slider, capture / Prescribe ATC
buttons, rec-prompt overlay, `#aria-notify-area`). Safe: the inline `<script>` never executed (Angular
strips template scripts) and COI is registered in `src/index.html:13` + bundled via angular.json, so
cross-origin isolation is unaffected.

Note: the 4310 esbuild cache threw a stale `Unexpected closing tag "body"` between the two edits; a
preview restart cleared it, file is clean (grep), build green.

**Follow-up — it was Safari-only.** Operator clarified the white mark only shows in Safari, not Chrome.
Confirmed via computer-use read-access to Safari on the live meeting: the full-page Zoom view has a ~25px
**white strip along the bottom** where the black Zoom area falls short of the visual viewport. Cause: Safari
computes the Zoom SDK container's height slightly short (classic WebKit `100vh` / dynamic-toolbar quirk),
exposing the default white `html`/`body` background; Chrome fills it. The template cleanup above didn't fix
this (it was never the h1). Real fix: `zoom-clientview.component.css` `:host { position: fixed; inset: 0;
background: #000; }` — pins the component to the real viewport and paints the backdrop black, so any
uncovered gap is black not white. No `overflow` clip (Zoom popups). Build green; visually confirmed only
that the strip is body-background (couldn't re-verify post-fix in the live Safari meeting — operator to
reload localhost:4200 in Safari). Arena-board (light theme) not touched — if it shows the same white gap,
same `:host`/body-background approach applies there.

**Correction — the `:host` fix was wrong; reverted.** Operator then reported the participant NAMES are
clipped at the top too. Re-checked live Safari: after reverting `:host`, the names were STILL clipped and
the white strip STILL there → my `:host` change neither fixed the strip nor caused the clip. So **both are
Zoom Web SDK rendering**: the SDK draws the big video-off name labels itself and sizes its gallery to a
stale/short window height at join in Safari (Safari's `innerHeight` differs from Chrome and isn't
re-measured after layout settles) → white gap below the gallery + clipped name tops. Global `html,body`
already have `margin:0; height:100%`, so it's not a missing reset.

Fix attempt (best-effort, needs live verification): in the Zoom join `success` callback
(`zoom-clientview.component.ts` ~line 826, right after `isJoined = true`), fire `window.dispatchEvent(new
Event('resize'))` at 150/600/1200ms so the SDK re-lays-out its gallery to the correct current size. No-op
on Chrome. Kept the earlier template cleanup (unrelated, beneficial). NOT yet confirmed to fix Safari —
operator must rejoin/reload the meeting in Safari (the nudge fires on join). If it doesn't help, the SDK is
measuring the same wrong Safari innerHeight and the names may be canvas-drawn (not CSS-fixable) — Chrome is
the working fallback. Build green.

**RESOLVED — the culprit was my template cleanup; fully reverted.** The resize nudge didn't help; operator
reported Safari still broken and asked what change caused it. Traced it: the **template cleanup**
(converting `zoom-clientview.component.html` from a full `<!DOCTYPE html>…<body>…</body></html>` document to
a plain fragment) changed the DOM the Zoom SDK renders into, and the SDK's Safari gallery layout depended
on that nested-`<body>` structure — clipping the big video-off name labels. Reverted the **entire**
zoom-clientview rendering back to original: template restored verbatim (`git diff` empty), the `:host`
rule removed (empty diff), the resize nudge removed. Verified LIVE in Safari via computer-use: names now
render fully ("Charan Reddy P", "Vignesh S", no clipping). The Zoom-view `.ts` now only carries the
intended `goToPrescribeAtc` reuse change.

Lesson: do NOT restructure the zoom-clientview template — that malformed full-HTML-document template is
load-bearing for the Zoom SDK's layout (esp. Safari). The bottom **white strip is PRE-EXISTING** (present
before any of my changes) and is a separate Zoom-SDK/Safari sizing quirk; leave it unless a non-invasive,
verified fix is found — restructuring the template is not it.

## Iteration 10 (2026-07-04) — white strip fix, COLOR-ONLY

Operator: white strip still there. Fixed it the safe way this time — **color only, no layout**, in
`src/styles.css`:
```
#zmmtg-root { background: #000; }
body:has(#zmmtg-root) { background: #000; }
body:has(#zmmtg-root) body { background: #000; }   /* the template's nested <body> */
```
The strip is Safari's short Zoom gallery revealing the default white page background; painting the backdrop
black makes the gap black. Scoped to the meeting view via `#zmmtg-root` (absent on other routes); `:has()`
already used elsewhere in styles.css; `.wait-screen` has its own dark gradient so it's unaffected. This
touches NO layout/positioning, so it can't clip names (unlike the reverted `:host` attempt). Build green.
Couldn't grab a live Safari screenshot of the Zoom tab post-fix (it wasn't the active Safari tab and read
tier can't switch tabs) — operator to confirm on the Safari Zoom tab (CSS HMR applies live; reload that tab
once if it doesn't update). Names remain fine (template stays reverted/original).

**Correction:** the 3-rule version (which included `#zmmtg-root { background:#000 }` + nested-`body` black)
killed the white strip but **hid the Zoom control toolbar** in Safari (operator: "controls not shown, able
to click but hidden") — the strip and the control bar share that bottom region, and blackening #zmmtg-root
painted over the controls. Reduced to a SINGLE rule: `body:has(#zmmtg-root) { background:#000 }` (outer
document background only, sits behind #zmmtg-root/controls). Build green; operator to confirm white gone AND
controls visible. If white returns with only this rule, the gap is inside #zmmtg-root, not the body, and a
different (control-safe) target is needed.

## Verification
- Build: green (`Application bundle generation complete`, warnings only). New popup rendered faithfully
  via the visualize widget (auth-gated app can't be driven to the live studio for a real screenshot).
- **Not runtime-verified in the live studio** (Firebase-auth gated). The `live assignment` collaborator
  query may want a `pairing` single-field index — auto-created on first run; verify in a real session.

## Pending / open
- Operator to review the new popup visually and the mentor/mandatory-activity data mapping (my
  interpretation of the "mandatory field" clarification).
- Confirm collaborator "in activity" == live assignment `status:'live'` is the right signal (vs. a
  looser `queue studio pairing.checkin` signal).
