# Data Reliability Classification — Firestore collections (StarLabs / production `fir-sample-aae4a`)

> **Status: DRAFT — pending operator lock-in (2026-06-02).** Once locked, this is the source of truth for which collections we trust when documenting the system and building CI fixtures. Method: read-only audit of doc count, write-recency (writes in last 90d / 365d), data span, and key-field fill-rate (`~/Downloads/svstats/reliability_audit.js` + `reliability_fix.js`; raw → `reliability_audit.json`). Verdict logic: actively-written + well-filled = reliable; migration-churn (`_v2`/`archives`) + stale = broken. ATC collections excluded by policy.
>
> **Operator ground-truth corroborated:** (1) journey purchases accurate-with-human-error → confirmed; (2) "big level logs broken" → confirmed (aggregate-level family fractured & stale).

## TIER A — RELIABLE · LOCK ON ✅

### Commercial / journey lifecycle (the trusted anchor)
| Collection | Count | Recency (writes) | Fill / notes |
|---|---|---|---|
| `participantjourneyproduct` | 5,137 | 261/90d, 1,216/365d (→2026-06-02) | subStart/subEnd 100%, journeystatus 93%, profileid 100%. **t0 = `subscriptionstart`** (purchasedate only 52%). The purchase record of truth. |
| `participantsproduct` | 38,399 | 2,153/90d (by subStart) | productref/profileid 100%, status 74%. Product enrollment of truth. (`journeyref` ~2% here — get the journey link from `participantjourneyproduct`.) |
| `participant metadata` | 3,310 | 219/90d (→2026-06-02) | name/email/customerstatus 94%, participantmode 78%. Denormalized participant profile used by dashboards. |
| `salesleads` | 4,335 | 418/90d | Pre-sale → purchase pipeline. |

### Identity & access
`profile_data` (3,246 — identity fields reliable), `user_data` (2,257), `new_user_data` (625), `eisroles` (166), `FCM_token` (8,907; 4,337/90d).

### Scheduling & 1:1 delivery
`appointments` (10,293; 1,364/90d — real stage timing), `availability` (20,767; 2,203/90d), `offtime` (125), `deliverables` (30,711; status 81%, fileref 91%, profileid 97%), `participantdeliverysequence` (3,292; profileid/products 100%).

### Queue / workflow operations
`queue stage log` (68,649; 3,843/90d), `queue_token` (7,041; 269/90d), `queue activity log` (8,283; 300/90d).

### BIG cohort **operations** (≠ the broken level-rollups)
`big cohorts` (345; 76/90d), `big cohorts log` (6,107; 1,392/90d), `big assignment` (63; 25/90d), `big participants assignments` (484; 63/90d), `biginvitation` (1,601).

### Content & engagement
`content analytics` (278,349; **47,320/90d** — the engagement backbone, incl. SolarVoice), `participant touchpoint` (89,031; 26,707/90d), `recommended mix playlist` (9,446; 1,803/90d), `episodes` (502), `solar voice playlist` (56), `solar voice audios` (49), `series` (53), `evolutionmappingvideo` (1,526; 543/90d), `liveevolutionmapping` (538; 118/90d).

### Events
`event collection` (97), `event participation request` (14,762; 4,361/90d), `arena events` (216), `event zones` (10).

### System / audit
`notificationrecord` (82,610; 23,521/90d). ⚠️ `loginlog` (71,886) **demoted to infra** — operator-screen validation (below) found NO screen uses it (background auth log); it fails the "operator uses this data" test.

### Catalog / reference (small, stable, code-referenced — reliable as *definitions*)
`journey` (48), `products` (104), `package` (49), `appointmenttype` (108), `journey-to-product` (41), `productToDeliverySequence` (85), `procedures` (34), `delivery events` (42), `delivery forms` (84), `modes` (15), `tier` (13), `classify` (36), `dashboard` (23), `AppointmentType-To-Roles` (102), `Roles-To-EIS` (102), `biglevel` (20 — **level *definitions*, not logs**), `accelerated evolution level` (11), `bigactivity` (33).

## TIER B — PARTIAL · USE WITH CARE ⚠️
- **`participantjourneyproduct` sparse fields:** `purchasedate` 52%, `onboarded` 56%, `journeyref` 8% missing (→ the `(unknown)` journeys). Use `subscriptionstart`/`journeystatus`, not these.
- **`participantsproduct`:** `status` 74% (some blank); `journeyref` ~2% (not the journey link).
- **`participant metadata`:** `participantmode` 78%.
- **Slowing/low (feature winding down):** `queue generation` (95; 0/90d, last 2025-08), `eiflix participant workshop` (906; 0/90d, last 2025-12), `tier` (slowing), `delivery report` (3 docs — thin).

## TIER C — BROKEN / SUPERSEDED · DO NOT LOCK ❌
- **BIG LEVEL ROLLUPS (operator-flagged):** `big aggregate level` (695), `big aggregate levelv2` (632 — STALE, 0/365d), `big aggregate level archives` (6), `big aggregate level archivesv2` (5 — STALE), `big aggregate event level` (1,145 — 0/90d). Fractured into v2/archives/archivesv2 → **no single source of truth. Do not use for level/progression analytics.**
- **`big marathon`** (10; name/date empty) — minor/deprecated.
- **`participantJourneySequence`** (1,495; STALE last 2024-11) — superseded by `participantjourneyproduct`.
- **`userAccessCounts`** (56,668; STALE last 2024-10) — telemetry stopped.
- **`eiflix workshop`** (2 docs; STALE 2024-08) — legacy; superseded by the `New-Workshop` feature.
- **`collectionname`** (0 docs — empty).
- **`profile_data.currentjourney` / `currentjourneystatus` / `currentproductstatus` = 100% NULL** — dead derived fields. **Never read them for journey state; use `participantjourneyproduct.journeystatus`.**

## TIER D — NOT YET AUDITED · NEXT PASS 🔍
`New-Workshop` collections (`workshopconfiguration`, `engagement_snapshots`), AppEngagement (`community post`, `evolutionwishlistlog`), Customer Support (`clientissue`), HPC (`3minuteshpc`), the various `*-clone`/`*-duplicate` backing collections (graphify flagged heavy component duplication), and the Watson external Firebase DB.

---
*Recency relative to 2026-06-02. "Writes/90d" counts docs whose write-time field falls in the last 90 days.*

---

## VALIDATION — operator-screen evidence (2026-06-02)

Method: 11 parallel agents extracted every Firestore read/write across all **194 routed operator screens** (file:line). Full map: **`specs/operator-screens.md`**. This answers "is there an operator who actually uses this data?"

- **54 of 55 Tier-A collections confirmed operator-used** (≥1 screen reads/writes). ✅
- **1 orphan → demoted:** `loginlog` (no operator screen — background auth log).
- **14 operator screens integrate sensitive ATC data → EXCLUDE from CI/CD** (2 WRITE): `updateprofiletaxonomy`(W), `overall_event_dashboard`(W), `big-dashboard`, `profilelist`, `JourneycoachDashboard-new`, `ecosystem`, `live_event_dashboard`, `first_timers_dashboard`, `queueeventhealth`, `arenadesigninsights`, `dynamicstudio`, `dynamicqueuemanager`, `participantAEL`(+`/:id`). Evidence in `operator-screens.md` §C.
- **Operator-used but NOT yet reliability-audited → promote candidates (run recency check next):** `queue generation` (read by 35 screens — but 0 writes/90d ⇒ heavily-read, stale-written, **pipeline likely broken**), `queue variation` (13), `users_roles` (12), `content_urls` (11), `wati archive` (10), `email archive` (10), `formsByClient` (9), `participant tags` (8), `live assignment` (8), `clientissue` (8), `workshopconfiguration` (8), `openviduroom`, `queue studio pairing`, `arenavideoask`.
- 219 distinct collections are referenced by screens (vs ~60 audited) — the Tier-D backlog.
