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

## 14. Participant journeys THROUGH events & arena (data-mapped 2026-06-10)
> Mapped from all 15,770 `event participation request` records. **Join note:** `journeyref` is null on **98%** of requests, so journey attribution is derived at the **product grain** (`productref → products.product`), then bucketed into journey families by name. Probes: `event_journey_map.js`, `event_family_map.js`.

### 14a. 🔑 Structural finding — "events" are TWO categories
Classifying products by attendance rate splits the event system cleanly:
- **Readiness gates** (<35% attended — *virtual funnel/qualification steps*, "attended" is **not** the terminal): **Evolution Prep (19%, n=4,762)** — the single biggest event by volume — plus Evolution Mapping Activity (12%), B!G Readiness Masterclass (17%), CPM (34%), Conversational Programming Masterclass/Workshop (0%), Scope Enhancement Workshop (0%), Mega Consultation (0%).
- **Live arenas** (≥35% attended — *the in-person destinations*): uP! Live Event (74%, n=3,648), uP! Arenas (79–96%), **CTD Live (99%)**, Mini uP! (88%), B!G Accelerator Arena (47%), Winning Heart (72%), CPM Live Readiness (91%), Mega Consultation B!G (96%).
- **Future** (0%, not yet held): A&H Installation Concert Jan 2026, uP! Live Event July 2026.

This **explains the §2 aggregate** (45% attended / 24% no-show): it blends low-attendance gates with high-attendance arenas. The readiness-gate category was invisible in the code-only view.

### 14b. Journey family → events
| Family | Reqs | Attended | No-show | Pending | #products |
|---|---|---|---|---|---|
| **uP!** | 8,889 | 44% | 40% | 16% | 6 |
| **CPM** | 2,453 | 34% | 2% | **64%** | 6 |
| **B!G** | 2,298 | 58% | 6% | 36% | **19** |
| **A&H/Leadership** | 1,204 | 46% | 7% | 47% | 6 |
| **CTD** | 445 | **98%** | 1% | 1% | 2 |
- **uP! is the flagship** (8,889 reqs) but carries the high no-show (40%) because it includes the huge Evolution-Prep gate. **B!G has the most event touchpoints (19 products)** — a multi-step arena ladder. **CTD is near-100% attended** (a tight, committed cohort). **CPM is 64% pending** — largely a registration funnel.

### 14c. Arena zones (the in-person layer)
Zone assignment is concentrated: for "uP! Live Event Jan 2026", **634 of 637 assignments are "Main Arena"** (Zones A/B/D used once each) — i.e. one primary hall with rare breakouts. `event participant zones.addedflow` is mostly `automatic` (cohort-eligibility-driven via `eligiliblecohorts`). Check-in (`arena e-ticket log`) is concentrated on **8 events** — the big physical uP!/B!G arenas.

### 14d. Real participant paths (multi-year journeys)
The data shows participants looping through the event system for **years**. Example real paths (top attenders, 47–56 events each):
- **Abirami Ganesan (56 events):** BiG Arena (Apr 2022) → uP! Mumbai (Sep 2022) → BiG Accelerator (Nov 2022) → CTD Live (Mar 2023) → BiG Accelerator (Apr 2023) → Mega Consultation (May 2023) → uP! Arena Mumbai (Jun 2023) → B!G Accelerator (Nov 2023) → … — a continuous **B!G + uP! + CPM** interleave, almost all `attended`.
- **Shilpa Rao (51)** and **Anjleen Kaur (50)** follow near-identical BiG→uP!→Accelerator ladders (a cohort moving together).
- **Saravanan Aruljothi (47):** an **A&H/Leadership + CTD** staff-style path (Leadership Training repeated, CTD Diagnostics, occasional uP!).

→ **The personalized journey IS the sequence of events a participant is registered into** — a multi-year ladder of readiness-gates → live-arenas, family-consistent (a B!G participant keeps returning to B!G arenas), with cohorts visibly moving together. There is no single "journey state machine" in the event system; the journey is *emergent* from the ordered `event participation request` trail per `profileid`.

### 14e. Open data questions
1. **`journeyref` is null on 98%** of requests — is the formal journey link deprecated in favour of product-grain, or a data-quality gap?
2. **Readiness-gate vs live-arena** isn't an explicit field — it's inferred from attendance. Is there a config flag (event `type`/`eventtyperef → delivery events`) that formally distinguishes them? (worth confirming for the e2e oracle.)
3. The **40% uP! no-show** is dominated by Evolution-Prep being a gate — confirm "unattended" on a gate means "didn't need to attend / auto-advanced", not a true no-show.
