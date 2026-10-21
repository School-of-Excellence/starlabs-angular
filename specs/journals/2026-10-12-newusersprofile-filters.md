# 2026-10-12 — /newusersprofile: created-date range + two-option conversion filter

Operator ask, verbatim:

> in the newusersprofile screen there is a filter as created date.. here i want that as date range
> filter .. and also in this we have another as converted .. here i want that as mat ment .. and in
> that i want two options as converted / not converted

Files: `src/app/New-Workshop/newusersprofile/newusersprofile.component.{ts,html,css}`
Hub: `workshops/new-users-profile.spec.ts` (WS-56, WS-57), `workshops/support/wshop.ts` (seeder + day helper)

---

## 1. The created-date filter was ALREADY a range — the problem was that you could not tell

This is the finding worth recording, because the next person will otherwise repeat the search.

The filter has been a `mat-date-range-picker` since `38707cba` (2026-07-13). The predicate took both
bounds, each one optional, start-of-day to end-of-day inclusive. Functionally, the ask was already met.

What it *looked* like was a single button reading **“Created date”** with a calendar icon, backed by a
form field deliberately hidden with `height: 0; opacity: 0; pointer-events: none` (`.date-hidden`),
anchored to the bottom of the button so the calendar would drop below it. Nothing on screen said
“range”, and you only found out by clicking and noticing the calendar wanted two picks.

So the change is about *discoverability*, plus one genuinely new capability:

- The real `mat-date-range-input` is now **in** the toolbar, both bounds visible and typable
  (`Created from` – `to`), with a `mat-datepicker-toggle` for the calendar and the `×` to clear.
- `.date-hidden` and the proxy button are gone. One control, no shadow copy to keep in sync.

**The new risk typing introduced, and the guard for it.** A picked date is always valid; a *typed*
one can be half-finished. `NativeDateAdapter.parse` hands back an `Invalid Date`, whose
`getFullYear()` is `NaN`, so the old bound maths produced `NaN` — and `created < NaN` is `false`, so
the filter silently matched **everything** while the control looked active. `dayBound()` now returns
`null` for anything that is not a parseable `Date`, and `hasDateFilter` is computed from the same
helper, so an unparseable date neither filters nor lights the control up. That is why the getter does
real work instead of `!!(startDate || endDate)`.

**Why `M/D/YYYY` matters to the test, not just the user.** The native adapter parses via `Date.parse`.
`Date.parse('2026-10-10')` is **UTC** midnight — west of Greenwich that is the 9th. `M/D/YYYY` parses
as local. `wsSeedDayMDY()` in the hub emits that format and builds the day with the same `setDate()`
arithmetic the seed uses, so the test and the seed cannot disagree about which day a row sits on.

## 2. Conversion: a two-option menu, and why there is no third row

Was an on/off pill (`convertedOnly`), so **“not converted” was unreachable** — that half is the new
capability, not a re-skin.

`convertedFilter: '' | 'converted' | 'notconverted'` now drives a `mat-menu` of exactly the two
options the operator asked for. `''` is the cleared state, **not a menu row**: re-picking the active
option clears it, and the `×` on the button clears it too. Two rows therefore cover three states, and
the menu says nothing that needs explaining.

Built as a `mat-menu` on a `mat-stroked-button` because that is already the idiom of the two filters
immediately to its left (*Select by tags*, *Workshops*) — same pill, same indigo active tint, same
place. The options are plain `mat-menu-item`s rather than the `.tfm-item` rows those menus use,
because those menus `stopPropagation` to stay open for multi-select; a single-choice menu should close
on the pick, which `mat-menu-item` does for free.

**The button label names the dimension when nothing is chosen** (`Conversion`), and the chosen answer
once something is (`Converted` / `Not converted`). Leaving it as the old static “Converted” would have
read as *“converted profiles are being shown”* in the one state where nothing is filtered at all.

**Moved On stays on the Converted side only.** The column and its export entry are gated on
`convertedFilter === 'converted'`, not on “a conversion filter is active” — the profiles on the other
side have no move date, so the column would be a strip of em-dashes. `lastConvertedActive` keeps the
same meaning (the Converted side specifically), so the export-chip auto-select/deselect still fires
exactly once per real transition and never fights a manual deselection.

## 3. Coverage — WS-56 / WS-57

Both land in the suite that already owns this folder; app hooks went in first, spec second.

- **WS-56** narrows to the **middle** of the three seeded days (-1d / -2d / -3d), so there is a
  negative control on *both* sides: a filter that dropped the start bound and one that dropped the end
  bound each fail. Then the `×` restores the full table.
- **WS-57** flips NU_C to converted and leaves NU_A alone, then requires the **same pair to swap** when
  the option changes. One-sided passing is impossible: Converted must hide A and keep C; Not converted
  must hide C and keep A. It also pins the Moved On column appearing on one side only.

Three deliberate choices in those cases:

1. **Negative assertions first, and they carry the wait.** A `filterPredicate` that throws leaves every
   row in place, so leading with “this row must be gone” catches it. Leading with the positive would
   pass on a thrown predicate — the WS-43 lesson, paid for once already.
2. **`toHaveCount(0)` is sound here only because of the precondition.** All three rows are asserted
   visible *together* first, which also proves they share page 1 of the 20-row paginator. Filtering
   only removes rows, so a row that was on page 1 and is now absent was filtered, not paged away.
3. **The seeder touches `movedtoexist` and nothing else.** Setting `movedon` would have been tempting
   (it would put real content in the Moved On column) but it feeds the ops-dashboard purchases oracles
   — WS-54 counts `new_user_data.movedon` in a window. Asserting the column's *presence* needs no date,
   so the two suites stay independent. `try/finally` restores NU_C even when the case fails.

## 4. Pending / worth knowing

- The screen's filter logic is still **inside the component**, so none of it is unit-testable the way
  `workshop-dashboard.engine.ts` and `content-analytics.engine.ts` are. `dayBound` and the conversion
  predicate are pure and would move cleanly into an engine file; e2e is the only thing pinning them
  today. Not done here — it is a refactor, not what was asked.
- `.created-range-field` compresses Material's 56px outline infix to the toolbar's 44px pill height via
  `::ng-deep` (the file's existing idiom). A Material upgrade that renames `.mat-mdc-form-field-infix`
  would loosen that back to 56px — cosmetic, not functional.
