# 03 · Queue Manager — OPERATOR-VALIDATED

> ✅ **Branch-checked (2026-06-05):** validated against `production` (Angular) + the CF repo on `development`. Facts here are from production config/data + code; Angular `file:line` cites are on `production`.
> **Status: VALIDATED with operator, 2026-06-05** (concept group #3). Supersedes `specs/QUEUE-AND-BIG.md` for queue mechanics.
> Evidence (in-repo): probes + outputs in `specs/journals/2026-06-05-queue-manager-artifacts/`; diagrams in `specs/diagrams/queue-*`; the live-config feature spec in `specs/queue-flow-visualizer/`. Journal: `specs/journals/2026-06-05-queue-manager.md`.

## 1. What the Queue Manager is
A **queue** orchestrates each participant through a **personalized series of sessions → builds the ATC → readiness for the uP! event.** It is *not* a waiting line. The stages are a curated sequence: some **self-guided** (forms, reports, self-ATC, wishlist — done alone), some **specialist-led** (anything needing a studio+specialist, an appointment, or a Zoom call — group calls, diagnostics, evolution-mapping, scope-enhancement, consultation). Across the specialist sessions, specialists/BIG participants **author the ATC** sitting-by-sitting; the participant carries the finished ATC into the uP! event.

Backend = **`starlabs-cloud-function/functions/components/queuesystem.js`** (3,609 lines, `development`) + `big-assignment.js`, `big-level-aggregate.js`. (`queue_atc_generation.js` is ATC — **off-limits**.) Config screen = **`src/app/queue system/queue-creation-v3/`**; live operations board = **`dynamic-queue-manager-clone/`** (⚠ the *clone* is the LIVE one, routed at `/dynamicqueuemanager`; the non-clone is the dead older version — TD-001 inversion).

## 2. How a participant MOVES — there are TWO transition types
This is the load-bearing model (and the thing easiest to get wrong):
1. **Operator `nextstage` buttons** — explicit, **variation-scoped** transitions on a stage (`{stage, calltoaction, markascompleted, variations[]}`). Used on specialist/decision stages. These encode loops ("Send Back"), branches, and changework round-trips.
2. **Self-move / auto-advance** — a stage with `selfmovable:true` (a form) — or a gate with no `nextstage` — **advances to the next stage in *that variation's* `stages[]` order on form submission.** This move is handled in the participant app (the CF `particpantFormSubmit_SlackIntegration` only fires notifications/touchpoints; `selfmovable` is consumed client-side). It is **NOT in `nextstage`** — so ~10 self-movable form stages per queue have *zero* configured buttons yet are fully connected.
3. (Runtime, not config) **Operator drag** on the live board can move anyone anywhere; and the daily/event crons advance modes. Not part of the queue config.

**The flow = the self-move linear backbone (per variation) + the operator `nextstage` branches at decision points.**

## 3. Variations — the personalized path (journey-family × cycle)
A queue defines a set of **variations**, each an **ordered subset of the stages** (its backbone) + an `atcmodel`. A participant is assigned a variation **manually**, by:
- **journey-family** → the track: `uP!` / `B!G` / `LYL` / `Prodigies` (this "track" label is a *convenience aggregation* — the real input is the participant's specific **journey**), and
- **cycle** → first time at uP! vs returning: `First Cycle` / `Next Cycle` / `3rd Cycle` (+ a `Prep Hold` parking variation).

**Reverse-engineered from data** (queue `L3rqCr`, 655 ppl, 9 variations) — variation ↔ dominant journey:
| Variation | dominant journeys | returning% |
|---|---|---|
| B!G – Next Cycle (190) | B!G Continuity 88 · B!G 44 | 7% |
| uP! – First Cycle (187) | uP! 111 · CPM 21 | 2% |
| uP! – Next Cycle (120) | uP! 70 · CPM 15 | 9% |
| LYL – First Cycle (48) | **B!G Continuity 19 · B!G 16** | 2% |
| uP! – 3rd Cycle (41) | uP! 14 · B!G 7 | **17%** |
| LYL – Next Cycle (26) | **B!G 7 · FTM 5** | 0% |
| Prodigies – Next/First (25/14) | uP! For Prodigies 7 / 12 | 12%/7% |
| uP! – Prep Hold (3) | mixed (parked) | 0% |
Returning% climbs First→Next→3rd (cycle = repeat count). **`LYL` is a batch label, not a journey** — its participants are on B!G/FTM journeys. ~5–15% of each variation are off-family exceptions (manual assignment).

## 4. The session series & the studio ATC-authoring workflow
- **Self-guided stages** (`actiontype:form/link`, `selfmovable`): forms/reports/self-ATC/wishlist; auto-advance on submit.
- **Specialist stages** (`studiowidgets` / `compulsoryactivity` / studio+appointment+zoom): the delivery happens here. `compulsoryactivity = {"0":[…],"1":[…]}` = the **activity combinations configured for movement between stages inside the studio**.
- **The ATC is built across the specialist stages** via `studiowidgets` (the buttons specialists/BIG click): `addunvalidatedatc → prescribe(un)validatedatc → assignprocedure → validateael`, plus `viewtripleatc` for the **Triple-ATC** validation sub-flow (B!G-only in `L3rqCr`). Widget usage across 96 queues: `prescribedvalidatedatc` (200 stages), `prescribedunvalidatedatc` (176), `assignprocedure` (142), `addunvalidatedatc` (129), `addvalidatedatc` (123), `assignedatc` (93), `viewtripleatc` (55), `validateael` (34).
- **Delivery is wildly concentrated:** in `vuvS7` (599 ppl, 14 stages) essentially **one stage — Scope Enhancement — is the studio engine** (64 of 71 studios). **Peak: 29 concurrent studios × ~2 specialists = ~60 specialists delivering at once** (2026-04-18). Diagnostics queues (`L3rqCr`) spread ATC authoring across ~11 stages instead.

## 5. The config model (what `queue-creation-v3` writes)
A queue = one `queue generation` document:
- **Top-level:** `queuename`, `queueadmin[]`/`queuementor[]` (operators), `queuestartdate`/`enddate`, `queuetargetcapacity`/`totalcapacity` (authored, **not enforced** client-side), comms (`queuewelcometemplate`, `iscommunicationsdisabled`), `zoomlinkrequired`, `packageeligibility[]`, `arenaeventidlist` (links delivery).
- **`stages[]`** — ordered stage-name strings.
- **`stageproperty{}`** — per stage (map keyed by name on save, `component.ts:916`): `selfmovable` (:292), `actiontype`/`actionresource`, `participantform[]`, `studiowidgets[]`, `compulsoryactivity`, `nextstage[]` (variation-scoped buttons, :306), `studiostagegrouping` (mandatory/optional/`transferactivity` carry-forward), `enablezoom`, `checkfinance`, waiting-minutes, messages.
- **`queuevariation[]`** — variation docids; each `queue variation` doc has `variationname`, `stages[]` (the path), `atcmodel`.
- **Staffing is NOT in the config** — the old role-requirement fields (`isdiagnosticsrequired/diagnosticsperson`, `changeworkperson`, …) are **commented out** (`component.ts:876-887`). Specialists are assigned **live, manually** (`arena participant.pairingmode = manual`, 99.9%); the roster = who actually delivered (`live assignment.participantsactivity`).

## 6. Provider / delivery data (the join)
- **`live assignment`** = a studio session: `queueid` (string), `stagename`, `studioid`, `participantsactivity` (specialist→activity map — the specialists), `created`. ← join to a queue is via **`queueid`** (NOT `queueref`).
- **`arena participant`** = the provider roster per queue (`queueid`, `profileid`, `stagerole` e.g. "In Diagnostics,In Implementation,In Review"). May be empty for some queues → use `live assignment` for the effective roster.
- **`queue stage log`** carries per-move providers (`cwperson`/`diagnosticperson`/`people_involved`) + `liveassignmentid` + `variationid`.
- **`queue_token`** = participant state: `currentstage`, `variationid`, `status` (queued/invited/ready/instudio), `queueposition`, `preassigned[stage]` (35% — pre-routed studios), `selectedstageslot[stage]` (12%), `avtest`, `notes`/`tags`, `people_involved` (3%). `stagerole` is NOT here (it's on `arena participant`).

## 7. The #3 / #4 boundary (proposed)
Seam = **`live assignment` creation.** **#3 Queue Manager** = routing + personalizing participants through stages *up to and including* studio **assignment** (the session-series orchestration, the `nextstage`+self-move flow, slots, invitations, ATC-widget *configuration*). **#4 Dynamic Studio** = the studio *runtime* (`arena participant` stageroles, the room/OpenVidu/Zoom, the delivery, where the ATC widgets get *clicked*).

## 8. Config↔flow drift & the live-visualizer feature
Designers configure this in a blind form and can't see the flow. We built a **live flow-visualizer** (`specs/queue-flow-visualizer/` — prototype + implementation BRIEF for a parallel session) that mirrors `queueform` as a graph: stages as kind-colored nodes, **operator `nextstage` (solid) + self-move (dashed) edges**, a variation filter to trace one path, and **drift detection** — dangling `nextstage` targets and true orphans. On `L3rqCr` it flags **2 genuine issues** (`My Evolution Wishlist` — configured but no variation routes through it; `uP! Prep Process - Hold` — parking stage with no configured exit). The same `build()`+validator is the intended **config-validity oracle for e2e/CI** (assert: no dangling, no orphans, every variation reaches a terminal).

## 9. Evidence log
| Claim | Evidence | Source |
|---|---|---|
| 2 transition types (nextstage + self-move) | 10 self-movable forms have 0 `nextstage`; auto-advance on submit | config dump `qconf.js`; `queuesystem.js:1754`, `:509` |
| variation = journey × cycle | per-variation journey breakdown, 9 variations | `qvj.js` |
| per-variation back-and-forth (loops/changework) | the `nextstage` transition graph, scoped | `qflow.js`/`qflow2.js` |
| peak 29 studios × ~2 specialists | live-assignment by stage/day for `vuvS7` | `queue_study.js` + `_out.json` |
| pairing 99.9% manual | `arena participant.pairingmode` | `queue_probe.js` |
| live-assignment→queue join = `queueid` | schema dump | `queue_explore.js` |
| ATC widget pipeline | `studiowidgets` across 96 queues | `queue_probe2.js` |
| clone is the live board | `/dynamicqueuemanager` → `dynamic-queue-manager-clone` | `app.routes.ts` (production) |

## 10. Open questions (carry forward)
1. **`compulsoryactivity` combos** — alternative valid combos vs all-required (matching code joins them). Operator-confirm.
2. **`queue participant transfer` / `bulk invitation`** consumers — per operator, **ops-recovery / pipeline short-cut scripts**, not core CF flow. Confirm location if needed.
3. **Capacity / `packageeligibility`** — authored but not enforced client-side; is there a CF gate on `event participation request` approval?
4. Per-variation **reachability** validation (does every variation reach a terminal?) — to add in the visualizer port + the e2e oracle.
5. **#3/#4 boundary** — proposed at `live assignment` creation; confirm when #4 Dynamic Studio is taken up.
