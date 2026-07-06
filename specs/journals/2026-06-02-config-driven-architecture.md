# 2026-06-02 — StarLabs is a config-driven engine (so docs must follow the data)

**Headline:** A read-only config probe proved the operator's point: StarLabs components are generic; **runtime behavior is assembled from configuration documents in Firestore** (queues, dynamic studios, nav, delivery, content access). Code-and-screen documentation alone is incomplete — it must document the **configuration model** and back every claim with **live-data evidence**. This reframes the documentation rollout plan.

## Context / why
Operator: "improve the plan to go through the data for understanding the application and the dynamic nature of the system (e.g. queue management, dynamic studios). The documentation is incomplete without proper documentation of the configuration that makes the code work, and the evidence log that supports it."

## What we did
Probed config-driven collections read-only (`~/Downloads/svstats/config_probe.js`) and introduced a **ROLE lens** on top of the reliability tiers: CONFIG (defines behavior) / RUNTIME-STATE (live position) / TRANSACTIONAL (events). Seeded `specs/CONFIGURATION.md` with the model + an evidence log, and rewrote `specs/plans/2026-06-02-documentation-rollout.md` to a data-first, config-aware, evidence-backed methodology.

## Findings (grounded)
- **Queue = config, not code:** `queue generation` (96) defines a queue's `stages[20]` + per-stage `stageproperty{}` + capacity + mentors + `queuevariation[]`; `queue variation` (183) holds named alternate stage-paths; `queue_token` (7,046) is only the participant's *position* (`currentstage`, `variationid`, `studioid`); `queue stage log` (68,649) is the transition audit. The stage list is resolved from config, not stored on the token.
- **Dynamic studios = runtime assembly:** `live assignment` (12,787) binds `participantid`→`studioid` for a stage and provisions `zoomdata{}` on the fly; `arena participant` (1,239) feeds readiness; `arenaspace` (93) defines spaces; `openviduroom` (102) is the live room.
- **Cross-cutting config:** `dashboard` (nav/ACL), `classify` (app singletons incl. LLM prompts + API keys), `modes`, `productToDeliverySequence`, `tier access config`, `procedures`.

## Surprises
- **Config schema drift:** `queue generation` has ≥2 live shapes (explicit `stages[]` vs boolean toggles). Never assume one config schema.
- **Naming drift / empty twins:** `arenaspace` (93, live) vs `arena space` (0, empty); `conetent_urls` typo vs `content_urls`.
- **Config-as-data secrets:** `classify/3minuteshpc` stores `apikey`/`claudeapikey` in Firestore (→ TD-012).

## Decision
Documentation methodology = three lenses, **config first**: (1) config model (shape + variants + config→behavior with code `file:line`), (2) the generic engine that interprets it, (3) live evidence (counts + a real entity traced end-to-end). Every subsystem doc carries an **evidence log** + `*-evidence/` artifacts. CONFIG and RUNTIME-STATE roles are now first-class in `DATA-MODEL.md`.

## Artifacts
`./2026-06-02-config-driven-architecture-artifacts/config_probe.js` + `config_probe_output.txt`. Seeded reference: `specs/CONFIGURATION.md`. Plan: `specs/plans/2026-06-02-documentation-rollout.md`.
