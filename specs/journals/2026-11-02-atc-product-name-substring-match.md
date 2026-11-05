# 2026-11-02 — ATC product name: substring match, not equality

Three repos changed in one pass: `starlabs-angular`, `breakthroughs-flutter`, `starlabs-e2e-tests`.

## What was wrong

Every "is this ATC EI Solution / WiSH?" check was an equality test against a hardcoded lowercase
literal:

```ts
(this.reportATC?.product ?? "").toString().toLowerCase() == "ei solution"
```

The real `atc model` records say **"EI Solutions"** (plural). `"ei solutions" == "ei solution"` is
`false`, so in production every EI Solution-only piece was silently off: the Ask · area of focus
section, the Review log, the `tag-ei` card colour, and the appointment-based specialist prefill in
Prescribe ATC (an EI Solution ATC fell through to the live-queue branch instead).

Nobody noticed because the seeds also said "EI Solution" (singular). The suites were green against
a world that did not exist.

## Why substring and not a rename

The obvious fix is to rename the record to the singular. That was ruled out by the operator: ATCs
already in the database reference these model names, so a rename orphans live data. The name is
fixed, so the *check* had to widen.

## Why one helper per project, not `.includes` at each site

There were 9 comparison sites in the Angular app and 2 in Flutter, but only 8 + 2 *predicates* —
every one of the 59 Angular call sites already went through a getter or a method. Putting
`.includes` at each comparison would have spread the rule across 5 files and left the next person
to find all of them. Instead:

- `starlabs-angular`: new `src/app/ATC/shared/atc-product.ts` holds `productKey`,
  `isEISolutionProduct`, `isWiSHProduct`. The 8 existing predicates delegate. Call sites untouched.
- `breakthroughs-flutter`: `lib/Main Screen/atcTemplateSections.dart` already had `atcProductKey`;
  `isWishATC` / `isEiSolutionATC` became `.contains(...)` (Dart, not `includes`).

The two calendar colour chains (`lib/Delivery Event/mastercalendar-clone.dart`,
`lib/mastercalendar_old.dart`) compared `atcmodel == 'EI Solution'` **case-sensitively**, so they
were broken by the same data and are fixed with a local `_atcModelContains` helper. Note for a
future session: `mastercalendar_old.dart` is imported by nothing in `lib/` — that edit is cosmetic,
and the file is a deletion candidate.

## The two boundaries this deliberately keeps

1. **`EI Starter Pack` must stay out of the EI Solution template.** `includes("ei solution")` does
   not match it, which preserves the exclusion already documented in
   `delivery-dashboard.engine.ts:370`. Had we matched on `"ei"` instead, Starter Pack would have
   started getting Ask rows.
2. **`W!SH` is not matched.** That spelling exists in `segment-board.engine.ts` journeyGroups and
   the team-evolution dashboard, but in no `atc model` record. Stripping punctuation to catch it
   would be a guard against a case we have not confirmed exists; if such a record ever appears, the
   change is one line in `atc-product.ts`.

Accepted with the operator, eyes open: `"EI Solution for Wife"` and `"EI Solution for Husband"`
(live product names) now match and get the EI Solution sections. They are EI Solution variants, so
this is wanted — but it is a behaviour change, not a no-op.

## How the fix is actually proven

A fix to a name match is worthless if the tests still seed the old name, so `starlabs-e2e-tests`
carries the other half:

- `atc/seed-atc.js` — `TPL_MODEL.ei` is now `'EI Solutions'`, the production spelling. Every spec
  reads `TPL_MODEL.ei` rather than a literal, so all the existing EI cases in
  `prescribe-atc-templates`, `edit-atc-templates` and `view-atc-templates` became regression tests
  for this fix at no cost. The comment above it now says *why* and warns against "correcting" it
  back to the singular.
- `appointments/seed-appointments.js` — same for `ATC_MODEL.ei`.
- `TPL_NEAR_MISS` seeds two new `atc model` records, `EI Starter Pack` and `W!SH`, with two new
  participants (`tnm`, `tnw`). **PTPL-08** picks each and asserts neither template appears — the
  guard that the widened match did not get *too* wide. Without this case, changing the match to
  `"ei"` would also pass.
- Flutter: `test/atc_template_sections_test.dart` pins the same five cases as a pure-function test
  (`EI Solutions` yes, `EI Solution for Wife` yes, `EI Starter Pack` no, `WiSH` yes, `W!SH` no).
  22/22 pass.

## State at the end of the session

Angular typechecks (`tsc --noEmit -p tsconfig.app.json`, clean). The Flutter unit test suite for
the ATC card passes. **The e2e suite was not run** — it needs the emulator up, and the ATC seed
correctly refuses to load without `FIRESTORE_EMULATOR_HOST` et al. PTPL-08 is therefore written but
unexecuted; run the `atc` suite against the emulator before trusting it.

Nothing is committed: `git add` was refused by the sandbox in all three repos. All three working
trees hold the changes. Note that `breakthroughs-flutter` was *already* dirty on branch
`atc-feature` with an unrelated in-progress design-2 rewrite of `participantATC.dart` and
`atcTemplateSections.dart` — do not sweep that into this commit.
