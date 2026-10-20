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

## Operator edits on top of the jcd pull
| Edit | Why |
|---|---|
| `goToHealthBoard` back to `window.open(..., '_blank')` | the pull switched it to in-tab `router.navigate`; the 09-23 new-tab behaviour is what JCD-02 asserts — operator kept new tab |
| Outreach row `statusLine` prefers priority.engine's reason again | the pull dropped it (Joshua c5477756 item 6); JCD-03 caught it |
| restored Joshua's open-ticket server count (`getCountFromServer`, item 5) + filtered appointments query (item 7) + their fix comments | Sashong's 88132b7b was built on the pre-c5477756 file and reverted them: tile counted PEOPLE with a stale-metadata fallback, appointments read unfiltered. Found by a parallel audit agent; JCD-01's seed can't tell the two apart |
| stripped 4 debug `console.log("Upgrade EMI…")` | came in with ee63ba33 |
| removed the 3 `this.getAtcAlpha()` calls the pull added | they read `atc_alpha` / `atc_to_validate` (ATC — off-limits under test). Unreachable today (their handlers aren't bound in the template) but one rebind away from an ATC read |

Net of the edits, what the pull contributes is Sashong's features only: per-product "To Be Onboarded"
drilldown, Ecosystem/DFU active + non-active boxes, `getProductName` / product-name fallback for the journey column.

## e2e
No template changes → no new hooks; hook-diff aligned for both. Pre-push (emulator WITH functions): full journey 80 pass /
1 fail (JCD-03 → fixed) / 27 skip; after the fixes coach-dashboards + dashboards 16/16.

## Revert guide (per screen)
- delivery dashboard: `git checkout 43055b77^1 -- "src/app/Journey Onboarding/delivery-dashboard-clone"`
- journeycoach-dashboard (whole pull + edits): `git checkout 43055b77 -- "src/app/Journey Onboarding/journeycoach-dashboard"`
- only the operator edits: revert the "keep new-tab health board, drop ATC calls" commit
