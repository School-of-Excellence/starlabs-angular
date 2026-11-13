# Contract: delivery-dashboard-v4-ia
Surface: /delivery-dashboard -> Overview (headline area, above the tab strip)
Env: starlabs-test   (never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/delivery-dashboard

## User moves
1. Open the URL logged in as an admin on starlabs-test
2. Read the funnel: Awaiting Initiation -> Ready to Start -> In delivery -> Delivered,
   with Stuck and Not-consuming as flags on In delivery (testid: dd-funnel)
3. Click any funnel number or flag; expect the Participants tab to open on that list
   (dd-funnel-awaiting / -ready / -stuck / -idle)
4. Click a product chip in "Ongoing by product" (testid: dd-strip-chip)
5. Expect every funnel number, the Products table and the Delivery-speed scope line to
   change together, and the Products dropdown to show that one product
6. Click "All products" (testid: dd-strip-all); expect the narrowing to clear
7. Tick two products in the Products dropdown; expect no chip to look selected and the
   speed scope line to read "Scoped to 2 products"

## Invariants
- ONE number, ONE home: each of kpiAwaitingTotal, kpiReadyToInitiate, kpiStuck,
  kpiInitiatedNotConsuming, kpiOngoingTotal and kpiCompletedTotal is rendered exactly
  once in the headline area. The only sanctioned restatement below the tabs is the
  "Bulk Initiate Ready (N)" button label, which names what the button will act on.
- The strip is a VIEW of productFilterControl, not a second filter: a chip click writes
  that control and runs onProductMultiFilterChange, the same path the dropdown uses.
  Changing the chip changes the funnel, the Products table and the speed scope line
  (a control that does not move the lists is the no-op failure class).
- A chip resolves a product through cardLabelForProductId - the same matcher
  populateActionableCohorts and availableCardLabels use - so the strip can never
  select a label the dropdown does not offer.
- The multi-select dropdown survives. A 2-product selection highlights no chip
  rather than lying about which single product is active.
- Nothing was removed: all four navToAttention drill-downs, all three sparklines,
  the "Not recorded" avg state, Stages, Specialist Appointment Slots, Completion
  History and the three outer tabs are all still present.
- The avg gauge is a 0-90 day scale with the 30-day target marked inside it, clamped
  at 100% (the old avgTimePct returned 150% for a 45-day average).

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- New MatDialog / extra component for a list that should be a native overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**
- Re-introducing .dd-kcell, .dd-attention/.dd-tile or .dd-pby markup: those panels
  are what duplicated the numbers
- A third product-scoping mechanism (see qa/delivery-dashboard-hidden-scope.md)
- Interpolated data-testid values

## Hooks (literal strings only - no ${interpolation})
- dd-funnel            -> the funnel container
- dd-funnel-awaiting   -> Awaiting Initiation step body
- dd-funnel-ready      -> Ready to Start step body
- dd-funnel-indelivery -> In delivery step body
- dd-funnel-stuck      -> Stuck flag (inside In delivery)
- dd-funnel-idle       -> Not-consuming flag (inside In delivery)
- dd-funnel-delivered  -> Delivered step body
- dd-strip             -> product strip container
- dd-strip-all         -> "All products" chip
- dd-strip-chip        -> each product chip
- dd-speed             -> Delivery speed panel
- dd-kpi-avg-complete  -> the avg figure (pre-existing hook, re-homed)
- dd-stagemix          -> the per-product stage-mix bar
- dd-stagemix-legend   -> the Init/Await/Started/Ongoing/Done colour legend

## Proof
- Spec path: qa/checks/delivery-dashboard-v4-ia.mjs (template/IA invariants)
            src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-strip.spec.ts (behaviour)
- Command: node qa/checks/delivery-dashboard-v4-ia.mjs
           npx ng test --watch=false --browsers=ChromeHeadless --include="**/delivery-dashboard-strip.spec.ts"
- Fail if reverted: yes - restoring the previous template fails 20+ of the 36 node
  checks (IA1/IA2/IA3 panel removal, the once-only counts, every new hook, and the
  strip wiring), and removing selectProductFromStrip fails the Karma spec.
- Last run: 2026-11-13 PASS — node check 51/51 ALL PASS (20+ FAIL on revert of the funnel/strip, 11 FAIL on revert of the stage mix); Karma strip spec 10/10 SUCCESS; npx ng build --configuration production -> BUILD_EXIT=0, 0 ERROR lines

## Stage mix (the Products row)
The bar from the deleted "Delivery Pipeline by Product" panel now lives in the
Products row, as a full-width second line inside the Journey Funnel cell, beside
the counts it describes.

- The bar ADDS the shape; it does NOT replace the five numeric pills. Those are
  five visible metrics and removing them was never asked for (IA44-IA48 pin them).
- Each segment opens the same list its pill opens (openCardFunnelModal).
- Segment and legend order is Init, Await, Started, Ongoing, Done - carried over
  unchanged from the deleted panel, so the colours still mean what they meant.
- The bar carries no text, so stageMixLabel() gives it a title and aria-label:
  "Init 3, Await 1, Started 2, Ongoing 4, Done 0 (total 10)".
- An empty pipeline says "No participants in the pipeline yet" rather than
  rendering an unexplained blank track.

## Not covered here
- No team-level cut. There is no teamref on the specialist profile in Firestore,
  so the board is still organised by product, which is not the cut the dashboard
  ultimately wants.
