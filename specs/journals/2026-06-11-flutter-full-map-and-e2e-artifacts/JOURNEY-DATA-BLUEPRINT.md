# JOURNEY DATA BLUEPRINT — synthetic ≥200-user "sample journey" cohort

> **Purpose.** The data blueprint for a synthetic cohort (≥200 users) to be seeded into the StarLabs **test** project `slabs-queue-e2e-exdcz` for an e2e suite that exercises the full participant journey: **purchase (Watson-join) → onboarding → mode/journey assignment → queue delivery → ≥4 events → content consumption → ≥1 journey shift/upgrade.**
>
> **Status: RECON COMPLETE (read-only), Phase-1 design — 2026-06-11.** This task did NOT seed or write anything. It is a read-only recon of **production** (`fir-sample-aae4a`) + the validated docs (`specs/validated/01,05,06`) + the existing proven seeders (`e2e/lib/seed-common.js`, `e2e/{journey,events,appointments,modes,content}/seed-*.js`, `e2e/queue/mobile/*.cjs`). Phase 2 (the actual seeder) extends those.
>
> **Evidence:** 5 read-only probes in this dir — `jb_probe1_purchase.js` … `jb_probe5_content.js` — with full output in `DATA_OUTPUTS.txt` (and pasted in the appendix). Every quantitative claim cites its probe.
>
> **Safety invariants honored.** Production was touched with `.get()/.count().get()/.where().limit().get()` only — no `.set/.update/.delete/.add/.create`, no batch/transaction write, no deploy. ATC collections and the `firestore-atc` named DB were never opened. Probes live under `~/solarcode/` (not a TCC dir). The Phase-2 seeder writes ONLY to `slabs-queue-e2e-exdcz` (the `lib/test-project.js` allowlist hard-aborts otherwise) and tags every doc `{testrunid, _testdata:true}`.

---

## Part A — Real-data findings (from probes 1–5)

### A1. Purchase / journey-entry model — `jb_probe1_purchase.js`
The entry of a user is **four joined records**, linked primarily by **`profileid`** (scalar string == the `profile_data` doc id):

| Record | Collection | Count (prod) | Role | Key fields |
|---|---|---|---|---|
| Identity | `profile_data` | 3,265 | who the participant is + **live mode** | `profileid`(=docid), `participantmode` (LIVE), `role_ref`→`users_roles`, `user_ref`→`user_data`. `currentjourney*` = **undefined/dead** |
| Purchase-of-truth | `participantjourneyproduct` (PJP) | 5,168 | the journey purchase + lifecycle | `profileid`, `journeyref`→`journey`, **`journeystatus`**, `onboarded`, `subscriptionstart`(=t0), `purchaseref`→`journeyproductpurchase`, `salesleadsref`→`salesleads`, `participantproducts[]` (ids), `productref[]` (mirror), `paymentplan` |
| Delivery unit | `participantsproduct` (PSP) | 41,234 | one per deliverable | `profileid`, `productref`→`products`, `packageref`→`package`, `status`, `mode`/`nextmode`, `deliverymode`, `statusdate{}` (mode-trail), `sequenceorder`, + event-link fields below |
| Per-purchase | `journeyproductpurchase` (JPP) | 5,162 | the Watson cross-join + shift label | `profileid`, `journeyref`, `participantjourneyproductref`→PJP, `purchasetype:"journey"`, **`watsonpurchaseid`** (100%), **`watsonpurchaselabel`** |

**The JOIN keys (precise):**
- `profile_data.profileid` **==** `PJP.profileid` **==** `PSP.profileid` **==** `JPP.profileid` (scalar string, the spine).
- `PJP.journeyref` → `journey/{id}`; `PSP.productref` → `products/{id}`; `journey↔products` via the `journey-to-product` catalog.
- `PJP.purchaseref` → `journeyproductpurchase/{id}` and back via `JPP.participantjourneyproductref` → `PJP` (bidirectional).
- `PJP.participantproducts[]` enumerates the `PSP` delivery-unit ids belonging to that purchase.
- **Watson cross-project join** (validated/01 §5): `JPP.watsonpurchaseid` (explicit-id, 100% on JPP) with **email fallback** on profile screens. In the **test** project there is **no Watson app** (environment.ts carries no `watson` key → `getApp("watson")` throws and is tolerated; see `seed-journey.js` header) — so we model the Watson side **only as the `watsonpurchaseid`/`watsonpurchaselabel` strings we write onto `JPP`**, never a second Firebase project.

**`PSP` event-link fields** (present when the product is an event/queue delivery; from the sample): `eventref` (→ **`event collection` OR `queue generation`** — either!), `arenaeventid`, `eventparticipationid`, `queuevariationid`, `instantiated:"done"`.

The JOIN walk on a real profile (`vQcPNOyqhRqH0Q7qAKv2`): 1 PJP (journeystatus="initiated", onboarded=true, `participantproducts`=array[6]) → 6 PSP. So **one purchase fans out to many delivery units** (validated/01 §4).

### A2. Journey shift / upgrade — `jb_probe2_shift.js`
**A shift/upgrade manifests in FOUR places** (all data-confirmed):
1. **`PJP.journeystatus`** distribution (5,168): `completed 1538 · upgraded 1127 · ongoing 818 · cancelled 520 · initiated 439 · downgraded 344 · (none) 344 · shifted 38`.
2. **A new `JPP` whose `watsonpurchaselabel` is a `"<A> to <B>"`/`"… upgrade"` transition** — **1,104** labels carry the `"<A> to <B>"` shape, **521** contain "upgrade". Samples: `"CTD to uP!"`, `"FTM to BiG upgrade"`, `"CPM upgrade to BiG"`, `"uP! to BiG upgrade"`, `"BiG to BiG Continuity"`.
3. **`PSP.status="shifted"`** (589 of 41,234).
4. **`PJP.onreschedule:true`** (186) — set when a journeycoach/onboarding appointment is cancelled (cf. validated/05 §14-G).

**Multi-journey fraction (per `profileid`, over 3,258 profiles with a PJP):** **33%** have **>1 PJP**, **29%** have **>1 distinct `journeyref`**, **784** carry an "upgraded" PJP, 35 a "shifted" PJP. → **~⅓ of real participants have shifted/upgraded** — this is the population anchor for the cohort's "≥1 shift/upgrade" requirement. `PSP` per profile: **median 8** (p25=3, p75=17, max=79) — real users accrue many delivery units; with mode set on 28,904 and a multi-key `statusdate` mode-trail on 19,983.

### A3. Events participation distribution — `jb_probe3_events.js`
**`event participation request`** (15,782) is the registration+attendance record, keyed by `profileid`. Status: `attended 7136 · unattended 3846 · requested 3089 · approved 1704` (+ tiny init/denied).

**Events ATTENDED per profileid:**
- Over **ALL 3,072 registered profiles**: **median = 1** (p25=0, p75=3, p90=6, max=35).
- Over the **1,617 who attended ≥1**: **median = 2** (p25=1, p75=5, p90=12, max=35).
- **Only 19% (569/3,072) attend ≥4 events.**
- Requests per profile: median = 2 (p75=6, p90=13, max=56).

**An "attended" event** = an `event participation request` doc with `status:"attended"`, `eventref` (→ **`event collection` OR `queue generation`**), `productref`→`products`, plus optional `eventtyperef`→`delivery events`, `arenaeventid`, `participantproductid`, `eventdate`, `doccreateddate`. RSVP (`event rsvp`, 8,766): 92% "yes"; `type` queue 5,194 / event 3,572.

> **⚠ Design tension (load-bearing for the suite oracle).** The real **median attended is 1–2**, and only 19% attend ≥4. The cohort requirement "**median user attends ≥4 events**" is therefore **above the production median** — it is a deliberate **test-fixture target** (we want a cohort where the median journey is *rich*), **not** a production-realistic distribution. The blueprint below makes the median ≥4 by construction (≥4 attended EPRs for ≥50% of users) and documents this as an intentional skew so a future reader does not mistake it for a claim about prod.

### A4. Delivery chain — `jb_probe4_delivery.js`
The in-progress-delivery state is a chain. **The Flutter-home queue card requires this exact resolution** (verbatim from `setup-mobile-fixture.cjs:98-144`): `profile_data.participantmode` → `participantsproduct` (mode==participantmode, status ongoing, `productref`) → `products.mode` → `participantdeliverysequence/{profileid}.products[participantproductid==active].delivery[type=='queue', status ongoing].sequenceref` → `deliverables.fileref[0]` → `queue_token`.

| Collection | Count | Shape (key fields) |
|---|---|---|
| `queue_token` | 7,541 | `profile_id`(+`profileid`), `queueref`→`queue generation`, `productref`, `currentstage`, `previousstage`, `stagestatus`, `tokenstatus`("Active"), `tokennumber`, `queueposition`, `variationid`, `deliveryRef`→`deliverables`, `formref`→`formsByClient`, `participantproductid`, `people_involved[]` |
| `participantdeliverysequence` | 3,310 | doc id == `profileid`; `products[]`={`participantproductid`,`productref`,`delivery[]`}; `delivery[]`={`type`,`status`,`sequenceref`→`deliverables`}. Types: **queue \| event \| form \| appointment \| report \| fieldwork** |
| `deliverables` | 31,883 | `profileid`,`type`,`status`(completed/ongoing/ready),`fileref[]`(→token/appt/EPR),`deliveryref`,`participantproductid`,`participantjourneyid`. type dist (1500-sample): appointment 561 / queue 505 / event 360 / form 39 / fieldwork 30 / report 5 |
| `appointments` | 10,458 | (validated/05) `appointment`→`appointmenttype`, `hostRole{}`(keyed by `eisroles/<id>`), `hosts[]`, `bookedby`→`profile_data`, `attended`/`cancelled`, `totalminutes`, `participantproductid`, `slotdata[]`, `created`, Zoom fields |
| `availability` | 20,959 | top `profileref/starttime/endtime/appointments/weeklyhours` + one key **per appointment-type-id** → slot array `{slotstart,slotend,booked,available,id}` |
| `queue generation` | 96 | the queue master (stages, `stageproperty`, `queuevariation[]`, `arenaeventidlist`, `queueadmin/queuementor`) |

**Delivery advances** by flipping statuses up the chain: booking an appointment sets `PSP.status→ongoing` + `deliverables.status→ongoing` + arrays the appt ref into `deliverables.fileref` (validated/05 §4); attending sets `deliverables.status→completed` (§5). Events: on attend, `deliverables.status→completed` + `events_profiles` denorm (validated/06 §2). Queue: the operator/`nextstage` moves `queue_token.currentstage` (validated/03).

### A5. Content + progression — `jb_probe5_content.js`
- **Content consumption** is marked by **`content analytics`** (286,960 docs): `profileid`, `videoid`, `type`(solarvoice/eiflixcontent/generalcontent), **`status:"complete"`** (vs watching/incomplete/null), `totaltimespend`/`totalruntime`, `logdate`, `playlistid`. A denorm **`participant content analytics/{profileid}`** (1,197) holds arrays per content type `{solarvoice[],eiflixcontent[],generalcontent[]}`. (`productconsumptionlog` 2,180; `recommended mix playlist` 9,958.)
- **Journey progression** is marked by **`participant mode checklist`** (29,480: `profileid`,`mode`,`productref`,`participantproductid`,`aelid`,`widget[]` — written by the CF `participantmode.js` on a mode change), and **`participant AEL`** (3,580 runtime evolution records: `profileid`,`atcmodel:"uP!"`,`status:"completed"`,`crossovermetric{Health,Personal Genius,Family,Career,Business}`,`evolutiontype`,`evolutionyearsaved`). `accelerated evolution level` (11) is the **config** ladder (Legendary → Greater Legendary, sequenced).
- **`modes`** catalog (15, ordered; the engine rolls up **lowest-sequence-wins**): `Big Mode(0) · Installation Event Mode(1) · Event Mode(2) · Integration Mode(3) · Priority Mode(4) · Preparation Mode(5) · Performance Mode(6) · Journey Priority Planning Mode(7) · Extended Performance Mode(8) · Early Preparation Mode(9) · Journey Planning Mode(10) · Exploration Mode(11) · After Extended Performance Mode(12) · Snooze Mode(13) · Investment Mode(14)`.
- **`participant metadata`** (3,328) is the CQRS projection (rebuilt by `participantmetadata.js`, validated/02 §7d): `participantmode`, `activejourney`, `lastcompletedjourney`, `higherorderpurchase`, `pp_totalpaid/pp_totalpurchasevalue`, `activeproduct/consumedproducts/unconsumedproducts`, `productmode`, `purchase`, `tier`, `lasttouchpoint`, etc.

---

## Part B — 200-user synthetic cohort blueprint

### B0. Conventions (reuse the proven harness)
Extend `e2e/lib/seed-common.js` + `fixtures/seed-test-project.js` exactly as every group seeder does:
- **Run prefix** `J` (proposal: `TESTRUNID = process.env.JRNY_RUNID || 'jrny'`). Every doc id is `${run}_…`; every doc carries `{testrunid, _testdata:true}` (the `TAG`).
- **Auth chain** via `seed.seedAuthChain` (Auth user + `user_data` + `profile_data` + `users_roles` + the queue DRIVEN_ROUTES grants). Staff roster via `seed.makeStaff` (admin/specialists/big) **plus** a custom `eis`/`scheduler`/`journeycoach` roster (as `seed-appointments.js`/`seed-journey.js` add). All emails `@example.com`, password `Test!1234`.
- **Catalog is shared, run-scoped:** seed run-prefixed `journey`/`products`/`package`/`journey-to-product`/`appointmenttype`/`modes`/`event collection`/`arena events` docs (teardown is `testrunid`-scoped so other suites' catalogs are untouched). `atcmodel:null` on every product/journey/event (keeps ATC branches dead).
- **Hard rule:** write ONLY to `slabs-queue-e2e-exdcz`; never seed any ATC collection; never open `firestore-atc`.

### B1. ONE fully-seeded user — the exact collections + docs + join keys
For participant `p` with `profileid = P = ${run}_profile_${i}` and `email = participant${i}+${run}@example.com`. (`J1`/`J2` = run journeys, `PA`/`PB`/`PC` = run products, `EVT_k` = run events, `QG` = the run queue-generation id `${run}_${QUEUE_ID}`.)

**(1) Identity + auth** — `seedAuthChain` writes these; we only set the journey-relevant extras:
- `user_data/{uid}`, `users_roles/{roleId}` (participant:true), and
- `profile_data/{P}`: `{ profileid:P, email, name, role_ref, user_ref, participantmode:<assigned mode>, profileimg:'https://example.com/e2e.png' }`. **`participantmode` is the LIVE mode** (A1) and the Flutter-home entrypoint (A4).

**(2) Purchase (Watson-join)** — the entry quartet, all joined by `profileid=P`:
- `journeyproductpurchase/${run}_jpp_${i}`: `{ profileid:P, journeyref→journey/J1, participantjourneyproductref→participantjourneyproduct/${run}_pjp_${i}, purchasetype:'journey', watsonpurchaseid:'${run}_wp_${i}', watsonpurchaselabel:'uP! Accelerate', productref:[PA,PB] }`. ← the **Watson join is the two `watson*` string fields** (no second project).
- `participantjourneyproduct/${run}_pjp_${i}` (PJP): `{ profileid:P, journeyref→journey/J1, journeystatus:'ongoing', journeytype:'new', onboarded:true, onboardedtime, subscriptionstart:t0(−90d), subscriptionend(+90d), purchaseref→journeyproductpurchase/${run}_jpp_${i}, salesleadsref→salesleads/${run}_sl_${i}, participantproducts:[${run}_pp_${i}_a, ${run}_pp_${i}_b], productref:[PA,PB], paymentplan:'enach-icici', orientationstatus:'completed' }`.
- `salesleads/${run}_sl_${i}`: `{ profileid:P, journey:J1, journeytype:'new', status:'Approved', watsonpurchaseid:'${run}_wp_${i}' }` (test-project only; no salescrm).
- `participantsproduct/${run}_pp_${i}_a` (PSP-A, the queue-delivered product): `{ profileid:P, productref→products/PA, packageref→package/PKG, status:'ongoing', mode:'Event Mode', deliverymode:'Event Mode', deliverytype:null, statusdate:{ongoing:ts}, sequenceorder:0, eventref→queue generation/QG, queuevariationid:VAR, instantiated:'done' }`.
- `participantsproduct/${run}_pp_${i}_b` (PSP-B, the appointment-delivered product): `{ profileid:P, productref→products/PB, packageref→package/PKG, status:'ongoing', mode:'Priority Mode', deliverymode:'Priority Mode', sequenceorder:1 }`.

**(3) Onboarding** — `PJP.onboarded:true` + `orientationstatus:'completed'` (above). Optionally one `appointments` doc of `onboarding:true` marked `attended:true` for the onboarding step (see (5)).

**(4) Mode / journey assignment** — three coupled writes:
- `profile_data.participantmode` (above) — the headline mode.
- `participant mode checklist/${run}_pmc_${i}`: `{ profileid:P, mode:'Integration Mode', productref→products/PA, participantproductid:${run}_pp_${i}_a, aelid:null, widget:[…], createddate }`.
- `participant metadata/{P}`: `{ profileid:P, participantmode:'Integration Mode', activejourney:J1, customerstatus:'active', financialstatus:'regular', pp_totalpaid:'50000', pp_totalpurchasevalue:'100000', activeproduct:[PA,PB], consumedproducts:[], unconsumedproducts:[], productmode:['Integration Mode'], firebaseuserref→user_data/{uid} }`. (NB the deployed CFs `*_to_pmd` / `participantmode.js` may also rewrite this — seed it as the merge target; assertions read the CF-written value where the CF is deployed.)

**(5) Queue delivery — the full Flutter-home chain (A4):**
- `queue_token/${run}_tok_${P}`: `{ profile_id:P, profileid:P, queueref→queue generation/QG, productref→products/PA, currentstage:<a mid stage>, previousstage, stagestatus:'Yet to Start', tokenstatus:'Active', tokennumber:n, queueposition:n, variationid:VAR(prefixed), deliveryRef→deliverables/${run}_delq_${i}, participantproductid:${run}_pp_${i}_a, people_involved:[] }` (reuse `seedParticipantToken`'s shape — it already writes both `profile_id`+`profileid` and the prefixed `variationid`).
- `deliverables/${run}_delq_${i}` (queue leaf): `{ profileid:P, type:'queue', status:'ongoing', fileref:[queue_token/${run}_tok_${P}], deliveryref→delivery queue/…, participantproductid:${run}_pp_${i}_a, participantjourneyid:${run}_pjp_${i} }`.
- `participantdeliverysequence/{P}`: `{ profileid:P, products:[ { participantproductid:${run}_pp_${i}_a, productref→products/PA, delivery:[ {type:'queue', status:'ongoing', sequenceref→deliverables/${run}_delq_${i}} ] }, { participantproductid:${run}_pp_${i}_b, productref→products/PB, delivery:[ {type:'appointment', status:'completed', sequenceref→deliverables/${run}_dela_${i}} ] } ] }`.
- **Appointment delivery** (PSP-B): one `appointments/${run}_apt_${i}` `{ appointment→appointmenttype/AT, appointmentrole:[…], hostRole:{'eisroles/R': [profile_data/eis]}, hosts:[profile_data/eis], bookedby→profile_data/{P}, starttime/endtime(past), attended:true, cancelled:false, totalminutes:60, participantproductid:${run}_pp_${i}_b, slotdata:[…], created }` + its leaf `deliverables/${run}_dela_${i}` `{ profileid:P, type:'appointment', status:'completed', fileref:[appointments/${run}_apt_${i}], deliveryref→appointmenttype/AT, participantproductid:${run}_pp_${i}_b }`. (Reuse the `availability`/`appointmenttype`/`Roles-To-EIS` config from `seed-appointments.js`.)

**(6) ≥4 events** — for each of the user's `E≥4` events (`EVT_k`, `k=1..E`):
- `event participation request/${run}_epr_${i}_k`: `{ profileid:P, eventref→event collection/EVT_k, productref→products/PA, eventtyperef→delivery events/DE, status:'attended', arenaeventid:${run}_arenaevt_k, participantproductid:${run}_pp_${i}_a, eventdate(past), doccreateddate }`.
- `events_profiles/${run}_ep_${i}_k`: `{ event_ref→event collection/EVT_k, profile_ref→profile_data/{P}, eventrequest→event participation request/…, pseudo_name, token }` (the attendance denorm).
- one `event rsvp/${run}_rsvp_${i}_k`: `{ profileid:P, eventref→event collection/EVT_k, productref→products/PA, participantresponse:'yes', type:(k odd?'queue':'event') }`.
- `arena e-ticket/${run}_etk_${i}_k`: `{ profileid:P, eventref→event collection/EVT_k, eventparticipationref→event participation request/…, producteligible:[PA], active:true, eventstartdate, eventenddate }` (optional, for QR-scan tests).
- a `deliverables/${run}_dele_${i}_k` of `type:'event', status:'completed', fileref:[event participation request/…]` and a matching `delivery[]` entry on `participantdeliverysequence` (folds events into the same ladder).
- **Join key:** events tie to the participant by `EPR.profileid=P`, to the journey by `EPR.productref→products` (→ journey family via the catalog; `journeyref` is null on 98% in prod, validated/06 §14), and to the event master by `EPR.eventref→event collection/EVT_k`.

**(7) Content consumption** — `C≥3` watch records:
- `content analytics/${run}_ca_${i}_n` (n=1..C): `{ profileid:P, videoid:${run}_vid_n, videoname, type:(rotate solarvoice/eiflixcontent/generalcontent), status:'complete', totaltimespend:600, totalruntime:600, logdate(recent), from:type, playlistid:${run}_play }`.
- `participant content analytics/{P}`: `{ solarvoice:[…refs], eiflixcontent:[…], generalcontent:[…] }` (the denorm arrays).

**(8) ≥1 journey shift/upgrade** — for the **upgraded slice** of the cohort (see B2), add a SECOND purchase quartet on `J2`:
- second `journeyproductpurchase/${run}_jpp2_${i}`: `{ profileid:P, journeyref→journey/J2, purchasetype:'journey', watsonpurchaseid:'${run}_wp2_${i}', watsonpurchaselabel:'uP! to BiG upgrade' }` ← the literal transition label (A2).
- the original `PJP` flips `journeystatus:'upgraded'` (or `'shifted'`); a second `participantjourneyproduct/${run}_pjp2_${i}` on `J2` with `journeystatus:'ongoing'`, `journeytype:'upgrade'`, `onreschedule:false`.
- (for a *shift* variant: original `journeystatus:'shifted'`, original `PSP`s `status:'shifted'`, second PJP `journeytype:'shift'`.)
- `participant metadata.lastcompletedjourney`/`higherorderpurchase`/`activejourney` updated to reflect the move.
- **Join key:** the two purchases share `profileid=P`; the upgrade is readable as `count(PJP where profileid=P) ≥ 2` AND/OR `count(distinct journeyref) ≥ 2` AND/OR a JPP `watsonpurchaselabel` matching `/ to | upgrade/i`.

**Per-user collection list (15 + auth):** `profile_data`, `user_data`, `users_roles`, `journeyproductpurchase`, `participantjourneyproduct`, `salesleads`, `participantsproduct`, `participant mode checklist`, `participant metadata`, `queue_token`, `participantdeliverysequence`, `deliverables`, `appointments`, `event participation request`, `events_profiles`, `event rsvp`, `arena e-ticket`, `content analytics`, `participant content analytics`. Plus shared run-scoped catalog: `journey`, `products`, `package`, `journey-to-product`, `appointmenttype`, `eisroles`, `Roles-To-EIS`, `AppointmentType-To-Roles`, `availability`, `modes`, `event collection`, `arena events`, `delivery events`, `queue generation`, `queue variation`, `dashboard`.

### B2. Varying across 200 users so the median holds
Generate **N=200** participants `${run}_profile_0 … _199`. Vary along three independent dials so the **median user attends ≥4 events** and **≥1 shift/upgrade holds across the cohort**, while keeping a believable spread:

**(i) Events attended per user — median MUST be ≥4** (deliberately above prod's 1–2, A3). Distribution plan (sum/positions chosen so the 100th-smallest value ≥ 4):

| Bucket | Share | #users | events attended each |
|---|---|---|---|
| Light | 20% | 40 | 2 |
| **Core** | **55%** | **110** | **4–6** (rotate 4,5,6) |
| Heavy | 20% | 40 | 8–12 |
| Power | 5% | 10 | 15–20 |

Sorted, the 100th and 101st values fall in the **Core** band → **median = 4–6 ≥ 4** with margin. (Even the strict median index 99/100 sits at the bottom of Core = 4.) Total ≈ 40·2 + 110·5 + 40·10 + 10·17 ≈ **1,200 attended EPRs**. Give a few users some `unattended`/`requested`/`approved` EPRs too (mirror prod's mix) **without** lowering attended counts.

**(ii) Journey shift/upgrade — ≥1 per the cohort, and the *median user* has ≥1.** Real prod is ~33% (A2); for a journey-centric suite we want the **median** user to have shifted/upgraded, so seed **≥55% upgraded/shifted** (so the median user carries a second purchase):

| Slice | Share | #users | journey state |
|---|---|---|---|
| Single journey | 45% | 90 | 1 PJP on J1, `journeystatus:'ongoing'`/`'completed'` |
| **Upgraded** | **40%** | **80** | J1 `journeystatus:'upgraded'` + 2nd PJP/JPP on J2 (`watsonpurchaselabel:'… upgrade'`) |
| **Shifted** | **15%** | **30** | J1 `journeystatus:'shifted'`, PSPs `status:'shifted'` + 2nd PJP on J2 (`watsonpurchaselabel:'<A> to <B>'`) |

→ 55% (110/200) carry ≥2 journey purchases, so the **median user has ≥1 shift/upgrade**, and the cohort easily satisfies "≥1 across the cohort". (Tune to taste — if you want the *median journey* to be richer, push upgraded+shifted to ≥60%.)

**(iii) Mode / delivery spread** (cosmetic realism, no oracle dependency): rotate `participantmode` across the journey-arc modes seen in prod (`Journey Planning Mode`, `Early Preparation Mode`, `Event Mode`, `Integration Mode`, `Performance Mode`, `Extended Performance Mode`); rotate `journey` family J1∈{uP!, B!G, CTD, CPM} (seed 4 run journeys) so the family→event mapping (validated/06 §14b) is exercised; vary content-watch count C∈{2..10}; vary queue `currentstage`.

**Cross-dial independence:** events (i), upgrade (ii), and mode (iii) are assigned by independent index buckets, so e.g. a Light-events user can still be Upgraded. Use a deterministic generator (like `lib/path-generator.js`) seeded by the participant index so the cohort is reproducible run-to-run.

**Idempotency + teardown:** deterministic doc ids (`${run}_…_${i}`) + the `{testrunid}` tag → re-seed overwrites, teardown sweeps by `testrunid` across the ~20 collections (extend each group seeder's `SEEDED` list; reuse `seed.teardownCollections`). App-written docs (CF projections with no tag) are swept by `profileid` (as `seed-journey.js` does for `journeyproductpurchase`/`email archive`).

---

## Part C — Verification plan (Phase-2, read-only, against the TEST project)

Run **after** seeding, pointed at `slabs-queue-e2e-exdcz` (ADC; **never** the prod SA). Read-only `.where('testrunid','==',run).get()` only. Proves the two cohort invariants:

```js
// verify-cohort.js — READ-ONLY against the TEST project (slabs-queue-e2e-exdcz).
// PROVES: (1) median events-attended per user >= 4 ; (2) median journey-shift/upgrade-count >= 1.
const admin = require('firebase-admin');
const { TEST_PROJECT_ID, assertWritable } = require('../e2e/lib/test-project');
assertWritable(process.env.TEST_PROJECT || TEST_PROJECT_ID);   // refuse prod/shared
if (!admin.apps.length) admin.initializeApp({ projectId: TEST_PROJECT_ID }); // ADC, never the prod SA
const db = admin.firestore();
const RUN = process.env.JRNY_RUNID || 'jrny';
const median = (a) => { a = a.slice().sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; };

(async () => {
  // the cohort = every seeded participant profile_data doc for this run that is a participant
  const profiles = await db.collection('profile_data').where('testrunid', '==', RUN).get();
  const pids = profiles.docs.map((d) => d.id);

  // (1) events attended per profile, from event participation request (status=='attended')
  const epr = await db.collection('event participation request').where('testrunid', '==', RUN).get();
  const attBy = {}; pids.forEach((p) => (attBy[p] = 0));
  epr.forEach((d) => { const x = d.data(); if (x.status === 'attended' && x.profileid in attBy) attBy[x.profileid]++; });
  const attCounts = pids.map((p) => attBy[p]);
  const medianEvents = median(attCounts);

  // (2) shift/upgrade count per profile: #PJP with journeystatus in {upgraded,shifted,downgraded}
  //     OR (#distinct journeyref - 1) OR a JPP watsonpurchaselabel matching / to | upgrade/i
  const pjp = await db.collection('participantjourneyproduct').where('testrunid', '==', RUN).get();
  const upgBy = {}, jrefBy = {}; pids.forEach((p) => { upgBy[p] = 0; jrefBy[p] = new Set(); });
  pjp.forEach((d) => { const x = d.data(); const p = x.profileid; if (!(p in upgBy)) return;
    if (['upgraded', 'shifted', 'downgraded'].includes(x.journeystatus)) upgBy[p]++;
    if (x.journeyref && x.journeyref.id) jrefBy[p].add(x.journeyref.id); });
  const shiftCounts = pids.map((p) => Math.max(upgBy[p], jrefBy[p].size - 1));
  const medianShift = median(shiftCounts);

  const ge4 = attCounts.filter((n) => n >= 4).length;
  console.log(`cohort size: ${pids.length}`);
  console.log(`median events attended/user : ${medianEvents}  (>=4 ? ${medianEvents >= 4 ? 'PASS' : 'FAIL'})  | users>=4: ${ge4} (${Math.round(ge4 / pids.length * 100)}%)`);
  console.log(`median shift/upgrade count   : ${medianShift}  (>=1 ? ${medianShift >= 1 ? 'PASS' : 'FAIL'})`);
  // optional cross-checks: each profile has a queue_token, a participantdeliverysequence, >=1 deliverable completed.
  process.exit((medianEvents >= 4 && medianShift >= 1) ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
```

The script **exits non-zero** unless both medians pass, so CI can gate the seed. (Optional add-ons: assert every profile has exactly one `participantdeliverysequence/{pid}` and ≥1 `deliverables` with `status:'completed'`, and that the Watson-join string `watsonpurchaseid` is present on 100% of seeded `journeyproductpurchase`.)

---

## Part D — Open questions / risks

1. **The ≥4-events median is above prod's real median (1–2; only 19% attend ≥4).** Confirm the operator wants a deliberately *rich* synthetic cohort (test-fixture target) rather than a prod-faithful distribution. The blueprint makes it a tunable dial (B2-i).
2. **`eventref` is polymorphic** — it points at **`event collection` OR `queue generation`** in prod (A1/A3). The blueprint seeds events as `event collection` for cleanliness; if a spec asserts a queue-origin event (`type:queue` RSVP, 59% in prod), seed a few EPRs whose `eventref→queue generation/QG` too.
3. **CF rewrites of `participant metadata` / `participant mode checklist`.** The deployed `*_to_pmd` + `participantmode.js` CFs fire on the test project (validated/02 §7d; seen in `seed-modes.js`). Seed these as merge targets and let assertions read the CF-written values where deployed; where a CF is absent, assert the seeded precondition. (Some CFs are NOT deployed to test — `seed-modes.js` PM-09 skip-guards.)
4. **Watson is not a second project in test.** The blueprint models the cross-join as the `watsonpurchaseid`/`watsonpurchaselabel` *strings* on `journeyproductpurchase`. Any spec that drives a real Watson screen will hit the tolerated `getApp("watson")` throw (`seed-journey.js` header) — keep Watson out of the driven flows.
5. **`journeyref` is null on 98% of real EPRs** (validated/06 §14) — journey attribution is product-grain. The blueprint sets `EPR.productref` (→ family via the catalog) and leaves `journeyref` null to match; verification keys events off `profileid`, not `journeyref`.
6. **Volume / cost.** 200 users × (~4 events + ~3 content + queue + appt + 2 purchases + ladder) ≈ **6,000–8,000 docs**. Within a disposable test project's budget, but chunk the writes (the events seeder uses `INITIATE_CHUNK_SIZE=20`; `seed-test-project.js` writes serially) and consider `BulkWriter` for the seed pass.
7. **Group-capacity / index gaps.** Some screens need composite indexes (validated/05 group-capacity; `seed-modes.js` notes the `product mode config` composite index). The Phase-2 seeder must provision the same indexes the existing suites use, or queries throw.
8. **Determinism of the median.** With N=200 the median is the mean of the 100th/101st sorted values; the B2-i buckets put both in the Core band (≥4). If N changes, re-check the bucket sizes so the median index stays inside Core.

---

## Appendix — full probe sources (read-only; audit)

All five are also saved verbatim in this dir (`jb_probe1_purchase.js` … `jb_probe5_content.js`) and were run with `cd ~/solarcode/starlabs-svstats && node <probe>.js`. Each opens production with the **production SA** and uses **only** `.get()/.count().get()/.where().limit().get()` — no write/transaction/batch, no deploy, no ATC collection, no `firestore-atc`.

### jb_probe1_purchase.js
```js
// jb_probe1_purchase.js — READ-ONLY recon of the purchase/journey-entry data model.
// Production fir-sample-aae4a. ONLY .get()/.limit().get() are used. No writes, ever.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const typeOf = (v) => {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (v && v._seconds !== undefined) return 'Timestamp';
  if (v && v.constructor && v.constructor.name === 'DocumentReference') return `ref->${v.path}`;
  if (v && typeof v === 'object') return `object{${Object.keys(v).slice(0, 6).join(',')}}`;
  return typeof v;
};
const safeVal = (k, v) => {
  const t = typeOf(v);
  const lower = String(k).toLowerCase();
  const pii = ['email', 'name', 'phone', 'number', 'mobile', 'address', 'firstname', 'lastname'];
  if (pii.some((p) => lower.includes(p))) return `<redacted ${t}>`;
  if (t === 'string') return JSON.stringify(String(v).slice(0, 40));
  if (t.startsWith('ref->') || t === 'Timestamp' || t.startsWith('array') || t.startsWith('object')) return t;
  return JSON.stringify(v);
};
const dumpDoc = (label, id, data, onlyKeys) => {
  console.log(`  [${label}] id=${id}`);
  const keys = (onlyKeys || Object.keys(data)).sort();
  for (const k of keys) console.log(`     ${k}: ${typeOf(data[k])} = ${safeVal(k, data[k])}`);
};
(async () => {
  console.log('=== profile_data (sample 5) — key entry fields ===');
  const pd = await db.collection('profile_data').limit(5).get();
  const PROFILE_KEYS = ['profileid', 'docid', 'email', 'name', 'participantmode', 'currentjourney',
    'currentjourneyref', 'role_ref', 'user_ref', 'number', 'countrycode', 'profileimg'];
  let firstProfileId = null;
  pd.forEach((d) => { if (!firstProfileId) firstProfileId = d.id; dumpDoc('profile_data', d.id, d.data(), PROFILE_KEYS); });
  console.log('\n=== participantjourneyproduct (sample 5) — FULL field shape ===');
  const pjp = await db.collection('participantjourneyproduct').limit(5).get();
  pjp.forEach((d) => dumpDoc('PJP', d.id, d.data()));
  console.log('\n=== participantsproduct (sample 5) — FULL field shape ===');
  const psp = await db.collection('participantsproduct').limit(5).get();
  psp.forEach((d) => dumpDoc('PSP', d.id, d.data()));
  console.log('\n=== journeyproductpurchase (sample 5) — FULL field shape ===');
  const jpp = await db.collection('journeyproductpurchase').limit(5).get();
  jpp.forEach((d) => dumpDoc('JPP', d.id, d.data()));
  console.log('\n=== JOIN walk for one real profileid ===');
  const pjpAny = await db.collection('participantjourneyproduct').limit(50).get();
  let joinProfile = null;
  pjpAny.forEach((d) => { if (!joinProfile && d.data().profileid) joinProfile = d.data().profileid; });
  console.log('  chosen profileid (from a PJP):', joinProfile);
  if (joinProfile) {
    const myPjp = await db.collection('participantjourneyproduct').where('profileid', '==', joinProfile).limit(10).get();
    console.log('  participantjourneyproduct for this profile:', myPjp.size);
    myPjp.forEach((d) => console.log(`     PJP ${d.id}: journeyref=${typeOf(d.data().journeyref)} journeystatus=${JSON.stringify(d.data().journeystatus)} onboarded=${d.data().onboarded} purchaseref=${typeOf(d.data().purchaseref)} participantproducts=${typeOf(d.data().participantproducts)}`));
    const myPsp = await db.collection('participantsproduct').where('profileid', '==', joinProfile).limit(50).get();
    console.log('  participantsproduct for this profile:', myPsp.size);
    myPsp.forEach((d, i) => { if (i < 6) console.log(`     PSP ${d.id}: productref=${typeOf(d.data().productref)} status=${JSON.stringify(d.data().status)} mode=${JSON.stringify(d.data().mode)} deliverymode=${JSON.stringify(d.data().deliverymode)}`); });
  }
  console.log('\n=== counts ===');
  for (const c of ['profile_data', 'participantjourneyproduct', 'participantsproduct', 'journeyproductpurchase']) {
    const cnt = await db.collection(c).count().get();
    console.log(`  ${c}: ${cnt.data().count}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
```

### jb_probe2_shift.js
```js
// jb_probe2_shift.js — READ-ONLY: how a journey SHIFT/UPGRADE manifests, and what fraction of
// real users have >1 journey/product. Production fir-sample-aae4a. Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const tally = (o, k) => { k = k == null ? '(none)' : k; o[k] = (o[k] || 0) + 1; };
(async () => {
  const pjp = await db.collection('participantjourneyproduct').get();
  const statusDist = {};
  const byProfile = {};
  const upgradeFlags = { onreschedule: 0, hasUpgradeNote: 0 };
  pjp.forEach((d) => {
    const x = d.data();
    tally(statusDist, x.journeystatus);
    const pid = x.profileid;
    if (pid) (byProfile[pid] || (byProfile[pid] = [])).push({ j: x.journeyref ? x.journeyref.id : null, s: x.journeystatus });
    if (x.onreschedule === true) upgradeFlags.onreschedule++;
  });
  console.log('=== participantjourneyproduct journeystatus distribution (' + pjp.size + ' docs) ===');
  console.log('  ' + JSON.stringify(statusDist));
  const profiles = Object.keys(byProfile);
  let multiPjp = 0, multiDistinctJourney = 0, hasShiftedStatus = 0, hasUpgradedStatus = 0;
  for (const pid of profiles) {
    const rows = byProfile[pid];
    if (rows.length > 1) multiPjp++;
    const distinctJourneys = new Set(rows.map((r) => r.j).filter(Boolean));
    if (distinctJourneys.size > 1) multiDistinctJourney++;
    if (rows.some((r) => r.s === 'shifted')) hasShiftedStatus++;
    if (rows.some((r) => r.s === 'upgraded')) hasUpgradedStatus++;
  }
  console.log('\n=== multi-journey fraction (per profileid, ' + profiles.length + ' distinct profiles with a PJP) ===');
  console.log('  profiles with >1 PJP (any):           ' + multiPjp + ' (' + Math.round(multiPjp / profiles.length * 100) + '%)');
  console.log('  profiles with >1 DISTINCT journeyref:  ' + multiDistinctJourney + ' (' + Math.round(multiDistinctJourney / profiles.length * 100) + '%)');
  console.log('  profiles with a "shifted" PJP:         ' + hasShiftedStatus);
  console.log('  profiles with an "upgraded" PJP:       ' + hasUpgradedStatus);
  console.log('  PJPs flagged onreschedule:true:        ' + upgradeFlags.onreschedule);
  const jpp = await db.collection('journeyproductpurchase').get();
  let transLabel = 0, upgradeLabel = 0;
  const labelSamples = [];
  jpp.forEach((d) => {
    const l = (d.data().watsonpurchaselabel || '').toLowerCase();
    if (/\bto\b/.test(l) && !/onboarding/.test(l)) { transLabel++; if (labelSamples.length < 14) labelSamples.push(d.data().watsonpurchaselabel); }
    if (/upgrade/.test(l)) upgradeLabel++;
  });
  console.log('\n=== journeyproductpurchase.watsonpurchaselabel (' + jpp.size + ' docs) ===');
  console.log('  labels with a "<A> to <B>" transition shape: ' + transLabel);
  console.log('  labels containing "upgrade":                 ' + upgradeLabel);
  console.log('  sample transition labels: ' + JSON.stringify(labelSamples));
  const psp = await db.collection('participantsproduct').get();
  const pspStatus = {}; let hasNextmode = 0, hasMode = 0, hasStatusdateMulti = 0;
  const profileProductCount = {};
  psp.forEach((d) => {
    const x = d.data();
    tally(pspStatus, x.status);
    if (x.nextmode) hasNextmode++;
    if (x.mode) hasMode++;
    if (x.statusdate && Object.keys(x.statusdate).length > 1) hasStatusdateMulti++;
    if (x.profileid) profileProductCount[x.profileid] = (profileProductCount[x.profileid] || 0) + 1;
  });
  console.log('\n=== participantsproduct.status distribution (' + psp.size + ' docs) ===');
  console.log('  ' + JSON.stringify(pspStatus));
  console.log('  with mode set: ' + hasMode + ' | with nextmode set: ' + hasNextmode + ' | with multi-key statusdate (mode-progression trail): ' + hasStatusdateMulti);
  const counts = Object.values(profileProductCount).sort((a, b) => a - b);
  const at = (q) => counts[Math.floor(counts.length * q)] || 0;
  console.log('\n=== participantsproduct PER profileid (' + counts.length + ' profiles) ===');
  console.log('  min=' + counts[0] + ' p25=' + at(0.25) + ' median=' + at(0.5) + ' p75=' + at(0.75) + ' p90=' + at(0.9) + ' max=' + counts[counts.length - 1]);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
```

### jb_probe3_events.js
```js
// jb_probe3_events.js — READ-ONLY: events-attended-per-profileid distribution + what an
// "attended" event looks like. Production fir-sample-aae4a. Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const rid = (r) => (r && r.id ? r.id : (typeof r === 'string' ? r : null));
const pct = (arr, q) => arr[Math.floor(arr.length * q)] || 0;
(async () => {
  const epr = await db.collection('event participation request').get();
  const reqByProfile = {};
  const attByProfile = {};
  const statusDist = {};
  epr.forEach((d) => {
    const x = d.data();
    const pid = x.profileid;
    const st = x.status || '(none)';
    statusDist[st] = (statusDist[st] || 0) + 1;
    if (!pid) return;
    reqByProfile[pid] = (reqByProfile[pid] || 0) + 1;
    if (st === 'attended') attByProfile[pid] = (attByProfile[pid] || 0) + 1;
  });
  console.log('=== event participation request (' + epr.size + ') status: ' + JSON.stringify(statusDist));
  const allReq = Object.values(reqByProfile).sort((a, b) => a - b);
  const allProfiles = Object.keys(reqByProfile);
  console.log('\n=== REQUESTS per profileid (' + allProfiles.length + ' distinct profiles registered for >=1 event) ===');
  console.log('  min=' + allReq[0] + ' p25=' + pct(allReq, 0.25) + ' median=' + pct(allReq, 0.5) + ' p75=' + pct(allReq, 0.75) + ' p90=' + pct(allReq, 0.9) + ' max=' + allReq[allReq.length - 1]);
  const attendedProfiles = Object.keys(attByProfile);
  const attActive = Object.values(attByProfile).sort((a, b) => a - b);
  const attAll = allProfiles.map((p) => attByProfile[p] || 0).sort((a, b) => a - b);
  console.log('\n=== ATTENDED events per profileid ===');
  console.log('  over ALL ' + allProfiles.length + ' registered profiles:  min=' + attAll[0] + ' p25=' + pct(attAll, 0.25) + ' median=' + pct(attAll, 0.5) + ' p75=' + pct(attAll, 0.75) + ' p90=' + pct(attAll, 0.9) + ' max=' + attAll[attAll.length - 1]);
  console.log('  over the ' + attendedProfiles.length + ' profiles who attended >=1: min=' + attActive[0] + ' p25=' + pct(attActive, 0.25) + ' median=' + pct(attActive, 0.5) + ' p75=' + pct(attActive, 0.75) + ' p90=' + pct(attActive, 0.9) + ' max=' + attActive[attActive.length - 1]);
  const ge4 = attAll.filter((n) => n >= 4).length;
  console.log('  profiles attending >=4 events: ' + ge4 + ' (' + Math.round(ge4 / allProfiles.length * 100) + '% of registered)');
  console.log('\n=== sample ATTENDED event participation request docs ===');
  const attSample = await db.collection('event participation request').where('status', '==', 'attended').limit(3).get();
  attSample.forEach((d) => {
    const x = d.data();
    const fields = Object.keys(x).sort().map((k) => {
      const v = x[k];
      const t = v === null ? 'null' : (v && v._seconds !== undefined ? 'Timestamp' : (v && v.path ? 'ref->' + v.path : (typeof v === 'string' && k !== 'profileid' && k !== 'status' ? 'string' : JSON.stringify(v))));
      return k + '=' + t;
    });
    console.log('  EPR ' + d.id + ': ' + fields.join(' | '));
  });
  const rsvp = await db.collection('event rsvp').get();
  const rsvpResp = {}, rsvpType = {};
  const rsvpByProfile = {};
  rsvp.forEach((d) => {
    const x = d.data();
    rsvpResp[x.participantresponse || '(null)'] = (rsvpResp[x.participantresponse || '(null)'] || 0) + 1;
    rsvpType[x.type || '(none)'] = (rsvpType[x.type || '(none)'] || 0) + 1;
    if (x.profileid) rsvpByProfile[x.profileid] = (rsvpByProfile[x.profileid] || 0) + 1;
  });
  console.log('\n=== event rsvp (' + rsvp.size + ') participantresponse: ' + JSON.stringify(rsvpResp) + ' | type: ' + JSON.stringify(rsvpType));
  console.log('  distinct profiles with an rsvp: ' + Object.keys(rsvpByProfile).length);
  const rsvpSample = await db.collection('event rsvp').limit(1).get();
  rsvpSample.forEach((d) => console.log('  sample rsvp keys: ' + Object.keys(d.data()).sort().join(', ')));
  const ep = await db.collection('events_profiles').limit(1).get();
  ep.forEach((d) => console.log('\n=== events_profiles sample keys: ' + Object.keys(d.data()).sort().join(', ')));
  const et = await db.collection('arena e-ticket').limit(1).get();
  et.forEach((d) => console.log('=== arena e-ticket sample keys: ' + Object.keys(d.data()).sort().join(', ')));
  const ec = await db.collection('event collection').limit(1).get();
  ec.forEach((d) => console.log('=== event collection sample keys: ' + Object.keys(d.data()).sort().join(', ')));
  const ecCount = await db.collection('event collection').count().get();
  console.log('=== event collection count: ' + ecCount.data().count);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
```

### jb_probe4_delivery.js
```js
// jb_probe4_delivery.js — READ-ONLY: the delivery chain field shapes (queue_token /
// participantdeliverysequence / deliverables / appointments / availability / queue generation).
// Production fir-sample-aae4a. Only .get() used. No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const keys = (d) => Object.keys(d).sort().join(', ');
const shape = (x) => Object.keys(x).sort().map((k) => {
  const v = x[k];
  let t;
  if (v === null) t = 'null';
  else if (Array.isArray(v)) t = 'array[' + v.length + ']';
  else if (v && v._seconds !== undefined) t = 'ts';
  else if (v && v.path) t = 'ref->' + v.path.split('/').slice(0, 1)[0];
  else if (v && typeof v === 'object') t = 'obj{' + Object.keys(v).slice(0, 5).join(',') + '}';
  else if (typeof v === 'string') t = 'str';
  else t = JSON.stringify(v);
  return k + ':' + t;
}).join(' | ');
(async () => {
  console.log('=== queue_token ===');
  const qt = await db.collection('queue_token').limit(2).get();
  qt.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));
  const qtCount = await db.collection('queue_token').count().get();
  console.log('  count: ' + qtCount.data().count);
  console.log('\n=== participantdeliverysequence ===');
  const pds = await db.collection('participantdeliverysequence').limit(2).get();
  pds.forEach((d) => {
    const x = d.data();
    console.log('  sample ' + d.id + ' top keys: ' + keys(x));
    const prods = x.products || [];
    console.log('    products.length=' + prods.length);
    if (prods[0]) {
      console.log('    products[0] keys: ' + Object.keys(prods[0]).sort().join(', '));
      const del = prods[0].delivery || [];
      console.log('    products[0].delivery.length=' + del.length);
      if (del[0]) console.log('    products[0].delivery[0]: ' + shape(del[0]));
      const tcount = {};
      prods.forEach((p) => (p.delivery || []).forEach((dd) => { const key = (dd.type || '?') + '/' + (dd.status || '?'); tcount[key] = (tcount[key] || 0) + 1; }));
      console.log('    delivery type/status across this doc: ' + JSON.stringify(tcount));
    }
  });
  const pdsCount = await db.collection('participantdeliverysequence').count().get();
  console.log('  count: ' + pdsCount.data().count);
  console.log('\n=== deliverables ===');
  const del = await db.collection('deliverables').limit(3).get();
  del.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));
  const delCount = await db.collection('deliverables').count().get();
  console.log('  count: ' + delCount.data().count);
  const delS = await db.collection('deliverables').limit(1500).get();
  const ds = {}, dt = {};
  delS.forEach((d) => { const x = d.data(); ds[x.status || '?'] = (ds[x.status || '?'] || 0) + 1; dt[x.type || '?'] = (dt[x.type || '?'] || 0) + 1; });
  console.log('  status dist (1500-sample): ' + JSON.stringify(ds));
  console.log('  type   dist (1500-sample): ' + JSON.stringify(dt));
  console.log('\n=== appointments ===');
  const ap = await db.collection('appointments').limit(2).get();
  ap.forEach((d) => console.log('  sample ' + d.id + ': ' + shape(d.data())));
  console.log('\n=== availability (top-level keys of a sample) ===');
  const av = await db.collection('availability').limit(1).get();
  av.forEach((d) => {
    const x = d.data();
    const known = ['id', 'docid', 'starttime', 'endtime', 'profileref', 'appointments', 'weeklyhours'];
    const slotKeys = Object.keys(x).filter((k) => !known.includes(k));
    console.log('  top: ' + known.filter((k) => k in x).join(', '));
    console.log('  appt-type slot keys: ' + slotKeys.length);
    if (slotKeys[0]) { const s = x[slotKeys[0]]; console.log('  one slot: ' + JSON.stringify(Array.isArray(s) ? s[0] : s)); }
  });
  console.log('\n=== queue generation (top keys) ===');
  const qg = await db.collection('queue generation').limit(1).get();
  qg.forEach((d) => console.log('  keys: ' + keys(d.data())));
  const qgCount = await db.collection('queue generation').count().get();
  console.log('  count: ' + qgCount.data().count);
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
```

### jb_probe5_content.js
```js
// jb_probe5_content.js — READ-ONLY: what marks content consumption + journey progression.
// Production fir-sample-aae4a. Only .get(). No writes.
const admin = require('firebase-admin');
const KEY = '/Users/antano/solarcode/serviceAccountKeyProduction.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const PII = ['email', 'name', 'phone', 'number', 'mobile', 'address'];
const shape = (x) => Object.keys(x).sort().map((k) => {
  const v = x[k];
  let t;
  if (v === null) t = 'null';
  else if (Array.isArray(v)) t = 'array[' + v.length + ']';
  else if (v && v._seconds !== undefined) t = 'ts';
  else if (v && v.path) t = 'ref->' + v.path.split('/')[0];
  else if (v && typeof v === 'object') t = 'obj{' + Object.keys(v).slice(0, 5).join(',') + '}';
  else if (typeof v === 'string') t = PII.some((p) => k.toLowerCase().includes(p)) ? '<redacted str>' : 'str:' + JSON.stringify(v.slice(0, 24));
  else t = JSON.stringify(v);
  return k + ':' + t;
}).join(' | ');
const sampleColl = async (name, n = 1) => {
  try {
    const s = await db.collection(name).limit(n).get();
    if (s.empty) { console.log('  [' + name + '] EMPTY/absent'); return; }
    s.forEach((d) => console.log('  [' + name + '] ' + d.id + ': ' + shape(d.data())));
    const c = await db.collection(name).count().get();
    console.log('  [' + name + '] count: ' + c.data().count);
  } catch (e) { console.log('  [' + name + '] ERR ' + e.message); }
};
(async () => {
  console.log('=== CONTENT CONSUMPTION collections ===');
  await sampleColl('content analytics', 2);
  await sampleColl('participant content analytics', 2);
  await sampleColl('productconsumptionlog', 2);
  await sampleColl('solarvoice contentanalytics', 1);
  await sampleColl('recommended mix playlist', 1);
  console.log('\n=== JOURNEY PROGRESSION collections ===');
  await sampleColl('participant mode checklist', 2);
  await sampleColl('accelerated evolution level', 2);
  await sampleColl('participant AEL', 1);
  await sampleColl('modes', 2);
  console.log('\n=== participant metadata (the CQRS projection) ===');
  const pm = await db.collection('participant metadata').limit(2).get();
  pm.forEach((d) => console.log('  [participant metadata] ' + d.id + ': ' + shape(d.data())));
  const pmCount = await db.collection('participant metadata').count().get();
  console.log('  [participant metadata] count: ' + pmCount.data().count);
  console.log('\n=== modes catalog (ordered) ===');
  const modes = await db.collection('modes').get();
  const ml = [];
  modes.forEach((d) => { const x = d.data(); ml.push({ mode: x.mode, sequence: x.sequence }); });
  ml.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  console.log('  ' + JSON.stringify(ml));
  console.log('\n=== content analytics status/type distribution (1000-sample) ===');
  const ca = await db.collection('content analytics').limit(1000).get();
  const cs = {}, ct = {};
  ca.forEach((d) => { const x = d.data(); cs[x.status || '?'] = (cs[x.status || '?'] || 0) + 1; ct[x.type || x.platform_name || '?'] = (ct[x.type || x.platform_name || '?'] || 0) + 1; });
  console.log('  status: ' + JSON.stringify(cs));
  console.log('  type/platform: ' + JSON.stringify(ct));
  process.exit(0);
})().catch((e) => { console.error('ERR', e.message, e.stack); process.exit(1); });
```
