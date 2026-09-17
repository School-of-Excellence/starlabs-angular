# Sales Numbers + Sales Teams — bring to development + production (2026-07-03)

**Type:** feature port from `joshua-development` + one unrelated perf tweak, promoted to `development` and `production`.
**Commits:** `041ed7e` (sales feature + routes), `70d323e` (delivery-sequence perf). Production merge = `6023a0f`.
**Branch flow:** `origin/development 9f76877 → 70d323e`; `origin/production 1d84baa → 6023a0f` (no-ff merge).

## What landed
### Sales Numbers (`src/app/Journey Onboarding/sales-numbers/`, 5 files) — read-only analytics
- Reads `salesleads` (never writes it) + `sales_teams` (read). Two Firestore collections only.
- Controls: **Time frame** (last7/last30/month) → the ONLY control that refetches (`loadSalesInRange` on `purchasedate`+`date`). **Metric** (GSV/ASV) and **View by** (person/team) → in-memory re-aggregate (`recompute()`), no refetch.
- GSV = gross (not cancelled, not downgrade); ASV = gross **and** has `paymentplanassureddate`. Both computed together in `accumulate()`; metric just selects which pre-computed field to show/sort (only the chart actually filters by metric).
- View-by: builds `salespersonname → team` map from `sales_teams.members`; unmatched names → "Unassigned". Name-based join (fragile to case/whitespace/renames/homonyms — no IDs).
- 6-month sales-vs-cancellations chart uses `loadSalesSince(6)` + `loadCancellations(6)` — fixed 6-mo window, ignores the Time frame; start = `monthsAgoStart(6)` (1st of month 5 months back), no end bound (open `>=`), months bucketed in `buildMonthly()`.
- Filter dropdowns (source/originalsource/salesperson/team) are DERIVED from loaded data in `aggregate()` (`distinct(...)`), not separate queries; source/originalsource/salesperson lists shift with the Time frame, team list is fixed.

### Sales Teams (`src/app/Journey Onboarding/sales-teams/`, 3 files) — CRUD on `sales_teams`
- `createTeam` (setDoc, stamps `seedTag:'sales-numbers'`), `saveTeamMembers` (updateDoc `members`+`lastupdate`), `deleteTeam` (deleteDoc). Roster from `loadAllSalespeople()` = full-scan distinct `salespersonname` in `salesleads`.

### Routes
`app.routes.ts`: added `sales-numbers` + `sales-teams` after the `salesleads` route (authGuard). **Not linked in any nav menu yet.**

### Unrelated perf tweak (`70d323e`)
`participant-delivery-sequence.component.ts`: `loadProfileList()` split out of `mapData()`, called in background only when `developer`; `sortDelivery()` hoisted out of the appointment/form loops.

## Known follow-ups (not blockers)
- **Redundant reads:** each reload reads `salesleads` up to 4× (timeframe fetch + 2 fixed 6-mo chart fetches, heavy overlap). Fix = one wide fetch + in-memory slicing.
- **`loadAllSalespeople()` full-collection scan** in Sales Teams.
- No `limit()`/pagination; all business filters client-side.
- Name-based team join has no referential integrity (see above).
- `seedTag:'sales-numbers'` is stamped on BOTH seeded AND real UI-created teams → a reseed's cleanup (`where seedTag=='sales-numbers'`) would delete real teams. Safe on emulator/starlabs-test only.

## Verification
Clean `ng build --configuration production` (0 errors) with all changes present. (Note: prod build only compiles clean because `node_modules` was reinstalled this session — see [[prod-build-preexisting-errors]]: livekit-client had to be bumped 1.15.13 → 2.19.1 via `npm install --legacy-peer-deps`.)

---

## Per-screen revert guide

### Screen — Sales Numbers + Sales Teams · promotion · DONE 2026-07-03
Net-new folders + 2 route lines, isolated in commit `041ed7e`.
```
git revert 041ed7e            # on development (removes both folders + the 2 routes)
git revert -m 1 6023a0f       # on production (revert the merge, first-parent) — reverts BOTH commits
```
To drop just the code without the routes: `git rm -r` the two folders and delete the two `sales-numbers`/`sales-teams` lines in `app.routes.ts`. No other file references them.

### Screen — Participant Delivery Sequence · profile-list lazy-load · DONE 2026-07-03
One file, isolated in commit `70d323e`.
```
git revert 70d323e
```
Reverting restores the original `mapData()` (profile list loaded inline, blocking) and the in-loop `sortDelivery()` calls. Symbol to confirm removal: `loadProfileList()`.

**Production merge `6023a0f` contains BOTH commits** — `git revert -m 1 6023a0f` backs out the whole promotion in one shot; revert individual commits to remove just one feature.
