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
4. **Dynamic Studio** — `04-dynamic-studio.md` 🟡 **DRAFT (investigated 2026-06-05)** — the studio runtime (`/dynamicstudio`). Core model **validated in session**: **data-widgets vs action-widgets** (read-only upstream projections vs in-studio authoring) + **hybrid** AEL/Triple-ATC; boundary = `live assignment` creation **confirmed**. Data findings: **84% solo delivery**, **video ~99% Zoom** (LiveKit dead — 1 studio), 100% manual pairing. Open items for operator sign-off in §10.
5. Appointment System — _pending_
6. Events, Arena & Calendar — _pending_

## Conventions
- Each doc states what was **validated** vs what remains an **open question**.
- Claims carry **evidence** (live read-only probe + code `file:line`); raw probes live in `specs/evidence/` and the journal `*-artifacts/`.
- Cross-project (Watson) facts are flagged because Watson is a **separate Firebase project** joined by **email** (see `01-journey-and-products.md` §Watson).
