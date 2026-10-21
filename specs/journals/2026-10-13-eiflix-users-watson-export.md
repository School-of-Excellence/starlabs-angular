# 2026-10-13 — Live checks + amount in the panel exports

Continues `2026-10-12-users-section-date-range.md` (the Users-section work of 2026-10-12/13).

## Live render of the New Users to Paid card

The words and the ₹10,486,474 figure were first checked only by a unit test and a hand-written
mockup. They have now been checked on the **real component on the emulator**: the emulator build
has no Watson (by design), so a throwaway Playwright check used Angular's dev API
(`ng.getComponent` + `ng.applyChanges`) to give the paid rows the totals Watson would return. It
confirmed `₹10,486,474`, "One crore four lakh eighty-six thousand four hundred seventy-four",
"Purchased Journey", no "found" text, and the panel's "Amount high–low" sort putting that row first.
The check was **not committed** — injecting state through a debug API is fine for one-off proof
but not something CI should depend on.

## Export now carries the amount (operator: "in both … when i export i want with the amount")

- `exportPanel` was split: `panelExportRows(panel)` builds the sheet (header + rows) and
  `exportPanel` only writes it. The split exists so the rows can be unit-tested without triggering
  a browser download.
- **New Users to Paid → "Total Amount"**: the Watson total, rounded to the rupee (as Journey Support
  displays it), blank for people not found.
- **Master Class Purchase → "Amount"**: the payment's `amountRupees` (rows now carry a numeric
  `amountValue` beside the display label).
- Both are **numbers, not "₹…" text**, so the sheet can be summed in Excel. Other panels gain no
  column.
- Verified by a throwaway live check that clicked the real Export on both panels and read the
  downloaded files with the app's SheetJS: Master Class `NU Alpha … 499`, New Users to Paid
  `NU Charlie … 10486474`. The hub cannot read .xlsx (no SheetJS there — the reason WS-55 checks only
  file size), so committed coverage is the 3 unit tests on `panelExportRows`.

Verified: build EXIT=0 · unit 103/103. No hub change.

## 2026-10-14 — Payment-schedule hover card on the New Users to Paid panel

Hovering (or keyboard-focusing) a person in the New Users to Paid side panel shows their Watson payment
schedule date by date, excl. GST, with the total.

- **No extra reads.** `loadPlanTotals()` already fetched each person's Payment Schedule to compute the
  total; it now also keeps the rows (`journeySupportSchedule()`: same `schedulemodified != true` filter,
  each `amount ÷ 1.18`, date order), so the rows add up to the total beside them.
- **Amounts are excl. GST** so they reconcile with the panel total. Journey Support's EMI column shows the
  GST-inclusive figure — a different base; the card header says "excl. GST".
- **Why not matTooltip / CDK overlay:** a schedule can run to ~59 instalments (needs a scrollable card,
  not a text tooltip), and the side panel is `z-index: 1001` — above the CDK overlay layer (1000) — so
  an overlay would render underneath it. Raising the global overlay layer would affect every overlay in
  the app. Instead the card is a component-level `position: fixed` element at `z-index: 1002`, placed
  beside the panel level with the row; with no room beside a full-width panel (phones) it drops below
  the row. 140 ms close grace + `keepPlanTip()` lets the pointer move onto the card to scroll it.
- Only rows with a schedule open it — other panels and no-Watson builds never show it.

Verified: build EXIT=0 · unit 106/106 (3 new) · WS-62 now also hovers the paid row and requires no card
(no Watson on the emulator) — passed · a throwaway live check injected a 14-row schedule into the real
component and confirmed the card renders beside the panel, lists the dates, totals ₹320,610 to match
the row, and closes when the pointer leaves (not committed — it uses the dev debug API).

### 2026-10-14 (later) — the hover card shows PURCHASES, not instalments

Operator, after hovering on real data: the card listed EMI instalments (e.g. 83,333 × 3); what they want
is **each product the person bought** — purchase date, product, amount — adding up to their total
(e.g. 1 Apr 50,000 · 10 Jun 1,00,000 · 10 Sep 1,00,000 = 2,50,000).

- Source: Watson **`ParticipantPurchases`** where `participantid ==` the same participant id Journey
  Support's lookup finds (one doc per product). Fields: `product`, `purchasedate_ts` (falls back to the
  `purchasedate` 'yyyy-mm-dd' string, read as a LOCAL date), and **`fee`** — the price before GST; the
  doc stores `gst` and `gross` separately (`gross = fee + 18%`).
- Cancelled purchases (`cancelled: true` or `purchasestatus: 'cancelled'`) are left out. Other
  statuses (active, addons, …) are shown. Oldest first. Footer = sum of the shown fees.
- One extra **read** per person, in the same lookup that computes the total. **Watson is read-only**
  (operator directive, 2026-10-14) — the component has no write against the Watson handle.
- The row's TOTAL AMOUNT is unchanged (Journey Support's Payment Schedule rule), so the card footer
  (purchases) and the row (schedule) come from different Watson collections; if a person's schedule
  and purchases ever disagree, the two figures will too.
- The instalment helper `journeySupportSchedule` was removed; `watsonPurchaseRows()` replaces it.

Verified: build EXIT=0 · unit 107/107 · rendered with the real CSS. Real-data check is the operator's
(localhost reads production Watson).

## 2026-10-15 — Purchased Journey total amount: batched reads (same fix as Sale Achieved)
- **Why it was slow:** each paid person ran four reads in a row (profile, Participants, Payment
  Schedule, ParticipantPurchases), with only six people in flight. A few hundred people meant
  hundreds of round trips back to back.
- **Now:** every step reads 30 people per `in` query, and all queries run at once. That is three
  stages in total, with schedule and purchases read side by side.
- **The Journey Support result is unchanged.** Each person's `where ==` answer is rebuilt from the
  batch by `groupLikeEquality`: the field's exact value (case-sensitive, so a number and its text
  form stay apart), in document-id order.
- The schedule order follows `journeySupportScheduleOrder`, which matches `orderBy('date','asc')`:
  rows without `date` drop out, and ties break on document id.
- A profile whose email isn't text still runs the old single-person chain.
- If one chunk fails, the people in it show "—" (not found), as before.
- Watson is read only.
- Unit tests: 109/109, including two new cases.
- Not verified against production Watson here: the emulator has no Watson. The operator checks on
  localhost.

## 2026-10-17 — Master Class Purchase export: Workshop column
- `panelExportRows` adds a "Workshop" column, after User Type, whenever the panel's rows carry a
  `workshopTag`. Today that is only Master Class Purchase. The value is the same detail-page title
  the row shows ("Unknown workshop" when the reference no longer resolves). Other panels' exports
  are unchanged.
- Tests:
  - Unit: 109/109.
  - Hub WS-60 reads the downloaded file and checks the Workshop column holds `Dashboard Workshop
    <run>`; it passes.
  - The hub commit is local, waiting on the deferred Touch Point tests and a full-suite run before
    the next push.

## 2026-10-17 — Master Class: moved-to-existing payers are not "New User"
- Bug (operator): someone in both `new_user_data` (with `movedtoexist: true`) and participant metadata
  was tagged New User on the Master Class row, counted in the card's "new users", and exported with
  User Type "New User".
- Cause: the row tested only "is in new_user_data".
- Fix: it now uses the dashboard's existing `isNewUserProfile` rule ("in new_user_data and
  movedtoexist is not true"). That is the same rule the user counts and logs already use, so the row
  tag, the card count and the export's User Type all agree.
- Tests: a unit case for a payer in both with `movedtoexist: true` (110/110), and WS-60 still passes.

## 2026-10-17 — Whole dashboard: movedtoexist == true is never a New User (operator)
One rule everywhere: `isNewUserProfile`, meaning in new_user_data AND movedtoexist is not true.
Sites brought in line:
- Master Class Purchase rows and card count (earlier the same day).
- New Users to Paid rows. Everyone there has moved, so a row with no participant metadata no longer
  gets the New User tag; it shows as Existing in the filter and the export.
- Engagement new-vs-existing watch time. A moved person not in participant metadata now counts on
  the existing side; before, they counted as new.
- Non-Active Users / Device Breakdown. A moved person with no metadata doc stays listed, but as
  existing (isNud false), so they move out of the "New Users" bucket counts.
- `resolveProfiles`, shared by the Viewers, Hot Leads and Non-Active panels: no New User tag for moved
  docs, so cohort filters and export User Type follow.
Already correct: Total New Users (filters movedtoexist), App Logs and consumption cohorts (already
used isNewUserProfile).
Tests: a unit case for the paid rows, the resolver and the export User Type (111/111). The
eiflix-ops-dashboard e2e file was re-run; the machine was heavily loaded at the time.
