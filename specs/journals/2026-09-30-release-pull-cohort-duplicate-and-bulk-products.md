# 2026-09-30 — feature-test → charan-release: cohort duplicate + Add Products (bulk) dialog

## What (operator picked 2 of feature-test's 5 components)
| Screen | Source | How |
|---|---|---|
| `big/cohort-management` + `big/manage-coherts` (`/bigcohorts`) | feature-test c9b8d320 | path-scoped `git checkout origin/feature-test -- <dirs>`; charan-release had no changes there since the merge-base |
| `participants-analytics/bulk-add-products` + its "Add Products" caller | feature-test 143ae6a2 | restored from charan-release history: dialog from 216325a8 (= feature-test's dialog + the 7 `bap-*` hooks), caller from 8411be85^ |

## Why these shapes
- **Not a merge of feature-test**: it lacks 29 charan-release commits and carries 3 unpicked components
  (participant-intelligence rounds 1–4, segment-board, specialist-appointment-studio).
- **Bulk dialog taken from our own history, not feature-test's tree**: byte-identical except the 7 hooks the
  readiness gate needs. The caller was NOT path-copied from feature-test because its
  `participants-analytics.component.ts` also carries the `pifilter` line of 4555d3e9 (dialogs commit, not picked).
- Bulk products had been removed from the release on 09-25 (8411be85) when its Cloud Function was still
  uncommitted; `functions/components/bulkproductjobs.js` is on the CF repo's `development` now.

## e2e (hub branch test/release-cohort-duplicate-bulk)
- `queue/big-cohorts-duplicate.spec.ts` BIG-12/13 (target-marathon dialog; per-cohort create dialog banner;
  no write on Cancel/dismiss) — added to the `big` area's `only` list in `suites-manifest.json`.
- `profiles/bulk-add-products.spec.ts` + bulkProductJobs seed restored from hub 89160fb.
- hook-diff aligned (cman / mcoh / bap). Suites NOT run yet — operator rule: run once, right before push.
- Gate `--files` mode reports "18 unhooked elements" in cohort-management: pre-existing (same 18 on
  development and on charan-release before the pull), not introduced here.

## Revert guide (per screen)
- cohort duplicate: `git checkout 3807e095 -- src/app/big/cohort-management src/app/big/manage-coherts`
- Add Products dialog: `git checkout 3807e095 -- "src/app/Participants Profile Management/participants-analytics"`
  (then drop `profiles/bulk-add-products.spec.ts` + the BPJ seed in the hub again, as on 09-25)
