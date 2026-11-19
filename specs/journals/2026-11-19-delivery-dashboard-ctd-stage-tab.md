# 2026-11-19 — Delivery dashboard: CTD D&I (Appointment) stage tab + stage logic tooltips

## Revert guide

| Entry | State | Scope | Files | Revert |
|---|---|---|---|---|
| CTD tab + tooltips | committed `fb978277` (pushed) | `/delivery-dashboard` → Stages section | `src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component.{ts,html,css}` | `git checkout -- "src/app/Journey Onboarding/delivery-dashboard-clone/"` (once committed: `git revert <hash>`) |

| Stages search + month columns (EI Starter Pack / EI Solution) | committed `fb978277` (pushed) | `/delivery-dashboard` → Stages | same three files | same command. These edits sit in the same files as the CTD entry, so reverting one by itself means hand-editing: drop `matchesStageSearch` / `getStageScheduledCards` / `tentativeStartMonthBucket`, the month buckets, and the re-indexed `updateFilteredCards` sources |

| CTD full sequence + 1st / Next Cycle toggle, Overview tooltips (multi-line), Add-on count, full-name dropdowns | committed with this entry (see `git log -- "src/app/Journey Onboarding/delivery-dashboard-clone"`) | `/delivery-dashboard` → Stages (CTD), Products Overview, every dropdown | the three component files + `src/styles.css` (`.dd-logic-tip`, `.dd-full-options`) | `git revert <that commit>` — the two `src/styles.css` rules are scoped to `dd-` classes, nothing else uses them |

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

## CTD stages: full delivery sequence + 1st / Next Cycle toggle (operator, same day)

The first cut showed only the appointments. The operator supplied the real sequence, in two versions:

- **1st Cycle:** CTD Aspiration Form → ATC Understanding Validation → My Evolution Wishlist → CTD – Impact Valuation Activity (forms) → CTD Diagnostics → CTD Implementation → CTD Implementation → CTD Review (appointments).
- **Next Cycle:** the same, with **My Pocket ATC** as the third form.

How it's built:
- A toggle (`ddc-ctd-cycle-first` / `ddc-ctd-cycle-next`) picks the version. Each enrolment's version comes from `participantsproduct.deliverytype`: "1st Cycle" or empty = 1st Cycle; anything else = Next Cycle. **Verified in production:** `productToDeliverySequence` for this product has exactly two options, "1st Cycle" and "Next Cycle", with this stage order (its third-form labels read "Self ATC" / "Self ATC Next Cycle", but the forms themselves are My Evolution Wishlist / My Pocket ATC). Enrolments today: 102 are 1st Cycle or empty, 2 are Next Cycle.
- Columns: Total Eligible, the 4 forms, Diagnostics, Implementation 1, Implementation 2, Review, Completion.
- Each enrolment sits at its **furthest done step**. Forms count once submitted; they come from `formsByClient` via `FilterReportData`, exactly like Critical Support's Pre/Post forms. Appointments count once attended. Form names are matched ignoring case, spacing and dash style, because "CTD – Impact Valuation Activity" uses an en dash. **Verified:** `delivery forms` and the 18 `formsByClient` submissions (database `firestore-forms`) use exactly these names.
- `buildCtdStageData()`: appointment columns use only this product's enrolments on the selected cycle, because CTD appointment types are shared with the CTD queue, Platinum and Diagnostics (Appointment) products. Implementation is split per enrolment by start time: the first one loaded this month is Implementation 1, later ones are Implementation 2.
- CTD Waiting: "booked" means a scheduled appointment in *that* column. The generic "any appointment of the type" test would hide everyone waiting for their 2nd Implementation.
- `filterAppointmentsForStage` was split into filter + `bucketStageAppointments()` so CTD can reuse the bucketing.

- **Forms kept apart from appointments** (`loadedForms` / `loadedAppointments`). The live appointments feed used to replace `allAppointments` with appointments only, which dropped every submitted form (Critical Support's form columns too) until the forms feed fired again. The forms feed appended instead of replacing, which duplicated forms on each refresh. Both feeds now rebuild the merged list from the two halves.
- Expected 1st Cycle board from production (19 Nov): the 5 ongoing enrolments sit at Aspiration Form 1, ATC Understanding Validation 2 and Impact Valuation Activity 2, with no CTD appointments this month. Next Cycle has 2 enrolments, both not started.

Known limit: appointments only load for the current month, so an Implementation from a previous month isn't seen. A second Implementation this month then counts as Implementation 1. Forms are not month-limited.

## Product Overview tooltips: Eligible / Overall / Not Eligible / Purchased / Bonus + clearer funnel tips (operator, same day)

- New `logicTip` keys `eligible`, `total` (the "Overall" chip), `notEligible`, `purchased` and `bonus`, wired onto the Eligible hero and the four chips.
- Rewrote `yetToStart`, `init`, `started`, `ongoing`, `done` and `delivered` as bullet lists. Each one now says outright whether the **date filter is USED or NOT used**, and which date it reads.
- Tips render multi-line through `matTooltipClass="dd-logic-tip"` plus a global rule in `src/styles.css` (`white-space: pre-line`, 380px max width). It has to be global because the tooltip overlay sits outside the component.
- Rules surfaced while writing them (from code, not changed):
  - `isDateInRange()` returns true when the date is missing, so a record with no initiated / ongoing / completed date is counted in Init / Started / Done whatever period is picked. The tips say so.
  - The Overview counts ignore the customer / finance / parallel filters; those only filter the participants table.
  - There was no Add-on count on screen: `addonsPackageIds` (package "Addons") was loaded, but `groupedAddons` was never filled. Fixed below.
- Revert: same three files plus the `.dd-logic-tip` block at the end of `src/styles.css`.
- **Add-on chip added (operator said yes).** Eligible products whose package is "Addons" (`addonsPackageLookup`) now fill `groupedAddons`. The chips are disjoint: **Eligible = Purchased + Bonus + Add-on**, so **Purchased no longer includes add-on packages and drops by that amount**. Added: the Add-on chip in the Overview row (`ddc-chip-addon`) and in the card chip row (`ddc-btn-addon`), an "Add-on" header tag, the modal type `addons` (title plus status select), the `logicTip.addons` tooltip, and Purchased / Bonus / Eligible tips updated to the 3-way sum. The chip grid widened from 4 to 5 columns through overrides at the end of the component CSS. Production (19 Nov): one "Addons" package, 296 not-started enrolments on it (e.g. WiSH D&I 12, CTD Live Event 109, which is hidden).

## Dropdowns show full names + screen check (operator, same day)

- **Products filter was 220px wide**, so 17 of 24 names ended in "…". It now has `panelWidth=""`, which lets the list grow to its longest option (483px for "A&H Custom Motherhood Excellence Solution for Wife"). Every dashboard `mat-select` now carries `panelClass="dd-full-options"`, and a global rule in `src/styles.css` caps the list at min(520px, 92vw) and wraps a longer name onto a second line instead of cutting it. Verified: 0 of 24 Products options clipped.
- **Chip column widened** from 2.2fr to 2.7fr so the 5 participant chips fit (58px each at 1440px wide). Below about 700px wide the whole row is cramped anyway; it already was with 4 chips.
- **Checked in the browser pane (signed in), 19 Nov:**
  - all 11 product rows add up (Eligible = Purchased + Bonus + Add-on; Overall = Eligible + Not Eligible)
  - the multi-line tooltips render
  - CTD 1st Cycle = Aspiration Form 1, ATC Understanding Validation 2, Impact Valuation Activity 2, Total Eligible 24, which matches production
  - EI Starter Pack / EI Solution columns still line up
- **Load order:** the CTD board first shows 29 / 0 / 0 / 0, then fills in about 7 seconds once `formsByClient` arrives, and stays stable afterwards. That's expected: forms load after the first pick of a product.

## Stages search + month columns (EI team report, same day)

- **Search reached only some columns.** `updateFilteredCards` filtered `filteredCardsMap` (the badges and legacy columns), but stage columns render `stage.all` and `getNotScheduledCards()` directly. Fix: `matchesStageSearch()` is applied in `getStageScheduledCards()` (template now uses it instead of `stage.all`), `getNotScheduledCards()` and `getScheduledOnboardingCards()`. The export calls `getNotScheduledCards(key, false)`, so it stays unfiltered.
- **Month columns were shifted.** EI Starter Pack has 10 columns but the data was wired by position to 7 lists, so Next Month showed Diagnostics, Diagnostics showed Celebration Call, and the last three columns were empty (verified live). `handleMonthCategory` was never called. Fix: the sources are re-indexed 1:1 with the column lists; Past / This / Next Month hold not-started products bucketed by `participantsproduct.tentativestart` (written by journey planning, `journeyplan.component.ts:518`), by calendar month from today. **They stay in Total Eligible as well** (a view, not a move), so Onboarding's Waiting pool is unchanged. EI Solution gains This Month / Next Month. `filteredCardsMap` is now cleared on each refresh so leftover indexes from a wider product don't linger.
- **EI Solution `onBoarded` typo fixed** (it pushed to an undefined key, the catch swallowed the error, and the whole EI Solution board refresh was lost). One word; this was needed for the EI Solution stage board to fill reliably.
- Month-column tooltips were added in the same `logicTip` voice.
- The participant investigation (21 names, the reason for each) went to the operator as a PNG; it isn't in the repo. Root causes, briefly: newer open cycle replaces the completed one; period filter; discontinued customers are never loaded; "EI Solutions for Health" is not on the EI card; Integration Mode is excluded; parallel-product rule; an undated new cycle loses the "latest record" pick to an old completed one; Total counts "initiated".

## Pending

- UI check while signed in (the code compiles on the dev server; the page is auth-gated).
- e2e: register `ddc-btn-ctd-appt`, `ddc-ctd-cycle-first`, `ddc-ctd-cycle-next`, `ddc-chip-addon` and `ddc-btn-addon` in the delivery-dashboard suite before pushing.
