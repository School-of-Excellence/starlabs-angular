# 2026-10-14 — Workshop dashboard: "Sale Achieved" card (live workshops)

Operator: for `workshoptype == 'liveworkshop'` only, a card after "Users Not in Chat Group" listing enrolled
people who bought in Watson `ParticipantPurchases` between `detailpage.registrationStartDate` and ONE MONTH
after `detailpage.workshopEndDate`; the side panel lists them with how much they bought, with the hover card.

## Data — Watson is READ-ONLY
enrolled profileid → email (`mapProfile`) → Watson `Participants where email in […]` (asked both as stored and
lower-cased — Watson stores lower-case) → **every** participant id for that email (duplicates happen) →
`ParticipantPurchases where participantid in […]` → `watsonPurchaseRows` (fee = price before GST, cancelled
dropped) → only purchases dated inside the window. The matching is a pure function, `buildSaleBuyers()`, in
the new shared `src/app/New-Workshop/watson-purchases.ts` (also now the home of `watsonPurchaseRows`, used by
the EiFlix dashboard) so it is unit-tested without Watson. No write against the Watson handle anywhere.

**Window:** `saleWindow()` — registration start at 00:00 to workshop end + one CALENDAR month at 23:59:59.999,
clamped at month end (31 Jan → 28/29 Feb). Missing either date → no window → the card reads ₹0 and the panel
says the dates are not set. Undated purchases cannot be placed and are left out.

## UI
- Card: the **amount is the headline** (amber), "Sale Achieved", then "N users". Without Watson (emulator
  build) the amount reads **"—"**, never a misleading ₹0, and no count is shown; "…" while loading.
- Panel line per person: amount + a small count badge. **No "product" wording anywhere** (operator), and no
  icon. Hover card: `date = amount` lines and `Total · N` — no product names.
- Panel heading read "Saleachieved" (the generic `status | titlecase`); fixed to "Sale Achieved" for this
  status only, so other panels' headings are unchanged.
- Placed after the "not category-based" card group, not inside it, so category-based live workshops get it.

## The slowness the operator hit, and the fix
1. **Sequential batches** — `for … await getDocs` over chunks of 30, twice. A 600-person workshop = ~40
   round trips in a row to Watson (10–20 s). Now `Promise.all` per phase: **2 round trips**.
2. **Restart on every listener fire** — the lookup is kicked off inside the live enrolled-participants
   `onSnapshot`, which fires several times on load (cache, server, any enrolment). Each fire bumped the token
   and threw the in-flight run away, so the card sat on "…". Now `saleKey` (sorted emails + window) skips a
   restart when nothing changed; a failure clears the key so the next fire retries.
Not measured against production Watson (tests must not reach it); the claim is the round-trip count.

## Coverage
Unit (`watson-purchases.spec.ts`, 5): date parsing (local yyyy-mm-dd), window incl. month-end clamp, inclusive
bounds + undated dropped, case-insensitive multi-participant matching with cancelled/outside-window/not-in-Watson
negatives, biggest buyer first. Hub **WDC-15** (committed locally in the hub, NOT pushed — operator asked to hold):
no card on W_DASH as seeded (no workshoptype); live → card visible, amount "—", no count, panel heading
"Sale Achieved", window stated, no buyers, no hover card. A throwaway live check injected three purchases into
the real component and confirmed ₹250,000 headline, "1 user", the panel line, the date = amount hover card,
and no "product" text.

## Amounts use Indian digit grouping (both dashboards)
Operator: "₹20,694,876 — I want ₹2,06,94,876", on cards and side panels of both dashboards.
- Both formatters now produce lakh/crore grouping: the shared `formatRupees()` (workshop dashboard card,
  panel line, hover card; EiFlix purchases card) and the EiFlix `formatPlan()` (New Users to Paid card,
  panel, hover card), which now just calls `formatRupees()`.
- Implemented with the browser's `toLocaleString('en-IN')`, NOT Angular's `formatCurrency(…, 'en-IN')`:
  the app does not register Angular's en-IN locale data, so the pipe would throw. Master Class Purchase
  already formatted this way, so all amounts on both screens now match.
- This deliberately departs from Journey Support's display (its currency pipe groups 2,724,000); the
  VALUE is unchanged, only the grouping.
- Exports are unaffected (they write plain numbers). Unit 113/113 incl. the operator's example.

## Correction — product NAMES stay in the hover card
Operator: "remove the product TEXT only, not the name of the product in the hover tooltip". The earlier
round over-read the instruction and dropped the names. Now: the hover card lines are date + product name +
amount again; only the WORD "product(s)" is gone (panel count badge, "Total · N" footer). A purchase with no
name no longer falls back to the text "Product" (that would reintroduce the word) — `watsonPurchaseRows`
returns '' and both dashboards' cards simply omit the name line.

## Every ₹ amount is green (both dashboards)
Operator: "all area amount i want in green". One green on both screens — the EiFlix palette's
`--eod-emerald` (#0c8a5f, tint rgba(12,138,95,0.10)); the workshop dashboard uses the same hex.
- EiFlix: card total pill (`.eod-card-amount`, was amber) and its words line; panel amounts
  (`.eod-row-hours.eod-row-amount`, was neutral ink — so Master Class payment amounts are green too); every
  hover-card amount (`.eod-plan-tip-amt`). Watch hours keep their own colour.
- Workshop: Sale Achieved headline (`.metric-value.sale-highlight`, was amber), panel amount
  (`.sale-row-amt`), every hover-card amount (`.sale-tip-amt`).
- Unchanged on purpose: the purchase COUNT badge (a count, not an amount) and the Master Class card's amber
  accent/icon. CSS only — no logic or test changes; verified by rendering both with the real CSS.

## Sale Achieved panel: sort instead of filter, and a per-purchase export
Operator: export the purchases (date, product, amount); drop the All/New/Old filter here; sort by amount and
by recent purchase instead.
- **Sort:** `saleSort` ('amount' default | 'recent'), a two-button toggle in the filter header; the All/New/
  Old menu and its "Filter All (N)" heading are hidden for this status only (heading reads "Buyers (N)").
  `applyFilterSide()` runs the name search as before, then `sortSaleBuyers()` (shared, pure): biggest
  `saleTotal` first, or latest `saleLastDate` (max purchase date in the window) first; ties by name.
- **Export:** for this status `exportParticipants()` writes ONE ROW PER PURCHASE —
  Participant Name, Email, Phone, Purchase Date, Product, Amount (number, rounded to the rupee) — in the
  panel's current order (`saleExportRows()`, shared, pure). File `workshop-sale-achieved-<title>-<date>.csv`.
  The engine's `createCsvContent` quotes commas/quotes/newlines, so "Scale, Grow" stays one cell (tested).
- Note: "Product" appears as an export COLUMN because the operator asked for it there; the on-screen
  Sale Achieved UI still has no "product" wording.
- Verified: unit 116/116 (sort both ways + tie, export shape, CSV comma case); WDC-15 now asserts no
  All/New/Old button, Amount default, toggle both ways — passed; a throwaway live check injected two buyers
  and confirmed the on-screen order flips with the toggle and the downloaded CSV has one row per purchase.
  (A first read of the order right after the click looked unchanged — it was read before the re-render;
  polling showed the reorder.)

## 2026-10-20 — Side-panel export crashed on Total Enrolled (production)
- Symptom (operator, breakthroughs.app): Export in the Total Enrolled panel did nothing. Console:
  "TypeError: Cannot read properties of undefined (reading 'email')" at exportParticipants.
- Cause: the CSV mapping read `p.metadata.email` directly. Several panels build rows with
  `metadata: this.mapProfile[id]` (participant metadata only), so an enrolled new user who exists
  only in new_user_data has `metadata` undefined, and the whole export threw.
- Fix: each row uses `p.metadata || mapProfile[id] || mapProfileNew[id] || {}`. Name falls back to the
  directory name. Nothing in the column set changed.
- Test: `workshop-dashboard.export.spec.ts` covers a row with missing metadata, a new-user-only row,
  and a row in neither directory; it passes.
- Fixed on request: 3 tests in `workshop-dashboard.exist-users.spec.ts` ("All Assignments") were
  already failing. `onAssignmentCardClick` checks `this.can('allassignments')` and the fixture had no
  `access`. The fixture now grants that one action, and a new case proves a click does nothing
  without it. The file passes 53/53.
- e2e: to add in the pending test round (an enrolled new-user-only profile exporting from Total
  Enrolled).

### Follow-up 2026-10-21: what exactly crashed, and the e2e
- `mapProfile` already overlays genuine new users from `new_user_data` (`newUserOverlay`), so new users
  were never the problem. The row with no `metadata` is a person **moved to existing
  (movedtoexist: true) whose participant metadata doc doesn't exist yet**. The overlay skips them,
  and `buildParticipantEntry` gave them `metadata: undefined` and the name "Unknown".
- Two small name fixes so the panel and the file agree:
  - `buildParticipantEntry` names them from `new_user_data`.
  - The export uses the directory name whenever the row says "Unknown".
- Hub WS-69 (`workshops/workshop-dashboard.spec.ts`):
  - Seeds two extra W_DASH enrollments (NU_A, a genuine new user; and a moved-to-existing profile
    with no metadata), opens Total Enrolled, and checks the moved person is listed by name.
  - Exports and reads the CSV. The moved row has the name, email and phone from `new_user_data`. The
    new user and p0 rows have their stored emails, read from Firestore. Nobody exports as "Unknown".
  - Cleans up by id.
