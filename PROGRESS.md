# PROGRESS

## Current state
Branch `dd-copy-polish`, 5 commits ahead, nothing pushed. The Delivery Dashboard now
runs the v4 information architecture: one funnel owning every population count, a
"Needs attention" row, a product strip that drives the existing product filter, a
Delivery-speed section, and stage-mix bars inside the Products table. Verified live
at http://localhost:4200/delivery-dashboard against starlabs-test. Production build
exits 0. The spec suite compiles for the first time.

## Last session changes
- `test:` unblocked the spec suite. Five pre-existing compile errors (stray `console`
  and `os` imports, two wrong-cased component imports in specs) meant `ng test` failed
  before a single assertion. The sixth is in `src/app/ATC/**`, which CLAUDE.md puts
  off-limits, so `tsconfig.spec.json` now excludes it - the constraint was never
  actually enforced anywhere. `tsconfig.spec.scoped.json` deleted, no longer needed.
  CONSEQUENCE TO WATCH: specs now run, so the ~398 empty CLI stubs now run AND FAIL.
  `delivery-dashboard-clone.component.spec.ts` fails on "No provider for Firestore".
  Repo-wide `ng test` is red for that reason; contract specs are green in isolation.
- `fix:` In delivery now spans hidden products, like every other funnel number.
- `feat:` the funnel became the single home for all six populations; KPI bento,
  Needs-Your-Attention tiles and the standalone pipeline panel deleted, their
  drill-downs re-homed.
- `feat:` stage-mix bar moved into the Products row, beneath the five numeric pills
  rather than replacing them.
- `fix:` Stuck and Not-consuming promoted OUT of the In-delivery step. Found by
  rendering: Glimpse reads In delivery 0, Stuck 13, Not consuming 13, so nesting
  asserted 13 inside 0. Not-consuming is 'initiated'-only and therefore disjoint
  from In delivery by construction.

Root cause worth remembering: my Gate 2 analysis claimed `visibleCardIds` was not
product-filtered. It is - via `itemPassesProductFilter` inside `allProductIdsFromRaw`.
Reading one level deeper would have saved a getter and a signature change.

## Pending
- Nothing pushed. Three decisions open for the operator: the grey stage-colour ramp,
  whether the funnel sparklines earn their place next to the labelled strip, and
  whether to carry these commits to origin/joshua-development.
- No team-level view; `teamref` does not exist in Firestore.
- Repo-wide `ng test` is red on pre-existing CLI stubs now that the suite compiles.
