# JOURNEY-LIFECYCLE.md — Purchase → onboarding → delivery → continuity

> Subsystem reference (data-first, config-aware, evidence-backed). The **commercial spine**: a participant purchases a journey/product, gets onboarded, moves through delivery, and often buys again. The lifecycle **state** lives in `participantjourneyproduct.journeystatus` — *not* in the dead `profile_data.currentjourney*` fields.
>
> Evidence: `specs/JOURNEY-LIFECYCLE-evidence/evidence.json` + 10 anonymised end-to-end timelines in `specs/evidence/journey_evidence_final.json` (full method: `specs/journals/2026-06-02-user-journey-evidence.md`). Config (catalog): `CONFIGURATION.md §5`. Delivery side: `SCHEDULING-DELIVERY.md`. Graph community: [Journey Onboarding](../graphify-out/wiki/Journey_Onboarding.md) (129 nodes). Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Track the customer journey as a commercial lifecycle: **purchase** (which journey/product, when, for how long), **onboarding**, **delivery** (via 1:1 / event / big modes), and **continuity/cross-sell** (33% buy further journeys). `participantjourneyproduct` is the **purchase record of truth**; `salesleads` is the pre-sale pipeline that feeds it.

## 2. Operator screens (from `operator-screens.md`)
- **Purchase / pipeline:** `participantpurchase/:pid` (`JourneyProductPurchaseComponent`) · `salesleads` · `onboardingremarks` · `productinitiated-dashboard` · `sales-report`.
- **Coaching / opportunities:** `JourneycoachDashboard-new` 🚫ATC-excluded · `opportunities` · `overall-dashboard` · `journeysupport/:pid` · `journeyonboardingdetail`.
- **Profile views:** `userprofile/:id` · `userprofile_old` · `participants-analytics` · `profilesummary/:profileid`.
- **Catalog (Product Designer):** `addjourney` · `addproduct` · `addpackage` · `journeyproductmap` · `packagedesign`.

## 3. Collections by ROLE × reliability tier
| ROLE | Collection | Count | Note |
|---|---|---|---|
| **RUNTIME-STATE** | `participantjourneyproduct` | 5,141 | the purchase record of truth (`journeystatus`, `subscriptionstart`=t0) |
| **RUNTIME-STATE** | `participantsproduct` | 38,503 | product enrollment (the products inside a journey; `deliverymode`) |
| **RUNTIME-STATE** | `participant metadata` | 3,312 | denormalized participant profile for dashboards (financials, customerstatus) |
| **RUNTIME-STATE** | `salesleads` | 4,339 | pre-sale → purchase pipeline |
| **CONFIG-catalog** | `journey` (48), `products` (104), `package` (49), `journey-to-product` (41) | — | the catalog (`CONFIGURATION.md §5`) |
| **C — DEAD** | `profile_data.currentjourney*` | — | 0% fill, writer has no callers — never read (TD-003) |
| **C — SUPERSEDED** | `participantJourneySequence` | 1,495 | stale (2024-11), superseded by `participantjourneyproduct` |

## 4. Configuration model
The catalog is CONFIG: choosing a `journey` auto-populates its `product[]` via `journey-to-product` ([journey-product-purchase.component.ts:179,327](../src/app/Participants%20Profile%20Management/journey-product-purchase/journey-product-purchase.component.ts#L179)); `products.mode` + `modeflow[]` pick the delivery mode (one of the 5: Priority / Event / Installation Event / Big / Investment). Catalog loaded in purchase ngOnInit: `journey` `:149`, `products` `:156`, `package` `:164`, `journey-to-product` `:176`. (Shapes + variants: `CONFIGURATION.md §5`.)

## 5. The `journeystatus` state machine (from logs + code)
`journeystatus` (94% filled on `participantjourneyproduct`) is the live lifecycle state. Observed values + transitions (from `journey_evidence_final.json` + the writers):
```
                    (sales pipeline: salesleads.status Approved, carries participantjourneyproductid)
                                   │  saleslead.ts:551,627
                                   ▼
        initiated ──▶ ongoing / currentjourney ──┬──▶ upgraded     (bought a higher journey; cross-sell)
        (create-watson :2140)   (the live journey)│
                                                   ├──▶ downgraded  (:1571)
                                                   ├──▶ cancelled   (:2231 — churn)
                                                   └──▶ completed    (journey finished)
```
Writers: the purchase write-of-record `updatePurchase()` sets `{journeystatus, subscriptionstart, subscriptionend}` ([journey-product-purchase.component.ts:646,684](../src/app/Participants%20Profile%20Management/journey-product-purchase/journey-product-purchase.component.ts#L646)); status transitions in `create-watson-profile` (`downgraded`/`initiated`/`cancelled`). Readers gate on it: `userprofile` sorts `journeystatus=='ongoing'` first ([:461](../src/app/Participants%20Profile%20Management/userprofile/userprofile.component.ts#L461)); `product-initiation-dashboard` excludes `['cancelled','downgraded']` ([:1206](../src/app/Journey%20Onboarding/product-initiation-dashboard/product-initiation-dashboard.component.ts#L1206)); `journeycoach-opportunities` reads `where('onboarded','==',true)` ([:132](../src/app/Journey%20Onboarding/journeycoach-opportunities/journeycoach-opportunities.component.ts#L132)).

> **⚠️ Dead-field correction (TD-003).** Do **not** read `profile_data.currentjourney`/`currentjourneystatus`/`currentproductstatus` — all 0% filled, written only by `profileCurrentData()` which has **zero callers** ([authguard.service.ts:964,989](../src/app/authguard.service.ts#L964)). The live state is `participantjourneyproduct.journeystatus`.

## 6. Data flow
`salesleads` (pipeline) → on approval, `participantjourneyproduct` created (`journeystatus`, `subscriptionstart`=t0, `journeyref`→journey) + `participantsproduct` per product (`deliverymode`) → onboarding (`onboarded`) → delivery by mode (1:1 → `SCHEDULING-DELIVERY.md`; big/event → `QUEUE-AND-BIG.md`) → review → **continuity/cross-sell** (a new `participantjourneyproduct` for the next journey; prior one `upgraded`). `participant metadata` denormalizes the rollup (totals, customerstatus) for dashboards.

## 7. Worked examples — real timelines (anonymised)
From `journey_evidence_final.json` (100% from logs; t0 = first purchase):
- **`P-4F5BB` — cross-sell + Critical Support pattern.** Journeys: *FTM with SLD CI* (`upgraded`) → *B!G* (`upgraded` at month 0.66). 45 delivered appointments (WiSH → Critical Support families). Content: 368 SolarVoice + 73 eiflix over 19 months. → purchased≠delivered, iterative, cross-sell.
- **`P-B54D2` — heavy cross-sell (4 journeys).** *A&H Light 3months* (`upgraded`) → *uP!* (`upgraded`, m6.7) → *B!G* (`downgraded`, m7.0) → *B!G* (`ongoing`, m15.6). 42 appointments. Shows the full upgrade/downgrade/continuity cycle on one participant.
- **`P-DE0F0` / `P-726F1` — short completed journeys.** Single *Health Explorative* (`completed`), 13-15 appointments, **zero content consumption** — a distinct lightweight cohort.
- **`P-1D89C` — churn / early cancel.** *uP! For Prodigies* (`cancelled`), 5 appointments, onboarding + a couple of EI Starter sessions then stop. The cancellation path of the state machine.

**Trace probe corroboration:** an `onboarded==true` profile (`mA072qKbzrAthut6CdFV`) had **1 journey, 14 `participantsproduct` rows, 9 deliverables, 0 appointments** — a big/event-mode journey (no 1:1 appointments), illustrating that "products" ≠ "1:1 appointments" and delivery mode varies (`evidence.json .traces.journeyTrace`).

## 8. Known caveats
- **Use `subscriptionstart` as t0, not `purchasedate`** (58%) or `updated` (0% — dead). `journeyref` is 92% (8% blank → the "(unknown)" journeys).
- **Purchased ≠ delivered (TD-009)** — analyze delivery by appointment type, not package name (`SCHEDULING-DELIVERY.md`).
- `participantsproduct.journeyref` ~2% — get the journey link from `participantjourneyproduct`, not here.
- `salesleads.journeystatus='currentjourney'` is a **pipeline** status, distinct from the `participantjourneyproduct.journeystatus` lifecycle value — don't conflate.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| Purchase record of truth | `participantjourneyproduct` subscriptionstart 100%, journeystatus 94% | 5,141 | evidence.json `.schema.participantjourneyproduct` |
| t0 = subscriptionstart | by `subscriptionstart` 336/90d (updated=0/90d) | — | evidence.json `.traces.recencyNuance` |
| journeystatus is the live state | reads/writes journeystatus | — | journey-product-purchase.ts:646; userprofile.ts:461; code audit |
| currentjourney* dead (TD-003) | writer `profileCurrentData` 0 callers; 0% fill | — | authguard.service.ts:964; data-reliability.md |
| Cross-sell ≈ 33% | P-B54D2 (4 journeys), P-4F5BB (2), P-29DDF (2), P-CAEC2 (2) | 10 timelines | journey_evidence_final.json |
| Lifecycle transitions | upgraded/downgraded/cancelled/completed/ongoing observed | — | journey_evidence_final.json; create-watson-profile |
| Products ≠ appointments | profile `mA072…`: 14 products, 0 appointments (big mode) | — | evidence.json `.traces.journeyTrace` |

## 10. Open questions (engineer validation)
1. Canonical `journeystatus` enum — confirm the full set + legal transitions (initiated/ongoing/currentjourney/upgraded/downgraded/cancelled/completed).
2. The 8% blank `journeyref` ("(unknown)" journeys) — data-entry gaps or a real "no-journey product" case?
3. Is `participant metadata` recomputed from `participantjourneyproduct`/`participantsproduct` (treat as derived) or independently maintained?
4. Confirm the cross-sell rate (33%) definition: distinct journeys per profile vs. upgrade chains.
