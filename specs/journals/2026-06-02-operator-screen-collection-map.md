# 2026-06-02 — Operator screen → collection map (11 agents) + Tier-A validation

**Headline:** Validated the reliability tiers by the right question — *"is there a real operator screen that uses this data?"* — using 11 parallel agents to extract every Firestore read/write across all 194 routed operator screens with file:line evidence. **54/55 Tier-A collections are operator-validated; `loginlog` is the lone orphan.**

## Context / why
"Written by the app" ≠ "operators use it." The runtime screen-usage telemetry (`collectionname`, `userAccessCounts`) is itself broken/stale, so the **route+component code is the 100% evidence** for which screens operators can use. Operator asked to validate Tier-A this way and document all operator screens.

## What we did
Partitioned the 194 routed operator screens (ATC's 16 excluded) into 11 chunks; dispatched 11 general-purpose agents, each writing a structured `agent_N.result.json` of per-screen reads/writes/services. Aggregated into a collection→screens reverse index (`~/Downloads/svstats/aggregate_screens.js`) → `specs/operator-screens.md`.

## Findings
- **Tier-A: 54/55 confirmed operator-used.** Orphan: **`loginlog`** (no screen → background auth log → demoted to infra).
- **CI-exclusion boundary: 14 non-ATC-folder operator screens integrate sensitive ATC data** (2 WRITE — `updateprofiletaxonomy`, `overall_event_dashboard`): e.g. `big-dashboard`, `profilelist`, `JourneycoachDashboard-new`, `ecosystem`, `live_event_dashboard`, `first_timers_dashboard`, `queueeventhealth`, `arenadesigninsights`, `dynamicstudio`, `dynamicqueuemanager`, `participantAEL`. So excluding ATC from CI means excluding *parts of mainstream screens*, not just the `ATC/` module.
- **Paradox:** `queue generation` is read by 35 screens but had **0 writes in 90 days** → heavily-used UI on a broken write-pipeline (same signature as the BIG-level breakage).
- 219 distinct collections referenced by screens vs ~60 audited → the Tier-D backlog (promote-candidates: `queue generation`, `users_roles`, `content_urls`, `formsByClient`, `live assignment`, `clientissue`, `workshopconfiguration`, …).

## Decision
`loginlog` → demote. The 14 ATC-integrating screens → documented as CI-exclusions in `operator-screens.md` §C. Promote-candidates → run the recency/fill audit next.

## Artifacts
`./2026-06-02-operator-screen-collection-map-artifacts/agent_1..11.result.json` (the raw per-screen evidence). Full map: `specs/operator-screens.md`.
