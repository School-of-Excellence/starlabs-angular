# 2026-06-10 — Profiles & Analytics e2e: deepening to full recon depth (PA-07 un-fixmed)

> Companion journal for the `profiles` group deep pass. Plans/recon say WHAT; this says WHY.
> Recon: `e2e/recon-allcomp/profiles-analytics.md`. Validated: `specs/validated/01-journey-and-products.md`.

## What changed
Brought `e2e/profiles/` from 12 green cases (+1 fixme) to **23 green cases** by adding 11 deep cases
across 4 new spec files, plus additive seed/support extensions. The 12 existing cases were left
untouched (added to, never rewritten).

New files:
- `profiles-deep.spec.ts` — **PA-07** (un-fixmed), **PA-08** (customerstatus filter narrows), **PA-18**
  (selection-count badge), **PA-PS-01** (ProfileScreen/new-profile dashboard body), **PA-EVO-01**
  (participant-evolution-summary render from localStorage).
- `form-tracker-deep.spec.ts` — **PA-FT-LL** (Love Letter tab), **PA-FT-FILT** (participant-select
  where-clause narrows), **PA-AFB-FILT** (app-flow-breaks type-chip filter).
- `metadata-cf-deep.spec.ts` — **PA-CF-04** (productsdata_to_pmd: completed→consumedproducts[]),
  **PA-CF-05** (productcount map aggregates across rows).
- `view-form-deep.spec.ts` — **PA-14** (like toggle writes liked:true to the forms DB).

Seed/support additions (additive; old seed still green): a 2nd `ask AH` (p1) + a `love letter` (p0) for
the tracker tabs/filter; a 2nd `appflowbreaks` of type `playback` for the chip filter; a 2nd `products`
ref + a dedicated **product-CF profile** (its own `participant metadata`) for the projection CFs; a
`/participant-evolution-summary` dashboard route grant; forms-DB read + like-reset + product-CF
reset/set/sibling helpers in `support/profiles.ts`.

## WHY the PA-07 fixme was wrong (the load-bearing finding)
The first pass fixme'd PA-07 claiming `/participants-analytics` "renders NO participant table until a
filter query is constructed and applied" and emits "Error checking permissions: Cannot convert undefined
or null to object" on sparse seed. **Both halves were a misdiagnosis:**

1. The screen is **not** build-a-query-first. `fetchData()` ends with `onDataSearch()`
   (`participants-analytics.component.ts:610`), and `onDataSearch()` filters `dashboardEntireData` with an
   **empty** `filterdata` → every `participant metadata` row passes through to `dataSource.data`
   (:1040–1320). The `<table mat-table>` and `<h3>Total: {{dataSource.data.length}}</h3>` are
   ungated — they render the full set on load. Verified live: Total reached **203** with the seeded
   `a.profilename` `/profilesummary/<id>` links present.
2. "Error checking permissions" is the **auth guard's** snackbar (`auth.guard.ts:83`), not an analytics
   state — and `route-mount.spec` already proves the guard admits this route. It is a tolerable line, not
   a "no table" signal.

So PA-07 was implemented (not fixme'd) and now asserts the real app-built table + per-row routerLink.
**There is no fixme left in the profiles suite.**

## Patterns that made the deep cases green (reuse these)
- **MatTable text Filter is `(keyup)`-bound** (`applyFilter($event)`). Playwright `fill()` dispatches
  `input` but NOT `keyup`, so the filter silently does nothing. Use `click → fill('') → pressSequentially`
  to fire real keyups (`typeTableFilter` helper). This was the root cause of the first PA-08/PA-18 reds.
- **Analytics "loaded" signal**: the `Total: N` header is in the DOM immediately reading `0` while the
  loading dialog is open, so "visible" is too early. Poll the header **text until ≥ the seeded floor (4)** —
  the app's own data-loaded signal (anti-circular: a count it computed, never a value the test wrote).
- **Scope to the run on a shared ~200-row cloud project** by typing the unique seeded name prefix
  ("Profile Test User") into the table filter; the 4 seeds then fit the default 25-row page →
  page-position-independent assertions (p3 non-active disappears, p0 active remains).
- **ngx-mat-select-search** input is **briefly disabled on overlay open**; don't type into it. The overlay
  renders every option (no virtual scroll), so click the target `mat-option` directly (Material
  auto-scrolls). This fixed PA-FT-FILT.
- **Routes reached directly (not via their menu button) need a dashboard route grant** or the data-driven
  authGuard shows "Contact Admin" and bounces to `/`. `/participant-evolution-summary` had none →
  added it. (Its localStorage payload must be set on the app origin first, then SPA-navigate.)
- **app-flow-breaks / view-participants-form search inputs are `(input)`-bound** → `fill()` works there.
- **PA-14 forms-DB write**: assert via the SAME named-DB handle the app writes to
  (`seeder.getFormsDb(admin)` → `firestore-forms`), poll `liked===true`, and additionally check the app
  stamped `likedetails.user` = the logged-in admin profileid. Idempotent: reset `liked:false` first.
- **productsdata_to_pmd projections** (PA-CF-04/05) on a **dedicated** profile (off p0/p1) so its
  array/map rollup is fully owned by these cases; each `beforeEach` resets to one ongoing P1 row so the
  subsequent flip/add is a real change (the CF only fires on a status/package change, `:495`).

## ATC discipline (unchanged)
All seeded products carry `atcmodel:null`; `participant metadata` `atccount/atcmodel` null. The
evolution-summary case asserts ONLY the NON-ATC `name` cell (recon ATC-exclusion §5) — never the
`atcmodel`/AEL columns. No ATC collection is read or written; `participantsely_to_pmd`/`atcdata_to_pmd`
remain out of scope (they touch `atc_alpha`).

## Self-validation
`node profiles/seed-profiles.js --teardown && --seed` → clean (68 docs torn down, seed summary, no error).
`npx playwright test --config=playwright.profiles.config.ts --list` → **23 tests in 8 files** compile.
All 11 new cases run GREEN against the live `:4200` dev server / `slabs-queue-e2e-exdcz`. Full-suite green
is left to the orchestrator (serial, shared server) per the workflow.

## Needed composite index
None. Every new query is doc-id read, single-field `orderBy`, or a single-field equality the analytics
client-side filter applies in memory. `firestore.indexes.json` was NOT edited (shared file).
