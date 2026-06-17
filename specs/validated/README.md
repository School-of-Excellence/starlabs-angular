# specs/validated/ — operator-validated documentation

> **This directory is the human-validated source of truth.** Every doc here has been reviewed and confirmed by the operator / the engineers who built StarLabs, concept-group by concept-group. It is deliberately **separate** from the AI-derived documentation produced earlier.

## Two documentation layers — don't confuse them

| Layer | Where | Status | Trust |
|---|---|---|---|
| **Validated** | `specs/validated/` | reviewed & confirmed with the operator | **authoritative** — supersedes the auto-docs for the same topic |
| **Auto-derived** | `specs/*.md` (DATA-MODEL, JOURNEY-LIFECYCLE, CONFIGURATION, QUEUE-AND-BIG, LIVE-STUDIOS, SCHEDULING-DELIVERY, CONTENT-ENGAGEMENT, AUTH-ROLES …), root `DOCS.md`/`DESIGN.md` | AI-generated from code + read-only data probes, **not yet human-reviewed** | reference only — may contain inference errors (already corrected several) |

As each concept group is validated, its `specs/validated/NN-*.md` becomes canonical; the corresponding auto-doc section is regarded as superseded (kept for history/cross-reference, not as truth).

## Concept groups (validation sequence)
1. **Journey & Products** — `01-journey-and-products.md` ✅ validated 2026-06-03
2. **Product Modes** — `02-product-modes.md` ✅ **validated 2026-06-04, end-to-end** (the transition **engine** is mapped: `participantmode.js` §7 + the `participantmetadata.js` projection §7d, in the `starlabs-cloud-function/` repo on `development`; TD-016 closed)
3. **Queue Manager** — `03-queue-manager.md` ✅ **validated 2026-06-05** (session-series → ATC; **two transition types** = operator `nextstage` + self-move/auto-advance; variation = journey-family × cycle; config model; + a live **flow-visualizer** spec for `queue-creation-v3` in `specs/queue-flow-visualizer/`)
4. **Dynamic Studio** — `04-dynamic-studio.md` ✅ **validated 2026-06-10** — the studio runtime (`/dynamicstudio`). **data-widgets vs action-widgets** (read-only upstream projections vs in-studio authoring) + **hybrid** AEL/Triple-ATC; boundary = `live assignment` creation. **84% solo delivery**, **video ~99% Zoom** (LiveKit dead — 1 studio), 100% manual pairing. Reconciled vs the e2e suite (§11) — incl. a 🔴 monitor-authorization finding (§3a). Acknowledged-open follow-ups in §10.
5. **Appointment System** — `05-appointment-system.md` 🟡 **DRAFT for sign-off (2026-06-10)** — the scheduled-delivery rail (sibling to Queue/Studio; **no `live assignment`**). Booking join-chain (type→roles→eis), `deliverytime`→`availability`→`computeSlot` slots, booking advances the delivery sequence, `attended`/`cancelled` state machine. **10,458 appts: 76% attended/23% cancelled**; 89% single-host; **video ~99% Zoom** (OpenVidu ~1%). Open Qs §12.
6. **Events, Arena & Calendar** — `06-events-arena-calendar.md` 🟡 **DRAFT for sign-off (2026-06-10)** — the uP!-event venue (live event after the queue). Lifecycle RSVP→request→approve→attend, e-tickets + QR check-in, arena zones/spaces/layers, VideoAsk highlights, BIG-mode events. Queue→Event bridge = `initiate-event-product` + `arenaeventidlist`. **15,717 participation reqs: 45% attended/24% no-show**; RSVP 92% yes; **no standalone calendar** (date-filtered list). 🐞 bulk-approve commit is commented out (§12-Q1). Open Qs §12.

— **Roadmap note:** the original 6-group sequence is now fully drafted (#1–#4 validated, #5–#6 draft). The 7 extra e2e component groups (content, workshops, support, profiles, comms, evomap, authroles) are **undocumented** — candidate #7+ if the roadmap is extended.

## Conventions
- Each doc states what was **validated** vs what remains an **open question**.
- Claims carry **evidence** (live read-only probe + code `file:line`); raw probes live in `specs/evidence/` and the journal `*-artifacts/`.
- Cross-project (Watson) facts are flagged because Watson is a **separate Firebase project** joined by **email** (see `01-journey-and-products.md` §Watson).
