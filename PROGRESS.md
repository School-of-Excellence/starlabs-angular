# PROGRESS

## Current state
- **starlabs-angular `nanda-development`**: HEAD `94accbcd`, even with origin. **Uncommitted, for the operator to commit:**
  - **New Users details dialog** (2026-11-18):
    - `newusersprofile.component.{ts,html,css}`;
    - the new folder `newusersprofile/new-user-details-dialog/`;
    - `workshop-access/workshop-access.service.ts`;
    - its plan and journal.
  - **Dashboard late-enrollee fix** (2026-11-19):
    - `workshop-dashboard.component.ts`;
    - `workshop-dashboard.engine.ts` + `.engine.unit.spec.ts`;
    - `workshop-dashboard.exist-users.spec.ts`;
    - its plan and journal;
    - this file.
  - **Dashboard "Manage tag"** (2026-11-19):
    - `workshop-dashboard.component.{ts,html,css}`;
    - `workshop-dashboard.engine.ts` + `.engine.unit.spec.ts`;
    - the new `workshop-dashboard.person-tags.spec.ts`;
    - `workshop-access/workshop-access.model.ts` + `.model.spec.ts`;
    - its plan and journal.
  - **Workshop Live** (2026-11-19): the Live button on /workshops (`workshops.component.{html,ts,css}`), route `workshoplive/:id` (`app.routes.ts`), the new folder `src/app/New-Workshop/workshop-live/`, the plan `2026-11-19-workshop-live.md` and the journal `2026-11-19-workshop-live.md`. It also has pagination (20 per page), a name/phone/email search, and Journey and Customer status columns ("New User" for still-new users). Checks: unit 2548/2548 (61 in the live engine); e2e WLV-01..13 plus the /workshops list file, 23/0/2; gate MATCHED.
  - **Dashboard light colour, option A** (2026-11-19): `workshop-dashboard.component.{css,html,ts}` (CSS section 8, `--tone` / colour classes, `panelTone`), the plan `2026-11-19-workshop-dashboard-colour-d.md` (it describes A), the journal `2026-11-19-workshop-dashboard-colour.md` and the mockup folder `2026-11-19-workshop-dashboard-colour/`. Checks: 13 dashboard e2e files 107/0/0, gate MATCHED, build OK.
  - **Dashboard double line under the People cards** (2026-11-19): `workshop-dashboard.component.css` (3 rules after `.wdx-grp-cells`) and journal `2026-11-19-dashboard-people-double-line`.
- **starlabs-e2e-tests `main`**: **pushed through `97033dd`** on 2026-11-20 (`d03caa2..97033dd`: WPT Manage tag and WLV-01..13 Workshop Live). Nothing is local; it is even with origin.
  - Before the push it was rebased onto 8 upstream commits (events/journey/queue, no conflicts).
  - The full workshops suite passed: **275/0/33** (308 tests in 37 files, 0 emulator restarts).
  - The gate was MATCHED over all 27 uncommitted app files.
  - The full workshops suite before the push: **247/0/33**.
  - Rebased onto 4 upstream commits (`c68c002`..`cc177d5`). They touch the readiness scripts, the manifest, the atc/comms/journey suites and pinned console/functions versions, and no workshops files. After the rebase, `--list` gives 22 tests and the gate is still MATCHED.
- No test servers are running; port 4200 (the operator's dev server) was untouched.

## Last session changes (2026-11-18 → 19)
- **New Users → person details dialog** with the **Delivery on hold** toggle. Journal `2026-11-18-new-user-details-dialog`.
  - Each flip writes `deliveryonhold` and `deliveryonholdby {time, user}`.
  - Tests: New Users e2e 43/0; the full suite before the push was 244/1/33 (WS-40 flaky, 7/7 alone). The hub is pushed.
- **Workshop dashboard "Unknown · No login yet"** in Not in Chat Group. Journal `2026-11-19-dashboard-late-enrollee-names`.
  - **Cause:** `new_user_data` was read once while the enrolled list and the chat group are live, so people who enrolled after the page opened were unknown. They counted as Existing, and "no login" was cached for good. Separately, an older snapshot could overwrite a newer one.
  - **Fix:**
    - read only the missing ids (full SDK, from the server, retried, 20 s limit);
    - hide people from Not in Chat Group while their lookup is pending;
    - counters on the enrolled snapshot.
  - **Tests:** unit 274/274; all 12 dashboard e2e files 92/0/0; gate MATCHED.
  - **Review:** 4 medium findings fixed (offline read, Sale Achieved, brief "Unknown" window, guard untested) plus 4 lows.
- **Workshop dashboard "Manage tag"** in the side-panel person menu. Journal `2026-11-19-dashboard-person-manage-tag`.
  - Only for the `clearworkshop` list (new `inClearList()`, not an access tick). Lists segment tags; a choice adds or removes it on the person's enrolled doc(s) for this workshop, `tags` only.
  - **Review fix:** a rebuilt or removed panel row left the person menu gone and the submenu floating. Fixed with trackBy and closing the menu before the row leaves.
  - **Tests:** unit 348/348 (2584/2584 wide); all 13 dashboard e2e files 107/0/0; gate MATCHED, 3 new hooks tested.
- **Hub push needed two tries.** The first `git push` hung on SSH; it was stopped and retried.

## Pending
1. **Operator:** commit the files above.
2. **Hub:** everything is pushed (through `97033dd`). The NUD, WDC-LATE, WPT and WLV cases use hooks and behaviour that exist only on the operator's uncommitted app branch. Until that lands, the gate treats those files as hub-ahead (skipped), and WDC-LATE would fail against the old app.
3. **Delivery on hold** is stored only; nothing reads it yet. Ask whether delivery should honour it.
4. **Dashboard, left as is:**
   - an Existing or New Users panel opened before a late joiner is identified stays as opened;
   - a new user who converts to existing while the page is open stays "New" until a refresh.
5. **Dashboard, open questions:**
   - Manage tag: should a clear-list member without the participant progress right get the person menu (Manage tag only)?
   - rename `workshop-access.model.spec.ts` to `.unit.spec.ts` so CI runs it (the new person-tags spec is not run by CI either);
   - the Sale Achieved card has no e2e (Watson-only, operator's choice);
   - optional "retry" on the "—" cards.
6. **Email template:** build the sender for `workshopsettings/{id}.mail`. Emulator functions don't load (firebase-functions v7).
7. **Load time:** add performance marks, then speed up the shared guard and role check.
8. **App header overflows at 390px** (`app.component.html`).
9. **Before deploying to production:**
   - add a `/workshoplive` route-config entry (via /routeconfiguration) in each real environment, with the same roles as /workshops;
   - fill `static meta data/Workshop Admin.clearworkshop`;
   - confirm the rules allow updates to `newusertags`, `new_user_data`, and `tags` on `workshop participant enrolled`.
10. **Carried over:**
    - EiFlix Confirmed repair (needs approval);
    - `/engagementdashboardv2` needs a route entry and `authGuard`;
    - ATC slider items;
    - `graphify` is not installed;
    - `.claude/skills/screen-e2e-coverage/` is missing on this machine.
