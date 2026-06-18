# 2026-06-02 — Component/route inventory, validated against ground truth

**Headline:** Rebuilt the component/route inventory from `src/app/app.routes.ts` (deterministic) instead of trusting agent prose — and caught **three** wrong agent claims in the process. Ground truth: **396 components, 212 routed screens, 14 services, 1 route guard.**

## Context / why
Operator (rightly) wanted to validate that we "have the components right" before building tests on top of the inventory. The 6-agent map was directionally good but excerpt-based.

## What we did
Parsed `app.routes.ts` with a deterministic script (`~/Downloads/svstats/parse_routes.js`) → 212 active routed screens (217 declared, 5 commented-out). Space-safe per-folder component counts. Produced `route_inventory.csv` (route → component class → folder → guard → import path).

## Surprises / corrections (why validation mattered)
1. **"~148 component files have no @Component" — FALSE ALARM.** Caused by ~10 folders with **spaces in their names** ("Journey Onboarding", "Zone Management", …) breaking `xargs`/word-splitting. Space-safe counting shows components are essentially all live. Lesson: quote paths / use `-exec` in this repo.
2. **Agents undercounted domains** (excerpt-based): `AppEngagement` (18 routes/32 comps — barely covered), `Participants Profile Management` (13/35; agent said ~9), `queue system` (14/37).
3. (carried) the SolarVoice "no tracking" error — same root cause: prose over data.

## Decision
The **route table is the backbone** for "intended usage." 212 routed screens; ~184 non-routed = dialogs/children/shared widgets. 19 ATC-related routes enumerated for fencing. Note: `view-participant-atc` (+5 others) appear **unguarded** — flagged for a precise guard pass.

## Artifacts
`./2026-06-02-inventory-validation-artifacts/route_inventory.csv` (212 rows). Saved to memory as `starlabs-test-coverage-is-stub` (the 398/399 stub finding).
