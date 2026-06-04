# TECHNICALDEBTS.md — StarLabs

> Narrative tech-debt register from the 2026-06-02 discovery. Evidence-linked. Not a status tracker (no live bug DB installed yet — that's part of the deferred velocity substrate).
>
> ⚠️ **STALE-BRANCH RISK (2026-06-04):** line numbers in TD entries were captured on `main` (2026-04-17); repo now on `production` (308 commits ahead). **Re-verify the Angular `file:line` refs before acting** — esp. TD-006 (`authguard.service.ts:186,188`), TD-010 (unguarded routes), TD-012/013 (config), TD-015 (`journeyplan.component.ts:557`). The *findings* still hold; only the line anchors may have moved. **Unaffected:** TD-016/017/018/019 (CF repo on `development`) and all data-driven debts. (Stream B; `ORIENTATION.md` Open-threads #4.)

### TD-001 · Heavy component duplication (Clone / Clone-2 / Duplicate / old)
**7 of the top-10 graph hubs** are clone/duplicate variants: `BigCohortClone(2)`, `DynamicQueueManagerClone`, `SalesDashboardClone`, `DeliveryDashboardClone`, `JourneycoachDuplicate`, `QueuePlanningClone`. Inflates surface area, splits logic, and pollutes any test effort. **Dedup before writing tests — don't test dead clones.** Evidence: `graphify-out/GRAPH_REPORT.md`.

### TD-002 · BIG aggregate-level rollups broken
`big aggregate level` fractured into `levelv2` + `archives` + `archivesv2` + `event level`; all stale (0 writes/365d) — no single source of truth. Operator-confirmed. BIG *operations* (`big cohorts`, `big assignment`) are fine. Evidence: `specs/data-reliability.md`.

### TD-003 · Dead derived fields on `profile_data`
`currentjourney` / `currentjourneystatus` / `currentproductstatus` = **100% NULL** across all 3,246 profiles. Code/dashboards reading them get nothing. Use `participantjourneyproduct.journeystatus`.

### TD-004 · ~Zero real test coverage behind a façade
**398 of 399 `.spec.ts` are default CLI stubs** (`should create`). The repo looks tested; it isn't. Coverage baseline ≈ 0.

### TD-005 · No CI test/build gate
`.github/workflows/deploy_19.yml` deploys on push to `development`/`production` with no build, lint, or test step. A broken push deploys.

### TD-006 · Secrets hardcoded in client source (SECURITY)
FCM legacy server keys at `authguard.service.ts:186,188` and the Zoom SDK key (`rjad2eLZSIKlamaIwi09tw`) in 4 files ship in the public JS bundle. Rotate + move push-send server-side. A background task was spawned for this.

### TD-007 · Screen-usage telemetry broken
`collectionname` (0 docs) and `userAccessCounts` (stale since 2024-10) — the intended "who viewed which screen" logs are dead, so runtime operator-usage analytics is unavailable (we used static code evidence instead).

### TD-008 · `queue generation` — new-queue creation stalled (refined 2026-06-02)
Read by 35 operator screens. Refined with a read-only probe on the correct timestamp fields: new-queue **creation** is stalled (`created` last 2025-08-06, **0/90d, 2/365d**) but existing queue configs are **actively edited** (`modified` last 2026-06-02, **7/90d, 21/365d**). So it is *not* a dead/broken collection (the earlier "0 writes/90d" used `created`): operators tune existing queues and rarely spin up new ones. Re-evaluate whether new-queue creation is intentionally retired. Evidence: `specs/QUEUE-AND-BIG.md §8`, `specs/evidence/traces.json .recencyNuance`.

### TD-009 · Purchased ≠ delivered (data-modeling ambiguity)
Appointments don't reliably link to the purchased journey; delivery uses a shared appointment-type toolkit. Makes journey-level analytics hard and is why journey docs key off the *delivered* sequence. Evidence: `2026-06-02-user-journey-evidence.md`.

### TD-010 · Unguarded routes (SECURITY)
`view-participant-atc` (an ATC screen) plus `evolutionwishlist`, `arenadesigninsights`, `create-workshop`, `workshopconfig/:id`, `devtestmic` have no `authGuard` (heuristic — verify per-route). Evidence: `route_inventory.csv`.

### TD-011 · Toolchain / housekeeping
`tslint.json` is deprecated (migrate to angular-eslint); stray empty files `del` and `npm` in repo root.

### TD-012 · Config-as-data secrets in `classify` (SECURITY)
`classify/3minuteshpc` stores `apikey`, `apikeytest`, and `claudeapikey` (plus LLM prompts) directly in a Firestore config document. Secrets in queryable config = exposure to anyone with read access. Move to a secret manager / server-side; rotate. Evidence: `specs/CONFIGURATION.md` §3, `config_probe_output.txt`.

### TD-013 · Config schema & collection-name drift
Same config collection has multiple live shapes — `queue generation` uses either an explicit `stages[]` + `stageproperty{}` or boolean toggles (`isdiagnosticsrequired`, …). Collection naming drift creates empty twins and typos: `arenaspace` (93 docs, live) vs `arena space` (0, empty); `conetent_urls` (typo) vs `content_urls`. Any reader/seed/fixture must enumerate variants and verify which name is actually written. Evidence: `specs/CONFIGURATION.md`, `2026-06-02-config-driven-architecture.md`.

### TD-014 · Blank `journeyref` on purchases (395 of 5,144) — mixed cause
Cross-checked vs Watson (by email): these are **real** participants with purchases. Two causes: (a) `journeytype=addons` → legitimate **add-on/standalone product purchases with no parent journey**; (b) `journeytype=(none)`, often `salesperson=Team` → **incomplete/placeholder rows** where the journey link was never populated (data-entry/sync gap). Not corruption, but it pollutes journey-level analytics (the "(unknown)" journeys). Decide: backfill journeyref where a journey exists, and formally model "journey-less product/add-on" as its own case. Evidence: `2026-06-03-watson-finance-and-shifted.md`, `shifted_correlation2.js`.

### TD-015 · Cross-project (StarLabs↔Watson) join: explicit-id primary, email fallback — but ids live in odd places
StarLabs and Watson are separate Firebase projects with **different id-spaces** — `profile_data` doc id ≠ Watson `participantid`. The cross-project link is maintained via **explicit Watson ids**, and (corrected 2026-06-03) is **NOT abandoned**:
- `journeyproductpurchase` (the `purchaseref` target): **100%** carry `watsonpurchaseid` + `watsonpurchaselabel`.
- `salesleads`: **2025 & 2026 = 100%** carry `watsonparticipantid` / `watsonpurchaseid` (+ explicit `upgradefrom/to`- and `downgradefrom/to-watsonpurchaseid` — the shift/upgrade ledger).
- **0%** on `participantjourneyproduct` / `participantsproduct` / `profile_data`.
The remaining debt: the watson id is **not on the participant/profile record itself**, so screens that start from a profile (e.g. `journeyplan.component.ts:557`) fall back to an **email** lookup (`Watson Participants where email == profile_data.email`) — case/whitespace/duplicate-sensitive, breaks on email change. Consider surfacing `watsonparticipantid` onto `profile_data` for a stable key. Evidence: `2026-06-03-watson-finance-and-shifted.md`, `watsonid_check.js`/`watsonid_check2.js`.

### TD-016 · Participant-mode (B) engine — RESOLVED 2026-06-04 (was: off-disk)
**Resolved:** the engine is **`starlabs-cloud-function/functions/components/participantmode.js`** (StarLabs Cloud Functions repo — separate git repo nested in the angular folder, **`development`** branch) — 3 functions: `calculateParticipantMode` (`participantsproduct` Firestore trigger: seed + completion day-arc + pre-event ramp + rollup + writes `participant mode checklist`), `productNextModeUpdate` (daily 00:05 IST cron — time-advance), `onEventApprovalProductMode` (event-approval trigger). The product day-knobs ARE consumed there (so they only looked "unused" because the engine was off-disk). Full mapping → `specs/validated/02-product-modes.md §7`. **Denorm path also resolved (§7d):** `participant metadata` is a CQRS projection rebuilt by ~11 `*_to_pmd` onWrite triggers in `participantmetadata.js`; `participantmode` there is mirrored from `profile_data.participantmode` (`profiledata_to_participantmetadata:12`) with `customerstatus` overrides (`journey_to_pmd:245`). **TD-016 fully closed — mode model is end-to-end mapped.**
> *Original finding (kept for history):* the participant-mode lifecycle was written by code not present in any local repo. Evidence (exhaustive grep): `participant mode checklist` (27,496 docs, per participant×product×mode: `{mode, profileid, participantproductid, productref, aelid, createddate, widget[]}`) is **read-only** (only `userprofile.component.ts:814`); `participant metadata.participantmode` is **read-only** (delivery screens group by it; written nowhere); `firebasefunctions` (30 fns) and `watson-cloud-functions` (empty) have **zero** mode refs; sibling repos none. The writer is tied to `aelid` (Accelerated Evolution Level) + delivery — almost certainly a Cloud Function on `fir-sample-aae4a` deployed outside the `firebasefunctions` repo. **Action: obtain the mode-engine source from the developer.** Separately, the product day-knobs (`modeflow`, `integrationdays`/`performancedays`/`extendedperformancedays`/`delaydays`, `diagnosticswithin4days`) are authored in Product Designer but **never consumed on-disk** — the pacing they imply runs in that off-disk engine; on-disk, `participantsproduct.mode`/`nextmode`/`nextmodedate` are only set **manually** via `mode-dashboard`. Evidence: `2026-06-03-product-modes-investigation.md`, `evidence_modes.js`, `checklist_probe.js`, 4-agent code audit.

### TD-017 · Product day-knobs are not versioned → mode pacing drifts from current config
The mode engine paces participants with `integrationdays`/`performancedays`/`extendedperformancedays` read **live** from the `products` doc, but already-paced participants are **never re-paced** when those knobs change (terminal `After Extended Performance Mode` has `nextmodedate=null`). Confirmed in the 12-user audit: 15 of 102 completed rows "mismatched" a recompute-from-current-knobs — all reconciled to a **historical `integrationdays=30`** (per-mode `statusdate` gaps prove it) vs the product's **current `45`**. The engine was correct each time; the *config moved*. **Implication:** any analytics/test that derives expected mode from current product knobs will mis-predict historical participants — use the `statusdate.<mode>` timestamps as ground truth. Consider snapshotting the knobs onto `participantsproduct` at pacing time. Evidence: `specs/validated/02-product-modes.md §7g`, `mode_audit_drill_OUTPUT.txt`.

### TD-018 · `participantmode` headline has two writers that can diverge
`profile_data.participantmode` is written by the **§7a rollup** (`participantmode.js:226`, only on a per-product **mode change**); `participant metadata.participantmode` is also written by **`journey_to_pmd`** (`participantmetadata.js:245`, on **customerstatus/journey change**) and mirrored from `profile_data` by `profiledata_to_participantmetadata`. When `customerstatus` flips (e.g. → `non active`) with no concurrent mode event, `participant metadata` correctly becomes `Exploration Mode` while `profile_data` keeps the **stale** prior headline. Confirmed live (Antano Solar: `participant metadata=Exploration Mode` vs `profile_data=Event Mode`). **Implication:** screens reading `profile_data.participantmode` can show a stale headline; prefer `participant metadata.participantmode` for customerstatus-driven state, or have the rollup also fire on customerstatus change. Evidence: `specs/validated/02-product-modes.md §7g`, `mode_audit_FULL_OUTPUT.txt`.

### TD-019 · Two dead/buggy branches in the mode engine (`participantmode.js`)
**F1:** `onEventApprovalProductMode` guard (`:503`) is `(!X && X)` — always false; the entire event-approval mode path is dead code (event-mode entry happens in `queuesystem.js` instead). **F2:** in the same function `eventEnd = eventData["start_date"]` (`:506`) should be `end_date` (moot while F1 holds). **F3:** the daily cron never advances a row whose `mode ∈ {Event, Installation Event, Big}` and `nextmode=="Integration Mode"` (`:414` excludes those modes; `:422` keys on *nextmode*) — confirmed a live stuck row in the audit. Verify whether `queuesystem.js` (#3) recovers F3 rows. Evidence: `specs/validated/02-product-modes.md §7f`, `participantmode.js:498-534,414-422`.
