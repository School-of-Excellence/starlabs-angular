# Contracts index

One line per live contract (gate section 1.1).

| feature-id | surface | spec | last run |
|---|---|---|---|
| jc-health-3fixes | /journey-coach-health | journey-coach-health-dashboard.contract.spec.ts + qa/checks/jc-health-contract.mjs | 2026-09-24 PASS (Karma 45/45, browser-verified; Schedule tile==list still owed) |
| je-dashboard-jc-fixes | /JourneycoachDashboard-new | qa/checks/je-dashboard-jc-fixes.mjs | 2026-09-23 PASS |
| jc-health-going-quiet | /journey-coach-health | qa/checks/jc-health-going-quiet.mjs | 2026-09-24 PASS (browser-verified: 92 / 1, intersection 0) |
| jc-health-dark-mode | /journey-coach-health | qa/checks/jc-health-dark-mode.mjs | 2026-09-24 PASS (browser-verified: dark+light+overlays, 0 light leaks) |
| jc-health-event-filter | /journey-coach-health | qa/checks/jc-health-event-filter.mjs | 2026-09-24 PASS (browser-verified: 53 -> 41 -> 42) |
| jc-health-na-reasons | /journey-coach-health | qa/checks/jc-health-na-reasons.mjs | 2026-09-24 PASS (browser-verified: 40/53 rows chipped) |

> "Tested" here means the contract was run on the real app at
> http://localhost:4200/journey-coach-health against the starlabs-test Firebase project,
> in a logged-in Chrome session, with the reconciliations recorded in each contract's
> Evidence block — not merely that it compiles or that the node checks pass.
