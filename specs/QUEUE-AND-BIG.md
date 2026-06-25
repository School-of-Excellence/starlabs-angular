# QUEUE-AND-BIG.md — Queue management & BIG cohort operations

> Subsystem reference (data-first, config-aware, evidence-backed). The queue is the clearest proof that **StarLabs is a config-driven engine**: a generic board component reads a `queue generation` config doc and assembles a participant's stage machine at runtime. BIG is the cohort/marathon operation layered on the same queue + studio primitives.
>
> Evidence: `specs/QUEUE-AND-BIG-evidence/evidence.json` (counts, schema, the traced token, recency). Config model: `CONFIGURATION.md §1`. Live studios (the runtime session layer this subsystem feeds): `LIVE-STUDIOS.md`. Graph communities: [queue system](../graphify-out/wiki/queue_system.md) (127 nodes) + [big](../graphify-out/wiki/big.md) (85 nodes) — `graphify-out/` is regenerable/gitignored. Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Move participants through an **ordered, per-queue sequence of stages** (Diagnostics → Consultation → Changework → Review → … → Completed) toward a delivered outcome, pairing them into live studios for the interactive stages. **BIG** runs the same machinery for cohort/marathon programs (group assignment, cohort logs, marathon events). The stage list, rules, capacity, and alternate paths are **not in code** — they are configuration (`queue generation`, `queue variation`).

## 2. Operator screens (from `operator-screens.md`)
- **Drive the queue:** `dynamicqueuemanager` (`DynamicQueueManagerCloneComponent`) 🚫ATC-excluded · `queue-web` · `queuevenue` · `queuetransfer` · `queuelist`.
- **Plan:** `queue-planner` (`QueuePlanningComponent`) · `queue-planner-review` · `queuebigplanner` (`BigPlannerComponent`).
- **Studio/activity:** `dynamicstudio` 🚫ATC-excluded · `arenastudioactivity` · `eventopportunitydashboard` · `initiateeventproduct`.
- **BIG ops:** `bigcohorts` (`BigCohortClone2Component`) · `particiant_assignment_board` · `manualassignment` · `validateParticipantAssignments` · `bigactivitymonitor` · `bigactivitylog` · `bigchatscreen` · `zoommeeting_bigparticipants` · `arena_space`.
- **Diagnostics:** `queueeventhealth` 🚫ATC-excluded.

> 🚫 = integrates ATC data → **excluded from CI/CD** (`operator-screens.md §C`). Queue/BIG config logic is documented here from the non-ATC code paths only.

## 3. Collections by ROLE × reliability tier
| ROLE | Collection (tier A unless noted) | Count | Note |
|---|---|---|---|
| **CONFIG** | `queue generation` | 96 | the queue definition (stages, properties, variations, capacity) |
| **CONFIG** | `queue variation` | 183 | named alternate stage-paths, selected by `queue_token.variationid` |
| **CONFIG** | `biglevel` (20), `accelerated evolution level` (11), `bigactivity` (33) | — | BIG level/AEL/activity **definitions** |
| **RUNTIME-STATE** | `queue_token` | 7,046 | a participant's current position (`currentstage`, `variationid`, `studioid`, `liveassignmentid`) |
| **RUNTIME-STATE** | `queue studio pairing` | 2,335 | token↔studio link (`participants[]`, `studioin`, `checkin`, `openvidu`) |
| **RUNTIME-STATE** | `big cohorts` (345), `big assignment` (63), `big participants assignments` (484), `biginvitation` (1,601) | — | BIG cohort/assignment state |
| **TRANSACTIONAL** | `queue stage log` | 68,662 | every stage move (the audit of token transitions) |
| **TRANSACTIONAL** | `queue activity log` (8,283), `big cohorts log` (6,107) | — | activity/cohort event logs |
| **C — DO NOT USE** | `big aggregate level`(+`levelv2`/`archives`/`archivesv2`/`event level`), `big marathon` | — | TD-002, see §8 |

## 4. Configuration model
*(Full shapes + variants + config→behavior table in `CONFIGURATION.md §1`. Summary here.)*

**`queue generation` (CONFIG, 96).** A queue = `stages: string[]` (ordered) + `stageproperty: {<stage>: {...}}` (per-stage rules: `compulsoryactivity`, `mandatory/optionalstagegrouping`, `selfmovable`, `nextstage`, `calltoaction`, `participantform`, `checkfinance`, `min/maxwatingminutes`, `transferactivity`) + `queuevariation[]` + `queueadmin[]` (gates who can drive it) + capacity/dates/`enablezoommeetingsdk`.
- Live sample `vuvS7eBgTxLKufnesLQT` ("A&H Evolution Preparation Event - April 2026"): **14 stages, 10 variations**, modified 2026-06-02.
- The engine iterates `stages[]` and looks up `stageproperty[stage]` to build the board: [dynamic-queue-manager-clone.component.ts:1871-1873](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1871) → board getter `:1372` → template `*ngFor` [.html:1199](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.html#L1199). `queueadmin[]` gates access (`:1510`).

**`queue variation` (CONFIG, 183).** `{variationname, queueref, stages[], atcmodel?}`. A token's `variationid` overrides the queue's default `stages[]`: [dynamic-queue-manager-clone.component.ts:2733-2737](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L2733).

**⚠️ Schema-drift correction:** `queue generation` has 60 key-sets/96 docs, but the boolean-toggle fields (`isdiagnosticsrequired`…) are **dormant** — commented-out in `queue-creation-v3` and read by nothing. **One live shape: `stages[]` + `stageproperty{}`.** (TD-013.)

## 5. Dynamic assembly / the stage machine
The stage list is **resolved from config, never stored on the token**:
```
queue_token.queueref ──▶ queue generation.stages[]            (default path)
queue_token.variationid ──▶ queue variation.stages[]          (override, if set)
   └─ resolved list = variationStages ?? queueData.stages      (queue-web-version1.ts:189)
queue_token.currentstage = "where am I" ;  next = resolvedStages[ indexOf(currentstage) + 1 ]
```
Advancing a participant (`AuthguardService.moveQueueStage`, [authguard.service.ts:1171-1213](../src/app/authguard.service.ts#L1171)):
1. `currentIndex = profileJourneyProduct["queuestages"].indexOf(currentStage)` (`:1173`) — `queuestages` is the **config-resolved** list, not a token field.
2. `nextStage = queuestages[currentIndex + 1]` (`:1176`).
3. `updateDoc(queue_token, {previousstage, currentstage, …})` (`:1201-1202`).
4. `setDoc(queue stage log, log)` (`:1206-1208`; collection handle `:142`).

The board also writes the same pair on drag/drop (Queued/Waiting column [:2889-2917], Activity/studio column [:3114-3143], generic `updateQueueStage` [:3167-3177]) stamping `manuallymoved:true`, `movedby`, `movedthrough:'queue manager'`. Dropping into an Activity column pairs the token into a studio (creates a `live assignment`, writes `studioid`/`liveassignmentid` back onto the token) — see `LIVE-STUDIOS.md §5`.

```
        ┌─────────────── queue generation (CONFIG) ───────────────┐
        │  stages[]  +  stageproperty{}  +  queuevariation[]       │
        └───────────────┬─────────────────────────────────────────┘
                        │ resolved at runtime (+ variation override)
                        ▼
   queue_token (RUNTIME-STATE: currentstage) ──move──▶ queue stage log (TRANSACTIONAL)
                        │ drop into Activity stage
                        ▼
   live assignment + queue studio pairing  ──▶  studio session   (LIVE-STUDIOS.md)
```

## 6. Data flow
Purchase (`participantsproduct`, may carry `queuevariationid`/`eventref`) → token created in a queue (`queue_token`, `queueref`→`queue generation`) → operator advances stages (board → `moveQueueStage` → `queue_token` update + `queue stage log` append) → interactive stages pair into studios (`live assignment`) → `Completed`. BIG overlays cohort grouping: `big cohorts` (participant lists) → `big assignment` (cohort-scoped tasks) → `big participants assignments` (per-participant status), logged in `big cohorts log`.

## 7. Worked example — a real token traced through `queue stage log`
**Token `00dyh4CxBHvM0NjWivlu`** (profile `rOO1lqhle8vGNSRmVfEx`), queue **"CTD D&I Dec 2022"** (`queueref → queue generation/TmUKHbQaFVhYrpGHH1Z8`, confirmed resolves to a config doc with `stages[]`), `variationid: null` ⇒ uses the queue's **default** stage list. 10 logged moves form a coherent diagnostics→changework→review→completed path:
```
yet to join → In Air meet → Ready for diagnostics → In Diagnostics
  → Ready for Changework → In changework → Ready for Changework → In changework   (a changework cycle)
  → Ready for Review → In Review → Completed
```
*(All 10 `queue stage log` rows share `createdon = 2022-12-15 14:08` — a **bulk migration** timestamp; chronological order is read from the from→to chain, not the timestamp. This collision affects older tokens — see §8.)*

**Variation override example:** token `0B1inpSgA668vdsLMOJu` carries `variationid RNOFi3yRZeRGSuRQZQJm` → variation **"Old Participant"**, a 15-stage path (`Yet to Start → Wellness Scaling Form → uP! Life Report → … → Self Evolution Report → Completed`) used **instead of** its queue's default `stages[]`. This is the config-override mechanism in live data.

## 8. Known-broken caveats (Tier-C / data quality)
- **TD-002 — BIG aggregate-level rollups broken.** `big aggregate level` (695; base still written, 506/365d) is **forked** into `big aggregate levelv2` (632, 0/365d STALE), `…archives` (6), `…archivesv2` (5, STALE), `big aggregate event level` (1,145, 3/365d). **No single source of truth — do not use for level/progression analytics.** Operator-confirmed. BIG *operations* (`big cohorts`/`big assignment`) are fine.
- **TD-008 (refined) — `queue generation` write-pipeline.** New-queue **creation** is stalled (`created` last 2025-08-06, 0/90d, 2/365d), but existing queue configs are **actively edited** (`modified` last 2026-06-02, 7/90d, 21/365d). So it is *not* a dead collection — it is "edit-only": operators tune existing queues, rarely spin up new ones. (The earlier "0 writes/90d" used `created`.)
- **Bulk-migration timestamps.** Many older `queue stage log` rows share an identical `createdon` (batch import). For pre-2023 tokens, reconstruct order from the `previousstage→currentstage` chain, not `createdon`. Recent moves have real timestamps (`createdon` 3,552/90d).
- **`big marathon`** (10; name/date sparse) — minor/deprecated.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| Queue stages are config | `queue generation/vuvS7eBgTxLKufnesLQT` → `stages[14]`, `stageproperty{}` | 96 | evidence.json `.traces.queueTrace.queueGeneration`; dynamic-queue-manager-clone.ts:1871 |
| Stage list resolved from config, not token | `queue_token` has no `stages`; engine uses `queuestages` (resolved) | 7,046 | authguard.service.ts:1173; queue-web-version1.ts:189 |
| Token→queue config link | token `00dyh4…` `queueref → queue generation/TmUKHbQaFVhYrpGHH1Z8` (hasStages=true) | — | evidence.json `.traces.tokenQueueRef` |
| Real stage progression | token `00dyh4…`, 10 moves, default path | 10 moves | evidence.json `.traces.queueTrace.tokenTrace` |
| Variation override | token `0B1inpSgA668vdsLMOJu` `variationid → "Old Participant"` (`stages[15]`) | 183 | evidence.json; dynamic-queue-manager-clone.ts:2733 |
| Stage move writes log | `moveQueueStage` updates token + appends `queue stage log` | 68,662 | authguard.service.ts:1201-1208 |
| Queue config edit-only (TD-008) | `queue generation` created 0/90d vs modified 7/90d | 96 | evidence.json `.traces.recencyNuance` |
| BIG level rollups forked (TD-002) | `big aggregate level` 695 + 4 stale forks | — | evidence.json `.tierC` |

## 10. Open questions (engineer validation)
1. Are `queuetargetcapacity`/`totalcapacity`/`queuementor[]` enforced server-side, or vestigial like the boolean toggles?
2. Confirm `big aggregate level` (base) should be abandoned in favor of recomputation from `queue stage log` + `big cohorts log`.
3. `queue studio pairing.openvidu` (28% fill) — is its absence the Zoom-SDK path? (See `LIVE-STUDIOS.md`.)
4. Can old bulk-migrated `queue stage log` rows be re-stamped, or is the from→to chain the permanent ordering key?
