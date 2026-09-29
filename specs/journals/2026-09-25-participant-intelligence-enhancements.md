# 2026-09-25 — Participant Intelligence enhancements (build)

Plan: `specs/plans/2026-09-25-participant-intelligence-enhancements.md` (approved in chat, point by point).
Branch `charan-release`. The component was committed as `92d6f49c` and its hooks as `216325a8`. Everything below is **uncommitted** on top of that.

## CHANGE LOG & REVERT GUIDE
All changes are in `participant-intelligence.component.{ts,html,css}` unless noted. To revert everything: `git checkout 92d6f49c -- "src/app/Participant Intelligence"`, then re-apply `216325a8`'s html hooks.

| # | Item | What changed | Firestore |
|---|------|--------------|-----------|
| 1/11 | uP! + CPM counts | `Participant.upcount/cpmcount` = consumed occurrences of `UP_LIVE_PRODUCT_IDS` / `CPM_PRODUCT_IDS`, imported from `participants-analytics.engine.ts` (one source of truth). Columns plus "at least N" filters. | read |
| 10 | New vs already uP! | `FilterModel.upStatus` new (count 0) / returning (≥ 1). | read |
| 2 | Counts | `store.audienceCounts` gives a live member count per audience. The stored `Audience.count` was removed. | — |
| 3/6 | Audience menu | Tabs Saved filters / Lists / Segments, a search box, live counts, and an "All participants" reset. | — |
| 4 | Filter-panel search | `query` signal. Hides non-matching options, opens every section while searching (clearing restores the layout), plus Collapse / Expand all. | — |
| 5 | Edit + unique names | Manage audiences gets tabs, Rename (filters, lists) and "Update with current filters". `store.nameTaken(kind, name)` is case-insensitive and trimmed, and blocks save / rename through a new `PromptData.validate`. | writes `searchquery.label`, `participant list.listname`, and the full `searchquery` doc on update |
| 8 | Finance columns | Purchase value (`pp_totalpurchasevalue`), Paid (`pp_totalpaid`), Balance (value − paid), Payment plan (`paymentplan`), and Age. New `money` column type. | read |
| 12 | Event status | "Event status" section: Attended = `productevent` (as analytics); Confirmed = `event participation request` with `status == 'approved'`, loaded on demand by an `effect` for the selected events only (`eventref in [...]`, 30 per query) and cached until Refresh. | read |
| 13 | Age | `ageFrom(dob)` done correctly (the analytics version mutates its input); min / max filter; no DOB = excluded. | read |
| 14 | Journey column | `Participant.journey` follows `journeyForParticipant` in analytics. | read |
| 15 | Watson rules | `WATSON_RULES` R1–R5 appear as a "Watson status" group in Checklists (Watson / subscription / balance columns, CSV export) plus a `watson-mismatch` signal card. `FinancialStatus` gains the exact values `fully paid` and `late`; they used to be mapped to `none`. | read |
| — | Saved filters | The new screen-only fields are saved under `searchquery.pifilter`. The analytics filter loop only acts on keys it knows, so it ignores `pifilter`. | write (on save) |
| — | Test hooks | New literal `pi-` hooks: filter-search, filter-toggle-all, filter-up-status/up-count/cpm-count, filter-event-attended/confirmed, filter-age-min/max, aud-tab, aud-search, manage-tab/rename/update, watson-checklist-item, watson-export. No spec yet. | — |

## Verification
- `ng build` (dev) passes, and `tsc --noUnusedLocals` is clean.
- The pure logic (filter engine + Watson rules) was extracted and run through 20 assertions, all passing: consumed vs unconsumed, uP! / CPM / new-returning, age, attended vs confirmed, R1–R5 including the 1000 boundary, and the skip cases.
- **Not verified in the browser.** The screen needs a login, and the dev environment points at production.

## Known gaps / notes
- A saved filter whose event status is Confirmed shows **0** in the live audience counts, because counts don't load approved requests. Loading the filter itself works.
- The existing signal "Defaulted / banned finance, still active" counts *defaulted + active*, which R1 says is valid. Left alone; for the operator to decide.
- Delete / set-default / toggle-live in Manage audiences still change only local state (this predates today's work).
- The e2e spec for the new hooks is still to be written (screen-e2e-coverage skill) before pushing.

## Flagged (not built)
B!G Accelerator count/filter · active segments (#9) · "not in package" filter (#7) · tag disabling (#16). Details are in the plan.

---

# Round 2 (same day)

Plan: `specs/plans/2026-09-25-participant-intelligence-round2.md` (approved point by point). Uncommitted, on top of round 1.

## CHANGE LOG & REVERT GUIDE
Before round 2 the `.ts` was saved to the session scratchpad as `pre-round2.ts`. Git revert: take `participant-intelligence.component.{ts,css}` back to the round-1 state (round 1 was uncommitted too, so revert by hand using the rows below).

| # | Item | What changed |
|---|------|--------------|
| P4 | Mode fix | Participant metadata stores the mode NAME. `reference.modes` is now built from `modes.mode` names (id = name), and an empty `participantmode` maps to `'none'`. A "None" option was added. Before this, options were `modes` doc ids and never matched. |
| P4 | Queue / Event fix | `mapValues()` flattens map values with concat, as analytics does (PA:1062-1068), so both a single id and a list match. The old `mapHasAny` needed arrays. |
| P4 | Live queue | `data.loadLiveQueues()` reads `queue_token` with stagestatus 'Approved' and tokenstatus 'Active' at page load (as analytics, PA:466), giving queueId → profile ids. New "Queue status" section: Completed (`queueevent`) / Live. No stage picker (analytics has it commented out). |
| P6 | Include / exclude | `FilterModel.exclude: Partial<Record<CheckGroup, string[]>>`. `CHECK_GROUPS` + `hasValue()` replace the per-field include checks in `applyFilters`: includes are OR'd, excludes remove. Rail options are buttons that cycle off → ✓ → ✕ → off; exclude chips read "X: not Y" in red. Saved under `searchquery.pifilter.exclude` (and `queueStatus`). |
| P6 | Filter context | `applyFilters(..., ctx: FilterContext)` carries `confirmedByEvent` and `liveByQueue` sets. It replaced the old `confirmed` Set parameter and is also used for the live audience counts. |
| P3 | Collapsed rail | `open` starts as an empty Set every time. |
| P5 | Sticky layout | `.shell` height = `calc(100vh - clamp(40px, 7.4vh, 64px))`, matching the app toolbar; `overflow: clip` on shell / body / rail / main. **Root cause of the header disappearing:** `overflow: hidden` boxes can be scrolled when an input inside them takes focus, so the whole page shifted up. `clip` can't be scrolled. Signals panel and chips are `flex-shrink: 0`; only the rail body and the table scroll. |
| P2 | Retention cards | New signals `status-none` and `higher-order-mismatch` (active vs activejourney, non active vs lastcompletedjourney; a one-sided empty value is a mismatch, both empty is not; same as analytics' `!=`). The Checklists menu is unchanged. |
| P8 | Product cells | Product-resolved array columns show "Name (count)" lines, up to 3, then "+N more", with the full list on hover (`pi-multiline-tip`). Cached per participant object (WeakMap). Rows are now `min-height: 46px` with 6px cell padding. |
| — | Hooks | New: `pi-filter-option`, `pi-filter-queue-completed`, `pi-filter-queue-live`. |

## Verification
- `ng build` (dev) passes, and `tsc --noUnusedLocals` is clean.
- Logic harness (engine extracted from the file): 37/37 pass. Round 1's 20 were re-run on the new `FilterContext` API, plus 17 new: include/exclude, mode by name / None, queue single-id vs list, live queue, confirmed via context, exclude chip, both new cards.
- **Not verified in the browser** (login plus a prod-pointed dev env). The sticky-header fix in particular needs a manual check.

## Notes
- The analytics screen ignores `pifilter`, so a saved filter that uses excludes, live queues or confirmed events is broader when opened in analytics.
- Include / exclude replaced the per-field include code. Behaviour for includes is unchanged (tests cover it).

## Round 2 flags (not built)
uP!/CPM-and-above insights (needs a journey ladder) · column-header filters · communication column + history (sends aren't stored per person) · income filter (no data).

---

# Round 3 (same day)

Plan: `specs/plans/2026-09-25-participant-intelligence-round3.md`. Uncommitted; the pre-round `.ts`/`.html` are in the session scratchpad as `pre-round3.*`.

| # | Item | What changed |
|---|------|--------------|
| R3-1 | Insight cards removed | `active-no-product`, `idle-active-product`, `expiring-soon`, `finance-overdue`, `finance-locked` (plus the now-unused IDLE / EXPIRING constants and `recentMoney`). Signals panel hides empty categories (Financial). The Watson filter, R1–R5, all checklists and the top badge are unchanged. |
| R3-4 | Lapsed card | `recently-lapsed` = non active only, subscriptionend > 0 and ≤ 183 days ago (`LAPSED_DAYS = 183`). |
| R3-5 | Selection bar | Menus: Communication / Organize / App Actions / Update / Reports, with every analytics action. The analytics dialogs get `Participant.raw` (the untouched metadata doc). New: Send Wati Messages (SendmessagesComponent + chunked cloud-function send with WhatsappProgressDialog; URL per project), Broadcast (BroadcastComponent + `data.sendBroadcast`), Wati Configuration, Manage Lists & Segments, Recommend Playlist (MapRecommendedplaylist), View Recommended (toggles the eiflix / solarvoice / generalcontent columns; names loaded on first show), App Action Pending, Add Product (BulkAddProducts, charan-release version). The placeholder QuickCompose dialog and its stubs were removed. |
| R3-6 | Export | Top-bar Export ▾ plus Reports: Export Table / Export Selection (xlsx: Name, Email, Phone + visible columns, names resolved) and Content Consumption (CSV of `content analytics` for the filtered participants). |

## Deliberate deviations from analytics (bugs not copied)
- **Broadcast:** analytics builds ids with odd-segment `doc()` paths (Firestore rejects these), re-pushes the same WriteBatch after 499 writes, and personalises from a `mapProfile` that is never filled (and returns '' when there's no `{{name}}`). Ported with auto-ids, a fresh batch per 150 participants (3 writes each), `profile_data` looked up only for the selected participants, and `{{name}}`/`{{email}}`/`{{number}}` substituted from the row.
- **Content Consumption:** analytics built the CSV but its `saveAs` is commented out, so nothing downloaded. Here it downloads, with proper CSV escaping.

## Verification
- `ng build` (dev) passes, `tsc --noUnusedLocals` is clean; the logic harness passes 54/54 (round 3 adds 17: removed / kept cards, Lapsed boundaries).
- **Not verified in the browser** (login plus a prod-pointed env). The reused dialogs and the Broadcast / Wati sends write or send for real, so test them on `starlabs-test` only.

## Round 3 flags
Move 4 cards to the Journey Coaching Dashboard (they stay here meanwhile) · "never consumed any in the last 6 months" (no consumption dates).

---

# 2026-09-29 — Load performance + frozen-column drift

Reported on production: slow load, and the Participant / Financial status (frozen) columns drift from the others while scrolling. Uncommitted; the pre-change `.ts`/`.html` are in the session scratchpad as `pre-perf.*`.

## Root cause
- The table drew **every** filtered participant (`@for (p of rows())`): thousands of rows × 8+ columns, each cell calling several methods, rebuilt on every filter click. Analytics shows 25 per page.
- ~~Sticky-cell compositing lag~~ (wrong diagnosis). **Actual cause of the "separate scrolling":** Participant and Financial status were **pinned by default** (`DEFAULT_PINNED_COLUMNS`), so they deliberately stayed in place during horizontal scrolling. The operator wants every column to scroll together.
- Communications analytics read all of `email archive`, `wati archive` and `notificationrecord` at startup, for a popover.

## CHANGE LOG & REVERT GUIDE
| # | Change | Revert |
|---|--------|--------|
| P1 | **Pagination** in `ParticipantTableComponent`: `pageRows` = one page of `rows()`, sizes 25 / 50 / 100 / 200 (default 50), first / prev / next / last, "x–y of N". Resets to page 1 (and scrolls to the top) whenever the rows change. Filters, sort, selection and select-all still cover **all** filtered rows. Hooks: `pi-page-size`, `pi-page-first` / `prev` / `next` / `last`. | Loop over `rows()` again; drop the pager block and signals. |
| P2 | **Comms analytics lazy**: `store.loadCommsAnalytics()` runs on the popover's `(menuOpened)`, cached until Refresh. The topbar queued badge therefore appears only after the popover has been opened once. | Call `getCommsAnalytics()` in `init()` again. |
| P3 | **Faster first paint**: `forkJoin` waits only for reference + participants; audiences load alongside. | Put `audiences` back into the forkJoin. |
| P4 | ~~Frozen cells get `will-change: transform`~~ **Withdrawn**: based on a wrong diagnosis (see below). | — |
| P5 | **No columns frozen by default**: `DEFAULT_PINNED_COLUMNS = []`, and `frozenLefts` returns nothing when no column is pinned, so the checkbox column scrolls too. Pinning stays opt-in in the Columns menu (pinning any column still pins Participant as well). | Restore `['name', 'financialstatus']` and remove the early return. |
| — | Sort value computed once per row (decorate-sort-undecorate), not twice per comparison. | Previous comparator. |

## Verification
`ng build` (dev) passes and `tsc --noUnusedLocals` is clean. **Not measured on production** (no login); the operator confirms load time and column alignment there.

## Note
`origin/charan-release` has an **older** copy of this component (92d6f49c + hooks 216325a8), without rounds 1–3. The operator said not to pull from it. The 7 hooks from 216325a8 (`pi-search-clear`, `pi-toggle-insights`, `pi-toggle-rail`, `pi-checklists`, `pi-comms`, `pi-refresh`, `pi-checklist-item`) are **not** in feature-test's HTML.

## 2026-09-29 (cont.) — table spacing / truncation, rail close, column order
From the operator's screenshot: wide gaps between columns, product / tag / email text cut off, a missing close for the filter panel, and the pager select showing 25 while 50 rows were displayed.

| # | Change | Revert |
|---|--------|--------|
| T1 | `colWidth()` sized per column type (products / playlists 280, tags 230, email 230, status 132, date 124, money 120, number 96, name 250, other 160). `gridTemplate` uses fixed px, and only the **last** column stretches (`minmax(w, 1fr)`). Before, every column was `minmax(150px, 1fr)`, which spread spare width as gaps. Rows are separate grids, so widths must be fixed to stay aligned. | Old `colWidth` / `gridTemplate`. |
| T2 | Product lines and tag chips **wrap** (`overflow-wrap: anywhere`, `.chips` flex-wrap) instead of ellipsis / `max-width: 120px`. Tags show 3 then +N (was 2). Email has a `title` tooltip. Cell padding 14 → 10px. | Old CSS. |
| T3 | Pager select uses `[selected]` per option, because `[value]` on the select was applied before the options existed. | — |
| T4 | Filter rail header gets a close button (`pi-filter-close`, `close` output → `railOpen.set(false)`); the topbar Filters button reopens it. | Remove the button / output. |
| T5 | Columns menu → "Add column" sorted A–Z (`availableColumns` sorted by label). | Remove the `.sort`. |

Not viewed logged-in; the operator checks on their dev server.
| T6 | **Reopen strip**: when the filter panel is closed, a 40px vertical "Filters" strip (with the active-filter count) sits in its place (`pi-filter-open`). The operator couldn't find how to reopen after closing (the topbar Filters label is hidden under 1100px). | Remove the `@else` block + `.rail-reopen` CSS. |
| T7 | **Default columns = Participant only** (`DEFAULT_VISIBLE_COLUMNS = ['name']`), also after Reset. Everything else is added from the (A–Z) Columns menu. | Restore the previous 8-column list. |
| T8 | **Communications button → Notification record screen**: the 📣 button opens `/notificationrecord` in a new tab. The popover and all of its code are removed: `CommsAnalyticsPanelComponent`, `Comms*` models, `getCommsAnalytics` / `channelStats` (which read the three archives), `commsAnalytics` / `queuedTotal` / `bumpQueued`, the queued badge and `.pi-comms-menu` CSS. `pi-comms` hook restored on the button. | Restore from `pre-comms.*` in the scratchpad. |
| T9 | **Top-bar Insights and Filters buttons removed.** Insights: a minimise button inside the cards (`pi-insights-minimize`, `minimize` output); when minimised, an "Insights · N need attention" bar expands it again (`pi-insights-expand`). Filters: the rail's close button plus the left reopen strip (T4 / T6). `toggleRail` / `toggleInsights` removed. | Re-add the two `.tbtn` buttons + methods. |

---

# Round 4 — testing report (2026-09-30)

Plan: `specs/plans/2026-09-29-participant-intelligence-round4.md` (two testing reports, deduplicated to 27 points and discussed one by one). Built by a multi-agent workflow (engine → filter rail → page / table / tags in sequence on the single file; analytics dialogs in parallel), then reviewed, fixed and unit-tested. Uncommitted. Pre-round copies are in the session scratchpad `pre-round4/`.

## CHANGE LOG & REVERT GUIDE
Revert everything for this round: restore the 3 component files from `pre-round4/`, delete `participant-intelligence.unit.spec.ts`, and `git checkout` the two dialog folders + `participants-analytics.component.ts` (the last three were untouched before this round).

| # | What changed |
|---|---|
| 3 | Responsive top bar: count under the title, icon-only tools below ~1200px, wraps instead of clipping |
| 4 / 4b | "Save filter" (renamed; also in the chips strip); Saved filters list at the top of the filter rail (search, live counts, active highlight, Manage); the top dropdown keeps Lists + Segments |
| 5 | Search in Columns → Add column; the menu stays open |
| 6 | manage-participantlist-dialog "Filter By" and create-segments-dialog dropdowns: ngx-mat-select-search + A–Z (via analytics' `filterOptions`). create-participantlist-dialog has no dropdowns (and nothing opens it) |
| 7 | "Journey segment" filter from `segmentboardconfig` + `segmentboardlist` (with the "updated" date) |
| 8 / 9 / 10 | Event and Queue sections each have the status switch + search; options "Name · date (count)" |
| 11 | Queue Completed / Live from `queue_token` split by `currentstage` (fixes Completed = 0, and Live counting finished tokens) |
| 12 | `CountCondition` At least / At most / Exact / Is between for uP!, CPM, ATC and product rules; all saved in `pifilter` (product rules were never saved before) |
| 13 | ATC missing → null → "—" |
| 14 | Subscription date range picker + 8 relations (day precision, inclusive, open sides); analytics-compatible keys still written for start / end between |
| 15 | Validators: invalid / no-op conditions aren't applied and make no chip; red inputs with messages |
| 16 | Consistent sorting, blanks always last, sort-basis tooltip |
| 17 | Active insight toggles off; Reset = Clear all; the top-bar count shows the active insight with ✕ |
| 18 | The loaded audience survives refinement ("· + N filters" / "· modified" + Update saved filter) and has its own chip |
| 19 | "· last" on non active subscription dates; Current / Last subscription start / end columns |
| 20 / 21 | Primary "+ Create tag"; required, editable "Tag for" (live event · queue event · video ask · journey coach) |
| 23 | HOP mismatch = HOP set and ≠ active journey; expired by day; "engaged" = real known products / journey; "Active, no remarks yet" |
| 24 | "Finance status" category: per-status cards + "Active customer, non-active finance" (R1–R5 unchanged) |
| 25 | Watson checklist rows: "View profile" |
| 27 | "Multiple DFU products active" (product `type == 'DFU'`, ≥ 2 active entries) |
| — | Saved filters now round-trip every field (`setDoc` mergeFields). **participants-analytics.component.ts**: one line, whose filter loop now skips `pifilter` |

## Verification
- Unit spec `participant-intelligence.unit.spec.ts` (repo convention `*.unit.spec.ts`, `tsconfig.unit.json`): **104 / 104 pass** (conditions, 8 relations, validation, sorting, queue split, insights, finance, DFU, Watson, include / exclude).
- `tsc` clean for the component; the development build passes. The in-build review raised 27 findings (0 high) and 20 were fixed.
- The follow-up adversarial verification workflow was **stopped by the operator** during its read-only find step (no edits).
- **Not viewed logged-in.**

## Operator decisions (2026-09-30)
1. **Confirmed-event counts:** do not load all approved requests at start → **flagged**. Counts stay on-demand.
2. **Participant count moved out of the top bar:** it now sits in a `.table-meta` line just above the table ("N of M participants" + active insight ✕; hooks `pi-count`, `pi-insight-clear`). The top bar shows only the title; the `.titles` / `.sub` / `.brand.with-insight` CSS was removed and table-wrap's top margin is 14 → 8px.
3. **Fixed** the create-segments-dialog bug: `filterAvailableTags` / `updateAvailableTags` compared `tag.docid`, which `participant tags` docs don't have (options and `segments.tagids` use `tag.id`), so already-picked tags stayed listed as available. Both now compare `tag.id`. Revert: `git checkout` the dialog file (the #6 search change is in the same file).
4. **e2e:** not now; the operator will say when (page spec PI-01..04 is out of sync with the new hooks).

Checks after these: tsc 0 errors, dev build OK, unit spec 104 / 104.

## Flags (not built)
Backend customer-status job (Watson R2–R4 mismatches) · Onboarding status + active-by-age insights · Load approved requests for all events at start (Confirmed counts for every event option).
