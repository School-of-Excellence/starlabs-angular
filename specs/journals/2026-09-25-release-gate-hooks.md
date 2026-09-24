# 2026-09-25 — readiness gate on charan-release: hooks for the pre-existing release commits

## Why
The first push of `charan-release` carried 6 commits that predate the FTO pull (content-analytics-v2,
bulk-add-products, view-participants-form filters, participant-intelligence + two dev merges). CI's readiness
gate blocked on them. Operator chose "cover what's reachable".

## What changed in the app
| Screen | Edit | Why |
|---|---|---|
| bulk-add-products | 7 literal hooks (`bap-tab-*`, `bap-unres-*`, `bap-history-participants`, `bap-history-export-failures`, `bap-footer-close`) | gate: interactive elements with no data-testid |
| content-analytics-v2 | 31 literal hooks (`cav-dnum-*`, `cav-rec-selcol`) on the drill-down counters | same |
| participant-intelligence | 7 literal hooks (`pi-*`) on the top bar | same; the screen had none |

## Hub side (starlabs-e2e-tests, branch test/team-evolution-fto)
- `suites-manifest.json`: `src/app/Participant Intelligence/**` → **profiles** suite (was covered by none).
- profiles: `participant-intelligence.spec.ts` (PI-01..04), `view-participants-form-filters.spec.ts` (VPF-F01..03),
  operator's local `bulk-add-products.spec.ts` + seed jobs, route grant `/participant-intelligence`.
- content: `content-analytics-v2-addressable.spec.ts` — ALL cav hooks as `fixme`. v2 is **not routed** after the
  operator's local route change (committed separately, "route /contentanalytics back to v1"): b471a730 had pointed
  `/contentanalytics` at v2; the operator restored v1 and commented v2 out. Route v2 again → write real cases
  (and content-analytics.spec.ts, the v1 spec, would then need retiring).

## Found
- view-participants-form reads `formsByClient` from the **firestore-forms named db** → denied on the emulator.
  VPF-F02 (pending/fetch) is cloud-only; VPF-F03 asserts the emulator's read-failure notice.

## Run (local emulator, firestore+auth only)
PI 4/4, VPF F01+F03 pass, bap + vpf-controls pass. Full profiles: 85 pass, 11 skip, 3 fail = PA-CF-01/04/05
(Cloud Function triggers — no functions emulator locally; unrelated). Gate locally: ✅ MATCHED.

## Revert guide
Hooks are attribute-only; `git revert <this commit>` removes them with no behaviour change.
