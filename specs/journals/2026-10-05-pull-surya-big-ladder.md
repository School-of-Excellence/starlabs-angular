# 2026-10-05 — surya-development → charan-release: B!G leaderboard + funnel Addon drill-down (7a23f823)

## What (operator picked 2 of 3)
| Screen | How |
|---|---|
| big/big-ladder (new) + route `/big-leaderboard` | path-scoped checkout of the folder; the single route line applied as a patch (rest of app.routes.ts untouched) |
| Events / product-funnel.component.html | path-scoped checkout (Addon segment: Reason column + Assign product, like No product) |
Not taken: communication-grid-planner — surya's branch carries his Sep 15 redesign (03b68872), which charan-release/
development no longer have (undone in the Oct 1 squash/merges); operator to confirm with Surya before re-applying.

## Edits on top of the pull
| Edit | Why |
|---|---|
| 56 literal `bld-*` hooks on big-ladder.component.html | screen shipped with 0 hooks; readiness gate |
| `await this.fetchDashbordData()` in ngOnInit before the active-cohort read | the cohort read (1 query) beat the 9-query dashboard load, saw an empty participantMetadataMap and threw on `metadata['activejourney']` → empty cohort panel |
| `metadata?.['activejourney']` / `?.['lastcompletedjourney']` | a cohort member with no metadata doc crashed the same line |

## Notes
- Read-only screen. Reads 14 collections incl. `big assignment` (plain B!G assignments — not ATC-fenced), full
  scans of participant metadata / event participation request / content analytics / queue activity log — heavy
  on production-size data.
- Surya rebased his branch onto acf59248 (dropping 573e1f59/7835cb21 from his line); the buckets survive via
  development — confirmations .ts identical to charan-release.

## e2e
Hub `queue/big-ladder.spec.ts` BLD-01..03 (+ BLD-ADDR1 fixme), added to the big area's `only` list; events
EPC-ELIG-02. hook-diff aligned (big-ladder → queue, confirmations → events).

## Revert guide
- leaderboard: `git rm -r src/app/big/big-ladder` + drop the `/big-leaderboard` route line
- funnel Addon drill-down: `git checkout 4ed20c1a -- src/app/Events/event-participation-confirmations/product-funnel.component.html`
