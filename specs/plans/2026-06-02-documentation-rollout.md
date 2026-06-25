# Plan — Documentation rollout (Phases 1–3), data-first & config-aware

> Executable cold by a future session. Phase 0 done (this session). **Core principle: StarLabs is a config-driven engine — the code is generic; behavior is assembled at runtime from configuration documents in Firestore. Documentation is incomplete until the configuration model and the live-data evidence behind it are captured.** Every claim must be backed by an evidence-log entry.

## Session kickoff checklist (cold start)
1. `CLAUDE.md` (ATC off-limits; prod read-only; journal every session) → `PROGRESS.md`.
2. The 8 journals `specs/journals/2026-06-02-*.md` + their `*-artifacts/`. Note `2026-06-02-config-driven-architecture.md` (the config model).
3. `specs/data-reliability.md` — **must say LOCKED** (else see Risks). `specs/operator-screens.md`. `specs/CONFIGURATION.md` (seeded — extend it).
4. `DOCS.md`, `DESIGN.md`, `DECISIONS.md`, `TECHNICALDEBTS.md`; `graphify-out/wiki/index.md`.
5. Read-only data harness: `~/Downloads/svstats/` (firebase-admin + prod SA `~/Downloads/serviceAccountKeyProduction.json`). Reusable probes: `config_probe.js`, `reliability_audit.js`, `evidence_step*.js`. **Hard ATC denylist is baked in — keep it.**

## Context
Discovery + reliability classification are done, but they were code-and-screen-centric. The system's real behavior (queues, dynamic studios, delivery sequences, nav, content access) is parameterized by **config documents** read by generic components. A doc that lists collections and screens but not *how config assembles behavior* — and that isn't backed by live data — is misleading.

## Goals
For each subsystem, produce a durable reference that captures: (a) the **configuration model** (the knobs and how code interprets them), (b) the **dynamic assembly / state machine** built from that config + runtime state, (c) a **worked example** traced through real production data, and (d) an **evidence log** proving every claim — built only on the **locked Tier-A** set.

## Non-goals
- ATC features/data; Tier-C broken data (mark "do not use" only).
- Building the test suite (separate, D-002) or fixing duplication (TD-001).

## Methodology — three lenses, data first
For every subsystem, before writing prose, gather evidence in this order:
1. **Config lens (do this FIRST):** enumerate the collections that *parameterize* the subsystem. For each, sample real docs read-only (`config_probe.js` pattern), record the document **shape**, enumerate **config variants / schema drift**, and map **config field → runtime behavior**, citing where the code reads it (`file:line`).
2. **Code lens:** the generic engine — which component/service consumes the config and how (the interpreter). Use `operator-screens.md` for the screens; graphify wiki for the call structure.
3. **Live-evidence lens:** counts, a representative sample doc id, and **one real entity traced end-to-end** (e.g., a participant through a queue's stages from `queue stage log`).

**Classify every collection by ROLE** (a new dimension on top of the reliability tier):
- **CONFIG** — defines behavior (e.g. `queue generation`, `queue variation`, `dashboard`, `modes`, `classify`, `tier access config`, `productToDeliverySequence`).
- **RUNTIME-STATE** — a live entity's current position (e.g. `queue_token`, `live assignment`, `arena participant`, `openviduroom`).
- **TRANSACTIONAL / LOG** — recorded events (e.g. `queue stage log`, `appointments`, `content analytics`).
Documentation that omits the CONFIG and RUNTIME-STATE roles is the gap this plan closes.

## Per-subsystem doc template (revised)
1. **Purpose** · 2. **Operator screens** (from `operator-screens.md`) · 3. **Collections by ROLE × reliability tier** (config / runtime-state / transactional; Tier-A only, Tier-C flagged) · 4. **Configuration model** — for each CONFIG collection: doc shape (from a live sample), variants/drift, and the config→behavior map with code `file:line` · 5. **Dynamic assembly / state machine** — how config + runtime-state produce behavior (the stage machine, the studio-assignment flow) · 6. **Data flow** · 7. **Worked example** — a real entity traced through prod data · 8. **Known-broken caveats** (Tier-C) · 9. **Evidence log** — table of `claim → query/sample doc id/count/file:line` · 10. **Open questions**. Each doc ships a `specs/<doc>-evidence/` dir with the actual probe outputs/samples.

## Worked example A — Queue Management (config model, grounded 2026-06-02)
- **CONFIG:** `queue generation` (96) = the queue definition — `stages[]` (e.g. Diagnostics→…→ATC Orientation→Self ATC→Post Video Log→Completed), per-stage `stageproperty{}`, `queuetargetcapacity`/`totalcapacity`, `queuementor[]`/`queueadmin[]`/`availabilitygivenby[]`, `queuevariation[]`, `enablezoommeetingsdk`, dates. **Schema drift:** a second config shape uses boolean toggles (`isdiagnosticsrequired`, `isconsultationrequired`, `isvideologrequired`, `ischangeworkreq`) — document BOTH. `queue variation` (183) = named alternate stage paths (`variationname`, `stages[]`, optional `atcmodel`).
- **RUNTIME-STATE:** `queue_token` (7,046) = participant position — `currentstage`/`previousstage`, `stagestatus`, `tokenstatus`, `variationid` (which variation applies), `studioid`, `liveassignmentid`, role slots (`cwperson`, `diagnosticperson`, …), `tokentransferredto`. Note: the stage *list* is NOT on the token — it's resolved from `queue generation`/`queue variation`.
- **TRANSACTIONAL:** `queue stage log` (68,649) = every move (`currentstage`, `previousstage`, `manuallymoved`, `queueposition`, `selectedstageslot`, `createdon`). `queue studio pairing` (2,335) links token→studio.
- **Engine:** `dynamic-queue-manager` + `queue-planning*` screens read the config to render/advance participants; `AuthguardService.moveQueueStage` writes the log. (Trace these `file:line` in Phase 1.)
- **Evidence to capture:** counts above; a sample `queue generation` doc id + its `stages[]`; one `queue_token` traced through `queue stage log`.

## Worked example B — Dynamic Studios (runtime assembly, grounded 2026-06-02)
- **CONFIG/space:** `arenaspace` (93) = space defs (`spaceid`, `mentor[]`, `pivottype`, `eventref`, `participantslist[]`, `validated`). (⚠️ naming drift: `arena space` exists but is empty — the live one is `arenaspace`.)
- **RUNTIME-STATE:** `live assignment` (12,787) = the dynamic studio binding — `participantid`→`studioid` for a `stagename`/`stagetype`, with provisioned `zoomdata{join_url,start_url,…}`, `signature`, `pairing[]`, `changeworkbrief[]`, `status`. `arena participant` (1,239) = pairing readiness (`pairingmode`, `stagerole[]`, `liveassignmentstatus`). `openviduroom` (102) = the live LiveKit room (`sessionid`, `egressInfo{}` recording, `participantjoined[]`, `roomstatus`).
- **Engine:** `dynamicstudio`/`dynamic-queue-manager` assemble assignments at runtime; conferencing screens consume `openviduroom` + Cloud Function tokens.
- **Evidence to capture:** counts; a `live assignment` sample (studioid + zoomdata) tied to its `queue_token`/stage.

## Phases
### Phase 1 — Subsystem + config + data-model docs  (GATE: Tier-A locked)
1. **`specs/CONFIGURATION.md`** — extend the seeded version: every CONFIG collection (shape, variants, config→behavior, code `file:line`), including the cross-cutting ones (`dashboard`, `classify`, `modes`, `tier access config`, `productToDeliverySequence`). Flag config-as-data secrets (`classify/3minuteshpc` API keys — TD-012).
2. **`specs/DATA-MODEL.md`** — locked-collection catalog with the ROLE dimension + schema (read-only 100-doc sample per collection) + refs/relationships + write-owner screens.
3. Subsystem refs (template above, each with evidence log + `*-evidence/`): `QUEUE-AND-BIG.md` (use Example A; mark broken aggregate-level TD-002 + queue-generation pipeline TD-008), `SCHEDULING-DELIVERY.md`, `CONTENT-ENGAGEMENT.md`, `JOURNEY-LIFECYCLE.md` (the `journeystatus` state machine from logs; purchased≠delivered), `AUTH-ROLES.md` (incl. `dashboard` config → nav).
   - Dynamic studios are documented inside `QUEUE-AND-BIG.md` (Example B) or a dedicated `LIVE-STUDIOS.md`.
   - Prefer **parallel agents** (one per subsystem), each fed its screens + config collections + graph community, each emitting prose **and** an evidence log.
**Owner action:** return validated `tier-a-proposal.csv`; rule on promote-candidates.

### Phase 2 — Graph linkage & diagrams
Link each doc to its graphify community; `diagrams/`: validated journey ASCII + the queue stage-machine + dynamic-studio assignment flow + architecture (AuthguardService hub, 5 delivery modes).

### Phase 3 — Test enablement
Turn each subsystem's documented config + happy-path into **emulator seed fixtures** (seed the CONFIG docs that drive behavior — e.g. a `queue generation` + `queue variation` so a queue actually runs) + Playwright specs. Tier-A only; ATC-excluded screens skipped. Bridge to D-002.

## Risks
- **Gate not met:** if `data-reliability.md` is DRAFT, do config/auth docs that don't need the reliability lock (config *shape* is observable now), hold data-trust-sensitive ones.
- **Config schema drift:** the same config collection has multiple shapes (proven for `queue generation`). Always enumerate variants; never assume one schema.
- **Naming drift / empty twins:** e.g. `arenaspace` (live) vs `arena space` (empty); `conetent_urls` typo vs `content_urls`. Verify which collection is actually written.
- **Config-as-data secrets:** `classify` holds API keys/prompts — document existence, never echo values; flag for secret-management (TD-012).
- **Runtime-state vs config confusion:** don't present `queue_token`/`live assignment` (runtime) as config; keep the ROLE dimension explicit.

## Verification (how the new session knows a doc is done)
- Every CONFIG collection cited has its **shape verified against a live read-only sample** and its **variants enumerated**.
- The **config→behavior map cites code `file:line`**; the dynamic assembly/state-machine is described from config + runtime-state, not guessed.
- The **worked example is a real entity traced through production data**; the **evidence log** backs every non-trivial claim (query + sample id + count/file:line).
- Every cited collection is Tier-A (or flagged Tier-C "do not use"); every screen exists in `operator-screens.md`; no ATC referenced as usable.
- One journal per doc (journal-every-session rule).
