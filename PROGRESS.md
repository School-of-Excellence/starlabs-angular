# PROGRESS

## Current state
- Branch `nanda-development` — pushed by the operator; **uncommitted here:** the completed-only pill + time, and the chat-group card/panel (dashboard .ts/.html/.css, engine .ts + unit spec, exist-users spec, journal, this file). Contains: the Communication dialog + Exist Users card + platform_name work, and the **merge of `meena-development`** (`c7f57bab`: her dashboard engine extraction, `wd-*` hooks across the app, unit-test workflow, support suite caller).
- Merged tree verified: prod build green; 194/194 unit cases (her engine suite + the three dashboard suites); console readiness script → **MATCHED** (drift 0, no missing test cases).
- **Hub `starlabs-e2e-tests`** (clone at `../starlabs-e2e-tests`, write access granted 2026-09-15): `workshops/workshop-dashboard-communication.spec.ts` (10 tests, all 55 `wdash-*` hooks) is on org `main` (`93ff70d`, then the WDC-09 extension). The fork `Nandakumar23/starlabs-e2e-tests` still holds the old branch; it can be deleted.

## Last session changes
- **Users Not in Chat Group** card + side panel (add one / add all → `supportchat.members` arrayUnion), live via a group-document listener; uid from `new_user_data.uid` or `participant metadata.firebaseuserref` (journal §12). Second CI run: workshops leg green; content CN-04 was a spec race in the hub (Escape reaching the dialog) — fixed there.
- Platform pill only on completed steps; completed date now carries the time (`formatDateTime` in the engine). First CI run of the hub spec failed on the CF-owned metadata name → fixed in the hub (journal §11).
- Platform Usage moved to the bottom of the dashboard; "Enrolled via" rows and donut slices open the side panel with that platform's participants (journal §10).
- Merge conflicts (dashboard .ts/.html) resolved keeping both sides: moved methods dropped in favour of her engine, my methods and her hooks kept. `amazon-chime-sdk-js` installed `--no-save`; Zoom peers restored after the prune.
- Readiness gate understood and reproduced locally (`node scripts/readiness/readiness.cjs --app ../starlabs-angular --base origin/development --head HEAD --json`); journal `specs/journals/2026-09-15-cicd-readiness-workshops-specs.md` §1–9.
- platform_name end to end (label map, pill, hero, Platform Usage charts) — earlier today, see §7–8.

## Pending
- Console recheck after the hub lands: expected MATCHED → workshops suite runs the new spec for the first time (never run locally: no Java / no SA on this Mac).
- Still open: runtime pass on the Communication dialog and the platform charts; the stale spec stubs that break a full `ng test`.
