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

## Proof
- Spec path: qa/checks/delivery-dashboard-v4-ia.mjs (template/IA invariants)
            src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-strip.spec.ts (behaviour)
- Command: node qa/checks/delivery-dashboard-v4-ia.mjs
           npx ng test --watch=false --browsers=ChromeHeadless --include="**/delivery-dashboard-strip.spec.ts"
- Fail if reverted: yes - restoring the previous template fails 20+ of the 36 node
  checks (IA1/IA2/IA3 panel removal, the once-only counts, every new hook, and the
  strip wiring), and removing selectProductFromStrip fails the Karma spec.
- Last run: 2026-11-13 PASS — node check 36/36 ALL PASS (20+ FAIL on revert); Karma strip spec 10/10 SUCCESS; prod build wrote dist/atctranscription (413 bundles, 13:30)

## Not covered here
- The per-product stage split still renders as five numeric columns in the Products
  table AND as bars in that table's own row block; folding those together is the next
  chunk (commit 3), not this one.
- No team-level cut. There is no teamref on the specialist profile in Firestore.
