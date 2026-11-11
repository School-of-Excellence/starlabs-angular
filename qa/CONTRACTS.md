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

| delivery-dashboard-days-waiting | /delivery-dashboard | src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-days-waiting.spec.ts | 2026-09-28 PASS (10/10; 6 FAIL on revert) |

> "Tested" here means the contract was run on the real app at
> http://localhost:4200/journey-coach-health against the starlabs-test Firebase project,
> in a logged-in Chrome session, with the reconciliations recorded in each contract's
> Evidence block — not merely that it compiles or that the node checks pass.

| jc-onboarding-usability (p1: decouple) | /onboarding-pipeline | qa/checks/jc-onboarding-decouple.mjs | 2026-11-09 PASS (8/8; 6 FAIL on revert; live intake funnel renders on starlabs-test) |

| jc-health-tabs | /journey-coach-health | qa/checks/jc-health-tabs.mjs | 2026-11-09 PASS (9/9; 8 FAIL on revert; live tab switching) |

| jc-health-onboarding-tab | /journey-coach-health (Onboarding tab) | qa/checks/jc-health-onboarding-tab.mjs | 2026-11-09 PASS (12/12; 9 FAIL on revert; live: filter + Gross/Assured + by-product + pipeline below; To onboard 7 == 6+1) |

| jc-onboarding-count-only | /journey-coach-health (Onboarding tab) | qa/checks/jc-onboarding-count-only.mjs | 2026-11-11 PASS (7/7; 6 FAIL on revert; live: Gross 2 == table 2, Assured 0; standalone 14/14 details) |

| jc-onboarding-pipeline | /journey-coach-health (Onboarding tab) | qa/checks/jc-onboarding-pipeline.mjs | 2026-11-11 PASS (14/14; 13 FAIL on revert; live Apr 2026: 5/1/2/0, tile==list, disjoint, journey selector changes counts) |
