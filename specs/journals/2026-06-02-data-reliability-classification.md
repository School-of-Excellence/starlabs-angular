# 2026-06-02 — Data-reliability classification (which collections to trust)

**Headline:** Classified the journey-management Firestore collections into reliability tiers from a read-only audit (write-recency, volume, fill-rate). **Confirmed the operator's two ground-truth examples exactly** — purchases reliable, "big level logs broken" — which validates the method.

## Context / why
Operator: "some logs have invalid data, some inaccurate, some useful. Journey purchases are accurate (with human errors); big level logs have been broken." We need a trusted set to lock before documenting further and before building CI fixtures.

## What we did
Read-only audit (`~/Downloads/svstats/reliability_audit.js` + `reliability_fix.js`) over ~60 collections: doc count, last-write, writes in last 90d/365d, key-field fill-rate. Verdict logic: actively-written + well-filled = reliable; migration-churn (`_v2`/`archives`) + stale = broken.

## Findings
- **Operator ground-truth corroborated:** `participantjourneyproduct` writes through 2026-06-02 (261/90d); core fields full (`subscriptionstart/end` 100%, `journeystatus` 93%, `profileid` 100%) but optional fields sparse (`purchasedate` 52%, `onboarded` 56%) = the "human errors." ✓
- **"Big level broken" CONFIRMED:** the `big aggregate level` family is fractured into `levelv2` + `archives` + `archivesv2` + `big aggregate event level`, all stale (0 writes/365d) — no single source of truth. (BIG *operations* — `big cohorts`, `big assignment` — are still active; only the level *rollups* are broken.) ✓
- **Dead fields:** `profile_data.currentjourney / currentjourneystatus / currentproductstatus` = 100% NULL → never read for journey state; use `participantjourneyproduct.journeystatus`.
- **Stale/superseded:** `participantJourneySequence` (→ PJP), `userAccessCounts` (telemetry stopped 2024-10), `eiflix workshop` (2 docs → New-Workshop), `collectionname` (empty).

## Decision (DRAFT, pending engineer lock)
Tiers in `specs/data-reliability.md`: A (reliable, lock on) · B (partial, specific fields) · C (broken, do not lock) · D (unaudited). Proposal exported as **`specs/tier-a-proposal.csv`** (55 rows) for the engineers who built the system to validate (`engineer_confirms` column). Once they return it → mark `data-reliability.md` LOCKED, then document only on the locked set.

## Artifacts
`./2026-06-02-data-reliability-classification-artifacts/reliability_audit.json`; proposal CSV at `specs/tier-a-proposal.csv`. Saved to memory as `atc-data-off-limits` (the sensitive denylist).
