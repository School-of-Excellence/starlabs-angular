# PROGRESS

## Current state
- Branch `nanda-development` — pushed. Contains: the Communication dialog + Exist Users card + platform_name work, and the **merge of `meena-development`** (`c7f57bab`: her dashboard engine extraction, `wd-*` hooks across the app, unit-test workflow, support suite caller).
- Merged tree verified: prod build green; 194/194 unit cases (her engine suite + the three dashboard suites); console readiness script → **MATCHED** (drift 0, no missing test cases).
- **Hub `starlabs-e2e-tests`** (clone at `../starlabs-e2e-tests`): `workshops/workshop-dashboard-communication.spec.ts` (10 tests, all 55 `wdash-*` hooks) + journal committed as `e6d098a` and **pushed to the fork `Nandakumar23/starlabs-e2e-tests`, branch `test/workshops-dashboard-communication`** — the org repo refuses both push (`push:false`) and PR creation for this account, so a maintainer must land it on hub `main` before the console can run it.

## Last session changes
- Merge conflicts (dashboard .ts/.html) resolved keeping both sides: moved methods dropped in favour of her engine, my methods and her hooks kept. `amazon-chime-sdk-js` installed `--no-save`; Zoom peers restored after the prune.
- Readiness gate understood and reproduced locally (`node scripts/readiness/readiness.cjs --app ../starlabs-angular --base origin/development --head HEAD --json`); journal `specs/journals/2026-09-15-cicd-readiness-workshops-specs.md` §1–9.
- platform_name end to end (label map, pill, hero, Platform Usage charts) — earlier today, see §7–8.

## Pending
- **Hub landing** — a maintainer runs `git fetch https://github.com/Nandakumar23/starlabs-e2e-tests.git test/workshops-dashboard-communication && git push origin FETCH_HEAD:main` (or opens the PR from their account); until then the console still reports "no spec references" for the workshop hooks.
- Console recheck after the hub lands: expected MATCHED → workshops suite runs the new spec for the first time (never run locally: no Java / no SA on this Mac).
- Still open: runtime pass on the Communication dialog and the platform charts; the stale spec stubs that break a full `ng test`.
