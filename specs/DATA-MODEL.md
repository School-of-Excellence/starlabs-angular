# DATA-MODEL.md — StarLabs Firestore data model (Tier-A locked set + ROLE dimension)

> The catalog of trusted collections, each tagged by **ROLE** (CONFIG / RUNTIME-STATE / TRANSACTIONAL) on top of its **reliability tier**, with the **schema** (from a read-only 100-doc sample), the **reference/join keys**, and the **write-owner screens**.
>
> **Provenance:** schema + fill-rates from a read-only production probe 2026-06-02 (`fir-sample-aae4a`), raw in `specs/evidence/schema_samples.json` (regenerate: `specs/evidence/probe_schema.js`). Reliability tiers per `specs/data-reliability.md` (**DRAFT — pending engineer lock**; counts/shapes are observable now regardless). Write-owners from `specs/operator-screens.md` (100% code-evidence). ATC collections are excluded by policy and never appear here as usable.
>
> **Fill% = share of the 100-doc sample where the field is non-null.** "Recency" uses the *semantically correct* time field per collection (noted), because some collections carry a sparse/stale `updated` that misleads (e.g. `participantjourneyproduct.updated` is 0% live — use `subscriptionstart`).

## Legend
- **ROLE** — **C**=CONFIG (behavior knobs, see `CONFIGURATION.md`) · **R**=RUNTIME-STATE (a live entity's position) · **T**=TRANSACTIONAL/LOG (events/audit).
- **Tier** — A=reliable/lock-on · B=partial/use-with-care · C=broken/do-not-use.
- `ref→X` = Firestore DocumentReference to collection X. `id:X` = string id keying into X.

---

## 1. Commercial / journey lifecycle  (anchor — `JOURNEY-LIFECYCLE.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by (screens) |
|---|---|---|---|---|---|---|
| `participantjourneyproduct` | R | A | 5,141 | profileid 100, subscriptionstart 100(t0), subscriptionend 100, journeystatus 94, journeyref 92, onboarded 59, purchasedate 58, opportunities 29 | `profileid`, `journeyref`→journey, `productref[]`→products, `purchaseref`, `salesleadsref`→salesleads | participantpurchase/:pid, participants-analytics, JourneycoachDashboard-new |
| `participantsproduct` | R | A | 38,503 | profileid 100, productref 100, packageref 100, subscriptionstart 100, deliverymode 100, sequenceorder 100, status 79, queuevariationid 18, eventref 41 | `profileid`, `productref`→products, `packageref`→package, `queuevariationid`→queue variation, `eventref`→arena events | bookappointment, dynamicstudio, queuetransfer, event_participation_approve |
| `participant metadata` | R | A | 3,312 | profileid 88, name/email 88, customerstatus 87, productmode[] 85, pp_totalpaid 85, addons[] 85 | `profileid` (denormalized profile for dashboards) | participants-analytics, JourneycoachDashboard-new, productinitiated-dashboard |
| `salesleads` | R | A | 4,339 | name/email/phone 100, status 100, journeytype 100, date 100(t0), profileid 99, totalpurchasevalue 99, journey 93 | `profileid`, `participantjourneyproductid` (→ on approval) | salesleads, JourneycoachDashboard-new, onboardingremarks |

Recency: `participantjourneyproduct` by `subscriptionstart` = 336/90d (NOT `updated`=0). `salesleads` by `date` = 418/90d. `participantsproduct` by `subscriptionstart` = 2,189/90d (`subscriptionend` extends to 2029 — future-dated subscriptions are normal).

## 2. Identity / access  (`AUTH-ROLES.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `profile_data` | R | A | 3,248 | profileid 100, name/email 100, role_ref 100, participantmode 100, created 100, user_ref 70 · **DEAD: currentjourney/currentjourneystatus/currentproductstatus = 0%** | `role_ref`→**users_roles**, `user_ref`→user_data | contentupload, login, profile mutations |
| `users_roles` | C | A | 3,252 | per-user boolean auth-role flags (~13 fields; e.g. `participant:true`) | target of `profile_data.role_ref` | (admin role tools) |
| `user_data` | R | A | 2,257 | number/name/email 100; rest ~1% (thin auth→profile map) | keyed by Firebase Auth `uid` | login |
| `new_user_data` | R | A | 625 | uid/profileid/name/email 100, status 100, created 100(t0), subscriber 88 | `profileid`, `uid` | customer-support, workshop screens |
| `eisroles` | C | A | 166 | role 100, experiencestage 64, experiencelevel 61 (**specialist role defs — not auth**) | `id`; used by Roles-To-EIS | appointmentrole |
| `FCM_token` | R | A | 8,940 | active 100, FCM_id 100, uid 100, device_os 100, last_modified 100(t0; 4,369/90d), profile_ref 99 | `profile_ref`, `user_ref`, `uid` | (FCM background + dynamicqueuemanager) |

## 3. Scheduling / 1:1 delivery  (`SCHEDULING-DELIVERY.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `appointments` | T/R | A | 10,312 | starttime/endtime 100, appointment 100, hosts[] 100, attended 100, cancelled 100, created 100(t0; 1,380/90d), participantproductid 78, productid 73 | `appointment`→appointmenttype, `participantproductid`→participantsproduct, `productid`→products, `bookedby`/`hosts`→profile | bookappointment, appointment-status-update, dynamicstudio |
| `availability` | R | A | 20,782 | starttime/endtime 100, profileref 100, appointments[] 100, plus per-appttype slot arrays | `profileref`→profile, `appointments[]`→appointmenttype | appointmentavailability, bookappointment |
| `offtime` | R | A | 125 | date 100, profileid 100, starttime/endtime 100, fullday 100, status 66 | `profileid` | offtime, approveofftime |
| `deliverables` | R | A | 30,738 | type 100, deliveryref 100, fileref[] 96, profileid 95, participantproductid 95, status 84 | `profileid`, `participantproductid`, `deliveryref` | bookappointment, participant-delivery-sequence, dynamicstudio |
| `participantdeliverysequence` | R | A | 3,294 | profileid 100, products[] 100 (doc id == profileid) | `profileid`; products[].sequenceref/deliverypath | bookappointment, participant-delivery-sequence/:pid, journeysupport/:pid |

## 4. Queue / workflow  (`QUEUE-AND-BIG.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `queue generation` | **C** | A* | 96 | stages[] 100, queueadmin[] 100, queuename 100, modified 99, queuevariation[] 92, stageproperty{} 89, queuetargetcapacity 89 | drives the stage machine; `queuevariation[]`→queue variation | queue-list, queue-web, userprofile (\*new-queue *creation* stalled since 2025-08; configs still *modified* — TD-008) |
| `queue variation` | **C** | A | 183 | variationname 100, queueref 100, stages[] 100, atcmodel 65 | `queueref`→queue generation | queuebigplanner |
| `queue_token` | **R** | A | 7,046 | profile_id 100, queueref 100, tokenstatus 100, currentstage 99, previousstage 94, variationid 87, studioid/liveassignmentid (sparse) | `profile_id`, `queueref`→queue generation, `variationid`→queue variation, `productref`→products, `liveassignmentid`→live assignment | dynamicqueuemanager, dynamicstudio, queue-web, formbasedsubmission |
| `queue stage log` | **T** | A | 68,662 | currentstage/previousstage 100, profile_id 100, queueref 100, createdon 100(t0; 3,552/90d), logdocid 100, variationid 86, manuallymoved 31 | `profile_id`, `queueref`, `logdocid` | dynamicqueuemanager, dynamicstudio, participantevolution (via AuthguardService.moveQueueStage) |
| `queue activity log` | T | A | 8,283 | participantid 100, activitydate 100(t0), atcmodel 100, queueid 100, activity 100 | `participantid`, `queueid`, `sourceref` | bigactivitymonitor, bigactivitylog |
| `queue studio pairing` | R | A | 2,335 | participantsactivity{} 100, queueref 100, participants[] 100, created 100, studioin 100, openvidu 28 | `queueref`, `participants[]` | arenastudioactivity, dynamicstudio, queuebigplanner |
| `cohorts queue planner` | R | A | 46 | profileid 100, queueid 100, selectedslots[] 100 | `profileid`, `queueid` | queue-planner, queue-planner-review |

## 5. Live studios  (`LIVE-STUDIOS.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `arenaspace` | **C** | A | 93 | spaceid 100, mentor[] 100, pivottype 100, eventref 100, participantslist[] 100, validated 100 (last write 2025-09) | `eventref`→event collection | create-arena-space, view-arena-space |
| `live assignment` | **R** | A | 12,787 | participantid 100, queueid 100, stagename 100, pairing[] 100, status 100, zoomdata{} 87, studioid 71, signature 55, stagetype 29 | `participantid`(=profileid), `queueid`, `studioid`; doc id ↔ `queue_token.liveassignmentid` & `openviduroom` id | dynamic-studio, arenastudioactivity, dynamicqueuemanager |
| `arena participant` | R | A | 1,239 | pairingmode 100, queueid 100, profileid 100, stagerole[] 100, status 100, liveassignmentstatus 21 | `profileid`, `queueid` | dynamicqueuemanager (writes liveassignmentstatus) |
| `openviduroom` | R | A | 102 | sessionid 100, roomid 100, hosts[] 100, active 100, roomstatus 92, recordingstatus 79, egressInfo{} 78, participantjoined[] 79 (98/102 in last 90d) | doc id often == `live assignment` id; `roomid`, `sessionid` | participantstudio, appointmentstudio, AuthguardService.createOpenViduRoom |

## 6. BIG operations  (≠ the broken level rollups — `QUEUE-AND-BIG.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `big cohorts` | R | A | 345 | createddate 100, marathonref 100, name 100, participantidlist[] 100, cohortType 46, status 46 | `marathonref`, `eventref`, `participantidlist[]` | bigcohorts, arena_space |
| `big cohorts log` | T | A | 6,107 | createddate 100(t0; 1,392/90d), cohortid 100, addedby 100, status 100, level 100, profileid 99 | `cohortid`, `profileid`, `marathonref` | bigcohorts |
| `big assignment` | R | A | 63 | description 100, start/enddate 100, assignmenttype 100, participantidlist[] 100, cohortsref 100, marathonref 100, status 100 | `cohortsref`, `marathonref`, `participantidlist[]` | particiant_assignment_board, validateParticipantAssignments |
| `big participants assignments` | R | A | 484 | profileid 100, assignmentref 100, status 100, cohortsref 100, marathonref 100 | `profileid`, `assignmentref`→big assignment, `cohortsref` | formbasedsubmission, manualassignment, bigcohorts |
| `biginvitation` | R | A | 1,601 | created 100, eventref 100, eventtype 100, expirydate 100, profileid 100, status 100, productref 100 | `profileid`, `eventref`, `productref` | bigcohorts, queuebigplanner |

## 7. Content / engagement  (`CONTENT-ENGAGEMENT.md`)
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `content analytics` | T | A | 278,752 | profileid 100, videoname/videoid 100, totaltimespend 100, logdate 100(t0; 47,622/90d), playlistid 84, **type 81** (solarvoice/eiflixcontent/…) | `profileid`, `videoid`, `playlistid` · **READ-ONLY in web app — written by mobile/backend** | (none in this repo; contentanalytics screen reads) |
| `participant touchpoint` | T | A | 89,243 | label 100, touchpoint 100, profileid 100, parentreference 100, metadata{} 100, logdate 100(t0; 26,835/90d) | `profileid`, `parentreference` | participanttouchpoint (read); coach interactions |
| `recommended mix playlist` | R | A | 9,446 | profileid 100, title 100, bufferdocref 100, type 100, list[] 100, personalised 100, date 100(t0) | `profileid`, `bufferdocref` | recommendedplaylist |
| `episodes` | C-catalog | A | 502 | id 100, title 99, videoUrl 99, hsl_* 99, date 100(t0), series[] 62, duration 56 | `series[]` | videodashboard, addseries, editseries |
| `series` | C-catalog | A | 53 | seriesName 100, sequence[] 100, tier[] 100, order 100, imageUrl 100, category 40 | `tier[]`→tier, `category`→ref | seriesdashboard, addseries, assigncategory |
| `solar voice playlist` | C-catalog | A | 56 | name 100, description 100, sequence[] 100, date 100(t0), private 96, likedby[] 59 | `sequence[]`→solar voice audios | audiodashboard, edit/add-playlist |
| `solar voice audios` | C-catalog | A | 49 | name 100, url 100, size/duration 100, date 100(t0), segmentCount 47 | `id` | content-upload-v2 |
| `evolutionmappingvideo` | R | A | 1,526 | title 100, videourl 100, profileid 100, deleted 100, created 100(t0; 539/90d) | `profileid` | queue-web, userprofile, evolutionmapping |
| `liveevolutionmapping` | R | A | 538 | profileid 100, title 100, videolist[] 100, live 100, created 100(t0) | `profileid` | evolutionmapping, participantevolution |
| `tier access config` | **C** | A | 12 | productaccess{} 100, tieraccessby 92, tierid 92, biglevel[] 75 | `productaccess{journeyid:[{productid,count}]}` | viewparticipantstieraccess, tieraccessconfig |
| `tier` | C | A | 13 | tier 100, date 100, order 77, eligibility/up/down msgs 69-77 (slowing: 0/90d) | `id` | accessscreen, addseries |

## 8. Events / zones
| Collection | ROLE | Tier | Count | Key schema (fill%) | Refs / join keys | Written by |
|---|---|---|---|---|---|---|
| `event collection` | R | A | 97 | name 100, start/end_date 100, venue 100, event_id 100, hosts[] 99 (forward-dated) | `event_id`; referenced by arena events, queue, big | create_event |
| `event participation request` | T/R | A | 14,824 | profileid 100, doccreateddate 100(t0; 4,415/90d), productref 100, eventref 100, status 100, participantproductid 51 | `profileid`, `productref`, `eventref` | initiateeventproduct, liveeventhealth, dynamicqueuemanager |
| `arena events` | R | A | 218 | venue 100, start/enddate 100, productref 100, eventref 100, eventname 100, deliveryref 100 (forward-dated) | `eventref`, `productref`, `deliveryref` | queuelist, queuetransfer |
| `event zones` | R | A | 10 | coordinators[] 100, mentors[] 100, eventref 100, zonename 100, status 100, cohorts[] 90 | `eventref`, `cohorts[]` | eventzonemanagement |

## 9. System / audit
| Collection | ROLE | Tier | Count | Key schema (fill%) | Notes |
|---|---|---|---|---|---|
| `notificationrecord` | T | A | 82,801 | title/message 100, notificationtype 100, profileid[] 100, date 100(t0; 23,662/90d), success 100, FCM success/fail arrays | push/notification audit |

## 10. Catalog / reference (CONFIG — see `CONFIGURATION.md` for shapes + config→behavior)
`journey` (48, C), `products` (104, C), `package` (49, C), `appointmenttype` (108, C), `journey-to-product` (41, C), `productToDeliverySequence` (85, C), `procedures` (34, C), `delivery events` (42, C), `delivery forms` (84, C), `modes` (15, C), `dashboard` (23, C), `tier access config` (12, C), `AppointmentType-To-Roles` (102, C), `Roles-To-EIS` (102, C), `biglevel` (20, C — defs only), `accelerated evolution level` (11, C), `bigactivity` (33, C), `classify` (36, C). Most carry no write-timestamp (authored once / rarely).

---

## 11. Reference / relationship map (the join keys)
```
profile_data ──role_ref──▶ users_roles (auth role flags)
profile_data ──user_ref──▶ user_data (Firebase uid)
profileid (string)  ── the universal participant key on: participantjourneyproduct, participantsproduct,
                       participant metadata, salesleads, deliverables, queue_token(.profile_id),
                       queue stage log(.profile_id), live assignment(.participantid), arena participant,
                       content analytics, participant touchpoint, evolutionmapping*, big participants assignments
participantjourneyproduct ──journeyref──▶ journey ;  ──productref[]──▶ products ;  ──salesleadsref──▶ salesleads
participantsproduct ──productref──▶ products ; ──packageref──▶ package ; ──queuevariationid──▶ queue variation
appointments ──appointment──▶ appointmenttype ; ──participantproductid──▶ participantsproduct ; ──productid──▶ products
deliverables ──participantproductid──▶ participantsproduct ; ──deliveryref──▶ (delivery doc)
queue_token ──queueref──▶ queue generation ; ──variationid──▶ queue variation ; ──liveassignmentid──▶ live assignment
queue stage log ──queueref──▶ queue generation  (log of queue_token moves; logdocid == token docid)
live assignment  doc-id ══ queue_token.liveassignmentid ══ openviduroom doc-id   (the studio↔room↔token join)
AppointmentType-To-Roles ──assigned_appttype_ref──▶ appointmenttype ; Roles-To-EIS ──assigned_role_ref──▶ role ; .assigned_eis[]──▶ specialists
tier access config .productaccess{ journeyid: [{productid,count}] }  (gates content per tier)
dashboard .children[] / .roles[] / .profileid[]   (nav tree + per-route ACL)
```

## 12. Tier-C — BROKEN / SUPERSEDED · DO NOT USE (counts confirmed 2026-06-02)
| Collection | Count | Last write | Why excluded |
|---|---|---|---|
| `big aggregate level` | 695 | 2026-05-30 (506/365d) | base still written but **forked** into the stale variants below → no single source of truth (TD-002) |
| `big aggregate levelv2` | 632 | 2025-04-26 (0/365d) | STALE fork |
| `big aggregate level archives` | 6 | 2025-06-19 | stale archive |
| `big aggregate level archivesv2` | 5 | 2025-04-26 (0/365d) | stale archive |
| `big aggregate event level` | 1,145 | 2025-06-13 (3/365d) | effectively stale |
| `participantJourneySequence` | 1,495 | 2024-11-27 (0/365d) | superseded by `participantjourneyproduct` |
| `userAccessCounts` | 56,668 | 2024-10-15 (0/365d) | screen-view telemetry stopped (TD-007) |
| `eiflix workshop` | 2 | 2024-08-05 | legacy; superseded by New-Workshop |
| `collectionname` | 0 | — | empty (TD-007) |
| `big marathon` | 10 | 2026-08-01 (2/365d) | minor/deprecated |
| `profile_data.currentjourney*` | — | — | **dead derived fields, 0% fill** — writer `profileCurrentData` has zero callers; use `participantjourneyproduct.journeystatus` (TD-003) |

> Evidence for all counts/recency: `specs/evidence/schema_samples.json` (`.tierC`) + `specs/DATA-MODEL-evidence/evidence.json`.

## Open questions (engineer validation)
1. `participantsproduct.subscriptionend` up to 2029 — confirm future-dating is intentional (pre-paid multi-year).
2. `deliverables`/`participantdeliverysequence` have no write-timestamp — confirm they're regenerated vs. appended.
3. `recommended mix playlist` — treat as derived (regenerable) or authoritative?
