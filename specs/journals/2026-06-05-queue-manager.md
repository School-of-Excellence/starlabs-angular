# 2026-06-05 — Queue Manager (concept group #3) + live flow-visualizer

Concept group #3 investigated via the usual validate-from-data method, with heavy operator correction along the way. Also produced a **product feature spec** (a live flow-visualizer for the config screen) because the investigation surfaced a concrete pain the operator wants fixed.

## What we set out to do
Document the Queue Manager — "how each user's experience is personalized at each stage" (operator's framing, *not* a generic state machine). Data-first.

## The reframes (operator corrections — each changed the model)
1. **It's a *series of sessions* → ATC → uP!-event readiness**, not a routing machine. The stages are a curated sequence; some **self-guided** (forms/self-ATC), some **specialist-led** (studio/appointment/zoom). I'd missed the session-series spine entirely.
2. **Personalization is also *in-studio*** — the **buttons specialists/BIG click** (`studiowidgets`: add/prescribe/assign-procedure/validate ATC) literally **build the ATC** sitting-by-sitting. The studio widgets are an ATC-authoring pipeline.
3. **Variation = journey-family × cycle**, assigned **manually** — and the "track" label (uP!/B!G/LYL/Prodigies) is a *convenience aggregation*; the real input is the specific **journey**. Reverse-engineered from data: uP! journey→uP! variations, B!G→B!G, **LYL→B!G/FTM journeys (a batch label, not a journey)**. Cycle ↔ returning-rate (First 2% → 3rd 17%).
4. **Segment/cohort ≠ a personalization axis** — they're **operational batching for comms + date segregation, mostly outside the queue** (which is why `live assignment` has no `queueref` — the batching lives in scheduling/comms). Stopped trying to find a queue-internal delivery model.

## The biggest technical correction — TWO transition types
My flow graph only knew **operator `nextstage` buttons**. The operator pointed at the "orphans": *"are they orphans or self-movable?"* — and they were right. ~10 stages per queue are **self-movable forms** that **auto-advance to the next stage in the variation's order on submission** — a *second transition class* outside `nextstage`. The CF (`particpantFormSubmit_SlackIntegration`) only does notifications; `selfmovable` is consumed client-side. Once I synthesized the implicit self-move edges per variation, **false orphans dropped 13 → 2** (the 2 real ones: a stage no variation uses, and a parking stage with no exit). *Lesson: a "queue" moves people two ways — operator branches + the self-move backbone — and the backbone is per-variation, from `variation.stages[]`.*

## What surprised us
- **Delivery load is wildly concentrated** — in the 599-person Evolution-Mapping queue, **one stage (Scope Enhancement)** ran 64 of 71 studios, peaking at **29 simultaneous studios / ~60 specialists** on a single day. The "supply" question ("how many BIG available per stage") is really "how many can we surge into that one stage."
- **The clone is the live one** — `dynamic-queue-manager-clone` (6,139 lines) is routed at `/dynamicqueuemanager`; the non-clone is dead. Inverts the TD-001 "clones are dead" heuristic for this folder.
- **Pairing is 99.9% manual** — the config deliberately *removed* the staffing fields (commented out); who-delivers is a live operator decision.
- **`nextstage` is a real variation-scoped state machine** — Diagnostics has 7 exits, several scoped: B!G/LYL route through Consultation; uP!/Prodigies route through uP!-Readiness-Changework; B!G alone gets the Triple-ATC sub-loop. Two routing families through one machine.

## What we built
- **`specs/validated/03-queue-manager.md`** — the validated doc (model, variations, sessions, config, providers, boundary, evidence).
- **`specs/queue-flow-visualizer/`** — a `/frontend-design` **prototype** (control-room schematic: stages as nodes, operator-solid + self-move-dashed edges, variation filter to trace one path, drift detection) loaded with the **real 30-stage / 9-variation `L3rqCr` config**, plus a **`BRIEF.md`** for a parallel session to port it into `queue-creation-v3`. Framed so the `build()`+validator doubles as the **config-validity oracle for e2e/CI** (the through-line to the original goal).
- **Diagrams** in `specs/diagrams/queue-*` (flow/peak/state-machine/journeys→variations).
- Probes + outputs in `…-queue-manager-artifacts/`.

## Pending
- **Concept groups #4 Dynamic Studio, #5 Appointment System, #6 Events/Arena/Calendar.** #4 is the natural next (the studio runtime — the boundary is `live assignment` creation).
- **Port the flow-visualizer** into `queue-creation-v3` (parallel session, `BRIEF.md`) + extract the validator as the headless e2e oracle.
- Operator to confirm the open questions (§10 of validated/03): `compulsoryactivity` combo semantics, capacity enforcement.

## Gotchas surfaced
- `live assignment` joins to a queue via **`queueid` (string)**, not `queueref`.
- `stagerole` lives on **`arena participant`**, not `queue_token`.
- The self-move backbone is **per-variation** (`variation.stages[]`), so the visualizer needs each variation's stage list, not just `{id,name}`.
