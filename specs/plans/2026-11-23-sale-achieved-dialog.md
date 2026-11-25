# Workshop dashboard: Sale Achieved opens a full-screen dialog (2026-11-23)

The operator's request: "there is a sale achieved when i click i dont want a side panel i want to open a new full screen dialog in that dialog list the data".

The operator's answers:
- **Layout:** one row per buyer, which expands to show their purchases.
- **Tools:** the From / To date filter, sort by amount or recent, search by name, email or phone, and Export to Excel.

## What changes

- **Clicking the Sale Achieved card** (`wdash-sale-card`) opens a **full-screen dialog** instead of the side panel. The side panel no longer has a Sale Achieved mode.
- **No new data reads.** The dialog shows the buyers the card already loaded (`saleAchievedParticipants`, from Watson). Watson stays read-only, and the window rule is unchanged: registration start to one month after the workshop end.
- **The dialog is a new standalone component** in `workshop-dashboard/sale-achieved-dialog/`, opened lazily through MatDialog as the communication dialog is.
  - It fills the viewport (`100vw × 100vh`, no radius).
  - It has a close button (`aria-label` "Close"), and Escape also closes it.
  - Focus moves into it and goes back to the card when it closes.
  - It uses the white/light theme in the dashboard's look (DM Sans, navy, option A palette). There are no Bootstrap class names and no field names in the text.

## Inside the dialog

- **Header:**
  - the title "Sale Achieved", with the workshop title;
  - the window ("Bought 07 Nov 2026 – 06 Jan 2027");
  - the total of the buyers shown (₹) and the number of buyers.
- **Tools:**
  - **From / To dates:** limited to the window. Only purchases inside the range count; a buyer with none in range drops out; totals follow. There is a clear button.
  - **Sort:** "Highest amount" (the default) or "Most recent".
  - **Search:** name, email or phone. Case-insensitive; phone digits match ignoring spaces and "+".
  - **Export to Excel:** downloads what is shown (range and search applied), using the dashboard's existing export helper. It is one sheet with a row per purchase and the buyer's details: name, email, phone, purchase date, product, amount. If the helper supports more than one sheet, a "Buyers" sheet is added.
- **Table:** one row per buyer.
  - **Columns:** name, email, phone, purchases (count), total (₹), latest purchase date.
  - **Expanding a row:** clicking it, or the expand button (keyboard accessible, `aria-expanded`), shows that buyer's purchases underneath: date, product and amount, newest first.
  - **Below about 768px,** the rows become cards.
- **States:**
  - **Loading:** a quiet loading state, while the lookup is still running.
  - **"Sale data isn't available in this build":** Watson is not configured. This is the emulator build.
  - **"No purchases in this window":** nobody bought.
  - **"No buyers match":** search or range leaves nothing, with a clear action.
- **Pure logic** goes in an engine or helper file (not `*.component.ts`) with `*.unit.spec.ts` tests:
  - applying the range;
  - search;
  - sort;
  - totals;
  - export rows.

## Hooks (literal, one new prefix for the new component: `wsad-`)

| Hook | Element |
|---|---|
| `wsad-dialog` | the dialog |
| `wsad-close` | close button |
| `wsad-title` | title |
| `wsad-window` | sale window line |
| `wsad-total` | total shown |
| `wsad-count` | number of buyers |
| `wsad-from` | From date |
| `wsad-to` | To date |
| `wsad-range-clear` | clear the date range |
| `wsad-sort-amount` | sort by amount |
| `wsad-sort-recent` | sort by most recent |
| `wsad-search` | search box |
| `wsad-search-clear` | clear the search |
| `wsad-export` | Export to Excel |
| `wsad-row` | a buyer row |
| `wsad-row-toggle` | expand a buyer row |
| `wsad-name` | buyer name |
| `wsad-email` | buyer email |
| `wsad-phone` | buyer phone |
| `wsad-purchases` | purchase count |
| `wsad-amount` | buyer total |
| `wsad-latest` | latest purchase date |
| `wsad-purchase` | one purchase line |
| `wsad-loading` | loading state |
| `wsad-unavailable` | unavailable state |
| `wsad-empty` | empty state |
| `wsad-no-match` | no-match state |

- **Retired:** the dashboard's side-panel Sale Achieved hooks (`wdash-sale-from`, `wdash-sale-to`, `wdash-sale-range-clear`, `wdash-sale-sort-*`, `wdash-sale-amount`, `wdash-sale-tip`).
- **Kept:** the card hooks (`wdash-sale-card`, `wdash-sale-total`, `wdash-sale-count`).

## Hub

- **Move WDC-15/16** out of `workshop-dashboard-communication.spec.ts` (which assert the side panel) into a **new gated file**, `workshops/workshop-dashboard-sale-dialog.spec.ts`, keyed on the new `wsad-` hooks. Older app branches then skip it instead of failing.
- **Watson does not exist on the emulator,** so e2e covers:
  - the card's states;
  - that clicking opens the full-screen dialog (it fills the viewport and no side panel opens);
  - the unavailable state;
  - the controls present and disabled or empty as appropriate;
  - close by button and by Escape, with focus returned.
- **The data logic** (range, search, sort, totals, export rows) is covered by unit tests.

## Out of scope

- No email, WhatsApp or notification buttons in the dialog. They were not asked for, and the side panel had them only as general panel tools.
- No change to how Sale Achieved is computed or read.

## Addition: New Sales, Funnel Sales and Upgrades (2026-11-23, operator)

The operator's request: "split this as separate … tables like one is New Sales and another one is Upgrades … users 1st sale means put in the New sales table". Then: "the user who came 1st sale in the workshop then bought another they are funnel so show in both the new sales and in funnel sale". The answer: **"1st sale" = first purchase ever.**

- **A person's first sale:** their earliest **paid** Watson purchase across their whole history (amount above ₹0 after rounding; dated). The dashboard already loads every purchase of these people (`ParticipantPurchases where participantid in …`, with no date filter), so this needs **no new read**. Watson stays read-only. If several purchases share that earliest moment (one checkout), they all count as the first sale.
- **Each paid purchase inside the sale window goes into exactly one table:**
  - **New Sales:** it is the person's first sale.
  - **Funnel Sales:** the person's first sale is inside this window, and this purchase came after it.
  - **Upgrades:** the person's first sale was before the window.
- **A new customer who bought again** appears in New Sales (their first purchase) **and** in Funnel Sales (the rest).
- **₹0 purchase lines** are not sales and are not listed. A person whose purchases in a table total ₹0 does not appear in that table, and is not counted there.
- **Layout:** the dialog shows three stacked sections, New Sales, Funnel Sales and Upgrades. Each has its own heading, total and buyer count, and the same table as before: one row per buyer, expandable to that section's purchases.
  - **Summary strip at the top:** each section's total and count, plus the overall total and the **unique** buyer count.
  - **The tools** (range, sort, search, export) apply to all three.
  - **An empty section** shows "None in this window", or "No match" when a search or range is active.
- **The From / To range** picks which window purchases are shown. The type of each purchase is always decided by the person's whole history, so it never changes with the range.
- **Export:** a "Type" column (New Sale / Funnel / Upgrade) is added to the one-row-per-purchase sheet.
- **The dashboard card** is unchanged: the overall total and the number of users.
- **New hooks:**
  - `wsad-section-new`, `wsad-section-funnel`, `wsad-section-upgrade` (the sections);
  - `wsad-section-total`, `wsad-section-count` (inside each section);
  - `wsad-summary` (the strip);
  - `wsad-section-empty`.

  Row hooks inside the sections reuse `wsad-row` and the rest.
- **Pure logic:** `firstSaleMs`, `classifySalePurchases` and the per-section views, with unit tests.
