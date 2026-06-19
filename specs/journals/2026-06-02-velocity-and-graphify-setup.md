# 2026-06-02 — Velocity journaling install + full graphify knowledge graph

**Headline:** Installed the journaling-discipline slice of the pilot-bootstrap velocity setup, and built the StarLabs knowledge graph — first AST-only, then a full LLM-driven semantic pass (operator-approved budget).

## Journaling discipline (pilot-bootstrap slice, operator-scoped)
Installed `CLAUDE.md` (Session Protocol + Plan/Journal Rules + graphify section + ATC constraints), `PROGRESS.md`, `specs/journals/` + `specs/plans/` (+ READMEs), `specs/pilot/log.md`. Full velocity substrate (Bug Protocol, Commit/Push rules, decision logs, gates) intentionally deferred. **Operator directive: journal after every session.** Per the trading-automation reference (198 granular journals), this session was split from one monolith into 7 focused journals (this file is #7).

## graphify
- **AST-only first** (0 LLM tokens): 10,595 nodes / 15,583 edges / 659 communities. Chosen to avoid a disproportionate semantic cost on a 1,461-file corpus for an initial build.
- **Full LLM-driven semantic pass** (budget approved): a 38-chunk workflow over 822 knowledge-bearing files (427 `.ts` + 394 `.html`; `assets/` + 398 spec-stubs excluded), ~4.34M tokens → **+1,240 concept nodes / +2,265 semantic edges / 94 hyperedges → 11,835 nodes / 17,848 edges / 728 communities** (wiki 728 articles). 328 semantic node-ids bridged onto AST nodes.

## Findings (graph)
- **`AuthguardService` is the dominant hub** (285 edges, betweenness 0.371) — the architectural backbone/bottleneck.
- **7 of the top-10 hubs are `Clone`/`Clone-2`/`Duplicate`/`old` components** (BigCohortClone(2), DynamicQueueManagerClone, SalesDashboardClone, DeliveryDashboardClone, JourneycoachDuplicate, QueuePlanningClone) → significant duplication / dead-variant tech debt; dedup before writing tests (don't test dead clones).
- The semantic layer surfaced **5 cross-community "surprising connections"** AST missed (AST-only had 0): duplicated content-add forms; `EmailRecordComponent` ↔ `Notification Record/Log` ↔ `InterimReportLogComponent` (one log pattern, three screens); `releaselogdialog` ↔ `CustomerSupportDashboard`; availability ↔ `AuthguardService`.

## Gotcha (fixed)
`echo 'graphify-out/' >> .gitignore` concatenated onto a no-newline last line → corrupted `.claude` into `.claudegraphify-out/`. Repaired to separate lines. Lesson: this repo's files often lack trailing newlines — use Edit, not blind append.

## Decision
`graphify-out/` is gitignored (regenerable, 13.5MB graph.json). Rebuild incrementally with the CLAUDE.md one-liner after code changes; full rebuild via `/graphify .`.
