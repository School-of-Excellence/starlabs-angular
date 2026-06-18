# CONFIGURATION.md — the config that makes the StarLabs engine work

> **Data-first, evidence-backed reference.** StarLabs components are *generic*; runtime behavior (queues, dynamic studios, delivery, nav, content access) is **assembled at runtime from configuration documents in Firestore**. This file documents those knobs: for each CONFIG collection — its **document shape** (from a live read-only sample), its **variants / schema drift**, and the **config → behavior map** with the exact code `file:line` that interprets it.
>
> **Evidence:** every shape here is from a read-only production probe on 2026-06-02 (`fir-sample-aae4a`). Raw: `specs/evidence/config_deep.json` (variant enumeration), `specs/evidence/schema_samples.json` (fill-rates), `specs/journals/2026-06-02-config-driven-architecture-artifacts/config_probe_output.txt` (representative docs). Regenerate via `specs/evidence/probe_config_deep.js`. Code citations were extracted + verified by per-subsystem code audits (see `specs/journals/2026-06-02-config-and-data-model-docs.md`). **Reliability tiers** per `specs/data-reliability.md` (DRAFT — pending engineer lock; config *shape* is observable now regardless of lock).

## Collection ROLES
Documentation must state which role a collection plays:
- **CONFIG** — defines behavior (the knobs operators/admins set). *This file.*
- **RUNTIME-STATE** — a live entity's current position, derived by the engine from config + events. (See the subsystem docs + `DATA-MODEL.md`.)
- **TRANSACTIONAL / LOG** — recorded events/audit.

## How config is interpreted (the engine pattern)
Generic Angular components read a CONFIG doc from Firestore, then loop/branch over its fields to render UI and drive flow. The canonical example is the queue: `dynamic-queue-manager-clone` reads a `queue generation` doc and iterates its `stages[]` array, looking up each stage's `stageproperty{}` to build the board ([dynamic-queue-manager-clone.component.ts:1871-1873](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1871)). **No stage names are hardcoded** — change the config doc, change the behavior. The same pattern recurs for delivery sequences, nav, content access, and studio assembly.

---

## 1. Queue configuration — the stage machine

| Collection | Role | Count | Drives |
|---|---|---|---|
| `queue generation` | **CONFIG** | 96 | a queue definition: `stages[]`, per-stage `stageproperty{}`, capacity, mentors/admins, `queuevariation[]`, dates, `enablezoommeetingsdk` |
| `queue variation` | **CONFIG** | 183 | named alternate stage-paths (`variationname`, `stages[]`, optional `atcmodel`) selected per-token by `variationid` |

### `queue generation` — document shape (live sample `vuvS7eBgTxLKufnesLQT`, "A&H Evolution Preparation Event - April 2026")
`{ queuename, stages: array[14], stageproperty: {<stagename>: {...}}, queuevariation: array[10], queueadmin[], queuementor[], queuetargetcapacity, totalcapacity, venue, queuestartdate, queueenddate, lastregistrationdate, enablezoommeetingsdk, zoomlinkrequired, created, modified }`. Fill-rates (100-doc sample): `stages` 100%, `queueadmin` 100%, `stageproperty` 89%, `queuetargetcapacity` 89%, `queuevariation` 92%, `totalcapacity` 65%.

`stages[]` is the ordered stage list, e.g.: `Evolution Prep Orientation → uP! Preparation Hold → Accelerated Evolution Level Form → … → Evolution Mapping Activity → In Evolution Mapping Activity → … → Transfered → Completed`. Each `stageproperty[<stage>]` carries ~18 keys including `compulsoryactivity`, `mandatorystagegrouping`, `optionalstagegrouping`, `transferactivity`, `selfmovable`, `nextstage`, `calltoaction`, `participantform`, `studiowidgets`, `min/maxwatingminutes`, `checkfinance`.

### `queue generation` config → behavior
| Config field | Code that reads it (`file:line`) | Behavior |
|---|---|---|
| collection load (per `queueadmin`) | [dynamic-queue-manager-clone.component.ts:1504](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1504), filter `:1510` | lists the queues a non-admin may drive (`where("queueadmin","array-contains",profileid)`) — **`queueadmin[]` is the one people-array consumed at runtime** |
| selected queue by docid | [dynamic-queue-manager-clone.component.ts:1812](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1812) | loads the full config doc (stages + stageproperty) |
| `stages[]` + `stageproperty{}` | [dynamic-queue-manager-clone.component.ts:1871-1873](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1871) → board getter `:1372` → template `*ngFor` [.html:1199](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.html#L1199) | builds the rendered stage columns; `stageproperty.compulsoryactivity` decides Activity sub-columns, `checkfinance` toggles locked styling ([.html:1222](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.html#L1222)) |
| `stages[]` (participant side, via `queue_token.queueref`) | [queue-web-version1.component.ts:173](../src/app/queue%20system/QueueWebVerison1/queue-web-version1.component.ts#L173), progress index `:189-194` | participant progress is `stages.findIndex(currentstage)` |
| `stages[]` (planning review) | [queue-planning-review.component.ts:424](../src/app/queue%20system/queue-planning-review/queue-planning-review.component.ts#L424) | `this.queueStages = queueDoc.data()['stages']` |
| `enablezoommeetingsdk` | [dynamic-studio.component.html:182](../src/app/queue%20system/dynamic-studio/dynamic-studio.component.html#L182) | chooses Zoom-SDK vs LiveKit path in the studio |
| `queuetargetcapacity`/`totalcapacity`/`queuementor[]` | **write-only** — set in the creation form [queue-creation-v3.component.ts:142-143,123](../src/app/queue%20system/queue-creation-v3/queue-creation-v3.component.ts#L142); **no runtime reader found** | capacity/mentor arrays are authored but not enforced in the queue engine today |

### `queue variation` — shape + config → behavior
Shape (live `0bH0Tm5SflXdjc7mZUYm`): `{ variationname, queueref: ref, stages: array[12], atcmodel? }`. 2 structural variants (with/without `atcmodel`; `atcmodel` 65% fill). A token's `variationid` selects a variation whose `stages[]` **overrides** the queue default:
- variations loaded into `mapVariation` keyed by id: [dynamic-queue-manager-clone.component.ts:1763-1766](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L1763)
- override applied when showing a token's moves: [dynamic-queue-manager-clone.component.ts:2733-2737](../src/app/queue%20system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts#L2733) (`stagesToShow = mapVariation[token.variationid].stages` else `selectedQueue.stages`)
- participant side: [queue-web-version1.component.ts:161-165](../src/app/queue%20system/QueueWebVerison1/queue-web-version1.component.ts#L161) (`variationStages ?? queueData.stages`)
- *Worked example:* token `0B1inpSgA668vdsLMOJu` carries `variationid RNOFi3yRZeRGSuRQZQJm` → variation **"Old Participant"** (15-stage path) used instead of the queue's default list.

### ⚠️ Schema drift — the boolean-toggle shape is DORMANT
`config_deep.json` shows **60 distinct key-sets across 96 `queue generation` docs** — mostly optional-field presence, not structural difference. A minority of docs additionally carry boolean-toggle fields (`isdiagnosticsrequired`, `isconsultationrequired`, `isvideologrequired`, `ischangeworkreq`, `isreviewrequired`, `videologperson[]`, `consultationperson[]`, `ahperson[]`) **layered on top of** the same `stages[]`/`stageproperty{}` shape (e.g. variant doc `9veKxEiF8f233RJ7RM3R` has both `stages: array[14]` AND the booleans). **These toggles are dead in code:** they appear only as *commented-out* writes in [queue-creation-v3.component.ts:878-884](../src/app/queue%20system/queue-creation-v3/queue-creation-v3.component.ts#L878) and have **no runtime reader** anywhere in `src/`. **The engine reads exactly one live shape: `stages[]` + `stageproperty{}` (+ `queue variation` override).** (Correction to the seeded note that implied two *interchangeable* behavioral shapes — there is one; the toggles are vestigial. → TD-013.) Note: the similarly-named `ischangeworkrequired` *is* live but belongs to **`appointmenttype`**, not the queue ([mark-appointment-status.component.ts:160](../src/app/Scheduling/mark-appointment-status/mark-appointment-status.component.ts#L160)).

---

## 2. Studio / space configuration

| Collection | Role | Count | Drives |
|---|---|---|---|
| `arenaspace` | **CONFIG** | 93 | studio-space defs: `spaceid`, `mentor[]`, `pivottype`, `eventref`, `participantslist[]`, `validated` |

Shape (live `0DQMrBO9bwnGmECMefeU`): `{ spaceid, mentor: array[1], pivottype, eventref: ref, participantslist[], cohortsid[], validated: bool, delete: bool, date, createddate }` (all top-level fields 100% fill across 93 docs). Authored by [create-arena-space.component.ts:723,740](../src/app/big/create-arena-space/create-arena-space.component.ts#L723) (`setDoc('arenaspace', …)`), read at `:172`; validation/edit writes at [view-arena-space.component.ts:359](../src/app/big/view-arena-space/view-arena-space.component.ts#L359), [arena-space-dialog.component.ts:173](../src/app/big/arena-space-dialog/arena-space-dialog.component.ts#L173). **⚠️ Naming drift:** the live collection is `arenaspace` (93); `arena space` (with a space) exists but is **empty (0)** — never read it. The *runtime* studio binding is `live assignment` (RUNTIME-STATE, not config) — see `LIVE-STUDIOS.md`.

---

## 3. Scheduling / delivery configuration

| Collection | Role | Count | Variants | Drives |
|---|---|---|---|---|
| `productToDeliverySequence` | **CONFIG** | 85 | 3 | `product` (ref) → `deliveryoptions[]`, each an ordered `deliverysequence[]` of stage activities |
| `modes` | **CONFIG** | 15 | 1 | the delivery-mode definitions (`mode`, `sequence`) — the 5 modes |
| `appointmenttype` | **CONFIG** | 108 | 5 | appointment/stage definitions: `appointmenttype`, `duration`, `ischangeworkrequired` (58%), `groupappointment` (43%) |
| `AppointmentType-To-Roles` | **CONFIG** | 102 | 3 | `assigned_appttype_ref` → `required_role[]`/`additional_role[]` |
| `Roles-To-EIS` | **CONFIG** | 102 | 2 | `assigned_role_ref` → `assigned_eis[]` (eligible specialists) |
| `delivery forms` | **CONFIG** | 84 | 5 | form templates (`formname`, `formarray[]`, `formtype`) |
| `delivery events` | **CONFIG** | 42 | 2 | delivery event templates (`eventname`, `events[]`) |

### config → behavior
| Config | Code (`file:line`) | Behavior |
|---|---|---|
| `productToDeliverySequence.deliveryoptions[]` | [product-delivery.component.ts:139,146,157](../src/app/Product%20Designer/product-delivery/product-delivery.component.ts#L139); dashboard uses `deliveryoptions.at(-1)` [appointment-dashboard.component.ts:115,133-134](../src/app/appointment-dashboard/appointment-dashboard.component.ts#L115) | the per-product ordered delivery sequence; the last option's `deliverysequence[]` yields the bookable stages |
| `modes` (ordered by `sequence`) | [mode-dashboard.component.ts:128,132](../src/app/AppEngagement/mode-dashboard/mode-dashboard.component.ts#L128) | the delivery-mode list; consumed in AppEngagement, Journey Onboarding, analytics |
| `appointmenttype` | [book-appointment.component.ts:225](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L225); via `getAppointmentMap()` [authguard.service.ts:122](../src/app/authguard.service.ts#L122) | identifies the stage being booked; availability is keyed by the appointmenttype ref |
| `AppointmentType-To-Roles` → `Roles-To-EIS` | [book-appointment.component.ts:224,228](../src/app/Scheduling/book-appointment/book-appointment.component.ts#L224) then `:286-287` | resolves appointment-type → roles → eligible EIS specialists (a two-hop config lookup) |

> Note: `book-appointment` does **not** read `productToDeliverySequence` directly; it reads the materialized per-participant `participantdeliverysequence` (RUNTIME-STATE) whose entries carry `sequenceref`/`deliverypath`. The product→sequence *config* is authored in Product Designer ([delivery-sequence.component.ts:302](../src/app/Product%20Designer/delivery-sequence/delivery-sequence.component.ts#L302)) and consumed by `participant-delivery-sequence` + `appointment-dashboard`.

---

## 4. Content / access configuration

| Collection | Role | Count | Variants | Drives |
|---|---|---|---|---|
| `tier access config` | **CONFIG** | 12 | 3 | content gating: `tieraccessby` (`product`\|`biglevel`), `tierid`, `productaccess{<journeyid>: [{productid,count}]}`, `biglevel[]` |
| `tier` | **CONFIG** | 13 | 4 | content tiers (`tier`, `order`, eligibility/up/down-grade messages) |
| `series` / `episodes` | CONFIG-catalog | 53 / 502 | — | video catalog; `series.tier[]` ties a series to tiers |

Shape (`tier access config`, live `5TUK8xByPaWJgWiwLLke`): `{ tieraccessby:"product", tierid, productaccess: {<journeyid>: array[…]}, biglevel[], biglevelid[] }`. The two modes are mutually exclusive: choosing `biglevel` clears `productaccess` and vice-versa ([config-new-tier.component.ts:176-180](../src/app/content/tier-access-config/config-new-tier/config-new-tier.component.ts#L176)); `productaccess[journeyid] = [{productid, count}]` ([:120](../src/app/content/tier-access-config/config-new-tier/config-new-tier.component.ts#L120)); written at `:183-184`, read for display at [view-tier-access.component.ts:44](../src/app/content/tier-access-config/view-tier-access/view-tier-access.component.ts#L44) and [viewparticipant-tier-access.component.ts:144](../src/app/content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component.ts#L144).

> **⚠️ Enforcement caveat (verified):** in this Angular client `tier access config` is read for **display/authoring only** — no code filters a participant's content by `productaccess`/`count` at view time. Runtime entitlement enforcement lives outside this repo (mobile app / Cloud Functions). Document the config; don't assume the web client gates content.

---

## 5. Journey / product catalog configuration

| Collection | Role | Count | Variants | Drives |
|---|---|---|---|---|
| `journey` | **CONFIG** | 48 | 7 | journey defs: `journey`, `originalfee`, `journeyupgrades[]`, `addonproducts[]`, `type`, `atcmodel` (56%) |
| `products` | **CONFIG** | 104 | 13 | product defs: `product`, `mode`, `modeflow[]`, `deliveryplanning`, `performancedays`/`extendedperformancedays`/`integrationdays`, `atcmodel`, `selfbooking` |
| `package` | **CONFIG** | 49 | 2 | package names |
| `journey-to-product` | **CONFIG** | 41 | 3 | `journey` (ref) → `product[]` (auto-populates products when a journey is chosen) |
| `biglevel` | **CONFIG** | 20 | 1 | BIG level **definitions** (`level`, `sequence`, `category`) — *not* the broken level rollups (TD-002) |
| `accelerated evolution level` | **CONFIG** | 11 | 1 | AEL defs (`sequence`, `startpoint`, `endpoint`) |
| `bigactivity` | **CONFIG** | 33 | 4 | BIG activity defs (`activity`, `shadow`, `activitytype`) |
| `procedures` | **CONFIG** | 34 | 2 | procedure defs (`name`, `suedoname`) |

config → behavior: the catalog is loaded in `journey-product-purchase` ngOnInit — `journey` [:149](../src/app/Participants%20Profile%20Management/journey-product-purchase/journey-product-purchase.component.ts#L149), `products` `:156`, `package` `:164`, `journey-to-product` `:176`; choosing a journey auto-populates products via `mapJourneyToProduct` ([:179,:327](../src/app/Participants%20Profile%20Management/journey-product-purchase/journey-product-purchase.component.ts#L179)). `products.mode` + `modeflow[]` select the delivery mode (one of 5). See `JOURNEY-LIFECYCLE.md`.

---

## 6. Navigation / authorization configuration

| Collection | Role | Count | Variants | Drives |
|---|---|---|---|---|
| `dashboard` | **CONFIG** | 23 | 4 | nav tree + per-route ACL: `{label, route, icon, showInSidenav, order, roles[], profileid[], children[]}` |
| `users_roles` | **CONFIG** | 3,252 | — | **per-user boolean auth-role flags** — the target of `profile_data.role_ref` |
| `eisroles` | **CONFIG** | 166 | — | **specialist/delivery role definitions** (`role`, `experiencestage`, `experiencelevel`) — used by scheduling, *not* auth |
| `classify` | **CONFIG** | 36 | 28 | app-config singletons by doc id (e.g. `AHCRM_dashboard_access`, `3minuteshpc`) |

### The auth model (corrected against live data)
Authorization is **100% client-side** (no Firebase custom claims anywhere — `grep` for `customUserClaims`/`getIdTokenResult`/`token.claims` = 0 hits). The chain:
1. Firebase Auth (email/password) → `user_data/{uid}`.
2. `profile_data` found by `where('user_ref','==', user_data/{uid})`; its **`role_ref` → `users_roles/{id}`** (a doc of boolean role flags). `getRoles()` returns that map: [authguard.service.ts:307-318](../src/app/authguard.service.ts#L307). **Verified live: 60/60 sampled `profile_data.role_ref` point to `users_roles` (count 3,252 ≈ profile count); a sample doc's true flag = `participant`.** *(Correction: prior docs said `role_ref → eisroles`; that is wrong — `eisroles` is the separate specialist-role catalog.)*
3. Active role names = `Object.keys(roleMap).filter(v => v===true)` ([auth.guard.ts:38](../src/app/auth.guard.ts#L38), [app.component.ts:263](../src/app/app.component.ts#L263)).
4. Per-route ACL from `dashboard`: `routeConfig()` matches the route at top level or inside `children[]` and returns `{roles[], profileid[]}` ([authguard.service.ts:325-345](../src/app/authguard.service.ts#L325)). Access = **(any active role ∈ `roles[]`) OR (profileid ∈ `profileid[]`)** ([auth.guard.ts:44](../src/app/auth.guard.ts#L44)).
5. The sidenav applies the same rule, reading `dashboard where showInSidenav==true` sorted by `order`, filtering `children[]` by role/profileid ([app.component.ts:584,594,539-545](../src/app/app.component.ts#L584)). *(Note: `main-dashboard.component.ts` does NOT build the live nav — its dashboard reads are commented out `:46-127`; the active nav is `app.component.ts`.)*

`dashboard` is a tree: 23 docs, top-level parents (Product Designer×14 children, Content×17, Queue System×14, B!G×16, ATC×14, …) with leaf ACLs, e.g. `Developer Settings → roles:[admin]`, `Form Template → [admin,ah,ahmember,capacityplanner,developer,eis,participant]`, `EI AI → [ah,developer,eis]`, `Development Mic Test → [developer]`. Roles vocabulary observed: `admin, developer, ah, ahmember, eis, capacityplanner, participant`. Editor: [route-configuration.component.ts](../src/app/route-configuration-duplicate/route-configuration.component.ts) (read `:97`, write `:210`); `RouteItem` interface `:20`. See `AUTH-ROLES.md`.

`classify/AHCRM_dashboard_access` = `{ "business dashboard": [6 profileids] }`, read/written by [profile-based-access.component.ts:536,524](../src/app/Business%20Dashboard/profile-based-access/profile-based-access.component.ts#L536) (admin editor only — not a runtime guard).

---

## 7. ⚠️ Config-as-data secrets (SECURITY — TD-012)
`classify/3minuteshpc` stores **`apikey`, `apikeytest`, `claudeapikey`** (plus LLM `prompt`/`summaryprompt`/`titleprompt`/`gptmodel`) directly in a Firestore config document. Secrets in queryable config = exposure to anyone with read access. **Documented by existence only — values never echoed.** Move to a secret manager / server-side; rotate. (Probe redacts any `apikey`/`secret`/`token`/`password`/`signature`/`claudeapikey` key to `REDACTED`.)

## 8. ⚠️ Config schema & name drift catalog (TD-013)
- **`queue generation`**: 60 key-sets/96 docs; vestigial boolean toggles on some docs (§1) — engine reads `stages[]`/`stageproperty{}` only.
- **`arenaspace` (93, live) vs `arena space` (0, empty)** — read `arenaspace`.
- **`content_urls` (live) vs `conetent_urls` (typo)** — both appear in screen reads (`modedashboard` reads the typo'd one [operator-screens.md]); verify which is written before seeding.
- **`classify`**: 28 key-sets/36 docs — it is a grab-bag of unrelated singletons keyed by doc id; treat each doc id as its own micro-schema.
Any reader/seed/fixture MUST enumerate variants and verify which name is actually written.

---

## Evidence log (read-only, 2026-06-02)
| Claim | Collection | Count | Sample doc id / value | Source |
|---|---|---|---|---|
| Queue stages are config, not code | `queue generation` | 96 | `vuvS7eBgTxLKufnesLQT` (`stages[14]`, `stageproperty{}`, `queuevariation[10]`) | schema_samples.json; dynamic-queue-manager-clone.ts:1871 |
| Boolean toggles are dormant | `queue generation` | — | toggles commented-out at queue-creation-v3.ts:878-884; 0 runtime readers | code audit |
| Variation overrides default stages | `queue variation` | 183 | token `0B1inpSgA668vdsLMOJu` → variation "Old Participant" (`stages[15]`) | traces.json; dynamic-queue-manager-clone.ts:2733 |
| Studio space defs | `arenaspace` | 93 | `0DQMrBO9bwnGmECMefeU`; empty twin `arena space`=0 | schema_samples.json; create-arena-space.ts:740 |
| Product→delivery sequence | `productToDeliverySequence` | 85 | `0mQIrpSvydzfe9OPcgoh` (`deliveryoptions[1]`, option keys `[deliverysequence, deliverytype]`) | traces2.json; product-delivery.ts:139 |
| Appt-type→roles→EIS | `AppointmentType-To-Roles`/`Roles-To-EIS` | 102/102 | book-appointment.ts:224→286 | code audit |
| Content gating config (display-only in web) | `tier access config` | 12 | `5TUK8xByPaWJgWiwLLke` (`productaccess{}`) | config_deep.json; view-tier-access.ts:44 |
| Nav/ACL config | `dashboard` | 23 | `FwJ0g5qxzBfNUUJHSKUR` (`children[14]`); leaf ACLs at `roles[]`/`profileid[]` | traces.json; authguard.service.ts:325 |
| `role_ref → users_roles` (not eisroles) | `users_roles` | 3,252 | `users_roles/00uKMRyllw0kmwkQXgGv`; 60/60 sampled profiles | traces2.json; authguard.service.ts:314 |
| `eisroles` = specialist role catalog | `eisroles` | 166 | `0VDWDUDz6A6d9wyqn88g` ("Breakthrough Mid Review Collaborator") | traces2.json |
| No Firebase custom claims | — | 0 | grep `customUserClaims`/`getIdTokenResult` = 0 hits | code audit |
| Config-as-data secrets | `classify` | 36 | `3minuteshpc` (apikey/claudeapikey present — REDACTED) | config_probe_output.txt |

## Open questions (for engineer validation)
1. Are `queuetargetcapacity`/`totalcapacity`/`queuementor[]` enforced anywhere (backend/Cloud Function), or fully vestigial?
2. Should the dormant boolean-toggle queue fields be migrated out (TD-013)?
3. Where is `tier access config` actually enforced (mobile/CF)? Confirm the web client is display-only by design.
4. `content_urls` vs `conetent_urls` — which is the source of truth for seeding?

---

## Config-authoring screens (who fills these knobs)
Quick verification from the route table: of 212 routed screens, ~45 are **config/authoring** surfaces — where operators set the CONFIG documented above. (The rest are operational/delivery/reporting.) Mapped to the collection they author:

| Config area | Authoring screens (routes) | Authors collection(s) |
|---|---|---|
| **Catalog** (Product Designer) | `/addjourney` `/addproduct` `/addpackage` `/packagedesign` `/journeyproductmap` `/createaelnames` `/productdelivery` | `journey`, `products` (**incl. `mode`/`modeflow`/day-knobs**), `package`, `journey-to-product` |
| **Delivery sequences** | `/deliverysequence` `/deliveryactivities` `/formtemplate` | `productToDeliverySequence`, `delivery events`/`delivery forms` |
| **Modes** | `/productmodeconfig` `/viewproductmodeplaylist` `/modedashboard` `/mode-dashboard-new` | `product mode config`, `product mode playlist`, (`modes` is reference) |
| **Routing / Nav / Access** | `/routeconfiguration` `/tieraccessconfig` `/accessscreen` `/viewparticipantstieraccess` | `dashboard`, `tier access config` |
| **Content** | `/seriesdashboard` `/addseries` `/editseries` `/category-dashboard` `/assigncategory` `/playlistdashboard` `/add-playlist` `/edit-playlist` `/ads` `/playlistads` `/recommendedplaylist` `/createarenavideoasktemplate` | `series`, `category`, `solar voice playlist`, `ads`/`adsplaylist`, `recommended mix playlist`, `arenavideoask` |
| **Scheduling setup** | `/appointmentrole` `/eisappointmentrole` `/mapappointmentrole` `/EISzoom` `/zoomaccount` | `AppointmentType-To-Roles`, `Roles-To-EIS`, `EISzoomcontact` |
| **Queue / Event / Studio** | `/arena_space` `/create_event` (+ `queue-creation-v3`) | `queue generation`, `arenaspace`, `event collection` |
| **Workshop** | `/createworkshop` `/create-workshop`⚠️ `/workshopconfig/:id`⚠️ `/enrollment_config_view` `/formtemplateworkshop` | `workshopconfiguration`, `eiflix workshop` |
| **Comms / Zones / Business** | `/email-templates` · `/eventzonemanagement` · `/ads-entry` | `email templates`, `event zones`, `adsinvestment` |
| **🚫 ATC config (CI-excluded)** | `/atctaxonomy` `/atcmodel` `/modellevelconfig` (+ `/updateprofiletaxonomy`, `/editATC`, `/addtripleATC` = write ATC) | `atc taxonomy`/`atc model`/`atcmodel level config` (reference); ATC transcript data (off-limits) |

⚠️ = unguarded route (no `authGuard`). Excluded false-positives: `/salesleads` (operational), `/participantdeliverysequence/:pid` (per-participant runtime, not catalog).

## ⚠️ Participant-mode (B) engine is OFF-DISK — open finding
The **participant engagement mode** (B) is recorded in two collections that are **read-only across every on-disk repo**:
- **`participant mode checklist`** (27,496 docs) — the per-(participant × product × mode) log: `{mode, profileid, participantproductid, productref, aelid, createddate, widget[]}`. One doc per mode a participant enters. Read only at `userprofile.component.ts:814`.
- **`participant metadata.participantmode`** — the rollup (headline mode by `modes.sequence` precedence). Read in delivery screens (product-initiation, delivery-dashboard, journeycoach, mode-dashboard) to **group participants by mode**; written **nowhere** on disk.

**No on-disk code writes either** (verified: starlabs-angular reads only; `firebasefunctions` = zero refs; `watson-cloud-functions` = empty; sibling repos = none). The writer — the mode engine, tied to `aelid` (**Accelerated Evolution Level**) + delivery — is a **backend not present in any local repo**. *Action: ask the developer for the mode-engine source* (likely a Cloud Function on `fir-sample-aae4a` deployed outside the `firebasefunctions` repo). NB: `participantsproduct.mode`/`nextmode`/`nextmodedate` are separately set **manually** via `mode-dashboard`. (TD-016.)
