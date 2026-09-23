# 2026-09-23 — Pull Joshua's journeycoach-dashboard iOS redesign (`/JourneycoachDashboard-new`)

## What
Merged `c67aae29` from `joshua-development` into the working tree (uncommitted, no merge commit):
the iOS redesign of the JE / journeycoach dashboard — component, template and CSS — plus a
`.cdk-overlay-container.jcd-dark` block appended to `src/styles.css` (union with the JC-Health block).

## How
- **Base `244e170b`.** Joshua had NO commits on this folder before `c67aae29`: his copy was byte-identical
  to that ancestor, and our branch was ahead by the engine extraction (`e118b28f`) + hooks (`176d11b8`).
- **His redesign was built ON our extraction**: his `journeycoach.engine.ts`, its 827-line spec and
  `priority.engine.ts` are byte-identical to ours, and his component imports them. Nothing of ours was lost.
- 1 TS conflict (the import block — his is a superset) and 14 HTML conflicts, all resolved to his side
  since his files are ours + the redesign. CSS merged clean. Engine specs still 97/97.

## Hooks — the part that needed judgement
The redesign kept 183 of our 216 `jcd-*` ids, **retired 33** and added 24 semantic ones.
- The 33 are REAL removals, verified one by one against the new template (not guessed): the months /
  date-range / queue filter-mode buttons, the months input, the queue multi-select, the health-key table
  rows, the all-months dialog, the ATC + impact blocks, the journey-coach tag list.
- 7 interactive controls in the redesign carried no id at all; hooked in his naming style:
  `jcd-btn-picker-range`, `jcd-lnk-gross-{pending,paid,overdue}`, `jcd-lnk-onb-calendar`,
  `jcd-lnk-subs-overall`, `jcd-ph-needsattn-empty` (the empty-state twin of `jcd-ph-needsattn-row`).
- **214 ids total, hook-diff aligned (0/0).** Hub: the `jcd` addressable list was regenerated from the
  template, and JCD-01 now drives the new health board for real.

## Verified
tsc + ngc clean, `ng build` (development) complete, journeycoach engine specs 97/97, hook-diff aligned.
NOT verified in a browser — the redesign's visual result is unreviewed here.

## Revert
`git diff` over `src/app/Journey Onboarding/journeycoach-dashboard` + the appended `src/styles.css` block.
