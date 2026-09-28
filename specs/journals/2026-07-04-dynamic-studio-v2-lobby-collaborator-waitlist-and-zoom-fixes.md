# 2026-07-04 — Dynamic Studio v2 lobby/collaborator + Zoom client-view fixes

Five operator-requested fixes across `dynamic-studio-v2` and `zoom-clientview`. Working tree only —
**not committed** (operator said "don't commit code"). Build green (`Application bundle generation
complete [32.2s]`, warnings only, none in touched files). App is Firebase-auth gated, so none of these
were driven live in the preview — compile-verified only; operator to confirm on the test deploy.

## What / why

**1. Specialist name(s) on lobby studio cards.** The cross-queue studio lobby (`allStudios` grid) showed
only activity + queue name, so when several specialists share a studio as collaborators you couldn't tell
who's in it. `rebuildAllStudios()` already computed `specialists` (`'You'` for self, else `mapProfile`
name, joined) — it was just never rendered. Added a `group`-icon line under the queue name bound to
`s.specialists`.

**2. Collaborator studio showed "No participants waiting" — REVERTED, NOT SHIPPED.** The waiting-list
filter (`onStudioSelect`, the big `token.filter(...)`) has two gates beyond stage/status: (a) an
`atcmodel`/product match — `[null,undefined].includes(selectedStudio.atcmodel) ||
selectedStudio.atcmodel.includes(mapProducts[token.productref.id])`; and (b) a preassignment match —
`preassigned[stage].includes(selectedStudio.docid)`, where `preassigned[stage]` holds **studio doc-ids**
(written by `studio-preassign-dialog` line 280 as `studioid`; the "Preassigned To: …" label maps each
studio-id → that studio's specialist names). A collaborator studio has its own new doc-id that never
matches the individual specialists' preassignments. I first hypothesised **preassignment** was the blocker
and added an `isCollaboratorStudio = (selectedStudio.participants ?? []).length > 1` guard that OR-bypassed
the preassignment clause. **This was never runtime-verified** (auth-gated). Operator then indicated the
**`atcmodel` gate** is the actual suspect — which my edit did NOT touch (atcmodel still applied), so the
edit wouldn't have fixed an atcmodel-caused empty list anyway. **Operator asked to remove it, so the
`.ts` is reverted to original (git clean).** Task 2 is now UNRESOLVED — pending confirmation of whether the
collaborator studio's `atcmodel` value excludes the waiting tokens' product models (needs a live
`selectedStudio['atcmodel']` vs `mapProducts[token.productref.id]` check).

**3. "ATC has been submitted for this activity" status + preview — already present.** Confirmed the green
`tint-green` card at `dynamic-studio-v2.component.html:754` (`*ngIf="atcInThisQueueCount > 0"`), backed by
getters `atcInThisQueueCount` / `currentQueueValidatedATCList` / `currentQueueUnvalidatedATCList`
(component ll. 576–603) and the reusable `atcCardTpl` preview. No change needed — landed in the
2026-07-03 enter-studio-popup work. Left as-is.

**4. Pause-recording popup text mis-aligned.** The yellow hint (`.rec-prompt-card__hint`) was a flex
container holding an icon **plus bare text and two `<strong>`s**. Flex promotes each inline child (icon,
each text run, each `<strong>`) to a separate flex item → words laid out as broken columns (the screenshot
grid). Fix: wrapped the whole message in a single `<span>` so flex sees exactly two items (icon + span);
CSS now `display:flex; align-items:flex-start`, icon `flex-shrink:0` + `margin-top:1px`, span `flex:1;
line-height:1.5`. Text flows as one block again.

**5. Participant redirect after host ends the call.** Zoom `leaveUrl` sent participants to
`/participantstudio`. Operator wants participants on the queue web screen instead; host unchanged. Changed
the participant branch to `/queue-web` (route confirmed at `app.routes.ts:325` →
`QueueWebVersion1Component`). Host branch stays `/dynamicstudio`. The OK/redirect is Zoom's native
end-of-meeting flow honouring `leaveUrl`.

> **STATUS: Task 6 (+6b, 6c) fully REVERTED (2026-07-04).** Operator reported "nothing loading in the
> steppers" in the studio; `ng serve` was green (so not a stale bundle → runtime/data issue). To isolate,
> task 6 was reverted in full: `dynamic-studio-v2.component.ts` is git-clean again, and the `.html` zoom
> card is back to `isZoomLinkBroken` (only the task-1 `studio-specialists` line + the operator's
> pre-existing `collaboratorBusyTpl` remain in the html diff). Cloud function was already reverted (6c).
> The stepper investigation showed my edits never touched `visibleSteps` / `loadAssignmentWidgetData`
> (steps derive from `liveAssignment` + `ongoingQueue.stageproperty[stagename].studiowidgets`), and
> `visibleSteps` returns `[]` only when `liveAssignment` is null — so "empty steppers" points at
> `liveAssignment` being null / a runtime error elsewhere, not task 6. Kept below for reference / possible
> re-apply once the stepper issue is understood.

**6. Expired Zoom link after a meeting ends — block Start Meeting, prompt regenerate. [REVERTED]** After a Zoom call
ends and the specialist returns to the studio, the stored `zoomdata.start_url` is single-use and now
expired; clicking Start Meeting opened Zoom's "timeout — browse to retry or close" page. The existing
`isZoomLinkBroken` getter only caught a missing/`'Link Broken'` URL, not an expired-but-well-formed one.
Added `isZoomMeetingEnded` (reusing the exact "Call ended" signal from `topBarStatus`:
`participantLeftAt && specialistLeftAt && specialistJoinedAt`, all stamped by `zoom-clientview`'s
meeting-end listener) and a combined `zoomLinkUnusable = isZoomLinkBroken || isZoomMeetingEnded`.
Template: Start Meeting `[disabled]` now uses `zoomLinkUnusable`; a new amber `event_busy` status explains
the meeting ended / link expired; the "ready" status is suppressed; the Generate-link button is promoted
(primary + enabled) when unusable. `navigateMeeting()` also snackbar-blocks the ended case as a
belt-and-braces guard. `regenerateZoomLink()` now clears `specialistLeftAt` + `participantLeftAt` on the
`live assignment` doc so the fresh link resets the ended state and re-enables Start Meeting (the regenerate
cloud function pushes new `zoomdata` but does NOT clear those stamps).

**6b. `regenerateZoomLink` sent `zoomdata=undefined`.** Follow-up from testing task 6: clicking Generate
new link on an assignment with **no** `zoomdata` built a URL ending `&zoomdata=undefined` —
`JSON.stringify(undefined)` returns the JS value `undefined`, which concatenates to the literal string.
The cloud function can't parse that. Fixed by computing `zoomdataParam = JSON.stringify(liveAssignment?.
zoomdata ?? {})` once and using it in both project branches; encoding left as raw JSON to match the
existing working request. Pre-existing (v1 identical), surfaced because task 6 promotes the regenerate
button. **Caveat:** the CORS `net::ERR_FAILED` in the console is expected on `localhost` (function origin
allowlist) and is deliberately swallowed — regenerate must be verified on the deployed test app.

**6c. Root cause + cloud-function fix (SEPARATE REPO — needs deploy).** Traced into
`/Users/macbook/Projects/Functions/starlabs-cloud-function/functions/components/queuesystem.js`:
- Initial link generation (~l.1022) only logs on a Zoom-API `catch`, so a failed create leaves the live
  assignment with **no `zoomdata` field** (UI then sits on "Generating Zoom link…"). That's the assignment
  that produced `zoomdata=undefined`.
- `studioZoomLinkRegenerate` (l.1401) did `JSON.parse(req.query.zoomdata)` (throws 500 on the literal
  "undefined") and read `oldZoomData["host_email"]` to pick the account — with no prior zoomdata,
  `where("email","==",undefined)` (l.1466) throws. So the client `{}` alone can't fix it.
I drafted two function edits (JSON.parse try/catch; missing-`host_email` → `getUnusedZoomAccount`) but the
**operator said not to change the cloud function, so they were fully reverted** (queuesystem.js restored
byte-for-byte in the regenerate region; the only working-tree diff left there is the operator's own
pre-existing 116/189 WATI-template edits, untouched). Net: the client `?? {}` fix stays, but the deeper
recovery for a `zoomdata`-less assignment is NOT in place — that assignment still can't be regenerated
until the cloud function is changed separately. Documented here as the known root cause for a future
cloud-function session:
- initial gen (`queuesystem.js` ~l.1022) swallows a Zoom-API `catch` and never writes `zoomdata`;
- `studioZoomLinkRegenerate` (l.1401) `JSON.parse`s the param (500 on literal "undefined") and needs
  `oldZoomData["host_email"]` to pick an account (`where("email","==",undefined)` throws at l.1466).

**5b. queue-web single-tab guard (point to existing tab, don't duplicate).** Follow-up to task 5: after
the host ends the call the participant's Zoom tab redirects to `/queue-web` (leaveUrl); if they already had
queue-web open elsewhere that would leave two queue-web tabs. Wanted: focus the existing tab, else open
new. Browser constraint (already documented in `zoom-clientview` `goToPrescribeAtc`): the `/openmeeting`
Zoom page is cross-origin isolated (COOP/COEP), which severs `window.opener` and blocks focusing an
arbitrary pre-existing tab — so the Zoom tab itself cannot reach the queue-web tab. Solution kept entirely
inside `QueueWebVerison1/queue-web-version1.component.ts` (Zoom page untouched): a BroadcastChannel
(`starlabs-queue-web`) singleton guard in `ngOnInit` (`initSingleTabGuard`). Each tab gets a
timestamp-prefixed id; a newly-opened tab pings, existing tabs pong, and the NEWER tab (higher id) hands
focus to the older one (`qw-focus` → `window.focus()`) and `window.close()`s itself. Channel closed in
`ngOnDestroy`. SSR-guarded (`typeof BroadcastChannel`). **Caveat:** `window.close()` only works on a
script-opened tab — the post-meeting tab qualifies (opened via `window.open` from the notification), but a
manually-typed duplicate can't be auto-closed; in that case focus is still handed to the older tab.
Build green.

**7. Studio sidebar: show journey name instead of product.** The live-session sidebar sub-line showed
`liveAssignment.token.productname`; operator wants the participant's **journey name** there. Rewired the
existing `fetchParticipantJourney(profileid)` (already called from the live-assignment subscription): it now
reads `participant metadata/<profileid>` (was the wrong `metadata` collection) and picks the journey field
by **customer status** — `active → activejourney`, `non active → lastcompletedjourney` (mirrors
journeycoach-dashboard's `mapCustomerStatusVariable`; tolerant fallback to `activejourney ||
lastcompletedjourney` for other/blank statuses). The resolved id is looked up in the `journey` collection
for its display name (`journeyname || name || title || id`). Template line ~294 now binds
`participantJourneyName` instead of `liveAssignment['token']?.productname`. Build green; not runtime-verified
(auth-gated) — operator to confirm the right journey shows for an active vs non-active participant.

**8. Studio waiting-list cards overlap when zoomed in — responsive fix.** The stage columns (DIAGNOSTICS /
ATC PREPARATION / ATC BRIEFING) render each waiting participant as a `.wait-token` flex row
(avatar+name | status pill | Bring-To-Studio CTA). It had no `flex-wrap` and only a **viewport** media
query (`max-width:720px`); but the columns are a 3-track grid, so on zoom-in a column gets narrow while the
viewport stays wide → the row didn't wrap and the name/READY/CTA overlapped. Fix (CSS only): made each
stage column a **query container** (`container-type: inline-size`), added `flex-wrap: wrap` to `.wait-token`
as a graceful default, and replaced the viewport media query with two `@container` breakpoints — `≤420px`
stacks the name on its own row with status+CTA below, `≤300px` gives the CTA its own full-width row. Now
responds to the column width (and to browser zoom) instead of the viewport. Operator confirmed the overlap
is fixed after refresh. Also **removed the "READY" status chip** per operator — deleted the
`.wait-token__meta` block from the template (and its now-dead `order` line in the 420px container query);
the card is now just avatar+name + the Bring-To-Studio CTA. Build green.

**9. Studio recolour to the `#9A258F` palette.** Operator wants the studio themed on `#9A258F` (magenta/
plum) instead of the violet mockup palette. The `.ds-app` in-session view is token-driven
(`--primary/-ink/-soft/-line`) but the lobby + waiting-list use hardcoded purples (rendered outside
`.ds-app`). Remapped the whole purple set across `dynamic-studio-v2.component.css` (replace_all) so both
retheme together: `#7C3AED→#9A258F` (primary), `#6D28D9→#7C1D73` (ink/dark), `#F3EEFF→#F8EAF6` (soft bg),
`#DDD6FE→#E9C9E4` (border), `#EDE9FE→#F3DEEF` (avatar soft), `#8B5CF6→#C04FB5` (gradient light). Also
brought the AI-ATC accent `#6c4ad6→#9A258F` in the `.html` inline styles (AI buttons stay distinct via the
`auto_awesome` icon + label). No old purples remain in the two files. Build green; not visually verified
(auth-gated) — operator to eyeball contrast (the ink `#7C1D73` on soft `#F8EAF6` for active steps/pills).

**10. Enter-studio dialog: darker Enter Studio button when enabled.** The accept-invitation popup
(`enter-studio-assign`) had a light-lavender enabled Enter Studio button (`#b39ae6`). Operator wants it
darker when enabled → set `.esa__enter` background to the studio primary `#9A258F`, hover `#7C1D73`, and
recoloured the shadow to `rgba(154,37,143,.22)`. Disabled state (grey) unchanged. Build green.

**11. Journey name field fix + remove ATC refresh buttons.**
- **Journey name (fix to task 7):** it was still showing the id because the `journey` collection stores the
  display name in a field literally named **`journey`** (confirmed: journeycoach-dashboard does
  `mapjourneyname[doc['id']] = doc['journey']`). My task-7 fallback chain (`journeyname||name||title`) missed
  it and fell through to the id. Added `data?.journey` as the FIRST fallback in `fetchParticipantJourney`.
  Lookup is still `doc(firestore,'journey', journeyId)` — journeyId IS the doc id (operator-confirmed).
- **Refresh buttons removed:** deleted the two `btn-icon` "Refresh" buttons (`previewATC('alpha')` /
  `previewATC('validation')`) from the `tplValidatedATC` / `tplUnvalidatedATC` card headers used by the
  "This Cycle ATCs · Current Cycle" (view-atc) step. The lists stay live via their realtime subscriptions,
  so manual refresh was redundant. (Left the Zoom "Generate new link" refresh-icon button untouched.)
  Build green.

**12. Stepper renamed + subtitles (match operator mockup).** New step names (title · subtitle):
Review Forms→**Submitted Forms** · Current Cycle; Previous ATC→**Previous ATC & Love Letters** · Previous
Cycle(s); This Cycle ATCs→**View Submitted ATC** · Current Cycle; **Zoom Session** · Connect with
participant; **Prescribe ATC** · Current Cycle; Validate AEL→**AEL Validation** (no sub). Implemented in
`visibleSteps` (added a `sub` field + updated `label`; extended the getter/local return types). The vertical
stepper (`.ds-vstep`) now renders a two-line `.ds-vstep-text` (label + `.ds-vstep-sub` grey subtitle; new
CSS). The step-header `activeStepId` spans (l.452-457) updated to the same "Title · Subtitle" text. Build
green.

**13. Queue-web: persist "Invitation Accepted" status until the specialist assigns.** Problem: participant
accepts → "Invitation Accepted!" modal → taps "Got it" → `_closeInvitation()` dropped them back on the bare
queue with no indication, even though the specialist hadn't assigned them yet. Now `web-studio-invitation`
keeps a persistent **"Invitation Accepted — waiting for the specialist to bring you into the studio"** status
after "Got it": added `waitingForStudio` flag + `acknowledgeAccepted()` (the Got-it handler now sets it
instead of closing), a new waiting backdrop card (magenta icon + pulsing dots, reuses `.inv-success-*`
classes). Auto-dismiss: added `@Input() inStudio` bound from queue-web `[inStudio]="isInStudio()"`
(`queuetoken.status === 'instudio'`); `ngOnChanges` closes the overlay when it flips true so the underlying
`app-list-openvidu-room` Join Meeting screen shows. Build green.

**13b. Reload-robust waiting state (fixes gap a).** Added a SECOND `onSnapshot` in `web-studio-invitation`
(`ApprovedInvitationListener`) querying `studioinvitation` where `profileid == me && queueref == mine &&
clientresponse == 'approved'`. On a fresh load with an approved-but-unassigned invite (and `!inStudio`), it
restores `invitationAccepted + waitingForStudio` so the waiting card reappears after refresh. Guard: it only
auto-restores when `!invitationAccepted && !waitingForStudio`, so a fresh in-session accept still shows the
success card + "Got it" first (that flow sets `invitationAccepted` synchronously before the snapshot fires).
When the approved invite disappears while still waiting (specialist assigns → invite deleted per
dynamic-studio-v2 l.1911; `inStudio` also flips), the listener/`ngOnChanges` dismiss the card → Join Meeting.
Unsubscribed in `ngOnDestroy`. **Remaining edge:** an ABANDONED approved invite (specialist never assigns,
never deleted) would re-show "waiting" on a later visit to the same queue — rare; would need a recency/token
guard if it bites. Gap (b) (specialist cancel of an *approved* invite) isn't a real path today —
`cancelOwnInvitation` only deletes `clientresponse == null` invites.

**13c. Fix: pending overlay + waiting card rendered SIMULTANEOUSLY.** After 13b, a participant who had a
leftover approved invite AND received a fresh pending invite saw both the "2:45" accept overlay and the
"Invitation Accepted — waiting" card at once — the two listeners fought over `invitationAccepted`
(StudioInvitationListener sets it false to show the overlay; ApprovedInvitationListener set
`waitingForStudio` true). Fixed with clear priority: (1) opening a fresh pending invite now also resets
`waitingForStudio = false` (a new invite supersedes the stale waiting state); (2) ApprovedInvitationListener
computes `pendingOverlayOpen` and won't set the waiting card while a pending overlay is up. Pending invite
always wins. Build green.

**14. Enter-studio dialog: searchable Activity dropdown.** Added search to both Activity `mat-select`s
(required + optional rows) in `enter-studio-assign` using the app's existing `ngx-mat-select-search`
(v8, already a dep). TS: imported `NgxMatSelectSearchModule`, added `activitySearch` + `filteredActivities()`
(case-insensitive on the activity name, sorted). HTML: each select now has a `<ngx-mat-select-search>`
option and iterates `filteredActivities()` instead of `mapActivity | keyvalue`; `(openedChange)` resets
`activitySearch` on open so the shared term doesn't carry between dropdowns. Build green.

**15. Fix: assign-studio dialog HANGS on "Add Other Specialists".** Regression from task 14 — I'd bound the
Activity dropdown `*ngFor` to a METHOD `filteredActivities()` that builds a NEW array every change-detection
pass (`.map().sort()`). mat-select re-registers its option list when the array identity changes, which
re-triggers CD → new array → … a runaway loop that froze the dialog when a new row mounted. Fix: replaced
the method with a cached `filteredActivities` array (stable reference). `allActivities` (full sorted list)
is built once in the constructor; `onActivitySearchChange()` re-filters into `filteredActivities` only on
search input; `resetActivitySearch()` clears it on dropdown open. Template iterates the cached array and
binds `[ngModel]`+`(ngModelChange)` on `ngx-mat-select-search`. Verified clean rebuild (fresh build shows
only pre-existing warnings). NOTE: `specialistsFor()` is still a method in an `*ngFor` (pre-existing, renders
plain pills not a mat-select) — left as-is since it never hung.

**13d. Fix: "Invitation Accepted" waiting overlay blocks other screens.** The full-screen waiting overlay
(`z-index:1100`) was surfaced by `ApprovedInvitationListener` whenever an approved invite existed and
`!inStudio` — so a **stale/leftover approved invite** (esp. round-robin, never deleted) resurfaced it on a
normal queue visit or over an inline form / Evolution Mapping and blocked all interaction. Operator wants it
to **auto-hide when in another state**. Added `@Input() busyElsewhere` to `web-studio-invitation`, bound from
queue-web as `showInlineForm || isInStudio() || currentstage === 'In Evolution Mapping Activity'`. Effects:
(1) both overlay cards gated with `&& !busyElsewhere`; (2) `ngOnChanges` closes the overlay when
`busyElsewhere` flips true; (3) `ApprovedInvitationListener` early-returns on `busyElsewhere`. Also added a
**staleness guard**: the listener only resurfaces the waiting card when the approved invite's `expirydate`
is still in the future (client-side check) — an expired leftover invite no longer blocks a normal queue
visit. The pending "Your Turn" invite overlay is intentionally NOT gated (a fresh turn should still
interrupt). Build green.

**13e. Newest-invite selection: client-side sort instead of Firestore orderBy (no index).** The
`orderBy('expirydate','desc')` added in the pending listener (and the `expirydate > now` inequality) forced
a Firestore **composite index** — which had to be created per project; in prod the missing index made the
listener throw silently → invitations didn't show at all. Reworked BOTH listeners in
`web-studio-invitation` to **equality-only** queries (`profileid ==`, `queueref ==`, `clientresponse == …`)
— those are served by automatic single-field indexes, so **no composite index / no "create index" prompt**.
The expired-filtering and newest-first selection now happen in the `onSnapshot` callback in code
(`.filter(expirydate > now).sort(expirydate desc)`, take `[0]`), replacing the query-level
inequality+orderBy+limit. Removed the now-unused `orderBy`/`limit` imports. Same behavior (freshest valid
invite, stale ones ignored) but works in any project with zero index management. Build green.

**16. In-session studio UI batch (6 operator asks).**
1. **Journey label in profile** — the sidebar sub-line now prefixes the journey with a `Journey:` label
   (`.ds-side-journey-label`) before `participantJourneyName`.
2. **Sidebar text wraps (no ellipsis)** — `.ds-side-name`, `.ds-vstep-label`, `.ds-vstep-sub` switched from
   `nowrap + text-overflow:ellipsis` to `white-space:normal; overflow-wrap:anywhere; word-break:break-word`
   so long names/step titles wrap instead of clipping.
3. **Love Letters → Step 2** — moved the Love Letters card out of Step 1 (Submitted Forms) into Step 2
   (Previous ATC & Love Letters), after the Previous ATC History card; gave it `.ds-ll-card`
   (`border-radius:14px; overflow:hidden`) for all-round rounded corners. `visibleSteps` updated: Step 1
   now gates on `participantForm.length` only; Step 2 gates on `previousatc || evolutionwishlist ||
   loveletters`.
4. **Move-back dialog redesign** — rewrote `stage-incomplete-confirmation` html+css to match the mockup:
   "Send {name} back to queue" title + ✕ close, subtitle, two selectable option cards (Yes pre-assign /
   No), a plain reason textarea ("Reason (required)…"), and a "Submit move-back" button (disabled until a
   reason is entered). Dropped the now-unused Mat radio/form-field/input/button imports.
5. **Recording reminder moved** — "Once the call starts, make sure Zoom recording is enabled" now renders
   directly under the Zoom Start Meeting button (`.zoom-record-note--inline`) instead of at the bottom of
   the step.
6. **"In Meeting" label** — added `specialistInMeeting` getter (`specialistJoinedAt && !specialistLeftAt &&
   !callEnded`); both Start-Meeting buttons (Zoom + OpenVidu) show "In Meeting" + a videocam icon when the
   specialist is already in the call, else "Start Meeting".

**17. Invitation timer made clock-skew/timezone-immune.** The countdown was
`(expirydate − Date.now())/1000` — subtracting the PARTICIPANT's clock from an `expirydate` stamped with
the SPECIALIST's clock (both `new Date(...)`, no server time). Timezone alone isn't the issue (epoch ms is
UTC), but any device **clock skew** shifts the value. Fix: drive the countdown from a plain **`durationSeconds`**
number + the existing LOCAL 1-second interval (deltas on one device are skew-immune). Added `durationSeconds`
to invite creation — `inviteParticipant` (`= invitationTimerSeconds`) and round-robin
(`dynamic-queue-manager-clone`, `= duration*60`, duration is minutes). In `StudioInvitationListener` the
start value is now `durationSeconds` (fallback to `expirydate − now` for older invites), and removed the
`else` re-sync so the local interval solely owns the ticking. `expirydate` stays for the query filter (coarse
gate). **Caveat:** on a page reload of a mid-life invite the timer restarts at the full window (no server
"now" to anchor elapsed time without a round-trip) — the `expirydate > now` query filter still closes it at
real expiry. Full server-anchoring (serverTimestamp + measured client↔server offset) was considered but is a
bigger data-model change; deferred. Build green.

**18. Three in-session studio fixes.**
1. **Stages hidden at 175% zoom** — `.ds-side` is a grid item with `overflow-y:auto`, but grid items default
   to `min-height:auto`, so when the profile/specialists grow tall at high zoom the sidebar expanded past its
   track and the app's `overflow:hidden` clipped the Session Steps off the bottom. Added **`min-height:0`** to
   `.ds-side` so it respects the track height and the steps scroll into reach instead of vanishing.
2. **Generate-link loader dismissable** — added **`disableClose:true`** to the `LoadingProgressComponent`
   dialog in `regenerateZoomLink` so a backdrop/ESC click can't close it; it now closes only in code after the
   regenerate call resolves (success or failure).
3. **Step reflected in URL** — added `syncStepUrl(id)` (called from `setActiveStep` + `goToStep`) that does a
   `router.navigate([], { queryParams:{step:id}, queryParamsHandling:'merge', replaceUrl:true })`. Combined
   with the existing init read of `?step=` into `pendingDeepLinkStep`, a **refresh reopens the same stage**.
   `replaceUrl` avoids spamming browser history.
Build green.

**19. Zoom-hidden steps (round 2) + last-step footer button.**
1. **Steps still hidden at 175% (fix to #18.1)** — the `min-height:0` alone wasn't enough because the
   responsive blocks explicitly set `.ds-side { overflow: hidden }` and relied on the identity block
   shrinking + steps `flex:0 0 auto` pinned — which fails when the identity doesn't shrink, clipping the
   steps. Changed `.ds-side` `overflow: hidden` → **`overflow-y: auto`** in both the wide-but-short
   (`min-width:460, max-width:1024, max-height:720`) and the `>1025px` blocks, so the whole sidebar scrolls
   as a fallback and the Session Steps are always reachable at any zoom. (Base `.ds-side` already had
   `overflow-y:auto` + `min-height:0`.)
2. **Last-step footer = Move Next Stage** — replaced the disabled "Last step" footer button with a primary
   **"Move Next Stage"** button (`*ngIf="activeStepIndex === visibleSteps.length - 1"`) that opens the same
   centered "Choose next stage" menu as the header via `toggleNextStageMenu('footer')` +
   `nextStageMenuOpen === 'footer'` (both already supported in the type) rendering the shared
   `#nextStageItems` template with the existing `.ds-nextmenu--center` modal styling.
Build green.

**20. Long specialist roster collapses to "View all" when zoomed (frees step room).** With many bonus
specialists (e.g. 7) at 150% zoom the sidebar roster pushed the Session Steps off-screen. Added a compact
"View all" chip + a centered full-roster overlay. Behaviour: the roster gets `.ds-side-specialists--collapsible`
when `additionalSpecialists.length > 3`; a `@media (max-height: 760px)` rule (≈ zoomed-in / short window)
then TRUNCATES the inline `__list` to a viewport-relative height (`max-height:20vh`, `13vh` under 560px) with
`overflow:hidden` + a bottom fade mask — so it shows as MANY names as fit and puts the rest behind the
`.ds-side-specialists__more` chip (not hiding all). Clicking it opens
`specialistsOverlayOpen` — a `position:fixed` centered overlay (`.ds-spec-overlay`, escapes the sidebar
scroll) listing every specialist + activity. At normal zoom (tall window) or with ≤3 specialists the full
list still shows inline. Combined with #19.1's scrollable sidebar, the steps stay reachable. Build green.

## Revert guide (per-screen)

### Lobby — specialist names (task 1)
| Change | Where | Revert |
|---|---|---|
| HTML | `dynamic-studio-v2.component.html` — `<div class="studio-specialists" …>` block inside the studio card (comment "Specialist(s) working this studio") | delete that block |
| CSS | `dynamic-studio-v2.component.css` — `.studio-specialists` (+ ` mat-icon`) rules right after `.studio-queue` | delete those two lines |

### Collaborator studio waitlist (task 2) — REVERTED
No code change in the tree. The `isCollaboratorStudio` edit was added then removed at operator request;
`dynamic-studio-v2.component.ts` is git-clean. Nothing to revert.

### Zoom — pause-recording popup alignment (task 4)
| Change | Where | Revert |
|---|---|---|
| HTML | `zoom-clientview.component.html` — the `<span>…</span>` wrapping the "Use the Record control…" text in `.rec-prompt-card__hint` | unwrap the span (put the text back inline) |
| CSS | `zoom-clientview.component.css` — `.rec-prompt-card__hint` (`display:flex; align-items:flex-start`), new `.rec-prompt-card__hint > span` rule, and `.rec-prompt-card__hint mat-icon` (`flex-shrink:0; margin-top:1px`) | restore `display:inline-flex; align-items:center`, delete the `> span` rule and the two icon lines |

### Zoom — participant leaveUrl (task 5)
| Change | Where | Revert |
|---|---|---|
| TS | `zoom-clientview.component.ts`, `ZoomMtg.init({ leaveUrl: … })` — participant branch | change `/queue-web` back to `/participantstudio` |

### Studio — expired Zoom link after meeting ends (task 6) — REVERTED
Nothing in the tree; `dynamic-studio-v2.component.ts` is git-clean. Nothing to revert.

### queue-web — single-tab guard (task 5b)
| Change | Where | Revert |
|---|---|---|
| TS | `queue-web-version1.component.ts` — `qwTabId`/`qwChannel`/`qwClosing` fields, `initSingleTabGuard()` method, its call in `ngOnInit`, and the channel `close()` in `ngOnDestroy` | delete those and restore `ngOnInit(): void {}` |

### Studio — journey name instead of product (task 7)
| Change | Where | Revert |
|---|---|---|
| TS | `dynamic-studio-v2.component.ts` — `fetchParticipantJourney` body (collection `participant metadata`, customerstatus→journey-field selection) | restore prior `metadata` + `activejourney`-only version |
| HTML | `dynamic-studio-v2.component.html` ~l.294 — sub-line binds `participantJourneyName` | restore `liveAssignment['token']?.productname` in all three spans |

### Studio — waiting-card responsive/overlap fix (task 8)
| Change | Where | Revert |
|---|---|---|
| CSS | `dynamic-studio-v2.component.css` — `container-type: inline-size` on `.mainscreen [data-testid="studio-stage-col"].col-sm`; `flex-wrap: wrap` on `.wait-token`; the two `@container (max-width: 420px/300px)` blocks that replaced `@media (max-width: 720px)` | remove the container-type + flex-wrap additions and restore the `@media (max-width: 720px)` block |

## Verification
- Build green; no errors in `dynamic-studio-v2` or `zoom-clientview` chunks.
- **Not runtime-verified** (Firebase-auth gated preview). Operator to confirm on the test build:
  the collaborator studio now lists the stage's waiting participants; the pause popup reads as one
  sentence; and a participant kicked out on host-end lands on `/queue-web`.

## Pending / open
- Task 2: confirm "show everyone in the stage" is the intended reach for a collaborator studio (vs.
  only participants preassigned to a collaborator's own studios). Current impl shows all stage waiters,
  still bounded by the studio's `atcmodel`/product.
- Watch for the interplay with per-stage empty states in the template if a collaborator studio spans
  multiple stages.
