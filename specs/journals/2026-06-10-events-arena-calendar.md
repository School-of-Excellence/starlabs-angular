# Journal — 2026-06-10 · #6 Events, Arena & Calendar (investigation → draft)

## What was done
Documented concept group #6 with the standard rigor: Explore code map (`src/app/Events/**` + `initiate-event-product`, `create-arena-space`, `bigeventmentor` + CF) leveraging the e2e recon (`e2e/recon-allcomp/events-arena.md`), + two read-only production probes (`event_discover.js`, `event_runtime_probe.js`). Wrote `specs/validated/06-events-arena-calendar.md` (DRAFT for sign-off). **This completes the original 6-group documentation roadmap.**

## The model
The **uP!-event venue** — the live event participants reach *after* the queue. Lifecycle = **RSVP (`event rsvp`) → register (`event participation request`: requested→approved→attended|unattended) → e-ticket → QR check-in → highlights**. Attendance completes `deliverables` + denorms into `participant metadata` (CQRS). The **Queue→Event bridge** is `initiate-event-product` + the `arenaeventidlist` join. BIG-mode events use `arenaspace`/`bigeventmentor`. **No standalone event calendar** — "Calendar" in the group name is the date dimension across Appointments (#5) + the date-filtered event list.

## Evidence highlights (production, read-only)
- **event participation request 15,717:** 45% attended · 24% unattended (no-show) · 19% requested · 11% approved · denied 3.
- **event rsvp 8,766:** 92% "yes"; origin `type` queue 59% / event 41%.
- **arena e-ticket 2,127:** 99% active; 64% single-product, 31% two-product.
- **check-in 9,917 scans:** 940 distinct participants across **only 8 events** (the big in-person uP! events) — ~10.5 scans/participant.
- **97 events** (93 past, 4 upcoming); **50 link arena sub-events** (`arenaeventidlist`).
- **zones:** 637 assignments (100% have a `selectedzone`), 19,255-row zone-change log.
- arena events 218 (per-product sub-events); arenaspace 93 (BIG); arenalayers 17; arenavideoask 51; arena highlights 62.

## Surprises / findings
- **🐞 Bulk-approve is a no-op:** `event-participation-approve.component.ts:420-427` has the `batch.commit()` commented out — only `markAsAttended()` commits. A latent bug surfaced by the e2e recon and confirmed in code (analogous to the #4 §3a monitor finding). Logged as §12-Q1.
- The Explore map inferred `platform`-style fields and a v1/v2 dashboard split; data + routes confirm **V2 is live, V1 dead** (consistent with the repo's TD-001 clone pattern).
- "Calendar" is **not** a subsystem — there is no event-calendar UI; events are list + date-filtered. Important scope clarification for the group name.

## Pending
- Operator walkthrough of `06` §12 (the bulk-approve bug; the requested/approved backlog; RSVP-type origins; zone eligibility; atcmodel reference-only).
- Later: doc↔e2e reconciliation pass for `e2e/events/` (as #4 §11).

## Deepening pass (2026-06-10, same day) — participant journeys through events
Per operator goal "map what journeys which participants have taken through which events and arena," added **§14** to `06` from all 15,770 `event participation request` records (`event_journey_map.js`, `event_family_map.js`):
- **Structural finding:** "events" are **two categories** — *readiness gates* (virtual funnel steps, <35% attended; Evolution Prep is the biggest event at 19%/n=4,762) vs *live arenas* (in-person destinations, 47–99% attended). This explains the 45%/24% aggregate and was invisible in the code-only view.
- **Journey-family flow** (product-grain; `journeyref` null on 98%): uP! 8,889 reqs (44% att, 40% no-show via the Evolution-Prep gate) · CPM 2,453 (64% pending funnel) · B!G 2,298 (58% att, **19 products** = longest arena ladder) · CTD 445 (**98%** att) · A&H/Leadership 1,204.
- **Arena zones:** one "Main Arena" dominates (634/637 for uP! Jan 2026); cohort-eligibility-driven (`addedflow:automatic`); check-in concentrated on 8 physical events.
- **Real multi-year paths:** top attenders (47–56 events) loop family-consistently through readiness-gate→live-arena ladders for years; **the journey is *emergent* from the ordered participation trail per `profileid`** — no single event state machine.
- Also folded the **#5 actual-data findings** into `05` §14 (90% operator-mediated booking, WiSH-specific continuity engine, lead-time/duration grounding).

## Roadmap status after this session
All 6 concept groups now have a `validated/` doc: **#1–#4 VALIDATED, #5 & #6 DRAFT-for-sign-off** (both now deepened with actual-data analysis). The 7 extra e2e component groups (content, workshops, support, profiles, comms, evomap, authroles) remain undocumented — candidate roadmap extension (#7+).
