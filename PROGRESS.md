# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-04_ · **New session? Read `specs/ORIENTATION.md` first.**

## Current state
- Angular 19 + Firebase PWA across **3 Firebase projects** (StarLabs `fir-sample-aae4a` = delivery; Watson `watsonproduction-becde` = finance; Sales-CRM `salesleadcrm` = lead/purchase), email-joined. Deployed via GitHub Actions → Firebase Hosting; **no test/build gate**; real coverage ≈ 0 (398/399 stub specs).
- **Documenting the system concept-group by concept-group, validating with the operator.** Authoritative truth → `specs/validated/` (supersedes the AI-derived `specs/*.md`). Full discovery, graphify graph, reliability tiers, operator-screen map, and config model already documented.
- Trusted-collection set **proposed** (`specs/tier-a-proposal.csv`) — awaiting engineer validation → then lock.
- **Working branch: `docs/system-documentation-prod`** (cut 2026-06-04 from `origin/production` = today's live code; the old `main` was 308 commits / 234 files stale). Backend = `starlabs-cloud-function/` on `development`. **graphify graph rebuilt 2026-06-04 over production + CF backend** — 18,337 nodes / 25,613 edges / 1,094 communities, 1,104 wiki articles (`graphify-out/wiki/index.md`). Hub node: `AuthguardService` (289 edges).

## Last session changes (2026-06-03) — why
- **#1 Journey & Products — VALIDATED & documented** (`specs/validated/01-journey-and-products.md`): the journey/product/**package**(=pricing design) model; the `journeystatus` machine incl. **`shifted`** = journey-change-with-payment-carryover (decoded via Watson); the **Watson finance** backend; cardinality (1 journey → many delivery products); the cross-project **email/`watsonpurchaseid`** join. Now carries full evidence tables.
- **#2 Product Modes — VALIDATED end-to-end** (`specs/validated/02-product-modes.md`): the **two-mode model** (delivery mode = 5 rails; participant mode = 15-state machine); delivery taxonomy with the **inverted names** (Event=queue-in-event, Installation Event=full event); the **`participant mode checklist`** mechanism; field opportunities (BIG deliver for others); per-mode widgets; rollup rule. **Engine FOUND & mapped (2026-06-04, §7):** `starlabs-cloud-function/functions/components/participantmode.js` (`development`) — 3 functions (participantsproduct trigger + daily IST cron + event trigger). **Denorm/projection layer also mapped (§7d):** `participant metadata` is a CQRS projection rebuilt by ~11 `*_to_pmd` triggers in `participantmetadata.js`. **TD-016 fully closed.**
- **Config-authoring screens** mapped into `CONFIGURATION.md`. **`specs/ORIENTATION.md`** created (read-first map) + `CLAUDE.md` wired to it. All probe scripts + their captured data copied into `specs/journals/…-artifacts/`.

## Pending
- **#2 Product Modes — DONE (end-to-end mapped 2026-06-04).** Engine = `participantmode.js §7`; denorm/projection = `participantmetadata.js §7d` (CQRS, ~11 `*_to_pmd` triggers). No residual. → ready to move to #3.
- **#3 Queue Manager** — next concept group (head start: `CONFIGURATION.md §1` queue config model).
- **Engineers validate `tier-a-proposal.csv`** → mark `data-reliability.md` LOCKED → build CI fixtures.
- Resolve **FCM/Zoom hardcoded-key** security task (TD-006); consider **Clone/Duplicate dedup** (TD-001) before tests.
