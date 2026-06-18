# 2026-06-02 — User journeys, reconstructed 100% from participant logs

**Headline:** Built 10 real anonymized participant journeys (windowed to the first 24 months from earliest purchase) from `participantjourneyproduct` + `appointments` + `content analytics`. The load-bearing truth: **the purchased journey ≠ the delivered journey.**

## Context / why
Operator goal (`/goal`): document ≥10 distinct user journeys (purchase → first 2 years) as ASCII to validate, then get 100% evidence from the logs (not inference) for timings/cross-sell/engagement.

## What we did
Two passes: (1) 12 ASCII journeys grounded in the real taxonomy (48 journeys, 104 products across 5 delivery modes, 108 appointment-type stages). (2) Evidence pass: in-memory join of 5,137 purchases + 10,293 appointments + content listens; windowed M0–M24; labeled each by the *actual delivered* appointment sequence (not the package name).

## Findings (all from logs)
- **Purchased ≠ delivered:** delivery runs on a shared toolkit — **WiSH / A&H Light / Critical Support / EI Implementation** — regardless of package bought (e.g. a "CTD"/"CPM"/"uP! For Prodigies" buyer delivered via A&H Light + WiSH).
- Journeys are **iterative** (9–19 repeated Implementation sessions) and **cancellation-heavy**; **Critical Support recurs mid-journey** as an intervention.
- **33% of participants (1,072/3,240) buy ≥2 journeys.** Top real cross-sell: uP!⇒B!G (200×), B!G⇒B!G Continuity (157×), CTD⇒uP! (117×).
- Journey lifecycle state lives in **`participantjourneyproduct`** (`subscriptionstart/end`, `journeystatus`, `onboarded`, `opportunities`), NOT `profile_data` (those fields are 100% null).

## Caveats (data limits, not inference)
- `content analytics` tracking only starts ~Aug 2023 → older-cohort exemplars show 0 content (pre-tracking, not "no engagement").
- Cohort/event journeys (B!G, CPM-Live, SMP-Live) deliver via the **queue/big/event** system → sparse `appointments`; their evidence lives in queue-stage/big logs.

## Artifacts
`./2026-06-02-user-journey-evidence-artifacts/`: `journey_evidence_final.json` (the 10 windowed individuals), `journey_evidence.json` (aggregate volumes + cross-sell). Harness: `~/Downloads/svstats/evidence_step{1..4}.js`, `journey_taxonomy.js`.
