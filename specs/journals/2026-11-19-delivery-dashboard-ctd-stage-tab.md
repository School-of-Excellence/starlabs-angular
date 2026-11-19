# 2026-11-19 — Delivery dashboard: CTD D&I (Appointment) stage tab + stage logic tooltips

## Revert guide

| Entry | State | Scope | Files | Revert |
|---|---|---|---|---|
| CTD tab + tooltips | uncommitted | `/delivery-dashboard` → Stages section | `src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component.{ts,html,css}` | `git checkout -- "src/app/Journey Onboarding/delivery-dashboard-clone/"` (once committed: `git revert <hash>`) |

| Stages search + month columns (EI Starter Pack / EI Solution) | uncommitted | `/delivery-dashboard` → Stages | same three files | same command. These edits sit in the same files as the CTD entry, so reverting one by itself means hand-editing: drop `matchesStageSearch` / `getStageScheduledCards` / `tentativeStartMonthBucket`, the month buckets, and the re-indexed `updateFilteredCards` sources |

Self-contained: no other screen depends on it. The `ctdStageType()` alias fold sits in shared stage helpers, but it only rewrites two CTD type names, so other products are unaffected and reverting it alone is safe.

## What changed

- New Stages chip **CTD D&I (Appointment)** (hook `ddc-btn-ctd-appt`). Columns: Total Eligible → Diagnostics → Implementation → Review → Completion.
- Stage mapping: Diagnostics = `CTD Diagnostics`; Implementation = `CTD Implementation` + `CTD Implementation Appointment`; Review = `CTD Review` + `CTD Review/Validation` (via `ctdStageType()`).
- Tooltips: a column-header tip per CTD column (`stageColTips`), and a tip on every stat chip for all products (badge, Completed, Cancelled, All, Scheduled, Waiting), via `stageStatTip()`. Same style as the existing `logicTip` (above, 250 ms delay).
- Empty-state hint now reads "Choose a product above".
- **Tooltip rewrite (operator feedback, same day):** the first draft described the UI ("number of cards this column holds") instead of the rule. Every tip now follows the `logicTip` voice: *Label — who is counted (status / field), which window, one row per what.* The column badge reuses the column-title rule. "Selected month" became "this calendar month", because the board has no month picker: `selectedMonth` is always the current month. Stage-column titles also note that the cards follow the All / Scheduled / Waiting tab, which explains why the Diagnostics badge reads 0 while 29 Waiting cards show.

## Why

- **Exact product, not the merged CTD card** (operator decision): the page merges four CTD products into one "CTD Diagnostics & Implementation" card. The tab uses only `CTD Diagnostics & Implementation (Appointment)` (`products/5rveXecc26pY8JOUGT8k`), so the 1,420 queue enrolments don't swamp it.
- **Source is the `appointments` collection**, the same as the other tabs. A production read-only probe (2026-11-18) found no CTD sessions anywhere else: there are no participation requests, and the queue tokens these participants hold belong to the queue product.
- An ongoing participant with attended appointments but **no CTD stage appointment** goes to Total Eligible, not into a silent drop (the other products drop them).

## Findings to keep in mind

- The board will be sparse. This product has 103 enrolments (13 initiated/ongoing/completed, 42 with no status, 48 cancelled) but only 2 linked appointments ever. Four went ongoing on 13–18 Nov 2026 and haven't booked yet.
- **"Cancelled" stat is always 0 for every product**: `filterAppointmentsByType('all')` queries `cancelled == false`, so `stage.cancelled` is never filled. The tooltip says so. This is a pre-existing bug and has not been fixed.
- **EI Solution latent bug**: `filterProductData` pushes to `productData.eiCustomSolutions.onBoarded`, but the key is `onBoarding`. A participant whose furthest attended is the EI Welcome Call throws, and the try/catch then swallows the whole EI Solution board refresh. This is pre-existing and has not been fixed.
- Total Eligible counts no-status products when the minimum is paid. If that inflates the CTD count, narrow it to `initiated` for CTD only.

## Stages search + month columns (EI team report, same day)

- **Search reached only some columns.** `updateFilteredCards` filtered `filteredCardsMap` (the badges and legacy columns), but stage columns render `stage.all` and `getNotScheduledCards()` directly. Fix: `matchesStageSearch()` is applied in `getStageScheduledCards()` (template now uses it instead of `stage.all`), `getNotScheduledCards()` and `getScheduledOnboardingCards()`. The export calls `getNotScheduledCards(key, false)`, so it stays unfiltered.
- **Month columns were shifted.** EI Starter Pack has 10 columns but the data was wired by position to 7 lists, so Next Month showed Diagnostics, Diagnostics showed Celebration Call, and the last three columns were empty (verified live). `handleMonthCategory` was never called. Fix: the sources are re-indexed 1:1 with the column lists; Past / This / Next Month hold not-started products bucketed by `participantsproduct.tentativestart` (written by journey planning, `journeyplan.component.ts:518`), by calendar month from today. **They stay in Total Eligible as well** (a view, not a move), so Onboarding's Waiting pool is unchanged. EI Solution gains This Month / Next Month. `filteredCardsMap` is now cleared on each refresh so leftover indexes from a wider product don't linger.
- **EI Solution `onBoarded` typo fixed** (it pushed to an undefined key, the catch swallowed the error, and the whole EI Solution board refresh was lost). One word; this was needed for the EI Solution stage board to fill reliably.
- Month-column tooltips were added in the same `logicTip` voice.
- The participant investigation (21 names, the reason for each) went to the operator as a PNG; it isn't in the repo. Root causes, briefly: newer open cycle replaces the completed one; period filter; discontinued customers are never loaded; "EI Solutions for Health" is not on the EI card; Integration Mode is excluded; parallel-product rule; an undated new cycle loses the "latest record" pick to an old completed one; Total counts "initiated".

## Pending

- UI check while signed in (the code compiles on the dev server; the page is auth-gated).
- e2e: register `ddc-btn-ctd-appt` in the delivery-dashboard suite before pushing.
