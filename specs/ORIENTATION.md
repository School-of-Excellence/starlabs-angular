# ORIENTATION — read this FIRST (new-session map)

> One-screen map of where everything is and what's true. Read this → `CLAUDE.md` (constraints) → then the specific `specs/validated/` doc or journal you need. Updated 2026-06-04.

## What this project is
**StarLabs / "Breakthroughs"** — an Angular 19 + Firebase coaching/customer-journey platform. People **buy a journey** → get **onboarded** → move through **delivery** (appointments / events / cohort) → consume **content** → **progress** to further journeys. We are **documenting the system, validating concept-group by concept-group with the operator.**

## The method (how we work here)
**Data-first, evidence-backed, don't guess.** For each concept group: (1) probe production **data** read-only + read the **code**, (2) bring findings to the operator to **validate**, (3) **document** only what's proven into `specs/validated/`. Every claim carries evidence (a probe output + code `file:line`). When something isn't in the code/data, say so — don't infer.

## ⚠️ Hard constraints (never violate)
- **ATC data is OFF-LIMITS** for CI/testing — never read/write/seed `atc_alpha`, `atc_to_validate`, `atc_notes`, `triple atc`, `ai_generated_atc_summary(_backup)`, `temporary_*atc*`, `assignment_*atc*`, `big *atc*`, `0 atcinvolved issue`. 14 mainstream operator screens also touch ATC → CI-excluded (`specs/operator-screens.md` §C). Reference-only config (`atc taxonomy`/`atc model`/`atcmodel level config`) is safe.
- **Production is read-only.** Use the service accounts only to read. Test users (incl. admin) live in `starlabs-test`/emulator, never prod.

## The system is THREE Firebase projects (email-joined)
| Project | Role | Service file (in `~/Downloads/`) |
|---|---|---|
| `fir-sample-aae4a` | **StarLabs** — delivery, participants, content, **mode engine** | `serviceAccountKeyProduction.json` |
| `watsonproduction-becde` | **Watson** — finance: purchases, payments, EMI/NACH, invoices | `watson_servicefile.json` (has a text prefix + NBSP indentation — strip both) |
| `salesleadcrm` / `salescrm-test-19` | **Sales CRM** — lead → purchase approval (`breakthroughapprovedleads`) | (off-disk) |
Join key = **email** (`profile_data.email` ↔ Watson `Participants.email`); explicit `watsonpurchaseid`/`watsonparticipantid` on `journeyproductpurchase`/`salesleads`. `profileid ≠ Watson participantid`.

**StarLabs backend = Cloud Functions repo `starlabs-cloud-function/`** (a separate git repo nested in this folder; work on the **`development`** branch). `functions/components/*.js` = the real backend (participantmode, participantproduct, participantmetadata, queuesystem, big-*, watson-updates, salescrm-updates, …). This is where the **mode engine** lives (TD-016 resolved). The old `firebasefunctions/` is a partial/legacy deployment — ignore for mode/delivery logic.

**Branches (important):** Angular work is on **`docs/system-documentation-prod`** — cut from `origin/production` (today's live code). **Do NOT use `main`** — it is 308 commits / 234 files stale (frozen 2026-04-17). The CF backend repo is on **`development`**.

## The read-only data harness
`~/Downloads/svstats/` — Node + `firebase-admin`. Pattern: `cd ~/Downloads/svstats && node <probe>.js`. The query scripts for each investigation are **copied into the repo** under `specs/journals/<date>-<topic>-artifacts/` with a `DATA_OUTPUTS.txt` of the captured data. (`firebase-admin` already installed there.)

## Documentation map (what to read for what)
- **`specs/validated/`** = the **authoritative, operator-validated** truth (supersedes the auto-docs per topic). `README.md` is the validation-sequence index.
  - `01-journey-and-products.md` ✅ validated · `02-product-modes.md` ✅ **engine fully mapped** (§7 = the 3-function mode engine; §7d = the `participantmetadata.js` projection layer — end-to-end) · `03-queue-manager.md` ✅ **validated** (session-series → ATC; two transition types: operator `nextstage` + self-move; variation = journey×cycle; + flow-visualizer spec in `specs/queue-flow-visualizer/`, diagrams in `specs/diagrams/queue-*`).
- **`specs/` auto-docs** (AI-derived, *unreviewed* — reference only): `DATA-MODEL.md`, `CONFIGURATION.md` (config→behavior + config-authoring screens), `operator-screens.md` (every screen→collection, ATC-exclusion set), `data-reliability.md` (Tier A/B/C trust), `JOURNEY-LIFECYCLE`/`SCHEDULING-DELIVERY`/`QUEUE-AND-BIG`/`LIVE-STUDIOS`/`CONTENT-ENGAGEMENT`/`AUTH-ROLES`.
- **Root:** `DESIGN.md` (architecture WHY), `DOCS.md` (212-route code reference), `DECISIONS.md` (D-001…D-009), `TECHNICALDEBTS.md` (TD-001…TD-016).
- **`specs/journals/`** = the WHY/narrative per investigation (10 journals; each pairs with a `-artifacts/` data dir). **`tier-a-proposal.csv`** = the trusted-collection set awaiting engineer validation.
- **`graphify-out/`** (gitignored) = knowledge graph; `wiki/index.md` to navigate. **Rebuilt 2026-06-04 over `production` + the CF backend** — 18,337 nodes, 1,104 wiki articles, 40 labelled communities (incl. `CF Backend — Delivery & Data`, `CF Backend — Notifications/FCM`). Hub nodes: `AuthguardService` (289 edges), the dashboard clones, `DynamicQueueManager`. **Scope:** all code (AST) + 961 code/doc files (semantic). **Excluded:** the 249 `src/assets` images (all decorative UI/journey-track **icons — no diagrams**) and the 398 empty spec stubs. Our own architecture/journey/mode diagrams are **ASCII inside the `.md` docs**, so they ARE in the graph.

## Concept-group validation status
| # | Group | Status |
|---|---|---|
| 1 | Journey & Products | ✅ validated → `validated/01` |
| 2 | Product Modes | ✅ **fully mapped** → `validated/02` §7 (`participantmode.js` engine) + §7d (`participantmetadata.js` projection) |
| 3 | Queue Manager | ✅ **validated** → `validated/03` (+ `specs/queue-flow-visualizer/`) |
| 4 | Dynamic Studio | ⏳ **next** (boundary = `live assignment` creation; the studio runtime — `arena participant` stageroles, OpenVidu/Zoom rooms, where ATC widgets get clicked) |
| 5 | Appointment System | ⏳ pending |
| 6 | Events, Arena & Calendar | ⏳ pending |

## 🔴 Open threads / blockers
1. ~~Mode engine off-disk~~ — **RESOLVED 2026-06-04 (TD-016, fully closed).** The engine is **`starlabs-cloud-function/functions/components/participantmode.js`** (the StarLabs Cloud Functions repo — a separate git repo nested here; develop on the **`development`** branch). Fully mapped in `validated/02 §7`. The `participant metadata.participantmode` denorm path is also resolved (§7d): it's a CQRS projection rebuilt by `participantmetadata.js`.
2. **Tier-A lock pending** — engineers validate `specs/tier-a-proposal.csv` → then mark `data-reliability.md` LOCKED → only then build CI fixtures.
3. **Hardcoded secrets** (FCM server keys, Zoom SDK key) in client source — TD-006 (a spawned task exists).
4. ✅ **Doc citations re-anchored to `production` (stream B — done 2026-06-04, one residual).** Re-verified: TD-006 (`authguard.service.ts:186,188` **unchanged — keys still live**), **TD-010 5 of 6 routes now GUARDED** on `production` (only `devtestmic` `app.routes.ts:322` remains), TD-015 (`journeyplan:557→:584`), TD-016-history (`userprofile:814→:815`); `app.routes.ts` = 389 paths (+2 vs `main`). Data-driven facts + CF-repo (`development`) cites were always branch-independent. **Residual:** ~7 new `production` screens (`OneWayAppCommunication`, `onboarding-pipeline`, `web-studio-invitation`, `add-delivery-activities`, `workshop-dialog`, `upload-episode-dialog`, `exceptionalrouting`) not yet in `operator-screens.md` — fold in when that map is next touched.

## Immediate next actions
- Resume **#4 Dynamic Studio** (validate-from-data) — the studio runtime (boundary from #3 = `live assignment` creation). Head start: `arena participant`, `live assignment`, `studioZoomLink`/`openVidu.js` in the CF repo, `src/app/queue system/` studio components.
- (Parallel, optional) port the **queue flow-visualizer** into `queue-creation-v3` — spec ready at `specs/queue-flow-visualizer/BRIEF.md`.

## ⚙️ Multi-machine / branch setup (READ if you just cloned this on a new machine)
This folder is **one git repo** with **separate git repos nested inside it** (all gitignored — they do NOT travel with this repo):
- **`starlabs-angular`** (this repo): work continues on branch **`docs/concept-groups-wip`** (off `production`). The graph (`graphify-out/`) and the nested repos are gitignored — regenerate / re-clone them.
- **`starlabs-cloud-function/`** = the StarLabs backend, **its own repo** (`github.com/School-of-Excellence/starlabs-cloud-function`). On a fresh machine you must **clone it into this exact nested path and `git checkout development`** — it will NOT be here otherwise, and `validated/02`/`03` cite it.
- **`Watson-Angular/`, `watson-cloud-functions/`** = separate repos (finance/Watson); clone only if needed.
- **`graphify-out/`** (gitignored, ~26MB) = the knowledge graph — not committed; rebuild with `/graphify .` (+ the CF repo) if you want it.
- The **read-only probe harness** lives outside the repo (`~/Downloads/svstats/` + the production service-account JSON) — copy it + the SA file to the new machine to re-run probes. Key queue probes are also archived in `specs/journals/2026-06-05-queue-manager-artifacts/`.

## Gotchas (this repo specifically)
- **Folder names have spaces** ("Journey Onboarding", "queue system"…) → `grep --include=*.ts` and unquoted `xargs` BREAK. Use `find … -print0 | xargs -0 grep`.
- **Bash cwd resets** between calls — always `cd ~/Downloads/svstats &&` for probes.
- **398/399 `.spec.ts` are CLI stubs** — real test coverage ≈ 0 (don't trust the file count).
- **Watson SA file** has a `"Service Account for Watson Production: "` prefix + NBSP (U+00A0) indentation — slice to `{…}` and `split(String.fromCharCode(160)).join(' ')` before `JSON.parse`.
- **Heavy code duplication** (Clone/Clone-2/Duplicate/old) — 7 of 10 graph hubs (TD-001); don't document/test dead clones.
