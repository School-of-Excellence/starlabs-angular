# 2026-10-01 — mahalakshmi-development → charan-release: delivery dashboard stuck cases (bb5bca74)

## What
| Screen | Source | How |
|---|---|---|
| delivery-dashboard-clone (`/delivery-dashboard`), .ts only | mahalakshmi-development bb5bca74 | path-scoped `git checkout origin/mahalakshmi-development -- "src/app/Journey Onboarding/delivery-dashboard-clone"`; charan-release had no changes there since the merge-base |

## Changes
- Subscription Start / End columns on Awaiting Initiation, Initiated – Not Consuming, Stuck Cases, Ready for Initiation.
- Stuck Cases: every initiated|ongoing PP is a candidate; kept only when its last ATTENDED appointment
  (`appointments.participantproductid == PP docid`) ended >= 15 days ago. Was: 15 days since statusdate.
- Stuck list cached by the sorted set of candidate PP ids — the appointment read re-runs only when that set changes.

## Flagged (not changed — operator's call)
- A PP with NO attended appointment is never stuck now (was: stuck after 15 days of statusdate). Pinned by DDC-STK-01's NOAPPT control.
- The appointment query (`participantproductid in` + `attended ==` + `orderBy endtime`) needs a composite index
  that no firestore.indexes.json declares. Without it the read throws, is caught, and Stuck Cases shows 0.
  The emulator doesn't enforce indexes, so CI cannot catch this — check the index exists on production.

## e2e
Hub `journey/delivery-dashboard-stuck.spec.ts` DDC-STK-01/02 + `seedDdcStuck` (hub journal 2026-10-01-ddc-stuck-cases.md).
No template changes → no new hooks; hook-diff aligned.

## Revert guide
`git checkout a083c1e4 -- "src/app/Journey Onboarding/delivery-dashboard-clone"` (and drop the DDC-STK spec + seed step 8 in the hub)
