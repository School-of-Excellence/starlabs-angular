# 2026-07-07 — Events stage data screen (new)

**Headline:** New standalone screen `events-stage-data` — a 3-step wizard (Event ▸ Arena event ▸ Participants) that lets an operator drill from an event to one of its arena events, maps the related queue, and shows that arena event's participants' **name, email, phone, customer status** — all pulled from `participant metadata` (doc id = profileid).

## What was built
- **Component:** `src/app/Events/events-stage-data/events-stage-data.component.{ts,html,css}`
- **Route:** `events-stage-data` (lazy, `authGuard`) — added in `src/app/app.routes.ts` right after `event-participation-confirmation`.
- **URL:** `/events-stage-data`

## Data flow — FINAL: Event → Arena event → Queue (step 3) with per-stage columns
This section supersedes several earlier iterations (event-only step 1 → merged event+queue step 1 → queuename shown in step 2). The operator's final shape moves the queue into step 3 and adds per-stage Completed / Slot-booking columns. Leans on `2026-07-07-queue-planner-slot-booking-model.md` for the slot/stage model.

1. **Step 1 — Event** — `event collection` only (`name`, `start_date`, `end_date`), filter `delete != true` + upcoming/past window.
2. **Step 2 — Arena event** — `arena events` where `eventref == event.ref`, filter `delete != true`. One row per product (Product, Type). No queue column — the queue is resolved in step 3.
3. **Step 3 — Queue + participants + dynamic stage columns.** On arena select:
   - **Participants (REQUESTED + APPROVED):** `event participation request` where `arenaeventid == arena.docid` **and `status in ['requested','approved']`** → dedupe by `profileid` (approved outranks requested) → `getDoc('participant metadata', profileid)`. Base columns: Name, Email, Phone, Customer status, **Request** (the request status chip). (Was approved-only; operator later asked for both.)
   - **Queues:** loads **all live queues** (`queue generation`, `delete != true`, `queueenddate >= today` or no end date) for a **selector** dropdown; the queue(s) whose `arenaeventidlist` contains the arena docid are flagged `(mapped)`, sorted first, and pre-selected. The selected queue's ordered **`stages`** feeds the stage picker.
   - ⚠️ **The stage list is the queue's `stages` field, NOT `stagegroup`.** `stages` = ordered stage names that `queue_token.currentstage` indexes into (confirmed: `queue-planning-review` does `queueStages = queueDoc.data()['stages']` then `indexOf(token.currentstage)`); `stagegroup` is *group* names — using it left the dropdown empty. Fixed to `stages`.
   - **Tokens / current stage:** per profile use the **latest** record (operator directive). Current stage = the `currentstage` of the profile's latest `queue stage log` entry (max `logdate`), falling back to the token; `selectedstageslot` from the profile's latest `queue_token` (max `logdate`). (Was: furthest-progressed token by stage index.)
   - **Stage columns:** start **empty** — operator adds stages manually via a `+` dropdown (Add all / Clear also available). A "Queue stages (N): …" line lists all available stages in order for reference. (Briefly defaulted to all-shown; operator reverted to manual.) Each added stage adds two columns:
     - **Completed** = crossed that stage = `stages.indexOf(currentstage) > stages.indexOf(stage)` → "Completed" else "Not completed" (queue-planner rule: "not past this stage" is `idx(current) <= idx(stage)`).
     - **Slot booking** column: **completed → completion date** from the stage log; else **booked → the slot's start–end** (`selectedstageslot[stage].startdate`/`enddate`); else "Not booked". Completion date = `logdate` of the `queue stage log` doc where `previousstage == stage` (that doc marks moving OUT of the stage; per queue, keep the latest logdate per (pid, previousstage)). Loaded per selected queue alongside tokens.
   - **Multi-queue:** the queue selector is a **checkbox multi-select** (mapped queues pre-checked). Stage columns are **merged across all selected queues** — each column is a `(queueId, stage)` pair (labeled `stage · queue` when >1 queue), and Completed/Slot are computed against that queue's own token (`tokens[queueId]`).
   - **Date filters:** **Completed date** (range, matches stage-log completion dates) and **Slot date** (range, matches slot `startdate`), alongside Request / Current stage / Customer status dropdowns + text search.
   - **iOS dashboard restyle** (operator, models the Google-Sheet pivot dashboard "July uP! - Evol. Prep Status"): step 3 shows **summary tiles** over the *filtered* rows — a blue Participants tile + one tile per added stage column with completed count, a stacked done/booked/not-booked mini-bar and legend (`stageSummaries` getter). Full iOS theme in CSS: SF Pro, `#f2f2f7` bg, white rounded cards (filters/tiles/table), `#007aff` accents, chip selectors, tinted pills for Completed (green) / booked (blue) / not-booked (gray) via `slotKind()`. Presentation + computed-summary only; no data logic changed.
   - **Variation filter/column:** loads each selected queue's `queue variation` (`queueref == queue.ref`) → `variationId → variationname`. A participant's variation is inferred (queue-planner convention) from the `variationid` on their **first booked slot** (`selectedstageslot[firstStage].variationid`) — not stored on the token. Adds a Variation dropdown (All / each / "No variation"), a Variation column, and CSV field; multi-queue matches if the participant is in that variation in any selected queue.
   - **"Not booked only" quick filter** (operator: focus the chase-list): keeps rows where any checked stage is NOT completed AND has NO slot (`!crossedStage && !isBooked`), checked across `addedCols` (or all `mergedStages` if none added). No slot = not booked, so parked states (DFU Ongoing / Mega Consultation / Triple ATC) count; completed stages never flagged; SE-or-Diagnostics (any unbooked stage). Reuses existing helpers, no new data. Groundwork for the Evolution Prep view (Google Sheet "July uP! - Evol. Prep Status") — a future "match any: not booked / finance not cleared" toggle; finance condition deferred until its Firestore source is decided. ATC-model / finance columns + the Evolution Prep preset still pending.
   - Added stages are removable chips; a "Current stage" column always shows. CSV export = base cols + Current stage + each added stage's Completed + Slot-booking.

## Notes / surprises
- `participant metadata` holds `email` directly (fields list confirmed in `email-input.component.ts` comment: `name, phonenumber, email, participantmode, customerstatus, financialstatus`). The sibling `product-funnel` sources email from `profile_data` instead — this screen deliberately takes **all four columns from metadata** per the request.
- Uses per-doc `getDoc` (literal to "profileid is the docid") rather than the chunked `where('profileid','in',…)` that `product-funnel.loadMeta` uses. Fine for typical event sizes; if a very large event is slow, switch to the chunked field query.
- Folder on disk is `src/app/Events` (capital E); routes import from `./Events/...`. macOS is case-insensitive so both spellings resolve.
- Verified with `ng build --configuration development` — compiles clean; only pre-existing warnings in unrelated components.

## Revert guide (per-screen)
This is an additive, self-contained screen. To revert completely:
1. Delete `src/app/Events/events-stage-data/` (the 3 component files).
2. Remove the single route line `{path: 'events-stage-data', …EventsStageDataComponent…}` from `src/app/app.routes.ts`.
No other file touched; no shared component or collection schema changed, so revert is risk-free.

## Pending
- Not linked from any nav/menu yet — reachable only by direct URL. Add a menu entry if operators need discoverability.

---

# 2026-07-08 — Stage-data step 3 additions: per-queue stage, segments, product, journey (+ completed-date stage picker, sheet import)

Five operator-requested additions to step 3, all **additive** to the same three component files. No route/schema change. Verified: `npx tsc --noEmit -p tsconfig.app.json` clean (whole app), no cross-file breakage. Not committed (operator's standing no-autocommit).

## What changed (this session)
1. **Completed-date filter now asks for a stage.** When a Completed-date range is set, a stage `<select>` appears (`completedStage`); it lists **only the added table columns** (`completedStageOptions`, unique `addedCols[].stage`), and the date match is scoped to that stage (`allCompletedMs` filters by `c.stage === completedStage && crossedStage`). Fixes the earlier bug where a row matched on *any* completed stage (incl. non-displayed ones), so visible cells read "Not completed". `syncCompletedStage()` resets the pick when its column is removed / queues change. Also: completed-but-no-date now renders **"Completed · no date"** in the Slot cell instead of bare "Completed".
2. **Sheet import & reconcile.** New toolbar button **Import sheet to compare** (styled as a paired button beside Export CSV via `.toolbar-actions` + `.btn/.btn-primary/.btn-secondary`). Reads `.xlsx/.xls/.csv` with SheetJS (already a dep), auto-detects a **Name** and/or **Email** header, and diffs the sheet against `stageRows` (full arena set, ignores filters) matching by **email OR name** (normalized). Shows two lists — *In table, not in sheet* / *In sheet, not in table* — with counts + an **Export diff CSV**. State: `showReconcile`, `extraInTable`, `extraInSheet`, `sheetCount`, `matchedCount`. Name match is exact-after-normalize (no fuzzy).
3. **Two queues → separate current-stage columns.** The single "Current stage" column became **one column per selected queue** (`selectedQueues` getter, `currentStageFor(r,qid)`); header label is "Current stage · <queue>" when >1 queue. `currentStagesDisplay` (comma-joined) is retained only where a combined string is still handy.
4. **Segments column + filter.** `loadRefData()` (cached, one-shot) reads `segments` (id→`segmentname`) and `participant list` (`profilelist[]` members + `segmentid[]` back-ref) to build `profileSegments: profileId→string[]` (per journal `2026-07-08-participant-segments-storage.md` — membership lives in lists, resolved via the list's `segmentid` back-ref; **tags path not implemented**). New **Segments** column (`segmentsDisplay`) + **Segment** filter (`segmentFilter`). Options come from `segmentOptions` — a **getter scoped to segments present among the loaded participants** (not every segment in the system), so the dropdown only lists relevant segments.
5. **Product filter (unconsumed).** Product dropdown from `mapProduct` (`products` id→`product`, already loaded in `loadEvents`) via `productOptions`. Selecting a product checks the participant's `unconsumedproducts[]` (product ids) on metadata (`StageRow.unconsumedProducts`); a second select gives the two modes — **Show only** (`productMode='only'`) / **Remove** (`'exclude'`).
6. **Journey column.** `StageRow.journeyId` chosen by customer status (`pickJourneyId`): `active`→`activejourney`, `non active`→`lastcompletedjourney`, else→`lastsubscribedjourney`; resolved to a name via `guard.getJourneyMap()` (`journey` id→`journey` name) with raw-id fallback (`journeyDisplay`). Column only (no filter requested).

Table column order is now: Name, Email, Phone, Customer status, **Journey**, **Segments**, Request, Variation, **Current stage ×(selected queues)**, then added stage columns. Empty-row colspan = `8 + selectedQueues.length + addedCols.length*2`. CSV export mirrors this.

## Notes / surprises
- `activejourney`/`lastcompletedjourney`/`lastsubscribedjourney` are treated as journey **ids**; some sibling dashboards use the raw value as a name, so `journeyDisplay` falls back to the raw string when it's not a map key — safe either way.
- `unconsumedproducts` elements are product **doc-ids** (same keyspace as `getProductMap`), confirmed against participants-analytics' product map.
- Segments/journey/products reference data loads once per session (`refDataLoaded`); it does **not** re-read on arena switch. If those collections change mid-session, reload the screen.

## Revert guide (per-change, all within the 3 `events-stage-data` component files)
- **Completed-date stage picker:** revert `allCompletedMs` to iterate all `notBookedCols`/queue `completedAt`; remove `completedStage`, `completedStageOptions`, `syncCompletedStage` (+ its calls in `removeCol`/`clearCols`/`buildMergedStages`) and the stage `<select>` in the Completed-date filter. Restore Slot cell "Completed" (drop "· no date").
- **Sheet import:** remove the `.toolbar-actions` block + reconcile panel in HTML, the reconcile state/methods (`onImportSheet`,`reconcile`,`closeReconcile`,`exportReconcile`,`normEmail`,`normName`) and `import * as XLSX`, and the `.btn*`/`.reconcile*` CSS.
- **Per-queue current stage:** restore the single `<th>Current stage</th>` + `<td>{{currentStagesDisplay(r)}}</td>`; drop the `selectedQueues`/`currentStageFor` loops (revert colspan to `7 + addedCols.length*2`).
- **Segments:** remove Segments `<th>/<td>`, the Segment filter, `segmentFilter`, `segmentsDisplay`/`rowSegments`/`segmentOptions`/`profileSegments`, and the segments/list reads in `loadRefData`.
- **Product filter:** remove the Product filter block, `productFilter`/`productMode`/`productOptions`, the `filteredStageRows` product branch, and `StageRow.unconsumedProducts` (+ its load).
- **Journey:** remove Journey `<th>/<td>`, `journeyDisplay`/`pickJourneyId`/`journeyMap`, `StageRow.journeyId`, and the `getJourneyMap()` call in `loadRefData`.
Remove the new filter fields from `selectArena`/`clearFilters`/`isStageFiltered` resets accordingly. If reverting *all* ref-data features, delete `loadRefData` + its `selectArena` call and the `refDataLoaded`/`journeyMap`/`profileSegments`/`segmentOptions` fields.

## 2026-07-09 addendum — searchable dropdowns + segment-filter scoping
- **All step-3 dropdowns are now searchable.** New reusable standalone component `searchable-select.component.{ts,html,css}` (`app-searchable-select`, `SsOption = {value,label}`, two-way `[value]`/`(valueChange)`) — a trigger button + popup with a filter input (shown only when >5 options), keyboard Enter=pick-first / Esc=close, click-outside to close. Kept native-select look (no Material) to match the screen's iOS theme; `ngx-mat-select-search` was avoided here on purpose. Replaced every `<select>`: Stage-columns picker, Request, Current stage, Customer status, Variation, Segment, Product + Product-mode, Completed-date stage picker. Option lists built by `ss*Opts` getters (`ssFrom()` helper prepends the All/Any sentinel; product/add-col carry value≠label). The old `.row select` CSS rule is now dead but harmless.
- **Segment filter scoped to loaded participants.** `segmentOptions` changed from a system-wide array (built in `loadRefData`) to a **getter over `stageRows`** segments only, so the dropdown lists just the segments present in the current arena.
- Revert: delete the `searchable-select` component files, drop it from the parent `imports`, restore the native `<select>` blocks, and remove the `ss*Opts`/`ssFrom` helpers. For the segment scoping, restore the `segmentOptions` array field + its `loadRefData` assignment.

## Pending
- Segment **tags** path (`segments.tagids` → `participant tags` → `profiletags`) not implemented — segment membership is list-based only.
- Journey has no filter (column only) — add one if operators want it.
- Live browser verification still not done here (auth-gated; needs a real event→arena→queue with participants); all changes type-check clean and reuse established patterns.
