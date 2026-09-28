# 2026-09-29 — pulls onto charan-release: delivery dashboard (mahalakshmi) + journeycoach-dashboard (sashong)

## What
| Screen | Source | How | Commit |
|---|---|---|---|
| delivery-dashboard-clone (`/delivery-dashboard`) | mahalakshmi-development e42364e6 | `merge --no-ff --no-commit`, update-delivery dropped | 43055b77 |
| journeycoach-dashboard (`/JourneycoachDashboard-new`) | sashong-development 88132b7b + ee63ba33 | path-scoped `git checkout origin/sashong-development -- <dir>` | (this commit) |

## Why these shapes
- **update-delivery excluded** (operator). It went through a real merge, so git records dac660a1 as merged — a
  later merge of mahalakshmi-development will NOT re-offer it; take it path-scoped if wanted.
- **sashong-development NOT merged**: its `app.routes.ts` is older than ours — a merge would drop
  team-evolution-dashboard / communication-grid-planner / workshopconfigold / eiflix ops routes, repoint
  /bigcohorts and /workshopconfig, strip several authGuards, and add an unguarded `ContentAnalyticsv2` route.
  Only journeycoach-dashboard was taken; charan-release had no jcd changes since the merge-base, so nothing
  of ours was overwritten.

## Changes
- delivery-dashboard-clone: "Ready for Initiation" built from the product cards' `awaiting` funnel instead of
  cleared-payment-not-initiated metadata.
- journeycoach-dashboard (.ts only, +189/−112): onboarding-product click opens the product, `getProductName`,
  Health board navigates in-tab; reads appointments / clientissue / products (no ATC).

## e2e
No template changes → no new hooks; hook-diff aligned for both. Suites run before push (see PROGRESS / commit).

## Revert guide (per screen)
- delivery dashboard: `git checkout 43055b77^1 -- "src/app/Journey Onboarding/delivery-dashboard-clone"`
- journeycoach-dashboard: `git checkout 43055b77 -- "src/app/Journey Onboarding/journeycoach-dashboard"`
