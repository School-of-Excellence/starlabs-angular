# Handoff — paste this to start the next session

> Copy the block below into a fresh Claude Code session opened in the `starlabs-angular` folder.

---

We're documenting the StarLabs system concept-group by concept-group, validating with the operator (data-first, evidence-backed — don't guess). I'm continuing on a **new machine**, on branch **`docs/concept-groups-wip`**.

**First, orient (in this order):**
1. Read `specs/ORIENTATION.md` — especially the **"Multi-machine / branch setup"** section. Confirm the environment is ready:
   - This repo is on branch `docs/concept-groups-wip`.
   - The nested **`starlabs-cloud-function/`** repo exists and is on **`development`** (it's a *separate* git repo, gitignored here — if missing, clone `github.com/School-of-Excellence/starlabs-cloud-function` into that path and `git checkout development`). `validated/02` and `/03` cite it.
   - The read-only probe harness (`~/Downloads/svstats/` + the production service-account JSON) is present if I want to re-run data probes. (Key queue probes are archived in `specs/journals/2026-06-05-queue-manager-artifacts/`.)
   - `graphify-out/` is gitignored/regenerable — rebuild with `/graphify .` if you want the graph; not required.
2. Read `PROGRESS.md` and `specs/validated/README.md`.
3. Skim the validated docs already done: `specs/validated/01-journey-and-products.md`, `02-product-modes.md`, `03-queue-manager.md`.

**Status:** concept groups #1 Journey & Products, #2 Product Modes, #3 Queue Manager are ✅ validated & documented.

**Next task — concept group #4 Dynamic Studio.** The #3→#4 boundary is **`live assignment` creation**: #3 (Queue Manager) routes participants *up to* studio assignment; **#4 is the studio runtime** — what happens *inside* a session. Investigate via the usual method (probe production data read-only + read code → bring findings to me to validate → document into `specs/validated/04-dynamic-studio.md` + a journal). Head start:
- Collections: `live assignment` (the session — `participantsactivity` specialist→activity, `studioid`, `queueid`, status, zoom), `arena participant` (`stagerole`, `pairingmode=manual`), `queue studio pairing` (studio type Zoom vs OpenVidu), `studioinvitation`, `studio activity log`, `queue activity log`.
- CF (`starlabs-cloud-function/functions/components/`, `development`): `queuesystem.js` (`studioZoomLink`, `inviteToStudio`, `CreateQueueActivityLogV2`, `onQueueTokenCreateUpdateProductMode`), `openVidu.js`, `appointmentZoomIntegraion.js`, `big-assignment.js`.
- Angular: `src/app/queue system/` studio components (`assign-queue-studio`, `assign-procedure-studio`, `dynamic-studio`, `arenastudioactivity`, the zoom/openvidu components). ⚠ Remember the **clone inversion** (the `-clone` of dynamic-queue-manager is the LIVE one) and **stay out of ATC** (`atc_*`, `queue_atc_generation.js`, `triple atc`).
- Key #3 facts to carry in: pairing is 99.9% manual; the ATC is authored in-studio via `studiowidgets` (add→prescribe→assign-procedure→validate); `stagerole` lives on `arena participant`.

**Also pending (parallel / when ready):**
- Port the **queue flow-visualizer** into `queue-creation-v3` per `specs/queue-flow-visualizer/BRIEF.md` (and extract its graph-`build()`+validator as the **headless config-validity oracle** for the e2e/CI goal).
- Operator to confirm `validated/03` §10 open questions (`compulsoryactivity` combo semantics, capacity enforcement).

The overarching goal remains: **the documentation needed to stand up automated e2e testing that enables CI/CD.** Each validated concept group + the config-validity oracle are steps toward that.
