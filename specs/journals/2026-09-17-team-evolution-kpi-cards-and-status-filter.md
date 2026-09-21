# 2026-09-17 — Team Evolution Dashboard: duplicate KPI cards + status filter that filtered nothing

## Context
`mahalakshmi-development` (merged as `dc21e133`) reworked the Member overview to source
participants from `activeproduct` / `consumedproducts` / `unconsumedproducts`, added a
`Completed` KPI card and an `overviewStatusFilter`. Two defects came with it; both were
flagged before the merge and fixed here after the rollout gate run.

## Defect 1 — five identical "Needs attention" cards
The KPI card kept `*ngFor="let k of order"` (5 lifecycle keys) while every field inside it
was rewritten to read `lifecycleCounts.needsAttention` / hardcoded copy. Result: five
visually identical cards, each with the SAME `data-testid="jted-div-014"`, whose only
difference was the click handler passing a different `k` to `toggleKpi`.

Duplicate testids also make a Playwright `getByTestId` strict-mode locator ambiguous, so
this was on course to break the addressable case as soon as one was written.

**Fix:** drop the `*ngFor`; bind `kpiFilter === 'needsAttention'`, `lifecycleConfig.needsAttention.cssVar`
and `toggleKpi('needsAttention')` directly. One card, one hook. The author's intent looks
like a two-card layout (Needs attention + Completed), which is what this produces.

## Defect 2 — the status filter changed the count, not the rows
`filteredOverviewEntries` was wired into the empty-state row and the "N participants"
subtitle, but the table body still iterated `dfuParticipantMap | keyvalue`. Selecting
"Completed" changed the header text while every participant stayed on screen.

**Fix:** iterate `filteredOverviewEntries`.

**Why the trackBy came with it:** `filteredOverviewEntries` is a *getter*, so it returns a
NEW array on every change-detection pass. The `keyvalue` pipe it replaced is a pure pipe
and memoises, so the swap silently traded a memoised array for an unmemoised one — without
a trackBy, `*ngFor` would tear down and rebuild every row on each CD cycle, collapsing any
expanded participant. `trackOverviewEntry` keys on the profile id.

Left alone: the People-cards section (`.cards`, ~line 257) also iterates the unfiltered
map, but it has its own `pplSearch` filter and is a different view — the status filter is
a Member-overview control.

## Verification
`tsc --noEmit` clean, `ng build --configuration production` 0 errors, hook-diff aligned
(27 declared / 27 referenced, both directions). NOT verified in a browser — the screen is
Firebase-auth gated and needs real DFU participant data. The behavioural claims worth
clicking through: one KPI card renders (not five), and choosing Completed actually shortens
the table.

## Revert guide (per-screen)
Screen: **Team Evolution Dashboard → KPI strip + Member overview table**.
Files: `src/app/Journey Onboarding/team-evolution-dashboard/team-evolution-dashboard.component.{html,ts}`.

To fully revert:
1. **.html:122** — restore `*ngFor="let k of order"` on the `jted-div-014` card and change
   the three bindings back to `kpiFilter === k`, `lifecycleConfig[k].cssVar`, `toggleKpi(k)`.
2. **.html:158** — `*ngFor="let entry of filteredOverviewEntries; trackBy: trackOverviewEntry"`
   back to `*ngFor="let entry of dfuParticipantMap | keyvalue"`.
3. **.ts** — delete `trackOverviewEntry()` and its comment (above `toggleOverviewStatus`).

Reverting restores both defects. No other screen is affected.

## Pending
- No behavioural spec yet for the status filter; the journey suite only asserts
  `jted-div-027` is addressable. Now that the filter works, a case is worth writing.
- The `appointments` query added to delivery-dashboard-clone in the same merge
  (`in` + `attended ==` + `orderBy endtime desc`) still needs a composite index; it fails
  at runtime, not build time.
