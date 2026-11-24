# 2026-11-23 — Sale Achieved opens a full-screen dialog (no more side-panel mode)

Plan: `specs/plans/2026-11-23-sale-achieved-dialog.md` (approved). Builds on the Sale Achieved card
(2026-10-14), its panel date range (2026-11-02), the Heritage Ledger redesign (`2026-11-17-workshop-dashboard-redesign.md`)
and colour option A (`2026-11-19-workshop-dashboard-colour.md`).

## The request

"there is a sale achieved when i click i dont want a side panel i want to open a new full screen dialog in that dialog
list the data". The operator then chose: one row per buyer that expands to their purchases; From / To dates, sort by
amount or recent, search by name / email / phone, and Export to Excel.

## What landed (app stage)

All uncommitted; the operator commits. The New Sign-ups change already in the working tree is untouched.

- **New standalone component** `workshop-dashboard/sale-achieved-dialog/sale-achieved-dialog.component.{ts,html,css}`,
  hook prefix `wsad-`, loaded lazily by `openSaleAchieved()` (`import('./sale-achieved-dialog/…')`, as the
  communication dialog is). MatDialog config: `width/height 100vw/100vh`, `maxWidth/maxHeight 100vw/100vh`,
  `panelClass: 'wsad-panel'` (radius 0, no shadow, `100dvh` where supported), `ariaLabelledBy: 'wsad-heading'`,
  `autoFocus: 'first-tabbable'` with `cdkFocusInitial` on the close button, `restoreFocus: true`, plus an explicit
  `card.focus()` after close.
- **Pure helpers** `sale-achieved-dialog/sale-achieved.ts` (not `*.component.ts`), 14 specs in
  `sale-achieved.unit.spec.ts`: `saleDialogView` (range → search → sort, shown total + count), `matchesSaleSearch`,
  `buyerPhone`, `toSaleRow`, `purchasesNewestFirst`, `saleDialogExportRows`, `saleExportFileName`, and the
  `SaleAchievedSource` interface the dashboard implements.
- **Dashboard:** the card (`wdash-sale-card`, `wdash-sale-total`, `wdash-sale-count`) and `loadSaleAchieved` are as
  they were; the click passes the card element. Removed: the side panel's Sale Achieved heading case and subtitle rule,
  "Buyers (n)" label, sort segment, From / To range + clear, "Total value" row, per-row amount, the purchases hover
  card and their state / handlers (`saleTipRow`, `saleTipStyle`, `saleTipTimer`, `showSaleTip`, `keepSaleTip`,
  `hideSaleTip`, `saleSort`, `setSaleSort`, `saleFrom`, `saleTo`, `clearSaleRange`, `saleShownTotalLabel`, the
  `saleAchieved` branches in `onMetricClick`, `applyFilterSide`, `exportParticipants`, `statusDisplayMap` and
  `PANEL_TONES`), and their CSS (`.wdx-total`, `.wdx-amt*`, `.wdx-hcard*`, the picked-row tint). `saleMin` / `saleMax`
  stay (the dialog's date bounds). `personMenuOpen` stays — the tag-change focus logic still reads it.
- **Spec touch-up:** `workshop-dashboard.person-tags.spec.ts` used `'saleAchieved'` as its example of a panel without
  tag chips; it now uses `'notInChatGroup'`.
- **Retired hooks:** `wdash-sale-from`, `wdash-sale-to`, `wdash-sale-range-clear`, `wdash-sale-sort-amount`,
  `wdash-sale-sort-recent`, `wdash-sale-panel-total`, `wdash-sale-amount`, `wdash-sale-tip`.

## Why each constraint landed

- **A live source, not a copy.** The card's Watson lookup can still be running when the dialog opens (it waits for
  `new_user_data`). A one-time copy of `saleAchievedParticipants` would freeze the dialog on "loading". The dashboard
  hands getters over its own state (`status`, `buyers`, `windowLabel`, `min`, `max`, `workshopTitle`, `canExport`);
  the dialog uses default change detection, so the next app tick after the lookup lands repaints it. The view is
  memoised on the buyers array's identity (a new array per lookup) and the four tool values, so the getters are cheap.
- **No read in the dialog.** Watson is read-only and the card already paid for the lookup; the dialog is a view over
  it. `loadSaleAchieved` lost only its last line (re-opening the side panel), which had become dead.
- **The range, sort, total and export reuse the shared helpers** in `watson-purchases.ts` (`saleBuyersInRange`,
  `sortSaleBuyers`, `saleBuyersTotal`, `saleExportRows`, `formatRupees`), so the dialog filters exactly as the side
  panel did (whole local days, either end open, a reversed pair swapped, buyers with nothing left dropping out). Only
  the search, the row shapes and the file name are new.
- **Search order: range, then search, then sort.** The search narrows who is shown; the range decides which purchases
  count. Phone search compares digits when the query is only digits once spaces, "+", "-", "." and brackets are
  dropped, so "+91 98200" and "9820000006" both find "+91 98200 00006".
- **The phone shows its dial code.** Participant metadata spells it `countrycode`, `new_user_data` `countryCode`; a
  number already stored as "+…" is shown once. (The export first wrote the same "+91 …" string. The fix round
  below split it into `Country Code` + `Phone`, because a cell starting with "+" is a spreadsheet formula.)
- **Export is the dashboard's own CSV writer.** "The dashboard's export helper" is `createCSVContent` + `downloadCSV`
  (the dialog calls it through `source.download`), so the file is still `workshop-sale-achieved-<workshop>-<date>.csv`
  and opens in Excel. CSV has one sheet, so there is no "Buyers" sheet — the plan made it conditional on the helper
  supporting sheets. No confirm prompt (the button says what it does), and it follows the panel's export right:
  without `can('export')` there is no Export button.
- **Tools are present but disabled until there is someone to filter.** Loading, unavailable and an empty window all
  disable From / To, sort and search (the sort keeps `aria-pressed` so the default is visible); Export is disabled
  whenever nothing is shown. The date pickers carry the window as `min` / `max` even when disabled, so e2e can check the
  bounds in the emulator, where there is no Watson.
- **Row click also toggles, unless the click ended a text selection** — someone copying an email should not collapse
  the row. The toggle button carries `aria-expanded` (and `aria-controls` while open) and stops the click so it does
  not toggle twice.
- **Full screen is styled through `panelClass` + `::ng-deep` in the dialog's own sheet**, not `src/styles.css`: the
  styles ship with the lazy chunk, and `styles.css` is cross-cutting for the readiness gate (every suite fans out).
- **No `.wsad button` reset.** In emulated encapsulation an element-level reset (`.wsad[a] button[a]`) outranks each
  button's own class, so each button class sets its own box; typography is pinned on `:host`, headings, lists and
  `dl`, and labels get `white-space: normal` against `styles.css`'s `label { white-space: pre-wrap }`.
- **The table header sticks with `overflow: clip`.** `overflow: hidden` on the rounded table would make it the sticky
  header's scroll box and the header would not stick.
- **Below 768px every buyer is a card** (one `tbody` per buyer, so the buyer row and its purchases move together).

## Results

- Unit (CI way, `tsconfig.unit.json`): the new spec + dashboard engine + glance — **226 / 226** (212 before + 14).
- The dashboard Karma specs this touches (person-tags, export, `watson-purchases.spec.ts`) plus the new spec, through
  a scratch tsconfig — **75 / 75**.
- Production build: exit 0, 35 warnings (the baseline), none from the touched files; the dialog is its own lazy chunk
  (~29 kB).
- Not seen in a browser this stage (no servers started); e2e is the next stage.

## Pending

- Hub: move WDC-15/16 out of `workshop-dashboard-communication.spec.ts` into a new gated
  `workshops/workshop-dashboard-sale-dialog.spec.ts` keyed on `wsad-` hooks (per the plan), covering the card states,
  open → full viewport + no side panel, the unavailable state, the disabled tools with the window bounds, close by
  button and Escape with focus back on the card. `wsad-no-match-clear` (the no-match state's clear, a hook the plan's
  table did not list) is new too. Without Watson the emulator never has buyers, so these hooks cannot be driven there
  and belong with the hooks no case drives: `wsad-range-clear`, `wsad-search-clear`, `wsad-row`, `wsad-row-toggle`,
  `wsad-name`, `wsad-email`, `wsad-phone`, `wsad-purchases`, `wsad-amount`, `wsad-latest`, `wsad-purchase`,
  `wsad-loading`, `wsad-empty`, `wsad-no-match`, `wsad-no-match-clear` (their logic is in the unit spec).
- graphify is not installed on this machine, so the graph rebuild after code changes was skipped.

## Fix round (review findings + screenshot review), 2026-11-23

The e2e stage passed (117/117, WSD-01..04 4/4). Its screenshot harness (`workshops/zz-sad-shots.spec.ts`, never
committed) filled the dialog through the dashboard's own state, and that plus a code review gave the list below.
Each item was checked against the code or a screenshot before it was changed.

Fixed (app, uncommitted):
- **Phones: the header and tools no longer pin.** Below 768px `.wsad` is the scroll container and `.wsad-body` grows
  (`flex: 1 0 auto; overflow: visible`). Before, the header (153px) and tools (225px) never scrolled, so an 844px
  phone left 466px for buyers and a 667px one about 290px. Now they scroll away with the list. Not done: putting sort
  and Export on one row. They are not next to each other in the DOM, and reordering them with CSS would make the
  visual order differ from the tab order.
- **The "·" never starts a line.** It used to be `.wsad-ws + .wsad-window::before` in a wrapping flex row, so at 390px
  the window line started with "· Bought …". Now it hangs in a 22px gap left of the window line
  (`margin-left: -22px`), and `.wsad-sub` has `overflow: hidden`. Beside the title it shows. When the line wraps, it
  sits outside the box and is clipped. This works at every width (tablets with long titles too), not only below 768px.
- **CSV phone is now two columns, `Country Code` (digits) then `Phone`.** "+91 9820000006" in one cell starts with
  "+", and spreadsheets read that as a formula (#NULL! in Excel, #ERROR! in Sheets). Two columns is the repo's
  existing convention (`upcomingworkshopresponses`, `newusersprofile`). If a number was stored with its own dial
  code, `exportPhoneParts` splits it at the first separator ("+44 7700 900123" → 44 / 7700 900123). With no
  separator, it strips a known code prefix, or else drops the "+". A unit test checks that no exported cell starts
  with `= + - @`. The dialog still SHOWS "+91 9820000006".
- **Narrowed figures say so.** With a range or a search set (`view.filtered`), "of ₹3,50,997" and "of 4" appear under
  the figures. With no match, the ₹0 is grey, not the sale green. The view now carries `filtered`, `allTotalLabel`
  and `allCount`, which replaces the dead `filtered` getter.
- **The no-match clear names what it clears:** "Clear search", "Clear dates" or "Clear search and dates" (copy
  settled in the lean pass below).
- **Focus stays in the dialog after a clear.** Each clear button removes itself. The dates' ✕ now focuses From, and
  the no-match clear focuses the search (the search ✕ already focused the search).
- **Escape in a typed search clears it and keeps the dialog open.** `(keydown.escape)` calls `preventDefault` and
  `stopPropagation` only when there is text, so CDK's body-level listener never sees that key press. Escape in an
  empty search still closes the dialog. The search wrapper is now a `div`: a `label` may hold only one control, and
  it held the input and the ✕.
- **No layout shift when a date is picked.** While no date is set, an empty 38px `.wsad-iconbtn-room` holds the ✕'s
  place, so the sort and search no longer jump about 46px. The span has no hook and is not interactive. The e2e still
  sees `wsad-range-clear` with count 0.
- **Clearer click cue.** The row hover went from #f8fafc to #f1f5f9, and the toggle tints on row hover. On phones
  the toggle is a bordered 32px button, not a bare light chevron.
- **Emails wrap at "@" and "."** (`emailBreakParts` → `<wbr>`), not mid-word. The cell's text is still the whole
  address.
- **No window is not "nobody bought".** If the workshop has no registration start or end date, the empty state says
  there is no sale window yet and how it is set. It no longer says "No purchases in this window".
- ~~Export file date is the LOCAL day.~~ Reverted in the lean pass below: the UTC file date is pre-existing and was
  kept on purpose.
- **The component now has its own TestBed spec:** `sale-achieved-dialog.view.unit.spec.ts`, named `*.unit.spec.ts`
  so CI's unit gate picks it up, with 15 cases on a mutable fake source. It covers:
  - the live source (loading, then the list when the lookup lands; a new buyers array; back to loading);
  - unavailable and empty, with and without a window;
  - the toggle's `aria-expanded` and `aria-controls`, a row click, and a click that ends a text selection;
  - the From / To cross-bounds, which WDC-16 drove before;
  - the "of" notes, the no-match labels, and focus after each clear;
  - Escape in the search;
  - export rows and file name, and no Export without the right;
  - sort `aria-pressed`, email `<wbr>`, and close.
- Hub: the stale `wdash-sale-tip` comment in `workshop-dashboard-side-person.spec.ts` now points to the dialog spec.

Not fixed, and why:
- **A failed Watson lookup still reads as ₹0 / "No purchases in this window".** This is pre-existing. The card's
  `catch` sets `ready` with no buyers. A distinct 'failed' state would change the card's figure and add a state, plus
  a hook and an e2e registration, that the plan does not list. That is an operator call. The no-window half of this
  finding is fixed (above).
- **Rounding:** the header total is the rounded sum of unrounded fees, while each row and each export line rounds on
  its own, so they can differ by a rupee or two. This is pre-existing. Rounding each purchase once would change how
  Sale Achieved is computed, and the card's figure with it, which the plan rules out.
- **The dashboard page behind the dialog is 568px wide at 390px.** This is pre-existing and belongs to the dashboard,
  not the dialog. The dialog itself is exactly 390px with no overflow.

## Review fixes + checks (lean pass), 2026-11-23

The fix round above was stopped part-way. This single pass checked what it left in `sale-achieved-dialog/` and
finished it. Everything is in the dialog's own files.
- **Export: no text cell can be read as a formula.** The phone split into 'Country Code' / 'Phone' only covered the
  phone. Every text cell now goes through `csvTextCell` (in `sale-achieved.ts`). A value starting with `=`, `+`, `-`,
  `@`, a tab or a carriage return gets a leading apostrophe, the usual "this is text" mark, so it stays readable.
  Numbers (Amount) are unchanged. A unit case covers a hostile name, email, phone and product.
- **Narrowed figures are labelled.** With a range or a search set, the header reads "Shown excl. GST" and
  "Buyers shown", with "of ₹3,50,997" / "of 4 buyers" underneath. With nothing set, it reads "Total" / "Buyers".
- **Clear copy** is now "Clear search", "Clear dates" or "Clear search and dates", and the ✕ buttons' labels match.
- **Emails** use `overflow-wrap: break-word`, not `anywhere`, so the `<wbr>` before each '@' / '.' are the break points.
- **Already done by the stopped round, and verified here:**
  - Below 768px the header and tools scroll away with the list (`.wsad` is the scroll container; at 390x844 it is
    1237px tall).
  - The '·' never starts a wrapped line.
  - The ✕'s room is reserved: picking a date left sort x=414 and search x=663 unchanged.
  - The rows have a hover tint and toggle cue.
  - Focus moves to From after the dates' ✕ and to the search after the no-match clear.
  - The search wrapper is a `div`, not a `label`.
  - The dead `filtered` getter and the stale `wdash-sale-tip` comment (in the hub) are gone.
- **Pre-existing, left as they are (operator):**
  - Header-total vs per-row/export rounding.
  - The export file name's UTC date: in IST before 05:30 it is yesterday. `saleExportFileName` is back to
    `toISOString`, and its unit case pins the UTC day.
  - A failed Watson lookup reads as ready with no buyers (₹0, "No purchases in this window").
  - The no-window empty state from the stopped round stays. It is a different case and touches only the dialog.

Checks:
- **Production build:** exit 0, 35 warnings (the baseline), none from the touched files. Log:
  `scratchpad/sad-build-lean.log`.
- **Unit tests, the CI way** (`tsconfig.unit.json`, `sale-achieved.unit.spec.ts` and
  `sale-achieved-dialog.view.unit.spec.ts`): 33/33 SUCCESS. Log: `scratchpad/sad-unit-lean.log`.
- **e2e, isolated, the three changed hub files only:** 30 passed, 0 failed, 0 skipped. The dialog file passed 4/4,
  communication 20/20 and side-person 6/6. Log: `scratchpad/sad-run-lean.log`.
- **Screenshots** (temp harness, populated through the dashboard's live state, now deleted):
  - `scratchpad/sad-shots/final-1440.png`: one row expanded.
  - `scratchpad/sad-shots/final-390.png`: no orphaned dot; emails break at '@'; bordered toggles.
- **Readiness gate** over all 13 touched app files: MATCHED, canProceed true. Nothing uncovered, no drift, nothing
  not landed, no new components; 1753 selectors checked.
- **Hub:** committed on `main` as `5e51dbe`, not pushed.
- **Servers:** stopped. The Firestore emulator on :8080 had been left running on its own and was stopped too.
  `functions/package.json` was restored. The operator's :4200 was not touched.


## ₹0 buyers left out (operator, 2026-11-23)

- **The operator's request:** "if the amount is 0 that is total is 0 dont show in the list and also in the buyers count".
- **What changed:**
  - A buyer whose window total rounds to ₹0 (`isZeroRupees`, using the same rounding as `formatRupees`) is now dropped where the card builds its buyers in `loadSaleAchieved`. So the card's "N users" line, the dialog list, the buyer count and the export all agree.
  - The dialog also drops a buyer whose purchases **inside a picked date range** add up to ₹0. Someone who paid in December but has only a ₹0 line in November disappears from a November range.
  - A buyer with a ₹0 purchase line but a paid total stays, and keeps that line.
  - A total of ₹0.6 shows as ₹1 and counts.
- **Unit tests:** 1 new case; 34/34 pass the CI way. The production build passes.
- **No e2e:** Watson is not on the emulator, so the dialog's data cannot be driven there.


## New Sales, Funnel Sales and Upgrades (operator, 2026-11-23)

- **The operator's request:** split the list into "New Sales" (the user's 1st sale) and "Upgrades" (all the others);
  then a new customer who bought again is "funnel" and shows in both New Sales and Funnel Sales. "1st sale" = first
  purchase ever. Plan: the last section of `specs/plans/2026-11-23-sale-achieved-dialog.md`.
- **The rule, as implemented** (`classifySalePurchases` in `sale-achieved.ts`): a person's first sale is the moment of
  their earliest paid, dated purchase across their whole Watson history (`firstSaleMs` in `watson-purchases.ts`). Each
  paid purchase in the window goes into exactly one section:
  - at the first-sale moment → **New Sales**;
  - after it, with the first sale inside the window → **Funnel Sales**;
  - after it, with the first sale before the window → **Upgrades**.
- **Why each constraint landed:**
  - **No new read.** `loadSaleAchieved` already reads every `ParticipantPurchases` doc of these people with no date
    filter, so `buildSaleBuyers` now also returns `firstPaidMs`, and the dashboard carries it as `saleFirstPaidMs`.
    Watson stays read-only, and the emulator (no Watson) is unaffected.
  - **"Paid" = shows as more than ₹0** (`isPaidAmount`: `Math.round(amount) > 0`). A free webinar in 2025 must not make
    a person's first real purchase an "upgrade". The same test drops ₹0 lines from every section. It also drops
    unknown-amount (null fee) and negative lines, which are not sales either; before, those lines were listed with "—".
  - **Ties are moments, not days.** Purchases with the same timestamp (one checkout) are all New. A purchase stored
    only as a `yyyy-mm-dd` string is read as local midnight, so same-day purchases of that kind also tie. This is the
    honest reading of the data.
  - **The first sale is never later than the window's own earliest paid line.** The window lines are part of the
    history. Taking the earlier of the two also covers a buyer object that carries no first-sale moment.
  - **The range never changes a type.** The type comes from the whole history, then `saleBuyersInRange` only picks which
    purchases are shown. A Funnel purchase stays Funnel when the range hides the first sale.
  - **The window start comes from the dialog's `min`** (`saleWindowStartMs`). It is `yyyy-mm-dd` of `saleWindow`'s start,
    read as local midnight, so it is the same moment. The source contract did not need to grow.
  - **The overall buyer count is unique.** Neha in New and Funnel is one buyer. The section counts are their own.
  - **The overall figures stay in the header** (`wsad-total`, `wsad-count`). The summary strip (`wsad-summary`) shows
    the three sections, so the same number is not shown twice.
  - **Expanded state is keyed by section + person,** so opening Neha in New Sales does not open her Funnel row. The
    detail ids carry the section, so they stay unique.
  - **"No match" vs "None in this window":** a section with buyers before the search/range says "No match"; a section
    with none at all says "None in this window". When everything is filtered away, the single existing no-match state
    (with its clear action) shows instead of three empty sections.
  - **Export:** one row per purchase, section by section, with a "Type" column first (New Sale / Funnel / Upgrade).
- **What surprised us:** the `:4201` dev server's watcher missed the python-written edits to `watson-purchases.ts` and
  `sale-achieved.ts`. It reported "no exported member" until the files were touched. The first e2e run then timed out
  on a cold login click in WSD-01, while the production build was running alongside it. The re-run passed 4/4.

Checks:
- **Unit tests, the CI way** (`sale-achieved*.unit.spec.ts`): 49/49 SUCCESS, with 15 new cases. Log:
  `scratchpad/tt-unit.log`.
- **Production build:** exit 0, 35 warnings (the baseline), none from the touched files. Log: `scratchpad/tt-build.log`.
- **e2e:** `workshop-dashboard-sale-dialog.spec.ts`, 4/4 on the re-run. Log: `scratchpad/tt-run.log`.
- **Screenshots** (temp harness, populated via `window.ng`, now deleted): `scratchpad/tt-shots/three-1440.png` (Neha
  expanded in Funnel Sales) and `scratchpad/tt-shots/three-390.png`.
- **Readiness gate** over all 14 uncommitted app files: MATCHED, canProceed true, 1760 selectors checked.
- **Hub:** committed on `main` as `da84451`, not pushed.
- **Servers:** stopped. The Firestore emulator on `:8080` had again outlived its process group and was stopped by
  hand. `functions/package.json` was restored. The operator's `:4200` was not touched.
- **Pending / nits:**
  - The three tables size their columns independently, so the columns do not line up across sections. This is
    cosmetic.
  - The card's figure still sums the window total, including any negative line. The dialog's overall figure sums paid
    lines only. They differ only if Watson ever holds a negative fee.

## "EiFlix New User" chip (operator, 2026-11-23)

- **The operator's request:** a buyer who has a `new_user_data` doc gets an "EiFlix New User" chip after their name in the dialog. This applies **whatever `movedtoexist` says** (absent, false or true).
- **Dialog only.** The dashboard's other "New" rules (`isNewUserProfile`, which excludes moved users) are unchanged.
- **How:** the dashboard passes `newUserIds` through the live source, using `eiflixNewUserIds(mapProfileNew)`, memoised per map, with no new read. Each row view carries `eiflixNew`, and the chip has the hook `wsad-eiflix-new`. If the dialog opens before `new_user_data` has loaded, the chip appears once it lands.
- **Checks:**
  - unit tests: 52/52, the CI way;
  - production build: exit 0, 35 warnings (the baseline);
  - hub WSD: 4/4;
  - readiness gate: MATCHED;
  - hub commit `3b3e449`, local and not pushed.
- **Process note:** this was started as an agent run, then stopped and finished by hand. The agent had already written most of it, and finishing directly took about 10 minutes. Small UI changes are done directly from now on.

## Purchases before enrolment left out + header "Opt-in" (operator, 2026-11-23)

- **The operator's request:** "if the user purchase date is before the enrollement date we dont want that.. if the user purchase after the enrollment only we need to take".
  - **The rule:** `purchasesFromEnrolment` in `watson-purchases.ts`, applied in `buildSaleBuyers`. It keeps window purchases dated on or after the person's **enrolment day** in this workshop (`enrollmentdate` on their `workshop participant enrolled` doc). Days are compared as local calendar days, so a purchase on the enrolment day counts even if it was earlier that day. Without an enrolment date, nothing is dropped.
  - **Everything follows it:** the card total and count, the dialog, its three sections and the export. A buyer left with nothing (or ₹0) drops out.
  - **First sale:** for New Sales / Funnel / Upgrades it is still decided from the person's whole purchase history.
  - **The sale key** now includes the enrolment dates, so a changed enrolment date reloads.
- **The operator's request:** "in the dashboard in the top … along with that i want detailpage.registrationStartDate and register end date also … show as optin".
  - **The header** shows "Opt-in 01 Sept 2026 – 14 Sept 2026" (`wdash-optin-dates`) next to the workshop dates. With no end date it reads "Opt-in from …"; with no start date it is hidden.
- **Checks:**
  - unit tests: 52/52 (`buildSaleBuyers` asserts the enrolment cases);
  - production build: exit 0, 35 warnings;
  - hub WSD: 4/4 (WSD-01 restates the Opt-in text from the seed);
  - readiness gate: MATCHED;
  - hub commit, local and not pushed.
- **Done directly,** with no agent: about 15 minutes.

## Purchases listed in the row + filters (operator, 2026-11-23)

- **The operator's request:** "i want the product also in the column i dont want expand and collapse i want to list al in the column it self and also i want filter is filter with the product and also more possible filters". The operator then picked **one row per buyer, with products listed in the row**, and all four filters.
- **Table:**
  - **Columns:** Name, Email, Phone, **Products**, Total.
  - **The Products cell** lists every purchase of that section, newest first: the product name, then "date · ₹amount".
  - **Removed:** the expand / collapse (hooks `wsad-row-toggle`), the Purchases count and Latest purchase columns (`wsad-purchases`, `wsad-latest`).
  - **On phones,** each buyer is a card with a Products block.
- **Filters row** (`SaleTools`: `products`, `buyerType`, `minAmount`, `maxAmount`, `repeatOnly`):
  - **Product:** a multi-select of the paid products bought in the window (A→Z). Only those purchases count, and totals follow.
  - **Buyers:** All / EiFlix New User / Others. EiFlix New User is the same rule as the chip: a `new_user_data` doc, moved to existing or not.
  - **Amount per purchase (₹):** min–max, inclusive; a reversed pair is swapped; either end can be open.
  - **Repeat buyers only:** 2 or more paid purchases in the sale window, counted **across** New / Funnel / Upgrades. So a new customer who bought again is a repeat buyer, and their first purchase still shows in New Sales.
  - **"Clear filters"** appears when any of these is set. The no-match clear reads "Clear all" when more than one kind is set.
  - **The header** switches to "Shown … of …" for any filter.
  - **Order of application:** date range → product / amount (purchase level) → ₹0 drop → buyer type / repeat / search (buyer level) → sort. A purchase's section is still decided from the whole history, before any filter.
- **Checks:**
  - unit tests: 56/56 (5 new pure filter cases; the component tests now check the listed purchases);
  - production build: exit 0;
  - hub WSD: 4/4;
  - readiness gate: MATCHED;
  - hub commit `1e32ffd`, local and not pushed.
- **Done directly,** with no agent.
