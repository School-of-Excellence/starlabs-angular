# PROGRESS

## Current state
- Branch `nanda-development` at `dff7de77` "release workshop dashboard" (Communication dialog, Exist card, fixes — all committed by the operator).
- **Uncommitted (this repo):** dashboard `.ts/.html/.css` + dialog `.html` + exist-users spec — 8 new `data-testid`s (7 dialog, 1 dashboard), the Exist panel's chips moved into their own container (they never rendered before), and **platform_name** end to end: label map (blank/`eiflixweb` → EiFlix Web, `eiflixapp` → EiFlix App), a pill per sub-challenge card, "via …" in the Participant Data hero, and a **Platform Usage** section (ApexCharts donut of enrolment platform + stacked bars of touched steps by platform). Prod build green; dashboard Karma suites 81/81.
- **Hub repo cloned** at `../starlabs-e2e-tests` (npm ci done). **Untracked there:** `workshops/workshop-dashboard-communication.spec.ts` — 10 behavioural Playwright tests + an addressable list covering all 55 `wdash-*` hooks. Compiles; adversarially reviewed; NOT run (no Java runtime, no SA secret on this Mac).
- Release Console: this branch is **Blocked**. Reproduce locally with `node scripts/readiness/readiness.cjs --app ../starlabs-angular --base origin/development --head HEAD --json` in the hub.

## Last session changes
- Read the gate (`scripts/readiness/lib.cjs`): four checks; the console truncates the drift list to 5. Journal: `specs/journals/2026-09-15-cicd-readiness-workshops-specs.md`.
- **"Selectors gone" is not ours:** 1,076 hub-spec ids that exist only on `origin/meena-development` (rollout approved). Clears when her branch reaches `development` and is merged here — that merge conflicts in `workshop-dashboard.component.{ts,html}`; keep both sides' hooks.
- **"Missing test cases" is fixed on our side:** readiness now reports no element flags and no untested new component. Spec follows `workshop-dashboard.spec.ts` (anti-circular oracles, seed people, console guard) and WS-14's guard-free stance for the composers (`disableClose:true` on two of them → dismissed via their own buttons).
- Bug found by the review and fixed: Exist panel chips were inside the category-based block.
- Added the platform pill, the hero's enrolment platform and the Platform Usage charts (operator request); rules tested in Karma, hub WDC-08/09 assert them against the seed.

## Pending
- Operator: (1) commit + push the two templates here; (2) commit the hub spec and land it on hub `main` (the callers use `e2e_ref: main`); (3) after meena-development merges, merge `development` here and resolve the dashboard conflict; then recheck in the console — expected MATCHED, then the workshops suite runs the new spec for the first time.
- If that first run fails, the evidence report names the step; likeliest: composer heading text in WDC-07, timing.
- Still open from before: runtime pass on the Communication dialog; the five stale spec stubs that break `ng test` repo-wide.
