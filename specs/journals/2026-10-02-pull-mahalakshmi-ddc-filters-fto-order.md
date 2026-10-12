# 2026-10-02 — mahalakshmi-development → charan-release: delivery dashboard filters + FTO ordering (dfdb6b57)

## What
| Screen | Source | How |
|---|---|---|
| delivery-dashboard-clone (`/delivery-dashboard`) | mahalakshmi dfdb6b57 | path-scoped `git checkout origin/mahalakshmi-development -- <dir>` |
| team-evolution-dashboard (`/team-evolution-dashboard`) | mahalakshmi dfdb6b57 | same |
charan-release had no changes in either folder since the merge-base (8bc69f43), so nothing of ours was overwritten.

## Changes
- **Delivery dashboard:** new first Participants tab **All** (= Awaiting + Initiated–Not Consuming + Stuck rows with a
  status); filters **Customer Status / Financial Status / Parallel Product** + **Clear Filter**; **Parallel Product**
  column (participant's other active products); "Total Participants" counter; Awaiting now requires `isReadyToStart`
  (active + regular/fully paid + no parallel product); **Bulk Initiate Ready** commented out (it was a stub). Tile
  links' tab indices shift by one.
- **Team evolution:** participants held as an array and ordered by each member's earliest `statusdate.initiated`
  (oldest first, undated last). metadataReady + ahParticipantCards (our 09-24 fixes) are kept.

## Edits on top of the pull
| Edit | Why |
|---|---|
| removed `console.log("allParticipantsProduct:", allParticipantsProduct[0]…)` | throws TypeError when a product has no participant products → the list never builds |
| removed `console.log("orderedParticipants:", …)` | debug noise |

## e2e
Hub `journey/delivery-dashboard-stuck.spec.ts` DDC-FLT-01/02 (+ DDC-ADDR1 fixme for `ddc-btn-128`) and
`journey/team-evolution.spec.ts` JTED-09. hook-diff aligned for both folders.

## Revert guide (per screen)
- delivery dashboard: `git checkout 10bad42e -- "src/app/Journey Onboarding/delivery-dashboard-clone"`
- team evolution: `git checkout 10bad42e -- "src/app/Journey Onboarding/team-evolution-dashboard"`
