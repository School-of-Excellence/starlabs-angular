# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-06-05 (session 2)_ · **New session? Read `specs/ORIENTATION.md` first** (incl. its Multi-machine/branch + macOS-TCC harness note if you just cloned this).

## Current state
- Angular 19 + Firebase PWA across **3 Firebase projects** (StarLabs `fir-sample-aae4a` = delivery; Watson `watsonproduction-becde` = finance; Sales-CRM `salesleadcrm`), email-joined. Deployed via GitHub Actions → Firebase Hosting; **no test/build gate**; real coverage ≈ 0.
- **Documenting the system concept-group by concept-group, validating with the operator.** Authoritative truth → `specs/validated/` (supersedes the AI auto-docs). Groups #1–#3 VALIDATED; **#4 Dynamic Studio = DRAFT** (`validated/04`, awaiting operator sign-off).
- **Working branch: `docs/concept-groups-wip`** (off `production`). Backend = `starlabs-cloud-function/` on `development`. **`production` now at `1ea4e49`** (fetched this session; only a workshop-dashboard change since our base — no studio impact). Data harness verified working against both production projects.

## Last session changes (2026-06-05 session 2) — why
- **Environment migrated to a new machine.** (1) Re-pointed `watson-cloud-functions` stale `main`→`development`. (2) **macOS TCC**: harness + SA JSONs were in `~/Downloads` (shell `Operation not permitted`); operator moved them to `~/solarcode/`, I re-pointed 89 hardcoded probe paths + `npm install firebase-admin` + verified read-only prod access. (3) **GitHub auth** via `gh`: `solar345` has StarLabs access (`antanosolar` is Watson-only); fetched fresh. All recorded in `ORIENTATION.md`.
- **#4 Dynamic Studio investigated & DRAFTed** (`validated/04-dynamic-studio.md` + `journals/2026-06-05-dynamic-studio.md` + `-artifacts/`). Core model **validated in session**: **data-widgets (read-only upstream projections) vs action-widgets (in-studio authoring)**, with **AEL/Triple-ATC hybrids**; **#3/#4 boundary = `live assignment` creation confirmed in code** (`dynamic-studio.component.ts:1136`). Findings: **84% solo delivery**; **video ~99% Zoom, LiveKit dead** (1/2335 studios); `studioZoomLink` is a CF not a collection; **Love Letters belongs to the engagement system**, only surfaced in-studio.

## Pending
- **#4 → promote DRAFT to VALIDATED:** operator walkthrough of `validated/04` §10 open Qs (LiveKit intent; `zoomlinkrequired:false`=32 queues meaning; 34% unanswered invitations; confirm hybrid classification; multi-specialist ~16% patterns; ATC-authoring workflow without reading ATC data).
- **#5 Appointment System — next** after #4 sign-off.
- Carry-overs: engineers validate `tier-a-proposal.csv` → lock `data-reliability.md`; TD-006 hardcoded secrets (still live on `production`); fold the ~7 residual `production` screens into `operator-screens.md`.
