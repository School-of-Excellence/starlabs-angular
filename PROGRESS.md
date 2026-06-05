# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-05_ · **New session? Read `specs/ORIENTATION.md` first** (incl. its Multi-machine/branch setup section if you just cloned this).

## Current state
- Angular 19 + Firebase PWA across **3 Firebase projects** (StarLabs `fir-sample-aae4a` = delivery; Watson `watsonproduction-becde` = finance; Sales-CRM `salesleadcrm` = lead/purchase), email-joined. Deployed via GitHub Actions → Firebase Hosting; **no test/build gate**; real coverage ≈ 0 (398/399 stub specs).
- **Documenting the system concept-group by concept-group, validating with the operator.** Authoritative truth → `specs/validated/` (supersedes the AI-derived `specs/*.md`). Full discovery, graphify graph, reliability tiers, operator-screen map, and config model already documented.
- Trusted-collection set **proposed** (`specs/tier-a-proposal.csv`) — awaiting engineer validation → then lock.
- **Working branch: `docs/concept-groups-wip`** (off `production` = live code; supersedes `docs/system-documentation-prod`). Backend = `starlabs-cloud-function/` on `development` (separate repo, gitignored — re-clone on a new machine; see ORIENTATION "Multi-machine"). graphify graph (gitignored, regenerable) was rebuilt over production + CF — 18,337 nodes; hub node `AuthguardService`.

## Last session changes (2026-06-03) — why
- **#1 Journey & Products — VALIDATED & documented** (`specs/validated/01-journey-and-products.md`): the journey/product/**package**(=pricing design) model; the `journeystatus` machine incl. **`shifted`** = journey-change-with-payment-carryover (decoded via Watson); the **Watson finance** backend; cardinality (1 journey → many delivery products); the cross-project **email/`watsonpurchaseid`** join. Now carries full evidence tables.
- **#2 Product Modes — VALIDATED end-to-end** (`specs/validated/02-product-modes.md`): the **two-mode model** (delivery mode = 5 rails; participant mode = 15-state machine); delivery taxonomy with the **inverted names** (Event=queue-in-event, Installation Event=full event); the **`participant mode checklist`** mechanism; field opportunities (BIG deliver for others); per-mode widgets; rollup rule. **Engine FOUND & mapped (2026-06-04, §7):** `starlabs-cloud-function/functions/components/participantmode.js` (`development`) — 3 functions (participantsproduct trigger + daily IST cron + event trigger). **Denorm/projection layer also mapped (§7d):** `participant metadata` is a CQRS projection rebuilt by ~11 `*_to_pmd` triggers in `participantmetadata.js`. **TD-016 fully closed.**
- **Config-authoring screens** mapped into `CONFIGURATION.md`. **`specs/ORIENTATION.md`** created (read-first map) + `CLAUDE.md` wired to it. All probe scripts + their captured data copied into `specs/journals/…-artifacts/`.

## Pending
- **#2 Product Modes — DONE (end-to-end mapped 2026-06-04).** Engine = `participantmode.js §7`; denorm/projection = `participantmetadata.js §7d` (CQRS, ~11 `*_to_pmd` triggers). No residual.
- **Stream B (citation re-anchoring) — DONE 2026-06-04.** TDs/key cites re-verified vs `production`: **TD-010 now mostly fixed** (5 of 6 routes guarded; only `devtestmic` left), TD-006 keys still live, TD-015 `:557→:584`, TD-016-hist `:814→:815`. **Residual:** ~7 new `production` screens not yet in `operator-screens.md`.
- **#3 Queue Manager — DONE (validated 2026-06-05).** `validated/03-queue-manager.md`: session-series → ATC → uP! event; **two transition types** (operator `nextstage` + self-move/auto-advance); variation = journey-family × cycle; config model (`queue-creation-v3`); providers (peak 29 studios × ~2 specialists); #3/#4 boundary = `live assignment` creation. Plus the **live flow-visualizer** feature (`specs/queue-flow-visualizer/` — prototype + BRIEF for a parallel session; doubles as the e2e config-validity oracle).
- **#4 Dynamic Studio — ⏳ NEXT** (the studio runtime; head start: `arena participant`, `live assignment`, `studioZoomLink`/`openVidu.js`).
- **Engineers validate `tier-a-proposal.csv`** → mark `data-reliability.md` LOCKED → build CI fixtures.
- Resolve **FCM/Zoom hardcoded-key** security task (TD-006, still live on `production`); consider **Clone/Duplicate dedup** (TD-001) before tests.
