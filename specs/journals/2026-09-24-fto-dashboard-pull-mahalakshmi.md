# 2026-09-24 — FTO dashboard pulled from mahalakshmi-development onto charan-release

## What
- Pulled **only** `src/app/Journey Onboarding/team-evolution-dashboard/**` from `origin/mahalakshmi-development`
  (commits 41ac096e, dac660a1, 521ce153). `update-delivery` (queue-appointment checkbox, same branch) was
  offered and **not** taken — operator picked one component.
- Pull method: `git checkout origin/mahalakshmi-development -- <path>` (path-scoped, no merge). charan-release
  had no changes to these files since the merge-base, so nothing of ours was overwritten.

## Changes on top of the pull (and why)
| Edit | Why |
|---|---|
| `ahParticipantCards` getter added (ts) | Template referenced it, TS never defined it (on every branch). `strictTemplates:false` let the build pass; opening the Participants tab threw. Built from `participantMetadata` (AH members) + search + active products → DFU names, same shape the new template reads. |
| `metadataReady` promise; `selectProduct` awaits it | Race: the DFU dropdown fills before the AH metadata loads; picking a product in that window built an EMPTY list and cached it for that product (found by JTED-02..06 on the emulator). |
| 21 literal `data-testid`s (`jted-stat-*`, `jted-ov-*`, `jted-ppl-*`, `jted-a-020` re-homed to the card name link) | The pull removed 12 hooks the journey suite asserted; the readiness gate blocked. |

## Found, not fixed (flag to Mahalakshmi)
- **Needs attention never fires on real data**: the 7-day rule reads `appointmentend`/`endtime` off the
  deliverable's `deliveryref`, which points at the `appointmenttype` activity doc (no such fields).
- **Awaiting sign-off**: nothing sets `awaitingsignoff` → tile always 0.
- 521ce153 removed the Overview `<section class="view">` wrapper → the DFU picker + tiles render on every tab.

## e2e
Local emulator run (firestore+auth, JDK 21, app on :4320): JTED 8 passed / 2 fixme; full journey suite 81 passed, 0 failed, 27 skipped.
Hub `journey/team-evolution.spec.ts` (JTED-01..08, 07 fixme = needs-attention gap) + `seed-journey.js`
step 7 (own run tag `<run>_fto` so JP-03's exact product count and coach-health's metadata counts don't move).

## Revert guide (per screen)
- Whole pull + fixes: `git checkout <commit-before> -- "src/app/Journey Onboarding/team-evolution-dashboard"`
- Only the getter fix: remove `get ahParticipantCards()` in the component ts (Participants tab will crash again).
