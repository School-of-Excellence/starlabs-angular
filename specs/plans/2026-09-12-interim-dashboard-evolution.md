# Plan — Interim Report Dashboard: real data for Evolution Progress
Approved by operator 2026-09-12 (data source: `interim evolutionprogress` only). Follows `2026-09-11-interim-dashboard-crossover.md`.

## Data (read-only, default DB — no ATC database / collections)
| Collection | Query | Used for |
|---|---|---|
| `interim evolutionprogress` | `interimlogid in [...]` chunks of 30, latest `created` per log | `age`, `summary.savedyears`, `adjustments[]` → `sliderValue`, `nochangevalue`, `type`, `hourValue`, `savedyears` |

Written by the Flutter app from commit `6acd161` (2026-09-11). Reports submitted before that build have no record → "no record" (older data lives only in ATC `atc_alpha/…/corrections`, deliberately not read). The `adjustment` text in the doc is never displayed.

## Rules
| Item | Rule |
|---|---|
| Outcome | `sliderValue` No Change / Somewhat Change / Changed / Changed and Improving / Completely Changed → none / some / lot / lotimp / full |
| Grid | member filed under their most frequent outcome (tie → lower), then share of their adjustments (1–25 / 26–50 / 51–75 / 76–100 %) |
| Total years saved | sum of stored `savedyears` (`summary.savedyears`) over members with time reported |
| Average per member | total ÷ members with time reported |
| Hours reclaimed | Σ hours/day (Week ÷ 7) |
| Pool | section pool (ongoing or submitted); grid counts members with at least one answer |
| By participant | outcome bar + answered/total; detail: years, hrs/day, age, outcome counts, no-change reasons |

## Edits
| File | Change |
|---|---|
| `interim-report-dashboard.component.ts` | load latest `interim evolutionprogress` per log; member gets `adjs`, `age`, `evoYears`, `hasEvo` |
| `interim-report-dashboard.script.ts` | grid, years strip, their drill-downs, By participant Evolution column + detail read the real pool |
