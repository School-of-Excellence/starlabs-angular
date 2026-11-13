# Contract: delivery-dashboard-hidden-scope
Surface: /delivery-dashboard -> Overview (headline funnel numbers)
Env: starlabs-test   (never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/delivery-dashboard

## User moves
1. Open the URL logged in as an admin on starlabs-test
2. Note the In-delivery / Ongoing headcount and the Stuck count
3. Hide a product that has ongoing participants (Show/Hide Hidden Products toggle)
4. Expect the In-delivery headcount NOT to drop - hiding is a table preference, not a filter on people
5. Change the Products dropdown to a single product
6. Expect the In-delivery headcount to drop to that product's ongoing count

## Invariants
- Every headline funnel number is computed over the same population: Awaiting,
  Ready, Stuck and Not-consuming come from populateActionableCohorts (which never
  consults hiddenProductIds), Delivered comes from getCompletionSummary (visible +
  hidden), and In delivery must therefore also span visible + hidden.
- A participant in a hidden product counted as Stuck is also counted as In delivery.
  Set(Stuck products) is NOT disjoint from Set(In-delivery products) on account of hiding.
- Hiding a product changes which ROWS the Products table shows, and changes no
  headline number.
- Selecting a single product in the Products dropdown DOES change every headline
  number, hidden products included (scoping rides on allProductIdsFromRaw ->
  itemPassesProductFilter, which both card lists are built from).

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**
- A second product-scoping mechanism: scoping belongs to itemPassesProductFilter
  (consumed via allProductIdsFromRaw) and to populateActionableCohorts' label check.
  Do not add a third card-list filter.

## Hooks (literal strings only - no ${interpolation})
- dd-kpi-avg-complete -> Avg. Days to Complete value (pre-existing)
- (no new DOM hooks: this chunk is a pure-logic fix, asserted at the getter level)

## Proof
- Spec path: src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-hidden-scope.spec.ts
- Command: npx ng test --watch=false --browsers=ChromeHeadless --include="**/delivery-dashboard-hidden-scope.spec.ts"
- Fail if reverted: yes - restore `this.visibleCardIds.reduce(...)` in kpiOngoingTotal
  and spec 1 reports 3 instead of 5, spec 2 reports a delta of 0 instead of 2.
- Last run: 2026-11-13 PASS (3/3; 3 FAILED on revert — "Expected 3 to be 5", "Expected 0 to be 2" x2)

## Note on the expected number movement
In delivery increases on first deploy by the ongoing headcount of whatever products
are currently hidden. That is the fix, not a regression: those participants were
already being counted as Stuck in the tile beside it.
