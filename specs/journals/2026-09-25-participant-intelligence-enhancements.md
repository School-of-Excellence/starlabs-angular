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
