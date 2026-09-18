# Dynamic Studio V2 — purple mockup reskin (2026-07-01)

**Branch:** `dynamic-studio-update`
**Design reference:** `~/Downloads/dynamic-studio-full.html` (mockup: purple accent #7C3AED, horizontal stepper workspace).
**Goal:** update the *UI only* of `dynamic-studio-v2` to the mockup's visual language. **No backend / navigation-model / data-flow changes.**

## Scope decisions (operator-confirmed)
- **Invitation timer** → keep OLD design (`QueueInvitationApprovalComponent`). Not touched.
- **Assign studio (after accept)** → keep OLD dialog (`AssignQueueStudioComponent`). Not touched.
- **Chat** → keep OLD design exactly. `.chat-container / .example-container / .talk-bubble*` CSS left untouched.
- **"time at uP!"** → use the existing `participantUPVisitLabel` field (already in the sidebar/header).
- **Variation filtering** on next-stage → not required (leave existing behaviour).
- **Immediate badge** → deferred (discuss later); not added.
- **AEL** → use the new slider modal (pending, workspace commit).
- Accent color adopted: mockup **purple #7C3AED**. Font kept as existing **Manrope** (mockup uses Inter — trivial swap if wanted).

## Why the approach is "restyle in place, not rebuild"
The existing v2 already has the same conceptual flow (lobby → waiting list → invite dialog → assign dialog → workspace stepper). The mockup's `inviting`/`accepted` full-page views map onto OLD dialogs we're keeping, so we do NOT build them. The workspace token palette is already `var(--primary)`-driven, so the accent swap cascades automatically.

---

## Per-screen revert guide

### Screen 1 — Lobby + Waiting List (pre-live) · DONE 2026-07-01
CSS-only, all in `dynamic-studio-v2.component.css`. No HTML/TS changed.
| Change | Where | Revert to |
|---|---|---|
| Token accent | `.ds-app` tokens `--primary/-ink/-soft/-line` | `#1E5663 / #143F49 / #E2EEEF / #BFD8DC` |
| Queue card hover/active | `.queue-card:hover`, `.queue-card--active` | border `#1E5663`, bg `#E2EEEF` |
| Section count + primary studio btn | `.sec__head-count`, `.primarystudio` | bg `#E2EEEF`, color `#143F49` |
| Wait avatar | `.wait-token__avatar` | bg `#E2EEEF`, color `#143F49`, border `#BFD8DC` |
| Preassigned badge | `.wait-token__preassigned` | was italic teal text (`color:#143F49`, no pill) |
| Token pill | `.wait-token__token` | color `#143F49`, bg `#E2EEEF`, border `#BFD8DC` |
| Bring button | `.wait-token__btn` (+`:hover`) | bg `#1E5663`, hover `#143F49`, radius `9px` |
| Self chip + cancel hover | `.wait-token__chip--self`, `.wait-token__chip-cancel:hover` | bg `#E8F1F4` color `#176B7E` border `#BBD9E1`; hover `rgba(23,107,126,.14)` |
| Stage group card + header | `.mainscreen [data-testid=studio-stage-col] > .mat-elevation-z2`, `.stagename`, `.stagequeue` | remove the new wrapper rule; `.stagename` = bold dark `#1A2332` on `#F8FAFC`, padding `10px 14px`; `.stagequeue` padding `8px 12px` |

**Full revert of Screen 1:** `git checkout <pre-branch> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.css"` (only that file changed for this screen).

### Screen 2 — Workspace layout: sidebar → header + horizontal stepper · DONE 2026-07-01
Operator chose "Full mockup layout" (remove left sidebar). HTML + CSS changed.
**HTML** (`.component.html`): replaced the old `<aside class="ds-sidebar">` + `<header class="ds-topbar">` (was ~lines 251–407) with a new `<header class="ds-header">` (participant avatar + name + "time at uP!"/product line + details popover holding product/variation/journey + extra specialists; status pill; actions: Invite More / Send back to Waiting / Move Next Stage) followed by `<nav class="ds-stepbar">` (horizontal stepper). `<main class="ds-main">` and the footer are unchanged. All bindings were relocated verbatim (toggleSidebarProfile/sidebarProfileOpen reused for the popover; `extraSpecialistsOpen`/`toggleExtraSpecialists` now unused-but-harmless).
**CSS** (`.component.css`):
| Change | Where | Revert to |
|---|---|---|
| Grid layout | `.ds-app` grid | `columns: var(--sidebar-w) 1fr; rows: var(--topbar-h) 1fr; areas "sidebar topbar"/"sidebar main"` |
| Avatar | `.ds-app .ds-avatar` | `border-radius:13px; background linear-gradient(135deg,#2E7180,#1E5663)` |
| New header/stepper block | `.ds-header`, `.ds-hdr-*`, `.ds-stepbar`, `.ds-hstep*` (inserted before `/* MAIN */`) | delete the whole inserted block |

**Full revert of Screen 2:** `git checkout <pre-branch> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.html" "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.css"`. The old `.ds-sidebar`/`.ds-topbar` CSS blocks were left in place (now unused) so a straight file revert restores everything.
Build: `ng build --configuration development` → success (only pre-existing unrelated warnings).

### Screen 3 — AEL slider modal · DONE 2026-07-01
Operator: "use the slider modal only". AEL's stored value is a **band string** `"startpoint---endpoint"` chosen from `aelLevelList` — NOT a 0–10 scale. So the slider indexes the band list (each notch = one band); the stored value string is unchanged → **UI only, no backend/model change**.
**TS** (`.component.ts`): added `aelModalOpen` flag + helpers `openAelModal / closeAelModal / aelBandIndex / setAelBand / aelBandLabel / validateAelFromModal` (just before `updateCurrentAEL`, which is reused untouched for the actual Firestore write).
**HTML**: AEL step body's inline `mat-select` dropdowns replaced by a single "Validate AEL" button (`openAelModal()`); added a top-level `.ael-modal-backdrop` overlay (inside `.ds-app`, after `</main>`) with one range slider per crossover metric + "Mark AEL validated" → `validateAelFromModal()`.
**CSS**: appended `.ds-app .ael-modal*` / `.ael-slider-row*` block at end of file.
**Revert Screen 3:** remove the `aelModalOpen`+helper methods in `.ts`, restore the inline `ael-form` mat-select block in `.html` (see git diff of this commit), delete the `.ael-modal*` CSS block. Or `git revert` the AEL commit.
Build: `ng build --configuration development` → success (component chunk built, no errors).

### Screen 2b — Responsive header + stepper · DONE 2026-07-01
Reported bug: horizontal stepper scrolled. Fix (CSS-only, `.component.css`):
- `.ds-stepbar-inner` → `flex-wrap: wrap` + removed `overflow-x:auto` (wraps rows, never scrolls). `.ds-hstep` → `flex-shrink:1; min-width:0`; label gets ellipsis.
- Breakpoints: **≤1080px** hide `.ds-hstep-chev`; **≤960px** header wraps (status/actions drop below identity, details popover flips right, metaline hidden); **≤680px** stepper compact — only the active step shows its label (others node-only), smaller nodes/buttons.
- Robustness: added `height: calc(100dvh - var(--host-toolbar-h))` fallback below the `100vh` line (iOS Safari URL-bar clipping).
**Revert:** restore `.ds-stepbar-inner` to `gap:2px; overflow-x:auto; scrollbar-width:thin` and `.ds-hstep` to `flex-shrink:0`; remove the three new `@media` blocks and the `dvh` line.
Verify harness (throwaway): `/tmp/ds-stepper-responsive-harness.html` links the real CSS; resize window to see breakpoints.

### Screen 2c — Stepper names to mockup + Love Letters → step 1 · DONE 2026-07-01
**Rename `visibleSteps` labels** (`.component.ts`) + matching content eyebrows (`.component.html`):
`current-forms` Submitted Forms → **Review Forms**; `prev-history` Previous ATC & Love Letters → **Previous ATC**; `view-atc` View Submitted ATC → **This Cycle ATCs**; `ael-validation` AEL Validation → **Validate AEL**. (Zoom Session / Prescribe ATC already matched; `mark-completed` kept — no mockup equivalent.)
**Love Letters → step 1:** moved the Love Letters `.card` from the `prev-history` `[hidden]` block into the `current-forms` ng-container. Loading is on-demand via `toggleLoveLetter()` (button), independent of step, so no load-trigger changes needed. Forms card now guarded by `*ngIf="participantForm?.length"` so it doesn't render empty. `visibleSteps` logic: step 1 gate now `(participantForm.length) || widgets.includes('loveletters')`; prev-history gate dropped `loveletters` (now `previousatc || evolutionwishlist`).
**Revert:** restore the 4 labels + 6 eyebrow spans; move the Love Letters card back into `prev-history` (after Previous ATC History, before Evolution Wishlist); restore step-1 gate to `participantForm.length` only and prev-history gate to include `loveletters`; drop the forms-card `*ngIf`.
Build: success.

### Screen 2d — Stepper restyle, comment queue rows + details popover, inline specialists · DONE 2026-07-02
- **Stepper look:** redesigned to a *segmented-pill* track — tinted `.ds-stepbar` gradient band; `.ds-hstep` are separated bordered pills with round nodes; active = filled purple pill, done = green pill; chevrons dropped (`.ds-hstep-chev{display:none}`). (`.component.css`)
- **Commented out (ngIf=false, kept for restore):** header details toggle button + `.ds-hdr-details` popover; and the in-studio `.ds-qnav` queue/studio switcher rows. (`.component.html`)
- **Specialists near the name:** new `.ds-hdr-specialists` inline row in `.ds-hdr-idbody` (`<mat-icon>groups</mat-icon> With <names (activity)>`), gated on `additionalSpecialists.length`. Replaces the popover's specialist list.
**Revert:** flip the two `*ngIf="false"` back (`sidebarProfileOpen` for the popover, and the qnav's original `queuesWithStudios...` condition); remove `.ds-hdr-specialists` markup + CSS; restore the previous stepper CSS block (rounded-11px chip, white `.ds-stepbar`, chevrons visible).
Build: success (733 kB chunk).

### Screen 2e — Zoom step: recording note + resend button, hide open URL · DONE 2026-07-02
- **Commented out (ngIf false):** the `.zoom-fallback` block that showed the raw `start_url` openly.
- **Added** the mockup's amber recording reminder (`.zoom-record-note`: "Once the call starts, make sure Zoom recording is enabled.").
- **Reworked** the generate-link row → button label "Generate new link & resend to participant"; now always visible when `enablezoom` (was gated on broken/throttle), disabled during the 10s `zoomlinkGenerator` throttle unless broken; adaptive title ("Need a fresh link?" vs "Link broken or expired?"). Calls existing `regenerateZoomLink()`.
**Revert:** restore `.zoom-fallback` ngIf; remove `.zoom-record-note` markup + CSS; restore the old generate row (condition + "Generate New Link" label, no disabled binding).
Build: success (735 kB chunk).

### Screen 2f — Short-viewport / high-zoom fallback · DONE 2026-07-02
Reported: zooming in showed ~5% of main content. Cause: fixed full-height shell (`grid-rows: auto auto 1fr` + `overflow:hidden`) — a short viewport (what zoom-in produces) squeezes the `1fr` main to a sliver and clips it. Fix (`.component.css`): `@media (max-height: 680px), (max-width: 560px)` **un-pins** `.ds-app.dyn-studio-v2-app` → `position:static; height:auto; overflow:visible; grid-rows:auto auto auto`, and makes `.ds-main`/`.ds-main-scroll` overflow visible so the host page scrolls and all content is reachable at any zoom. (Also naturally covers small laptops like 1366×768.)
**Revert:** delete that media block.
Build: success (736 kB chunk).

### Screen 2g — Hide lobby "Your Queues" inside studio + tablet/mobile responsiveness · DONE 2026-07-02 (LOCAL, uncommitted)
- **Bug:** `no-studio-alert`, `queue-card-list` ("Your Queues"), `otherstudio` were only gated on their own data, not on `liveAssignment == null` — they stayed hidden merely because the fixed overlay covered them, so they bled in once the shell un-pins on small screens. Fix: added `liveAssignment == null &&` to all three (`.component.html`). Revert: remove that prefix.
- **Responsiveness:** un-pin fallback broadened `max-width: 560px → 1024px` (covers phones + tablets, not just tiny/zoom); header-wrap breakpoint `960 → 1024`; added mobile padding trims in the ≤680 block (`.ds-main-scroll` / `.card-pad`). Revert: restore 560/960 and drop the two padding lines.
Build: success (737 kB chunk). **Not committed** — operator wants this session's work local only.

### Screen 2h — Laptop-zoom optimization (short-viewport chrome compaction) · DONE 2026-07-02 (LOCAL)
Reported: zoomed-in 14" laptop not optimized. Cause: on a short viewport the header + wrapping stepper eat the fixed height and squeeze content (before the ≤680 un-pin). Added two height-based, pinned-only (`min-width:1025px`) steps in `.component.css`:
- `@media (max-height: 860px) and (min-width:1025px)` → trim header/stepper/footer padding, step-header margin, card-pad, main-scroll padding.
- `@media (max-height: 720px) and (min-width:1025px)` → collapse stepper to one row (inactive labels hidden), smaller nodes.
Degradation ladder: tall → normal; ≤860h → compact chrome; ≤720h → single-row stepper; ≤680h or ≤1024w → un-pin to scrolling page.
**Revert:** delete the two new media blocks. Build: success (739 kB). Not committed.

### Screen 2i — Fix "content not scrolling" (global scroll-lock vs un-pin) · DONE 2026-07-02 (LOCAL)
Reported: content not scrolling. Cause: **`src/styles.css` lines 221–229** lock the host page (`body`/`html`/`.mat-drawer-content`/`.mat-drawer-container` → `overflow:hidden !important; height:100vh`) whenever `.dyn-studio-v2-app` is present — correct while the studio is a fixed overlay, but once the shell un-pins into flow the overflowing content has nothing allowed to scroll. Fix: added a `@media (max-height:680px), (max-width:1024px)` override in `src/styles.css` re-enabling `overflow:auto` + `height:auto; min-height:100vh` on those wrappers, matching the component's un-pin breakpoints. **This is a NEW file touched this session: `src/styles.css`.**
**Revert:** delete that media block in `src/styles.css`.
Build: success. Not committed.
Note: attempted to screenshot the user's browser to diagnose live — blocked (Screen Recording permission not granted / request_access timed out).

### Screen 2j — Keep pinned+compact at laptop-zoom/tablet (verified live) · DONE 2026-07-02 (LOCAL)
Diagnosed live via Chrome MCP on http://localhost:4200/dynamicstudio: user is at **150% zoom on a 14" MacBook → CSS viewport 1008×552**. The previous `max-width:1024` un-pin flipped that into a plain scrolling page ("not optimized"). Reworked breakpoints so a zoomed laptop / tablet stays PINNED + compact:
- Compaction now applies at any width: `@media (max-height:900px)` (chrome padding trims + stagenote padding) and `@media (max-height:760px)` (smaller nodes); single-row stepper (hide inactive labels) at `@media (max-height:760px) and (max-width:1180px)`. Removed the old `min-width:1025px` guards.
- Un-pin now only for phones/extreme: `@media (max-width:640px), (max-height:460px)` (was `max-height:680 / max-width:1024`). `src/styles.css` scroll-lock override updated to match.
Verified at 1008×552: `.ds-app` position=fixed, single-row stepper, header wrapped (all 3 action btns fit, no horizontal overflow), `.ds-main-scroll` scrollable (243>161), footer pinned at bottom (483–552). Also confirmed the inline "With Joshua Samuel (Changework Shadow)" specialists render by the name, and purple pill stepper.
**Revert:** restore prior blocks (min-width:1025 compaction guards; un-pin `max-height:680,max-width:1024`; styles.css override same).
Build/live: OK (HMR). Not committed.

### Screen 2k — Remove "Mark as Completed" step → "Move to Next Stage" dropdown (verified live) · DONE 2026-07-02 (LOCAL)
Per mockup, mark-completed is no longer a stepper step; its actions live in a popup opened from the header/footer "Move to Next Stage" trigger.
- **TS:** removed the `mark-completed` push from `visibleSteps`; added `nextStageMenuOpen:'header'|'footer'|null`, `toggleNextStageMenu`/`closeNextStageMenu`, and `get hasNextStageOptions` (nextstage.length || movetonextqueue widget).
- **HTML:** header + footer buttons now `.ds-menu-anchor` triggers opening `.ds-nextmenu` (down/up) with backdrop; shared `#nextStageItems` ng-template holds the exact old buttons — `movetoNextMonthReview()` (no close) + both `moveStage(config.stage, config.markascompleted)` variation branches (close on click). Removed the old step ng-container + its eyebrow span. Footer last step: menu when `hasNextStageOptions`, else disabled "Complete Session".
- **CSS:** `.ds-menu-anchor / .ds-nextmenu* / .ds-nextmenu__item(--go)` appended.
Verified live at localhost:4200/dynamicstudio: stepper now 6 steps (…Validate AEL), footer "Step 1 of 6"; header "Move Next Stage" opens "CHOOSE NEXT STAGE" popup showing "Mark for next month review" + routes (Move to Consultation / All done - Move to Review / Send back); closes on backdrop click. No move action triggered during test.
**Revert:** re-add the mark-completed push + step ng-container + eyebrow; restore header/footer buttons to setActiveStep('mark-completed')/disabled; remove nextStage state/getter/template/CSS.
Build: success (746 kB). Not committed.

### Screen 2l — Mockup lobby: show all studios directly (no queue select) — verified live · DONE 2026-07-02 (LOCAL)
Per mockup, the lobby lists ALL the user's studios across every queue as cards, no queue-selection step.
- **TS:** new `allStudios` + `allStudioChunks`; the existing `loadQueueStudioCounts` "queue studio pairing" subscription now also captures the studio docs → `rebuildAllStudios()` maps each to `{studioId, queueId, queueName, studio, activity, specialists, isLive, checkin}` (activity via global `mapActivity`, specialists via `mapProfile`/'You', queueName via `ongoingQueueList`). `openStudioCard(entry)` switches to the studio's queue (`onQueueSelect`) if needed then `onStudioSelect`. `backToStudios()` clears `selectedStudio`/`stageTokenList`/`liveAssignment`. Added `trackByStudioId`.
- **HTML:** replaced the "Your Queues" card list + "Your Studios" button section with a two-state pre-live view — LOBBY (`!selectedStudio.docid`): `.studio-grid` of `.studio-card`s + head "My Studios"; LIST (`selectedStudio.docid`): back link + studio header + `.checkin-card` (toggle) + `.empty-card` offline state. Existing waiting-list block (gated `selectedStudio.checkin`) renders under the list view. Kept `otherstudio` (invited) in the lobby.
- **CSS:** appended pre-live `.studio-grid/.studio-card/.studio-*/.ds-lobby-*/.ds-list-*/.ds-back-link/.checkin-card/.empty-card` (mockup purple).
Verified live (localhost:4200/dynamicstudio): lobby shows 3 studios across 2 queues (Evolution Prep + MIG-Clone), no queue picker; clicking "Changework Solo" cross-queue-switched and showed the check-in card + "Studio is offline"; "All studios" back link returned to the grid. No backend writes triggered (didn't toggle check-in).
**Revert:** restore the old queue-card-list + sec--studios block in HTML; remove allStudios TS (field, chunk capture, rebuildAllStudios, openStudioCard, backToStudios, trackByStudioId); remove the appended lobby CSS.
Build: success (756 kB). Not committed.

### Screen 2m — Lobby title = profile name · DONE 2026-07-02 (LOCAL)
Lobby head title changed "My Studios" → `{{ mapProfile[profileid] ? mapProfile[profileid] + "'s Studio" : 'My Studio' }}` (HTML only). Verified live: renders "Charan Reddy P's Studio". Revert: restore "My Studios". Not committed.

### Screen 2n — Fix check-in toggle stuck ON after cancelling conflict dialog (verified live) · DONE 2026-07-02 (LOCAL)
Bug: checking into a studio while already checked into another opens the "You're already checked into another studio" dialog; clicking **Cancel** left the mat-slide-toggle visually ON (model was off) until a refresh. Cause: `checkinStudio`'s `if(!confirmed) return` (and the checkout-failure path) didn't revert the toggle — a one-way `[checked]` binding can't, since the model value never changed.
Fix: template passes `$event` (was `$event.checked`); `checkinStudio(event)` derives `value`+`toggle=event.source`, and a `revertToggle()` (`toggle.checked = !!selectedStudio.checkin; cdr.detectChanges()`) is called on both the cancel and checkout-failure early returns. Backward-compatible with a raw boolean arg.
Verified live: had MIG-Clone checked in → toggled Diagnostics solo → dialog → Cancel → toggle snapped back OFF + "Studio is offline", no refresh. No writes on cancel (MIG-Clone check-in preserved).
Revert: template back to `checkinStudio($event.checked)`; `checkinStudio(value)` original signature; remove revertToggle calls.
Build: success (757 kB). Not committed.

### Screen 2o — Lobby "Checked in" indicator per studio card (verified live) · DONE 2026-07-02 (LOCAL)
Request: from the lobby (outside) show which studio is checked in. `allStudios` entries already carry live `checkin` (from the real-time pairing subscription). Added a green "● Checked in" `.studio-badge--in` in the card top + `.studio-card--in` green border, gated on `s.checkin`. HTML + CSS only.
Verified live: on the lobby, "Diagnostics Shodow" (checked in) shows the green badge + highlight; the other two cards show nothing.
Revert: remove the badge span + `[class.studio-card--in]` and the `.studio-badge*`/`.studio-card--in` CSS.
Build: success (759 kB). Not committed.

### Screen 2p — Fix invitation timer dialog not showing on "Bring to Studio" (verified live) · DONE 2026-07-02 (LOCAL)
Bug: clicking Bring To Studio sent the invite (chip updated) but the countdown timer dialog never opened. Diagnosed live via `ng.getComponent`: `studioInvitationSubscription.closed === true` (dead). Root cause (pre-existing, exposed by the new lobby's cross-queue `onQueueSelect`): `resetSubscription()` unsubscribes `studioInvitationSubscription` but line ~1145 `this.studioInvitationSubscription = null` was **commented out**, leaving a *closed non-null* object; `getStudio()` only rebuilt it when null or open, never when closed-non-null → permanently dead after the 2nd reset.
Fix (`.component.ts`): (1) uncomment the null in `resetSubscription()`; (2) getStudio rebuild guard `if(!this.studioInvitationSubscription || this.studioInvitationSubscription.closed)`.
Verified live: after fix `subClosed=false`; Bring To Studio → "Queue Invitation" countdown dialog (old design + Quick Tap/Memory games) appears; Cancel Invitation closes it and restores the row. Not a UI-scope change but was blocking the kept-old timer.
Revert: re-comment the null; getStudio guard back to `if(!this.studioInvitationSubscription)`.
Build: success (759 kB). Not committed.

### Screen 2q — Fix invitation timer ring running backwards (verified live) · DONE 2026-07-02 (LOCAL)
Bug: the countdown ring in the invitation dialog ran in reverse (filled) at the start. Cause: ring offset hardcoded `/120` (`565.48 * (1 - expiryInSeconds / 120)`) but this queue's timer is ~180s, so while `expiryInSeconds > 120` the factor went negative → ring over-filled/reversed until it dropped to 120.
Fix (**new files this session: `queue-invitation-approval.component.ts` + `.html`**): added `totalSeconds` (derived in ngOnInit from `data.createddate`→`data.expirydate`, fallback getTimeDiff/120); template offset now `/ totalSeconds`.
Verified live: 180s timer → ring ~99% full at 179s, drains to ~90% at 163s (forward, matching countdown); Cancel closes cleanly.
Revert: template back to `/120`; remove `totalSeconds` field + ngOnInit block.
Build: success. Not committed.

### Screen 2r — Ring total sourced from classify/studiotimer doc (verified live) · DONE 2026-07-02 (LOCAL)
Request: use the invitation timer from the classify doc. `fetchInvitationTimerSeconds()` already reads `classify/studiotimer.timerinseconds` → `invitationTimerSeconds` (drives the invite expiry). Now pass it into the dialog so the ring total is that authoritative value, not a derived one.
- `dynamic-studio-v2.component.ts`: openQueueInvitationApproval `data: { ...studioInvitation, timerSeconds: this.invitationTimerSeconds }`.
- `queue-invitation-approval.component.ts`: `totalSeconds` prefers `data.timerSeconds` (then createddate→expirydate, then getTimeDiff).
Verified live via `ng.getComponent`: `data.timerSeconds=180`, `totalSeconds=180`; ring near-full at 159s, draining correctly; Cancel clean.
Revert: drop `timerSeconds` from the data + the `configured` branch in the dialog.
Build: success. Not committed.

### Screen 2s — Remove ATC count chip from studio header · DONE 2026-07-02 (LOCAL)
Removed the `.ds-chip--atc` "{{atcInThisQueueCount}} ATC" button from the workspace header (`.ds-hdr-status`) per request. `atcInThisQueueCount` still used in the Prescribe ATC step, so not dead. HTML-only. Revert: re-add the button (see git diff). Build: success. Not committed.

### Screen 2t — Center the workspace stepper (stages row) · DONE 2026-07-02 (LOCAL)
Stepper pills were left-aligned within the 1320px inner container. Added `justify-content: center` to `.ds-stepbar-inner`. CSS-only. Verified live: 6 pills now centered with equal margins (also confirmed the ATC-chip removal applied). Revert: remove `justify-content: center`. Build: OK. Not committed.

### Screen 2u — Redesign stepper to mockup pane (rounded card + chevrons) · DONE 2026-07-02 (LOCAL)
Replaced the segmented-pill stepper with the mockup's single rounded white **pane** (`.ds-stepbar-inner`: border + radius 16 + shadow, `width: fit-content` centered) carrying numbered steps (`.ds-hstep`: transparent, rounded-square node) with **chevrons between** them (HTML: `*ngFor` moved to `ng-container`, `.ds-hstep-chev` now a sibling shown again). Active = purple-soft chip + purple node; done = green node. `.ds-stepbar` is now a plain white bar (was gradient). Verified live in the workspace: pane renders centered with chevrons, matching dynamic-studio-full.html. Top bar above it already matches the mockup (avatar + name + "Nth time at uP!" meta + status chip + Invite More / Send back (amber) / Move Next Stage actions).
Revert: restore the segmented-pill CSS block + the `*ngFor`-on-button HTML.
Build: success. Not committed.

### Screen 2v — Fixed toolbar + stepper-top/topbar-left + no footer (verified live) · DONE 2026-07-02 (LOCAL, post-push)
Operator goal (3 items):
1. **STARLABS title bar fixed height at any zoom/screen** — `src/app/app.component.css`: `.toolbar` pinned `height/min/max 64px !important` + `::ng-deep .toolbar.mat-toolbar-single-row / .mat-toolbar-row { 64px !important }` (Material otherwise drops to 56px at the mobile breakpoint, which zoom triggers). Verified `getBoundingClientRect().height === 64`.
2. **Stepper to top, top-bar to the left** — `.ds-app` grid → `columns: clamp(240px,22vw,320px) 1fr; rows: auto 1fr; areas: "stepper stepper" / "header main"`. `.ds-header` now a vertical LEFT column (flex-column, border-right); `.ds-hdr-status`/`.ds-hdr-actions` stack full-width (actions pinned to column bottom via margin-top:auto); header "Move Next Stage" dropdown flipped to `--up`. ≤1024px stacks back to single column with a horizontal header.
3. **Footer removed** — deleted the `<footer class="ds-footer">` (Back / Step X of N / Next / last-step Move). Step nav = the top stepper; Move-to-Next-Stage lives in the left top-bar. `goToStep()` now unused (harmless).
Verified live: stepper pane spans the top, participant bar is the left column (avatar/name/meta/status + Invite More/Send back/Move Next Stage at the bottom), no footer; Move Next Stage opens upward un-clipped; toolbar 64px.
Revert: app.component.css toolbar back to `max-height:64px` only + drop the row override; `.ds-app` grid back to `columns:1fr; rows:auto auto 1fr; areas header/stepper/main`; `.ds-header` back to horizontal row; restore the footer block + `--down` header dropdown; restore the old ≤1024 header-wrap rule.
Build: success. **NOTE: these are NEW uncommitted local changes on top of the already-pushed `dynamic-studio-update` (also touches app.component.css — a shared shell file).**

---
## Session summary (2026-07-01)
All 3 screens reskinned to the purple mockup. Kept per scope: invite timer dialog, assign-studio dialog, chat. Three commits on `dynamic-studio-update`. Not yet pushed. Not visually QA'd in a running browser (app is Firebase-auth gated) — verified by clean AOT build + structural review only.

---

## Pending
- Workspace layout conversion (sidebar vertical stepper → mockup horizontal top stepper + header + footer).
- AEL slider modal.
- Build verification (`ng build`) after workspace HTML changes (CSS-only screen 1 cannot break compile).

### Screen 2w — Full-height left sidebar · DONE 2026-07-02 (LOCAL)
Grid areas changed to `"header stepper" / "header main"` so the header/sidebar spans both rows (full height on the left); stepper now sits only above main. Revert: `"stepper stepper" / "header main"`.

### Screen 2x — Sidebar + vertical stepper + topbar + footer layout (mockup) · DONE 2026-07-02 (LOCAL)
New mockup ("use this layout for side and top"): left full-height sidebar = participant identity + "Session Steps" VERTICAL stepper (`.ds-side`/`.ds-vstep*`); topbar (`.ds-topbar2`) = status pill + Join Call (left) and Invite More / Send back / Move Next Stage (right); footer back (Back / Step X of N / Next). Grid `"sidebar topbar" / "sidebar main" / "sidebar footer"`; ≤1024 stacks `topbar/sidebar/main/footer` (steps wrap horizontal). **KEY FIX:** removed a leftover original-v2 `@media (max-width:900px)` block that forced the old 3-area grid (`topbar/sidebar/main`, no footer) and un-pinned early — it had been overriding the new layout and was the real "not responsive" cause. Also: restarted the stale dev server (branch-switch left it serving an old bundle), now bound to *:4200 (IPv4+IPv6, Safari fast). Revert: restore the horizontal `.ds-header`+`.ds-stepbar` layout (git diff), grid back to `"header stepper"/"header main"`.
Build: success. Not committed.

### Screen 2y — Fixed-size chrome + slim footer (verified live 1512px) · DONE 2026-07-02 (LOCAL)
Only the tab content should flex on zoom. Grid sidebar fixed `250px` (was clamp/20vw); `.ds-topbar2` padding fixed `10px 24px` (was clamp/vw); `.ds-footer` fixed `height:46px; padding:0 24px` (was min-height clamp 62–78 / vw padding) + `.ds-footer .btn` vertical padding 6px. main stays 1fr + internal scroll → zoom flexes content only. STARLABS toolbar already pinned 64px (app.component.css height/min/max !important + row override) — confirmed toolbarH=64. Verified live: gridCols "250px 1262px", footerH 46, toolbarH 64. Revert: grid cols back to clamp(230,20vw,300); topbar padding clamp; footer min-height var(--footer-h) + clamp padding, drop the .btn rule.
Build: success. Not committed.
