# Big Cohorts: randomize participants into educational cohorts

Approved by operator 2026-11-01 in chat. Why: `specs/journals/2026-11-01-bigcohorts-randomize.md`.

Goal: on `/bigcohorts`, choose with or without specialists, then build groups from new or existing educational or operational cohorts (existing ones are overwritten). With specialists, they're placed first. Then participants from one or more cohorts, filtered by event attendance on a date, are shuffled into the groups.

| # | File | Change |
|---|---|---|
| 1 | `src/app/big/cohort-randomize-dialog/cohort-randomize.logic.ts` | Seeded shuffle, split, specialist spread, event days |
| 2 | `src/app/big/cohort-randomize-dialog/cohort-randomize.logic.unit.spec.ts` | Unit tests for #1 |
| 3 | `src/app/big/cohort-randomize-dialog/cohort-randomize-dialog.component.*` | The dialog, with hook prefix `crnd` |
| 4 | `src/app/big/cohort-management/cohort-management.component.html` | Select bar button `cman-randomize-cohort-87` |
| 5 | `src/app/big/cohort-management/cohort-management.component.ts` | `getRandomizeSourceCohorts()`, `openRandomizeDialog()`, `applyRandomizePlan()` |

Open:
- Confirm is commented out on operator instruction, so nothing can be saved yet.
- Before pushing: add e2e coverage with the `screen-e2e-coverage` skill.
