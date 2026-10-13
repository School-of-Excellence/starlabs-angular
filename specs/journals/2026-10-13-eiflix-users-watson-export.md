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
