# 2026-07-02 · Planning-tab "Event confirmation" matrix restructure

## What / where

Route `eventopportunitydashboard` → `EventOpportunityDashboardComponent`, whose **Planning tab** hosts `app-planning-tab`. Restructured the per-phase readiness matrix (`table.pmx`) to match the operator's mockup. This is step 1 — operator will supply the data-logic ("other architectures") next; this pass is the **table shape** only, wired onto the existing compute where it maps cleanly.

Screen: **Planning tab** (`src/app/queue system/event-opportunity-dashboard/planning-tab/`).

## Changes (rows / columns / headers)

- **Column sub-labels** renamed to mockup: `Non-Active → Non Active`, `Discont → Added/Lefted` (both Confirmed and Not-Confirmed groups). Underlying `Col` keys (`c_a/c_na/c_d/n_a/n_na/n_d`) and the status bucketing (`active/discontinued/other`) are unchanged — only the display labels moved.
- **Group header** `Not confirmed → Not Confirmed`; added an `Event confirmation` super-header over the label column and a `Categories` sub-header (was two empty rowspan cells).
- **Rows (`rowDefs`)** replaced the old 4 with the mockup's 5 Categories, in order:
  `Not Completed` (notComplete/stage), `Slot Confirmed` (slotConfirmed/slot), `Confir. rate` (confRate/**rate**), `Not Confirmed` (slotNotConfirmed/slot), `Completed` (complete/stage).
- **New `'rate'` row kind.** `Confir. rate` is derived per column = `Slot Confirmed ÷ Not Completed × 100` (0 when denominator 0). Matches the mockup numbers (150→50 = 33%, 50→10 = 20%). Rate rows: no stage-config `mat-select`, not zero-dimmed, **not drillable** (`selectCell` early-returns on `kind==='rate'`; also skipped in `rebuildMatrix`'s holder loop).
- **Total column removed** from display (mockup has none). `completeLine.cells.total` is still computed internally and still drives the phase ring `pct`.
- **Header line added**: `Pending (Potential) - {{ potentialTotal }}` under the phase title (`.grp-pending`).

## Why these were safe

- The Confirmed/Not-Confirmed × 3-bucket column model already existed; only labels + the Total column changed, so drill-down, filters, and cell selection keep working for the count rows.
- `Confir. rate` reuses the two count rows already computed in the same pass — no new Firestore reads.
- Build: `ng build --configuration development` compiles clean (only pre-existing unrelated CSS/unused-import warnings).

## Open / pending

- Operator to define the real data architecture for the 5 categories (esp. whether `Confir. rate` should be `SlotConfirmed/NotCompleted` or something else, and what `Added/Lefted` should count vs. the current `discontinued` bucket).
- Not verified in a live browser (app is Firebase-auth gated; the tab needs a selected event+queue with live Firestore data). Compile-verified only.

## Follow-up (same session)

- Operator confirmed data wiring: **Added/Lefted** stays on the `discontinued` bucket; **Confir. rate** stays `Slot Confirmed ÷ Not Completed`. No code change for either.
- **Inactive tokens excluded.** `tokensForQueue()` now drops any `queue_token` with `tokenstatus === 'inActive'` (case-insensitive compare; missing status is kept). This is the single chokepoint feeding `queueHolderIds` → cards + every matrix count + drill-downs + slot/product lookups, so all planning numbers now ignore inactive tokens. Mirrors the `where("tokenstatus","==","Active")` filter used in `event-opportunity/event-opportunity.component.ts`. Revert: restore the one-line filter to `t?.['queueref']?.id === queueId`.

## Follow-up 2 — phases moved to their own collection

- Planning-tab **phases now live in a new dedicated collection `planning_phases`** (was the shared `stage opportunity count`). All 7 phase read/writes in `planning-tab.component.ts` (loadPhases query, setRowStages, submitPhase create+update, deletePhase, onPhaseDrop reorder) point at `planning_phases`.
- **Old data left as-is:** the `stage opportunity count` collection is untouched — its custom-stage-count docs (`kind !== 'phase'`, used by the parent dashboard stage panel) and any pre-existing phase docs stay there. Consequence: previously-created phases will NOT appear in the tab anymore (they're in the old collection); this was the operator's explicit choice. No migration performed.
- `kind: 'phase'` is still written and still filtered on read (harmless now that the collection is phase-only; kept for safety).
- Firestore rules: `firestore.rules` is a catch-all `match /{document=**} { allow read, write: if true; }`, so the new collection needs no rule change.
- Revert: `git checkout <pre> -- planning-tab.component.ts` (or replace `'planning_phases'` back to `'stage opportunity count'`).

## Follow-up 3 — Board/Planning tabs keep-alive (no reload on switch)

- **Problem:** Board and Planning were toggled with `*ngIf`, so every tab switch destroyed + recreated the active component — refetch, spinner, lost internal state (selected event, drill state, loaded phases). Queue selection itself never lost (it's parent-owned `selectedQueueList`), but the child screens reloaded.
- **Fix (dashboard shell — `event-opportunity-dashboard`):**
  - `event-opportunity-dashboard.component.html`: board wrapper `<ng-container *ngIf="activeTab === 'board'">…</ng-container>` → `<div [hidden]="activeTab !== 'board'">…</div>`; `<app-planning-tab *ngIf="activeTab === 'planning'">` → `[hidden]="activeTab !== 'planning'"`. Both stay mounted; switching only flips visibility.
  - `event-opportunity-dashboard.component.ts`: `setActiveTab()` no longer bumps `planningRefreshKey`. Planning stays fresh via its own `ngOnChanges` (queueTokens/completion/queue-selection), not tab switches.
- **Trade-off:** planning-tab now initializes at dashboard load and recomputes in the background on live data updates even while hidden (cheap when no queue selected). Acceptable — kills the reload the operator complained about.
- **Pending (operator will discuss):** an explicit "save phases" option + whether phases stay one-doc-per-phase (current) or move to a single all-phases doc. No change made yet.

Revert (this sub-change): in `event-opportunity-dashboard.component.html` restore the two `*ngIf="activeTab === …"` toggles (board back to `<ng-container>`), and in `.ts` re-add `if (tab === 'planning') this.planningRefreshKey++;` to `setActiveTab`.

## Follow-up 4 — separate in-Planning queue filter (no reload, no Board coupling)

- **Goal (operator):** keep the Board + the top "Select queue" at the top; give Planning its OWN queue filter used separately; moving to Planning must not reload — show what's already loaded.
- **Key architecture fact:** the top "Select queue" (`selectedQueueList`) drives the `<app-event-opportunity>` loop that LOADS all the data (mapData/tokens/completion). So a Planning filter can only be a **subset of already-loaded queues** — anything else would force a refetch (the opposite of what was asked).
- **planning-tab.component.ts:**
  - New local `filterQueues: string[]` + `get scope()` (= `filterQueues ∩ selectedQueueList`, empty ⇒ all loaded). Defaults to all loaded queues on init and whenever `selectedQueueList` changes.
  - View-compute now reads `scope` instead of `selectedQueueList`: `queueHolderIds`, `rebuildMatrix` stage filter, `cellIds`, `participantQueueStage`, `computeCellDrill`. **Persistence/config stays on `selectedQueueList`** (phase load/query, stageOptions, saved `queuelist`) — phases belong to the full queue-set; the filter is a view narrowing only.
  - Removed the old `@Output() queueChange` / `queueModel` / `onQueueChange` (which pushed the selection UP to the parent and reloaded + moved the Board). Replaced with `onFilterQueuesChange()` → `recomputeView()`.
  - New `recomputeView()` = computeCards + rebuildMatrix + refreshDrill + refreshCellDrill with **no Firestore fetch** (`recompute()` now delegates to it after the one status load). Filtering is instant, no reload.
- **event-opportunity-dashboard.component.html:** removed the `(queueChange)="onPlanningQueueChange($event)"` binding. (Parent method `onPlanningQueueChange` is now dead but left in place; harmless.)
- **planning-tab.component.html:** added the `Queues (planning filter)` mat-select (multi) in `.pl-filters`, bound to `filterQueues` via `onFilterQueuesChange`, options = `queueFilterOptions` (the loaded queues).
- Net behavior: top picker loads data + drives Board; Planning's filter narrows only Planning off the in-memory data; tab switches never reload (also see Follow-up 3 `[hidden]` keep-alive).

Revert: restore `@Output() queueChange`/`queueModel`/`onQueueChange` and the parent binding; revert the `scope`→`selectedQueueList` swaps in the 5 view-compute methods; remove the planning-filter mat-select. (Or `git checkout <pre>` the three files.)

## Follow-up 5 — Board/Planning toggle moved to top

- `event-opportunity-dashboard.component.html`: moved the `.planning-tabs` toggle from below the header/queue-picker/data-loaders to be the **first child of `.content-area`** (above the "Arena Opportunities" title). Pure markup move — no logic change; `setActiveTab` bindings unchanged.
- Revert: move the `.planning-tabs` block back to its prior position (between the `<app-event-opportunity>` `</ng-container>` loop and the `<div [hidden]="activeTab !== 'board'">` board wrapper).

## Follow-up 6 — Saved Filters system (phases→in-memory, named snapshots, apply/dirty/diff)

Operator goal: screen name at top; select queue+event then create phases; after creating, a floating widget offers "Save as filter" (asks a title); saved filters show at top; selecting one auto-patches the data (no reload); changing anything after applying re-shows the save widget; on save show a diff of what changed vs previous.

- **Screen name at top** (`event-opportunity-dashboard.component.html`): "Arena Opportunities" heading moved back above the Board/Planning toggle.
- **Filter model** = a named bundle `{ title, queueIds, eventIds, phases[] }` in a NEW collection **`planning_filters`** (phases embedded as a self-contained snapshot — this is the "same doc" answer to the earlier open question). Old `planning_phases` collection is now unused (left as-is).
- **Phases are now in-memory** (`planning-tab.component.ts`): `submitPhase`/`editPhase`/`deletePhase`/`onPhaseDrop`/`setRowStages` mutate the local `planningPhases` array + `rebuildMatrix()` — NO per-op Firestore writes, NO live `planning_phases` subscription. `loadPhases()` deleted; `ngOnInit`/`ngOnChanges` now call `loadStageOptions()` + `loadFilters()` and never wipe phases on queue changes.
- **Apply** (`applyFilter`): sets `activeFilterId`, restores `selectedEventIds`/`filterQueues`/`planningPhases` (cloned), emits `@Output() patchQueues` → parent `onPlanningQueueChange` loads that queue set's data; `loadEventSets()`+`recompute()`. No full reload (tokens arrive async → ngOnChanges recompute).
- **Dirty detection**: `get isDirty` compares a stable `currentSignature()` (queues+events+phases) to the applied filter's `filterSignature()`. No active filter + phases>0 ⇒ dirty (unsaved new work).
- **Floating widget** (`.pl-savefab`): compact pill when dirty ("Save as filter" / "Unsaved changes"); expands (`openSaveWidget`) to a card showing `pendingChanges` (human diff from `computeChanges`), a required **Filter title** input, and Save/Create. `saveFilter()` creates or updates the `planning_filters` doc.
- **Saved-filters bar** (`.pl-savedbar`) at top of the Planning tab: chips for each saved filter (active highlighted), click to apply, ✕ to delete.
- Parent wiring: removed nothing else; re-added a single restore-only `(patchQueues)` binding (the earlier `queueChange` decoupling stays intact for normal editing).
- Firestore rules: catch-all covers `planning_filters` — no rule change.
- Compile-verified (`ng build` clean). NOT browser-verified (auth-gated). Files: `planning-tab.component.{ts,html,css}`, `event-opportunity-dashboard.component.html`.

**Open/likely follow-ups:** event picker still lives inside Planning (not at the very top next to the queue picker) — operator said "select queue and event"; may want event moved up. Reorder-of-phases isn't persisted until you save the filter (by design now).

Revert: `git checkout <pre> -- planning-tab.component.ts planning-tab.component.html planning-tab.component.css event-opportunity-dashboard.component.html` (restores Firestore-backed `planning_phases` phases, removes the filter system, and the pre-existing header order).

## Follow-up 7 — FIX: queue-select hang (recompute storm from always-mounted Planning)

- **Regression** introduced by Follow-up 3's `[hidden]` keep-alive: Planning is now always mounted, so its `ngOnChanges` fired `recompute()` — which does an async Firestore `loadCustomerStatus` fetch — on EVERY `queueTokens` / `allCompletedStageCount` input change. Selecting a queue makes the `<app-event-opportunity>` loop emit in bursts (each `handleEventData` rebuilds `allCompletedStageCount`; `fetchQueueTokens` re-emits), so Planning fired a storm of Firestore reads + recomputes even while the user was on the Board → UI freeze.
- **Fix (`planning-tab.component.ts` + dashboard html):**
  - New `@Input() active` (dashboard passes `[active]="activeTab === 'planning'"`).
  - Recompute now goes through `requestRecompute()`: if `!active` it just sets `pendingRecompute` (no work); if active it debounces 200ms to coalesce bursts. `runRecompute()` clears the flag/timer and calls `recompute()`.
  - Becoming active (`becameActive`) runs any deferred recompute once. Timer cleared in `ngOnDestroy`.
  - `onFilterQueuesChange` still uses the synchronous fetch-free `recomputeView()`, so the local filter stays instant.
- Net: selecting queues on the Board no longer touches Planning's compute; opening Planning computes once from already-loaded data; editing while on Planning coalesces bursts. No hang.
- Compile-verified.

## Follow-up 8 — dropdown scroll-jump on queue select

- Symptom: clicking a queue option scrolled the screen. Cause: Angular Material `mat-select` (multiple, stays open) re-centers the selected option under the trigger on every selection change → panel/page scroll.
- Fix: added `disableOptionCentering` to all `eod-ios-pane` multi-selects — the top "Select queue" + phase stage select (dashboard html) and the Event / planning-queue-filter / row-config selects (planning html).
- If a full-PAGE scroll persists it's content reflow below the picker (loading queue data grows the page); next lever would be a `block` overlay scroll strategy. Not applied yet.

## Follow-up 9 — queue picker not selecting → switch to ngModel

- Symptom: clicking a queue option didn't register the selection. Root cause: the top "Select queue" used one-way `[value]="selectedQueueList"` + per-option `(onSelectionChange)="updateSelectedQueues(...)"` which mutated the array IN PLACE (push/splice, same reference) — Material's selection model and the `[value]` input fell out of sync, so toggles didn't stick.
- Fix: switched to the standard `[ngModel]="selectedQueueList"` + `(ngModelChange)="onQueueSelectionChange($event)"` (same pattern as the working planning filter). New dashboard method `onQueueSelectionChange(ids)` sets `selectedQueueList = [...ids]` then getselectedStages + fetchQueueTokens + planningRefreshKey++. Kept `disableOptionCentering`. `updateSelectedQueues` is now unused (left in place).
- Revert: restore `[value]` + per-option `(onSelectionChange)="updateSelectedQueues(...)"` on the queue mat-select.

## Follow-up 10 — FIX verified in-browser: queue-select hang + selection + widget

**Diagnosis red herring first:** the dev server on :4310 was a DIFFERENT repo (`Watson-Angular`, no planning-tab). Starlabs runs on **:4200**. All testing must target :4200.

- **Queue selection not registering** — the top "Select queue" used one-way `[value]` + per-option `(onSelectionChange)` mutating the array in place. Switched to `[ngModel]` + `(ngModelChange)="onQueueSelectionChange($event)"` (Follow-up 9). Verified: selecting a queue now sticks.
- **Hang on queue select (real root cause)** — `queueFilterOptions` getter built a NEW array of NEW objects every call and was bound in the planning queue-filter `mat-select` `*ngFor`. Because Follow-up 3's `[hidden]` keeps Planning always-mounted, that getter ran on every change-detection tick; once a queue was selected (filter renders) + Board streaming Firestore → the mat-select tore down/rebuilt options every CD → freeze. Fixes:
  - Template now iterates the stable `selectedQueueList` with `trackBy: trackByQueueId` and `queueName(q)` inline (no new-array getter).
  - Wrapped the whole planning template in `*ngIf="active"` so NONE of its bindings run while the Board is showing (component stays mounted → state preserved; only DOM toggles).
  - Verified in-browser (:4200, logged in as Charan Reddy P): selecting "A&H Evolution Preparation Event - April 2026" (the exact queue that hung before) is now smooth; Board + Planning render; phase creation works; matrix renders exactly to the mockup (EVENT CONFIRMATION / CONFIRMED / NOT CONFIRMED · Active/Non Active/Added-Lefted; rows Not Completed / Slot Confirmed / Confir. rate (tinted %) / Not Confirmed / Completed; Pending (Potential) line; no Total).
- **Save widget off-screen** — `.pl-savefab` used `position:sticky + float:right` (broken combo). Changed to `position:fixed; right:24px; bottom:24px; z-index:1000`. Confirmed the widget IS in the DOM and `isDirty` fires (page text shows "Save as filter"); no transformed ancestor traps the fixed element.

Revert levers: Follow-up 9 (ngModel) + this one (trackBy iteration, `*ngIf="active"` wrap, `.pl-savefab` fixed positioning).

## Follow-up 11 — Board & Planning: FULLY INDEPENDENT queue selections (verified)

Operator wanted the queue selection truly separate per tab (not the subset-filter I'd built). Re-architected:
- **Dashboard**: added `planningQueues: string[]` (Planning's own selection) alongside `selectedQueueList` (Board's). New `get loadedQueues()` = union of both. Data pipeline loads the union: `<app-event-opportunity *ngFor="loadedQueues">` and `fetchQueueTokens()` now iterate `loadedQueues`. New `onPlanningQueuesChange(ids)` sets `planningQueues` + refetch. Top "Select queue" picker gated to **Board only** (`*ngIf="showQueueSelect && activeTab === 'board'"`).
- **Planning tab**: `selectedQueueList` input now bound to `planningQueues` (not the shared list). Its picker lists ALL queues (`queueList`), binds the input, and emits `@Output() queueSelectionChange` up. Removed the old subset-filter machinery (`filterQueues`, `queueFilterOptions`, `onFilterQueuesChange`); `scope` is now simply `selectedQueueList`. Filter save/diff/signature use `selectedQueueList`. `patchQueues` (filter apply) also routes to `onPlanningQueuesChange`.
- Board template still reads `selectedQueueList` (its own queues) — unchanged.
- **Verified live (:4200)**: Board = "MIG" (renders MIG stage cards with real counts); switch to Planning → top picker hidden, Planning's own picker empty; pick "A&H Evolution Preparation Event" → Planning loads it independently; switch back to Board → still "MIG", untouched. No hang, responsive throughout.

Revert: bind planning `[selectedQueueList]="selectedQueueList"` again, drop `planningQueues`/`loadedQueues`/`onPlanningQueuesChange`, restore loops to `selectedQueueList`, un-gate the top picker, and restore the subset `filterQueues`/`scope`/`queueFilterOptions` in planning.

## Follow-up 12 — batch: validation, UX, journey + DFU filters

Ten requests, all in planning-tab (+ small dashboard wiring):
- **Target ≤100** — `phaseForm.targetPct` got `Validators.min(0)/max(100)` + a `mat-error`; Create disabled while invalid (was throwing/odd before).
- **Stage multiselect stays open** — root cause: `setRowStages`→`rebuildMatrix` reassigned `matrixRows`, recreating the row DOM (incl. the open `mat-select`). Added `trackBy: trackByPhaseRow` (phase.docid) and `trackByLineKey` (ln.key) to the matrix loops so the select instance persists → panel stays open across picks.
- **Snackbar** — `MatSnackBar` injected; `toast()` shows "Filter created/updated" after save.
- **Loader on apply** — `applyFilter` sets `dataLoading=true` and clears it in `.finally`.
- **Detailed diff** — `computeChanges` now reports target `X%→Y%` and per-row stage `+added / −removed` (with row label), not just "Phase updated".
- **Collection → `planning_phases`** — renamed `planning_filters`→`planning_phases` (operator's earlier plan). Old `planning_filters` docs orphaned (none created in prod yet).
- **lasteditedby** — saved-filter docs now store `lasteditedby: currentProfileId`. Dashboard reads it via `guard.getRoles().then(r => r.profile_ref.id)` and passes `[currentProfileId]` to planning.
- **Slot confirmed = future enddate** — `confirmedSlotSetForStage` now requires `slotconfirmation` AND `toDate(slot.enddate) > now` (was counting every confirmed slot regardless of date).
- **Journey filter** (top of planning) — `guard.getJourneyMap()` → journey names; a participant's effective journey chosen by customerstatus (active→`currentjourney`, discontinued→`lastsubscribedjourney`, else→`lastcompletedjourney`) from `guard.getParticipantMetaMap()` docdata; keep only matches. **NOTE/assumption:** compares the metadata journey field value against journey *names*; if those fields store journey *ids* instead, the match key needs flipping.
- **DFU ongoing omit** — toggle; DFU-ongoing = participant's `participant metadata.activeproduct` holds a product with `mode=='Priority Mode'` (mirrors dynamic-queue-manager-clone). Loaded `priorityProductIds` from `products where mode=='Priority Mode'`.
- **Filter plumbing:** split `queueHolderIds` → `rawQueueHolderIds` (unfiltered, used to load statuses so the journey filter has customerstatus) + `queueHolderIds` (applies journey + DFU). All cards/matrix/drills flow through the filtered one.

**Verified live (:4200, MIG - Clone, 56 holders):** Journey filter renders (loaded); **Omit DFU ongoing → 56→51** (5 omitted); no hang; responsive. Target-validation / multiselect / snackbar are build-verified (browser coordinate drift blocked a clean live capture but logic is straightforward).

Injected `AuthguardService` into planning-tab (path `../../../authguard.service`).

## Follow-up 13 — column relabel + full save diff (+ clarifications)

- **"Added/Lefted" → "Discontinued"** — relabeled the 3rd column in both Confirmed / Not Confirmed groups. The bucket already counted `customerstatus == 'discontinued'` (statusBucket 'd'); only the label changed.
- **Save diff now FULL** — `computeChanges` rewritten. New filter: lists Queues, Events, phase count, and every phase with its target and each configured row's stages (`Phase "X" · target 80%` / `   Not Completed: StageA, StageB`). Update: title change, queue/event add-remove, per-phase target `X%→Y%`, per-row stage `+/−`, added/removed phases — nothing summarized away. Added helpers `rowLabel`, `stageNames`, `phaseDetailLines`.
- **Journey/DFU not saved (confirmed, no change)** — `saveFilter` persists only `{title, queueIds, eventIds, phases, lasteditedby}`; the dirty signature only covers queues+events+phases. Journey filter + DFU-omit are runtime-only and never written to `planning_phases`.
- **Target readiness (explained, no change)** — phase completion goal: ring = actual `Completed÷holders %`; badge compares actual vs target (≥target On track, ≥target−10 At risk, else Behind).

## Follow-up 14 — no refetch on re-click + "＋" new-filter button

- **Re-clicking the active filter no longer refetches** — `applyFilter` returns early if `f.docid === activeFilterId`.
- **"＋" button** in the filters bar → `newFilter()`: **full reset** — clears the active filter, working phases, and EVERY selection (queue via `queueSelectionChange.emit([])`, event, journey, DFU toggle) plus the event-derived sets. Bar shows when a queue is selected OR any saved filter exists (so ＋ is always reachable). `.pl-fchip-add` styling added. **Verified live**: applying "Mega consultation" populated queue/event/phases, then ＋ cleared all dropdowns back to the empty state.

## Follow-up 15 — FIX journey filter (id vs name, activejourney)

Journey filter matched nothing. Two bugs, both fixed & verified live:
1. **Compared by journey name, not id.** Metadata fields hold journey IDs (journeycoach-dashboard: `const journeyId = metaData['lastcompletedjourney']; journeyTypeMap[journeyId]`). Dropdown option `[value]` changed `j.name`→`j.id`; `selectedJourneys` now holds ids; `journeyMap` key (journey doc id) === metadata field value.
2. **Active field was `currentjourney` (a name); should be `activejourney` (an id).** Authoritative map in journeycoach-dashboard `mapCustomerStatusVariable = {active:'activejourney', 'non active':'lastcompletedjourney', discontinued:'lastsubscribedjourney'}`. `currentjourney` is written to profile_data as a NAME (authguard) — not id-comparable. Replaced `effectiveJourney` with `journeyIdsFor(id)` (status→field, array-or-scalar safe, returns ids). `passesParticipantFilters` intersects those ids with `selectedJourneys`.
- `customerstatus` source confirmed correct: `loadCustomerStatus` reads `participant metadata.customerstatus` (same collection as the journey fields).
- **Verified (:4200, MIG - Clone, 56 holders):** BiG Continuity → 0; B!G + CPM continuty + CTD → 27. Different journeys → different sensible counts.

## Follow-up 16 — Type #2 "Eligible · not in queue" card (from the Flutter scope-enhancement journal)

Ports the `checkScopeEnhancement()` type-#2 idea (breakthroughs-flutter journal, 2026-07-03) into a Planning card.

- **Definition:** `Type #2 = Potential ∩ (in the selected queue's planning segments) ∩ (NOT in queue_token)`.
  - Potential = product owners not approved/requested for the event (`potentialIds()`; also now backs the Potential drill).
  - Segment membership resolution (this was the tricky part): `queue planning WHERE queueid == queue.docid` → `planning[].segments[].segmentid` → **`segments/<segmentid>.participantlistid`** → **`participant list/<listId>.profilelist`** (union). NOTE: participant list is NOT linked by a `segmentid` field (a first attempt with `where('segmentid','in',...)` returned 0); the link is `segments` doc → `participantlistid[]` → list docs, mirroring queue-planning.component.ts `getNonSelectedParticipantsCount`.
  - Not-in-queue = not in `rawQueueHolderIds()` (any `queue_token` for the queue).
- Loaded by `loadQueueEligibility()` on queue change (ngOnChanges queueChanged) + ngOnInit; result cached in `planningSegmentMembers`. New card `{key:'type2', label:'Eligible · not in queue'}`; drill via `drillIds` case `'type2'`.
- Not affected by the journey/DFU filters (event+queue-planning scoped, like Potential). `getDoc` added to firestore imports.
- **Verified live (MIG - Clone / Clone Event):** 6 segments → 6 participant lists → 165 members; Potential 135 → **Eligible·not-in-queue = 80**; drill lists the 80, all "In queue: Not".

## Follow-up 17 — card derivation descriptions

Added a small "how it's derived" line under each summary card. `CardDef` got an optional `desc`; each card in `computeCards` carries a one-liner; rendered as `.pl-card-desc` (10.5px, `--tertiary`). Verified live — all 7 cards show their derivation text.

## Follow-up 18 — queue_token: only tokenstatus == 'Active'

Tightened `tokensForQueue` from "exclude `inActive`" to "include ONLY `tokenstatus === 'Active'`" (case-insensitive), matching the reference query `where('tokenstatus','==','Active')`. Every planning number now counts only Active tokens; Type #2's "not in queue" now means "no Active token". Revert: `!== 'inactive'`.

## Follow-up 19 — "Total in the queue" counts tokens (no profile dedup)

New `inQueueTokenCount()` counts Active tokens across scope WITHOUT deduping by `profile_id` (still respects journey/DFU filters). The `inQueue` card uses it (desc → "Active tokens in the selected queue"). Everything else (holders Set, matrix cells, other cards, drills) still dedups by profile. Caveat: if a profile has >1 Active token in the queue, this card can exceed the person-based cards + the drill (which lists distinct people). Revert: `value: holders.size`.

## Follow-up 20 — "Total in the queue" == dynamic-queue-manager-clone.totalParticipants

Matched the clone's exact per-token filters (clone `processTokensIntoStages`/`totalParticipants`, ~lines 1990-2067):
- `tokensForQueue` now also excludes deleted tokens: `[null,undefined,false].includes(t.delete)` (added alongside the existing `tokenstatus==='active'`). Applies to ALL planning numbers.
- `inQueueTokenCount()` (the "Total in the queue" card) counts raw tokens (no dedup) whose `currentstage ∈ queueStages(q)` (`mapData[q].stages || mapQueue[q].stages`), mirroring the clone summing `allTokens.length` across real stages and excluding Unattended/orphaned. Card desc → "Active tokens in the selected queue".
- Not replicated: the clone's UI applyFilters (search/segment/tag/approved/variation/etc.) — those are its own filter chips; we only apply our journey/DFU. So this equals the clone's UNFILTERED total.
- Live check limited: this session's queue list no longer contains the earlier populated MIG-Clone (56); the July-2026 queue tested shows 0 (empty). Cross-check a populated queue in both views to confirm parity.

## Follow-up 21 — queue-change loader + fix stale/wrong "Total in the queue"

Operator: no loader on queue select/deselect; total slow + wrong number.
- **Wrong number root cause:** `inQueueTokenCount` scopes by `queueStages()`, which read `mapData[q].stages` FIRST. `mapData` arrives late (via the `<app-event-opportunity>` loop), so the total first computed with empty stages (→ no stage filter → over-count) and never recomputed when mapData landed. Fixes:
  - `queueStages()` now reads **`mapQueue[q].stages` first** (queue-generation doc, loaded with the queue list — same source the clone uses), `mapData` as fallback. Correct immediately.
  - `ngOnChanges` now also recomputes on **`mapData` change** (safety, debounced/gated).
- **Loader on queue change:** set `dataLoading = true` when the queue changes (active + non-empty scope); `recompute()` now clears it in a `finally` (so it also covers the event/apply paths). The existing `.pl-note` "Loading from Starlabs…" shows during the fetch.
- Clarified for operator: queue selection fetches `queue_token` (drives the total) independent of event; event selection fetches the event sets (Potential/Confirmed). Neither gates the other.
- Not live-verified this session (window/HMR resets + queue list changed, no populated queue reachable) — build-verified.

## Follow-up 22 — manual "Get" button (staged selections, no auto-fetch)

Operator: deselecting a queue processed slowly; no loader; wanted a Get button that loads event+queue on click.
- **Staged selections:** Event/Queue dropdowns now bind to `pendingEvents` / `pendingQueues` (`(ngModelChange)="pending... = $event"`) — selecting/deselecting is instant, NO fetch/recompute.
- **`loadPlanningData()` ("Get"):** the only fetch trigger — sets `selectedEventIds = pendingEvents`, `dataLoading=true`, emits `queueSelectionChange(pendingQueues)` (→ parent loads tokens → queueChanged → eligibility/recompute), and `loadEventSets().then(recompute)`. Loader cleared in `recompute`'s finally.
- Pending vars synced: ngOnInit, ngOnChanges (queueChanged), applyFilter (from the filter), newFilter (cleared). Old `onEventChange`/`onPlanningQueuesChange` left unused (no template binding).
- HTML: `.pl-get` button between the queue field and Journey; disabled when loading or nothing staged; icon `download`→`autorenew` + "Get"→"Loading…".
- **Verified live:** staged uP!/Legacy queue → Get → Total in the queue = 310 (populated); dropdown changes before Get do nothing (instant).

## Follow-up 23 — perf: kill the 4s whole-collection metadata read + parallelize

Profiled the slow "get queue data" (uP!/Legacy, 311 tokens):
- `getParticipantMetaMap` (guard) = **4029ms** loading the ENTIRE `participant metadata` collection (**3330 docs**) on init — the real killer.
- `loadCustomerStatus` = 275–875ms but called **3× redundantly**.
- `loadQueueEligibility` = ~2.7–3.5s.

Fixes:
- **Removed the whole-collection read.** New `PlanningDataService.loadParticipantMeta(ids)` loads FULL metadata docs for ONLY the needed ids (chunked, `Promise.all` parallel). `recompute()` calls it and derives `statusMap` from each doc's `customerstatus` — this ONE load replaces both the 4s init read AND the separate `loadCustomerStatus` query. `participantMeta` (journey/DFU source) is now per-load, holders-scoped.
- **Parallelized** `loadCustomerStatus` chunks (kept, unused now) and `loadQueueEligibility` (queue-planning / segments / participant-list reads were sequential `for`+await → `Promise.all`).
- **Skip eligibility when no event** — Type #2 = Potential ∩ members, and Potential needs an event; `loadQueueEligibility` early-returns if `selectedEventIds` empty (avoids ~3s of wasted work in the common queue-only case). Eligibility stays non-blocking (never holds `dataLoading`).
- Net: main cards ("Total in the queue" etc.) now load in ~token-fetch + ~0.5s instead of +4s. Verified live: uP!/Legacy total = 311, no 4s stall.

## Follow-up 24 — metadata cache (fetch each id once)

`recompute` re-fetched participant metadata every run (and it runs multiple times per Get). Added a `metaFetched` Set: only ids NOT already fetched are queried (`loadParticipantMeta(missing)`, merged into `participantMeta`). Repeated Gets / recomputes / re-selecting the same queue reuse the cache → no re-query. (Selecting a queue in the dropdown already triggers nothing — only Get fetches.) Cache is session-lived; not invalidated (stale customerstatus tolerated within a planning session).

## Follow-up 25 — bounded "Filters" group (journey + DFU-omit)

Moved the Journey dropdown out of `.pl-filters` and the DFU toggle out of `.pl-toggles` into one bordered `.pl-filterbox` with a floating "FILTERS" label (filter_alt icon). Border `0.5px var(--tint-hair)`, `--r-core` radius, `--surface-tray` bg; label absolutely-positioned on the top edge (`--bg` behind it). Shows when `journeyList>0 || selectedQueueList>0`; DFU chip inside gated on `selectedQueueList>0`. Verified live — box renders with Journey; DFU joins after Get.

## Follow-up 26 — unify ALL queue-data cards on the Total-in-queue logic

Operator: "use the Total-in-the-queue logic wherever queue data is used." The confirmed/not-confirmed-in-queue splits were built from `queueHolderIds` (deduped people, NO currentstage filter) while Total used token-count + currentstage filter → they didn't reconcile (960 ≠ 506+218).
- **Moved the currentstage∈stages filter into the shared `tokensForQueue`** — so Active + not-deleted + currentstage-is-a-real-stage is now the SINGLE "in queue" definition inherited by holders, the matrix, drills, and every count. (Falls back to all-Active if `queueStages` empty.)
- **`computeCards` in-queue splits are now token-based** (one pass over `tokensForQueue`): `inQueueTokens` (= Total), `confInQueueTokens` (profile ∈ approved), `notConfInQueue = inQueueTokens − confInQueueTokens`. `confNotInQueue` stays people-based (approved not in the deduped holder set — it's genuinely "people not in queue"). Removed the now-redundant `inQueueTokenCount()`.
- **Verified live:** uP! Live Event + uP!/Legacy → Total 311 = ConfInQueue 0 + NotConfInQueue 311. Reconciles.
- Caveat unchanged: drill lists show distinct people; Total counts tokens (differ only if duplicate Active tokens per person).

## Follow-up 27 — hide Filters box until data is loaded

`.pl-filterbox` `*ngIf` changed from `journeyList.length > 0 || selectedQueueList.length > 0` to `selectedQueueList.length > 0 || selectedEventIds.length > 0` — journeyList loads on init, so the box was showing (with only Journey, DFU hidden) before any Get, looking broken. Now it only appears once an APPLIED queue/event exists (post-Get). Verified: pre-Get shows just Event/Queue/Get + empty prompt.

## Follow-up 28 — per-filter include/exclude mode (Show only vs Remove)

Operator wanted, per filter, a choice between "show only the filtered data" or "remove it".
- **Journey:** `journeyMode: 'only' | 'remove'` (default 'only'). A "Show only | Remove" segmented toggle appears next to the Journey dropdown once journeys are selected. `setJourneyMode()`.
- **DFU:** replaced the single "Omit DFU ongoing" checkbox (`omitDfuOngoing` boolean) with `dfuFilter: 'off' | 'only' | 'remove'` + a "Show only | Remove" toggle (`setDfuFilter` toggles off if the active mode is re-clicked).
- `passesParticipantFilters` applies each: only→keep matches, remove→drop matches. `queueHolderIds`/`computeCards` active-check updated to `dfuFilter !== 'off'`. `newFilter` resets both.
- Segmented UI: `.pl-mode`/`.pl-mode-btn` (pill track, active = white pill + tint). Grouped in `.pl-fgroup` inside the Filters box.
- **Verified live (uP!/Legacy, 311):** DFU Remove → 310; DFU Show only → 1 (311 = 310 + 1).

## Follow-up 29 — one overall Show-only/Remove mode; filters below

Restructured Follow-up 28's per-filter modes into ONE shared mode:
- State: `filterMode: 'only' | 'remove'` (shared) + `dfuOn: boolean` (DFU is now a plain include-in-filter toggle); dropped `journeyMode`/`dfuFilter`.
- `passesParticipantFilters`: `only` = keep participants matching EVERY active filter (journey ∈ selected AND dfu-ongoing if on); `remove` = drop participants matching ANY active filter. (De Morgan of per-filter keep/drop.)
- UI (`.pl-filterbox` now column): overall `Show only | Remove` toggle (`.pl-mode-overall`) on top, then `.pl-frow` with the Journey dropdown + a "DFU ongoing" checkbox chip. `setFilterMode()`, `toggleDfu()`.
- **Verified live (uP!/Legacy 311):** DFU ongoing + Show only → 1; (earlier) + Remove → 310.

## Per-screen revert guide

Screen: **Planning tab**. Files touched (this screen only):
- `src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.ts`
- `src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.html`
- `src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.css`

**Full revert of this screen:**
`git checkout <pre-branch> -- "src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.ts" "src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.html" "src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.css"`
(or `git revert` this commit). No other screen or shared file was changed, so a straight three-file revert restores the prior 4-row + Total matrix exactly.
