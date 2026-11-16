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
- Last run: 2026-11-13 PASS - node check 63/63 ALL PASS; Karma strip spec 10/10 SUCCESS; npx ng build --configuration production -> BUILD_EXIT=0, 0 ERROR lines; verified live at localhost:4200 on starlabs-test (pill N and segment N identical computed colours; bar widths exactly proportional at 46px per participant; connector gradient resolving to the ramp)

## Set relationships (settled by live data, 2026-11-13)
v4 as mocked up drew Stuck and Not-consuming as flags INSIDE the In-delivery step,
on the premise that they are "states of people already in delivery". That premise
is false here:

- In delivery  = funnelData.ongoing            -> status 'ongoing'
- Stuck        = populateActionableCohorts     -> status 'initiated' OR 'ongoing', stalled 15d+
- Not consuming= populateActionableCohorts     -> status 'initiated' ONLY

Not-consuming is therefore DISJOINT from In delivery by construction, and Stuck
merely overlaps it. Measured on starlabs-test at localhost:4200:

| product | In delivery | Stuck | Not consuming |
|---|---|---|---|
| WiSH | 2 | 6 | 2 |
| EI Custom Solutions | 5 | 6 | 5 |
| Glimpse | 0 | 13 | 13 |

Nesting them would have the board assert 13 people stuck inside a population of 0.
They now sit in a "Needs attention" row beside the funnel, labelled "spans Initiated
and Ongoing - not a slice of In delivery". No number and no drill-down changed.

INVARIANT: no element carrying kpiStuck or kpiInitiatedNotConsuming may be nested
inside the In-delivery step (IA52-IA55).

## Stage colours (operator call, 2026-11-13)
The five stages are an ORDERED sequence, so the ramp must descend monotonically in
luminance - otherwise the bar reads backwards and the legend becomes mandatory.
The inherited zinc ramp did not:

| stop | zinc (was) | luminance | new | luminance |
|---|---|---|---|---|
| s1 Init    | #d4d4d8 | 0.660 | #ced5fe | 0.679 |
| s2 Await   | #71717a | 0.167 | #939cf1 | 0.363 |
| s3 Started | #3f3f46 | 0.051 | #646bbd | 0.169 |
| s4 Ongoing | #09090b | 0.003 | #3d4179 | 0.062 |
| s5 Done    | #4f46e5 | 0.117 | #1b1d32 | 0.013 |

Zinc rose again at the final step (Done lighter than Ongoing) AND bunched the
middle three into 0.167 / 0.051 / 0.003. The new ramp is built in OKLCH at hue 278
(the --accent family), L 0.88 -> 0.24, with adjacent WCAG ratios 1.76 / 1.89 /
1.96 / 1.76 - spread 0.20, against zinc's 1.36 - and the lightest stop still 1.32:1
against the --c-surface-2 track. Defined as --dd-stage-1..5 on :host.

INVARIANT: --dd-stage-1..5 must be defined and strictly descending in luminance,
and .dd-bg-s1..s5 must resolve to them (IA31c, IA31d).

## One colour system per row (operator call, 2026-11-13)
The five numeric pills used amber / sky / indigo / emerald / blue - five unrelated
hues for five ORDERED stages, which encodes them as unrelated categories - while the
bar directly beneath them used the sequential ramp. Two encodings of the same five
stages, disagreeing, in one cell. Pill N now takes --dd-stage-N.

Settling that exposed an ORDER conflict. The pills read
Yet to Start -> Init -> Started -> Ongoing -> Done. The bar and legend read
Init -> Await -> ... , carried over from the deleted "Delivery Pipeline by Product"
panel. The pills are right - a participant is awaiting before they are initiated - so
the bar, the legend and stageMixLabel() were reordered to match, and s1 is now
Awaiting rather than Initiated.

Pill ink is the AA pairing: stages 1-2 take --dd-stage-5 as ink (11.49:1, 6.52:1),
stages 3-5 take white (4.79:1, 9.41:1, 16.56:1).

The pill connector hairline was a gradient of the same five old hues
(#fbbf24, #38bdf8, #818cf8, #34d399, #2563eb) in two places - the Products row and
the hidden-product card. Both now carry the ramp.

INVARIANT: pill N, bar segment N and legend swatch N all mean the same stage, in
journey order, and every one of those colours comes from --dd-stage-N (IA56, IA56b,
IA56c, IA57, IA58, IA59, IA60). No stage colour is hard-coded.

## Sparklines removed (operator call, 2026-11-13)
The three funnel sparklines drew the per-product spread UNLABELLED, directly above
a product strip that draws the same spread WITH product names. The live spread is
skewed enough (51 against 2, 1 and 0) that five of six bars sat on the 3px minimum
floor, so the chart said "one product dominates" and nothing else. The strip says
that better. sparkReady / sparkStuck / sparkCompleted / sparkMax / buildSparkData
and their cache are deleted from the component; IA31 fails if any returns.

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
