# 06 · Events, Arena & Calendar — OPERATOR-VALIDATED (draft for sign-off)

> **Status: DRAFT for operator sign-off, 2026-06-10** (concept group #6). Code + read-only production data investigated 2026-06-10 against `production` (Angular) + the CF repo on `development`; cross-checked with the e2e recon (`e2e/recon-allcomp/events-arena.md`) and the green `e2e/events/` suite (6/6). Every quantitative claim carries a probe.
> Evidence (in-repo): probes + outputs in `specs/journals/2026-06-10-events-arena-artifacts/`. Supersedes `specs/QUEUE-AND-BIG.md`/`LIVE-STUDIOS.md` event sections.

## 1. What the Events/Arena system is
The **uP!-event venue** — the live (in-person or virtual) event a participant reaches *after* the queue journey. It covers: event definition, the **arena** (zones / spaces / layers / seating), **RSVP & participation approval**, **e-ticketing + QR check-in**, **VideoAsk highlights**, and **BIG-mode** event orchestration (cohorts, mentors, levels). It is the *destination* the Queue (#3) readies participants for.

Components live under `src/app/Events/**` (+ `src/app/queue system/initiate-event-product`, `event-opportunity-dashboard-v2`; `src/app/big/create-arena-space`; `bigeventmentor`). Backend triggers in the CF repo (`participantmetadata.js`, `participantproduct.js`, `participantmode.js`). **Two live-dashboard versions exist — V2 is LIVE, V1 is the dead clone** (`live-event-dashboard-v2` routed; v1 deprecated). `event-opportunity-dashboard-v2` is likewise the live one.

## 2. The participation lifecycle — the state machine
A participant's journey to an event runs through two linked records:

**(a) `event rsvp`** — the intent. `participantresponse` ∈ {yes, no}; `type` ∈ {queue, event}.
- Production (8,766): **92% "yes"** (8,045) / 7% no / 1% null. `type`: **queue 59%** (RSVP triggered by queue readiness) / **event 41%** (direct event RSVP).

**(b) `event participation request`** — the registration + attendance record. `status` ∈ {requested → approved → attended | unattended} (+ rare `denied`/`initiated`):

| status | meaning | production (of 15,717) |
|---|---|---|
| **attended** | checked in / marked present | **7,133 (45%)** |
| **unattended** | approved but no-show | **3,844 (24%)** |
| **requested** | signed up, awaiting approval | **3,060 (19%)** |
| **approved** | approved, event not yet held/marked | **1,673 (11%)** |
| denied / initiated | rejected / in-init | 3 / 4 |

→ **45% attendance, 24% no-show** among registered. On **attend**, `deliverables.status → completed` and `events_profiles` denorm is written; a CF (`eventparticipationdata_to_pmd`) projects into `participant metadata`. **⚠ Known code bug (recon + code):** the **bulk-approve `batch.commit()` is commented out** (`event-participation-approve.component.ts:420-427`) — only `markAsAttended()` actually commits; bulk approve is a no-op (see §12-Q1).

## 3. E-ticketing & check-in
- **`arena e-ticket`** (2,127) — per-participant ticket: `producteligible[]`, `active` (toggle), `eventstart/enddate`, `eventparticipationref`. **99% active**; **64% cover 1 product**, 31% cover 2.
- **`arena e-ticket log`** (9,917 scans) — QR check-in audit (`docid` = QR uniqueid, dedup key). Concentrated on **8 events** (the big in-person uP! events) across **940 distinct participants** — ~10.5 scans/participant (re-scans per product/zone). Scanned by `qr-scanner` (`/qr-scanner`); a valid scan requires the ticket `active` + within the date window + not a duplicate.

## 4. The arena layout
- **`arena events`** (218) — **per-product sub-events** under an event (`eventref`, `productref`, `deliveryref`, `startdate/enddate`, `type`, `venue`). An `event collection` links them via `arenaeventidlist[]` (present on **50 of 97** events).
- **`event participant zones`** (637, 100% carry `selectedzone`) + **`event zones`** (10: `zonename`, `mentors`, `coordinators`, `cohorts`) + **`event participant zones logs`** (19,255 audit) — seating/zone assignment.
- **`arenalayers`** (17) — event content layers (e.g. breakout sessions).
- **`arenaspace`** (93) — **BIG-mode** session assignments: `participantslist[]`, `mentor`, `pivottype`, `cohortsid`, `marathonref`, `validated` (authored in `create-arena-space`).

## 5. The Queue→Event bridge (`initiate-event-product`)
The seam from #3: `initiate-event-product` (`/initiateeventproduct`) takes queue-ready participants with an uninitiated `participantsproduct` and, on **Initiate**, batch-writes `participantsproduct.status → "initiated"` (+ `eventref`, `arenaeventid`, `deliverytype`, `queuevariationid`) and creates `event participation request` (status approved) — firing CF `participantsproductinitiated`. Chunked (`INITIATE_CHUNK_SIZE=20`, 5s delay). The **join key from the queue is `arenaeventidlist`** on `event collection` (and `queue generation.arenaeventidlist`, cf. `03` §5).

## 6. VideoAsk & highlights (participant submissions)
- **`arenavideoask`** (51) — VideoAsk template per event (`questionurl`, `questiontype`).
- **`participantvideoask`** — participant submissions, tagged; tagging writes `participant metadata.profiletags` + `participant tag logs` (denorm + audit) from `videoask-display`.
- **`arena highlights`** (62) — curated/pinned participant moments shared to an event feed (`pinned`, `postmessage`, `significance`, `consequence`).

## 7. The "Calendar" — clarification (there is **no** standalone event calendar)
**Finding:** there is **no distinct events-calendar UI.** The only calendar component in the app is the **appointment calendar** (#5, `Scheduling/appointment-calendar`). Events are surfaced as a **date-filtered list** (`event-list` ordered by `start_date`; `qr-scanner`/dashboards filter `end_date >= now`). So **"Calendar" in this group's name = the date dimension across Appointments (#5) + Events**, not a separate subsystem. Of 97 events, **93 are past, 4 upcoming/ongoing** (this is a mature, historical dataset). `event collection` carries `lastregistrationdate` (82%), `hosts` (99%), `addtocalendar`/`notifyparticipants` flags, and an optional `atcmodel` (reference-only, **not enforced** — ATC-safe config).

## 8. Cloud Functions (event-related, `development`)
| CF | Trigger | Effect |
|---|---|---|
| `eventparticipationdata_to_pmd` | write `event participation request/{id}` | project into `participant metadata` (CQRS, cf. `02 §7d`) |
| `participantsproductinitiated` | write `participantsproduct/{id}` | downstream queue_token / delivery wiring on Initiate |
| `onEventApprovalProductMode` | `event participation request` status change | participant-mode side-effects (`participantmode.js`) |
| `onEventDateChange` *(low-confidence)* | update `event collection/{id}` | downstream token/invite refresh |

## 9. Data model (event collections)
| Collection | Docs (2026-06-10) | Role |
|---|---|---|
| `event collection` | 97 | the event master (dates, venue, hosts, `arenaeventidlist`, registration window) |
| `arena events` | 218 | per-product sub-events |
| `event participation request` | 15,717 | registration + attendance state machine (§2) |
| `event rsvp` | 8,766 | RSVP intent (yes/no; queue/event) |
| `arena e-ticket` · `arena e-ticket log` | 2,127 · 9,917 | tickets · QR check-in audit |
| `event participant zones` · `event zones` · `…zones logs` | 637 · 10 · 19,255 | seating/zone assignment + audit |
| `arenaspace` · `arenalayers` | 93 · 17 | BIG-mode sessions · event content layers |
| `arenavideoask` · `participantvideoask` · `arena highlights` | 51 · — · 62 | VideoAsk templates · submissions · highlights |
| `events_profiles` · `events_hosts` · `event_token_user` · `event users` | 7,845 · 9 · 102 · 24 | attendance denorm · hosts · token map · event users |
| `bigeventmentor` · `bigeventparticipantsplan` · `big aggregate event level` | 2 · 5 · 1,145 | BIG event mentors · participant plans · level aggregate |
| `delivery events` · `event location` | 42 · 6 | delivery-event catalog · venue list |

## 10. Relationships / boundaries
- **Queue (#3) → Events:** the queue *readies participants for the uP! event*; the bridge is `initiate-event-product` + the `arenaeventidlist` join (§5). RSVP `type:queue` (59%) shows most RSVPs originate from queue readiness.
- **Journey/Products (#1/#2):** `arena events.productref`/`deliveryref` tie events to product delivery; attendance completes `deliverables`. Event "modes" (Installation Event / BIG) come from the product mode taxonomy (`02`).
- **BIG:** BIG-mode events use `arenaspace` + `bigeventmentor` + `bigeventparticipantsplan` + `big cohorts` (cohorts/mentors/levels).
- **Appointments (#5):** **sibling, no cross-writes** — appointments are scheduled 1:1 delivery; events are group experiences. Separate calendars/records.
- **Participant metadata:** event participation + videoask tags denormalize into `participant metadata` (CQRS projection, `02 §7d`).

## 11. Evidence log
| Claim | Evidence | Source |
|---|---|---|
| participation 45% attended / 24% unattended / 19% requested / 11% approved | status tally (15,717) | `event_runtime_probe.js` |
| RSVP 92% yes; type queue 59% / event 41% | tally (8,766) | `event_runtime_probe.js` |
| e-tickets 99% active; 64% single-product | tally (2,127) | `event_runtime_probe.js` |
| check-in: 9,917 scans, 940 profiles, **8 events** | distinct-set count | `event_runtime_probe.js` |
| 97 events (93 past / 4 upcoming); 50 link arena sub-events | tally | `event_runtime_probe.js` |
| zones 100% assigned; 19,255 zone-log audit | tally | `event_runtime_probe.js`/`event_discover.js` |
| bulk-approve commit commented out (bug) | code | `event-participation-approve.component.ts:420-427` |
| Queue→Event bridge = initiate-event-product + arenaeventidlist | code | `initiate-event-product.component.ts:312-519`; `event collection.arenaeventidlist` |
| no separate event calendar | code review | Explore map §D |

## 12. Open questions (operator walkthrough)
1. **🐞 Bulk-approve is a no-op** (`event-participation-approve.ts:420-427` commit commented out) — is approval done one-by-one on purpose, or is this a latent bug? (mirrors the #4 §3a kind of finding the e2e surfaced.)
2. **19% still `requested` + 11% `approved`-not-attended** — backlog of un-actioned registrations, or expected tail on past events?
3. **RSVP `type` queue vs event** (59/41) — confirm the two RSVP origins (queue-readiness auto-RSVP vs participant-initiated).
4. **Zones** (`event zones`/`participant zones`) — how seating/zone eligibility is decided (cohort-driven?), and the role of the 19,255-row zone log.
5. **`atcmodel` on `event collection`/`big aggregate event level`** — reference-only today; confirm it never drives an enforced ATC path here (stay off ATC data).

## 13. E2E coverage (the green `e2e/events/` suite — 6/6)
Covers the event spine; recon at `e2e/recon-allcomp/events-arena.md` (test cases EVT-*). **Known harness notes from recon:** no `data-testid`s (selector fallback), the **ZXing QR scanner can't run headless** (inject the payload via `component.onCodeResult(...)`), CFs not all deployed to the test project, and `arena e-ticket log` does a full-collection scan. **Deferred** there: QR/initiate multi-step flows. Reconcile doc↔test in a later pass (as for #4 §11).
