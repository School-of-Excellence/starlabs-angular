# Journal — 2026-06-05 · #4 Dynamic Studio (investigation) + environment migration

## What was done
1. **New-machine environment restore** (continuing from another machine):
   - All 4 nested git repos present; **re-pointed `watson-cloud-functions` from stale `main` → `development`** (`ea75ed8`).
   - **macOS TCC gotcha discovered & worked around:** the data harness + service-account JSONs were in `~/Downloads` (TCC-protected → shell got `Operation not permitted` on every read/`mv`, even though Finder worked). Operator moved them to `~/solarcode/`; I re-pointed the harness (89 probe scripts hardcoded `/Users/solar/Downloads/...` → `sed` to `/Users/antano/solarcode/...`), `npm install firebase-admin`, and **verified read-only access to both production projects** (StarLabs `fir-sample-aae4a` + Watson `watsonproduction-becde`). Recorded the gotcha + new paths in `ORIENTATION.md`.
   - **GitHub auth:** installed `gh`; first account (`antanosolar`) lacked StarLabs-repo access (Watson-only). Operator switched to **`solar345`** which has access. Fetched fresh — **`production` advanced `fe83d05→1ea4e49`** (only `workshop-dashboard` changed → irrelevant to #4); CF `development` already current.
2. **#4 Dynamic Studio investigated** (data-first): mapped the runtime code surface (Explore agent) + ran 3 read-only probes. Wrote `specs/validated/04-dynamic-studio.md` (DRAFT).

## What was found (the model)
- **Studio runtime = `dynamic-studio.component.ts` (`/dynamicstudio`)** — a **consolidation + delivery surface**, not a video tool. Boundary from #3 = **`live assignment` creation (:1136) — confirmed in code.**
- **The load-bearing insight: two widget classes.**
  - **DATA widgets** = read-only CQRS projections of processes *outside* the queue/studio (submitted forms, AEL, Triple-ATC, previous/prescribed ATC, **Love Letters**, uP!-visit). The studio doesn't own this data — it surfaces it.
  - **ACTION widgets** = the only things authored in-studio (add ATC, assign changeagent, mark procedures, next-month review, stage move).
  - **HYBRIDS** = AEL + Triple-ATC: surfaced read-only **then validated/confirmed** in-studio.
- **Love Letters ≠ studio feature.** It's the **interim-report engagement system** (`love letter` 1,094 / `ask AH` 857; CF `slackLoveLetter` posts to Slack). The studio just queries `love letter where profileid==participant`. Belongs to a later concept group.

## What surprised us
- **LiveKit/OpenVidu is effectively dead in production:** `openvidu=true` on **1 of 2,335 studios**. Despite a full CF (`openVidu.js` `createOpenViduToken`) + client join flow, **~99% of delivery is Zoom auto-link** (83% of sessions have `zoomdata`; Zoom SDK on 2/96 queues; 32/96 queues need no link at all). The "three-way video stack" is really one-way in practice.
- **Delivery is overwhelmingly solo:** 84% of 12,790 sessions are 1-specialist (cf. #3's "29 studios × ~2 specialists" peak = concurrency, not per-session headcount).
- **`studioZoomLink` is a Cloud Function, not a collection** (0 docs) — the earlier doc map listed it ambiguously. The `live assignment` doc *is* the room; no separate studio/room collection exists.
- **34% of `studioinvitation`s never get an explicit `clientresponse`** (4,249 approved / 645 denied / 2,570 null of 7,464) — open question on what happens to those.

## Pending / next
- **Operator walkthrough** to promote `04` DRAFT → VALIDATED — open questions in §10 (LiveKit intent; `zoomlinkrequired:false` meaning; unanswered-invitation fate; confirm hybrid classification; multi-specialist patterns; ATC-authoring workflow without touching ATC data).
- Then #5 Appointment System.
- Housekeeping debt unchanged: tier-A lock, TD-006 secrets, the 7 residual `production` screens for `operator-screens.md`.
