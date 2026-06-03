# TECHNICALDEBTS.md — StarLabs

> Narrative tech-debt register from the 2026-06-02 discovery. Evidence-linked. Not a status tracker (no live bug DB installed yet — that's part of the deferred velocity substrate).

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

### TD-016 · Participant-mode (B) engine is OFF-DISK; product day-knobs authored-but-unconsumed
The **participant engagement mode** lifecycle is written by code **not present in any local repo**. Evidence (exhaustive grep): `participant mode checklist` (27,496 docs, per participant×product×mode: `{mode, profileid, participantproductid, productref, aelid, createddate, widget[]}`) is **read-only** (only `userprofile.component.ts:814`); `participant metadata.participantmode` is **read-only** (delivery screens group by it; written nowhere); `firebasefunctions` (30 fns) and `watson-cloud-functions` (empty) have **zero** mode refs; sibling repos none. The writer is tied to `aelid` (Accelerated Evolution Level) + delivery — almost certainly a Cloud Function on `fir-sample-aae4a` deployed outside the `firebasefunctions` repo. **Action: obtain the mode-engine source from the developer.** Separately, the product day-knobs (`modeflow`, `integrationdays`/`performancedays`/`extendedperformancedays`/`delaydays`, `diagnosticswithin4days`) are authored in Product Designer but **never consumed on-disk** — the pacing they imply runs in that off-disk engine; on-disk, `participantsproduct.mode`/`nextmode`/`nextmodedate` are only set **manually** via `mode-dashboard`. Evidence: `2026-06-03-product-modes-investigation.md`, `evidence_modes.js`, `checklist_probe.js`, 4-agent code audit.
