# DECISIONS.md — StarLabs

> Architectural decision log. Newest first. Status: Accepted / Proposed / Superseded. Companion journals in `specs/journals/` carry the full reasoning.

### D-009 · Operator-validated docs kept separate from auto-derived; Watson finance project in scope — Accepted (2026-06-03)
Human-validated documentation lives in **`specs/validated/`** (authoritative, supersedes the auto-`specs/*.md` per topic); the earlier AI-derived docs are reference-only/unreviewed. Validating concept-group by concept-group with the operator. **Group 1 (Journey & Products) validated** → `specs/validated/01-journey-and-products.md`. Newly in scope: the **Watson** finance project (`watsonproduction-becde`, separate Firebase) — purchases/payments/EMI/NACH. Decoded `journeystatus='shifted'` = journey change with payment carryover (Watson `"<A> to <B>"` purchases). Cross-project join is **explicit watson-id primary** (`journeyproductpurchase` 100%, `salesleads` 2025/26 100%) + **email fallback** (`journeyplan.ts:557`) — corrected from "email-only/abandoned" (TD-015). New debts: TD-014 (blank journeyref), TD-015 (join). Journal: `2026-06-03-watson-finance-and-shifted.md`.

### D-008 · Config-driven docs Phases 1–3 delivered; emulator config kept out of `firebase.json` — Accepted (2026-06-02)
Executed the rollout end-to-end on the DRAFT Tier-A set (gate is a human lock I can't perform; all claims are observable read-only now). Delivered: extended `CONFIGURATION.md`, new `DATA-MODEL.md` (ROLE×tier), 6 subsystem refs each with a `*-evidence/` slice + worked example, `specs/evidence/` probe corpus, `specs/diagrams/` (4), and `e2e/` Tier-A emulator fixtures + Playwright specs (bridge to D-002). Data corrected three documented beliefs: **`profile_data.role_ref → users_roles`** (not `eisroles`; fixed DOCS/DESIGN), **queue boolean-toggle shape is dormant** (TD-013), **`queue generation` is edit-only not dead** (TD-008 refined); also confirmed `content analytics` is web-read-only and `tier access config` gating is display-only in the client. **Sub-decision (prod-safety):** because the deploy workflow runs a bare `firebase deploy`, emulator config lives in a separate `firebase.emulator.json` (+ emulator-only `firestore.rules`) — never in `firebase.json` — so test infra can't deploy rules to production. Journals: `2026-06-02-config-and-data-model-docs.md`, `2026-06-02-phase2-3-diagrams-and-test-enablement.md`.

### D-007 · Documentation structure & phased rollout — Accepted (2026-06-02)
Adopt the trading-automation doc model: root `DOCS.md`/`DESIGN.md`/`DECISIONS.md`/`TECHNICALDEBTS.md`, durable subsystem refs in `specs/`, granular journals + plans. Phase 0 (lock-independent) done now; Phases 1–3 gated on the Tier-A lock. Plan: `specs/plans/2026-06-02-documentation-rollout.md`.

### D-006 · graphify knowledge graph: AST + full semantic — Accepted (2026-06-02)
Built AST-only first (free), then a full LLM-driven semantic pass (operator-approved budget) via a 38-chunk workflow. `graphify-out/` is gitignored (regenerable). Journal: `2026-06-02-velocity-and-graphify-setup.md`.

### D-005 · Journaling discipline (pilot-bootstrap slice) — Accepted (2026-06-02)
Install only the journaling slice of the velocity setup; **journal after every session**; split each session into focused per-investigation journals (trading-automation style). Full substrate deferred.

### D-004 · `loginlog` demoted to infra — Accepted (2026-06-02)
Operator-screen validation found no screen reads/writes `loginlog` (background auth log) → it fails the "operator uses this data" test → not part of the operator trust set. Journal: `2026-06-02-operator-screen-collection-map.md`.

### D-003 · Data-reliability tiers + engineer-validated lock — Proposed (2026-06-02)
Classify collections A/B/C/D by write-recency/volume/fill + operator-screen usage. Lock the Tier-A set only after the engineers who built the system validate `specs/tier-a-proposal.csv`. Document & build CI fixtures only on the locked set. Journal: `2026-06-02-data-reliability-classification.md`.

### D-002 · CI/CD test stack — Proposed (2026-06-02)
Deterministic core: static gates → Jest unit → **Firebase Emulator** integration (ATC fenced by construction) → Playwright E2E (external SDKs stubbed) → contract tests. **LLM verification as a final, initially non-blocking gate.** Gate the existing deploy job behind tests. Endgame: AI self-healing loop (failure → regression test → fix → PR). Journal: `2026-06-02-system-map-and-test-stack.md`.

### D-001 · ATC data is off-limits for CI/testing — Accepted (operator constraint, 2026-06-02)
Never read/write/seed ATC collections (denylist in `CLAUDE.md` / memory `atc-data-off-limits`). Exclude all `ATC/**` screens **and** the 14 non-ATC-folder screens that integrate ATC data (see `specs/operator-screens.md` §C). Test users (incl. admin) live in `starlabs-test`/emulator, never production.
