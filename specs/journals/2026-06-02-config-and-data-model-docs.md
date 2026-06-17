# 2026-06-02 — Config + data-model + subsystem docs (rollout Phase 1), data-first & evidence-backed

**Headline:** Executed Phase 1 of the documentation rollout — extended `CONFIGURATION.md`, wrote `DATA-MODEL.md` and the six subsystem refs (`QUEUE-AND-BIG`, `LIVE-STUDIOS`, `SCHEDULING-DELIVERY`, `CONTENT-ENGAGEMENT`, `JOURNEY-LIFECYCLE`, `AUTH-ROLES`), each grounded in fresh read-only production probes **and** verified code `file:line` citations. Several long-standing assumptions were corrected by the data.

## Context / why
The rollout plan (`specs/plans/2026-06-02-documentation-rollout.md`) demands docs that capture the **configuration model** + **dynamic assembly** + a **worked example traced through live data** + an **evidence log** — built on the Tier-A set. The gate ("Tier-A locked") is a human sign-off I can't perform, but every technical claim is observable read-only now, and the classification is operator-corroborated — so I built the full scope on the DRAFT Tier-A set and flagged the pending lock in every doc.

## What we did
1. **Evidence corpus (read-only, ATC denylist baked in):** `specs/evidence/` — `probe_schema.js` (100-doc fill-rates for ~63 collections), `probe_config_deep.js` (variant enumeration), `probe_traces.js` + `probe_traces2.js` (worked examples), `split_evidence.js` (per-subsystem slices → `specs/<DOC>-evidence/evidence.json`). All outputs git-tracked.
2. **Code citations:** 5 parallel subagents extracted + verified `file:line` for the config→behavior interpreter in each subsystem (queue, studios, auth, scheduling, journey/content). I independently re-verified ~15 of the highest-value citations against source — all resolved exactly.
3. **Docs:** rewrote `CONFIGURATION.md` (every CONFIG collection: shape, variants, config→behavior `file:line`, secrets); wrote `DATA-MODEL.md` (ROLE × tier catalog + 100-doc schema + reference map + write-owners + Tier-C "do not use"); wrote the 6 subsystem refs per the 10-part template, each with an evidence log + worked example.

## Findings / surprises (the data corrected us)
- **Queue boolean-toggle "second shape" is DORMANT.** `queue generation` has 60 key-sets/96 docs, but the toggle fields (`isdiagnosticsrequired`…) are vestigial extras layered on `stages[]` and are **commented-out in `queue-creation-v3` with zero runtime readers**. The engine reads one live shape: `stages[]` + `stageproperty{}` (+ `queue variation` override). (Was framed as two interchangeable shapes.) → TD-013 refined.
- **`role_ref → users_roles`, NOT `eisroles`.** Live: 60/60 sampled `profile_data.role_ref` → `users_roles` (count 3,252 ≈ profile count). `eisroles` (166) is the separate *specialist-role* catalog used by scheduling. Fixed `DOCS.md`/`DESIGN.md`. No Firebase custom claims anywhere (0 grep hits) — auth is 100% client-side via the `dashboard` ACL.
- **TD-008 refined:** `queue generation` new-queue **creation** is stalled (`created` 0/90d, last 2025-08) but configs are **actively edited** (`modified` 7/90d, last 2026-06-02) — not a dead pipeline; the earlier "0 writes/90d" used `created`.
- **`content analytics` is read-only in the web app** (written by mobile/backend; no `addDoc`/`setDoc` in `src/`). **`tier access config` gating is display-only in the web client** — runtime entitlement is enforced elsewhere (mobile/CF). Don't assert gating against this app.
- **Bulk-migration timestamps:** many older `queue stage log` rows share an identical `createdon` — order must be read from the `previousstage→currentstage` chain for pre-2023 tokens.
- **`openviduroom` doc id == `live assignment` id == `queue_token.liveassignmentid`** — the studio↔room↔token join key (`dynamic-studio.ts:2486`).
- **purchased ≠ delivered** stays load-bearing: delivery keys off appointment *types* (WiSH/Critical Support/A&H Light/EI), not the package name (P-4F5BB: bought FTM/B!G, delivered WiSH+Critical Support over 45 appts).

## Decision
Methodology held: config-first, every claim backed by a live sample + a code `file:line`. ROLE (CONFIG/RUNTIME-STATE/TRANSACTIONAL) is now first-class in `DATA-MODEL.md`. Corrections above are reflected in the root docs.

## Artifacts
`specs/CONFIGURATION.md`, `specs/DATA-MODEL.md`, `specs/{QUEUE-AND-BIG,LIVE-STUDIOS,SCHEDULING-DELIVERY,CONTENT-ENGAGEMENT,JOURNEY-LIFECYCLE,AUTH-ROLES}.md` + their `*-evidence/`; `specs/evidence/` (probes + outputs). Companion: `2026-06-02-phase2-3-diagrams-and-test-enablement.md`.

## Pending
- Engineer lock of `tier-a-proposal.csv` → mark `data-reliability.md` LOCKED.
- Open questions per doc (capacity-field enforcement, tier-gating enforcement location, `journeystatus` enum, etc.) for engineer validation.
