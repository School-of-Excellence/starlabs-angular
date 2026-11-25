# 2026-11-19 — Workshop dashboard: people who enroll while it is open showed as "Unknown · No login yet"

Plan: `specs/plans/2026-11-19-dashboard-late-enrollee-names.md`. This went through the bugfix process: Stages 1–3 on 2026-11-18, and the operator approved the plan with "ok do".

## The report

In production, the Not in Chat Group panel listed a person as "Unknown · No login yet". It was a different person each time. After a refresh, that person was in the group and "Unknown" was gone.

## Root cause

**The dashboard learned about enrollees live but read `new_user_data` only once.**

1. Three things are live:
   - the enrolled list;
   - the `supportchat/{selectedgroup}` members;
   - `participant metadata`, which is re-read for every enrolled id on each snapshot.
2. `new_user_data` is read once, when the page opens.
3. Someone signs up and enrolls while the page is open. The EiFlix workshop app adds their login to the group (`workshop_service.dart:962`). The dashboard has no record of them.
4. Because of that:
   - their name is "Unknown";
   - they are counted under **Existing**, not New;
   - `uidOf` finds no login, and `resolveProfileUserRefs` caches "no login" for good.

**A second route to the same symptom:** the enrolled `onSnapshot` handler is async, so an older snapshot's metadata read could finish last and overwrite `mapProfile`.

This existed before the 2026-11-18 Lite change, which did not cause it.

## What landed

All uncommitted in `workshop-dashboard/`; the operator commits.

- **`missingProfileIds()` and `newUserDocsById()`** (engine, pure, unit-tested).
  - `missingProfileIds` returns enrolled ids that are in neither map and have not been asked about yet.
  - It skips ids containing `/`, because one bad id would fail its whole batch of 30.
- **`fillMissingNewUsers()`** reads only those ids with `where(documentId(),'in', ≤30)`.
  - It runs only once the big read is `'ready'`, and nothing waits for it.
  - When it finds people, it merges them into a new `mapProfileNew` and runs the same catch-up as when the big read lands. Then it calls `loadSaleAchieved` again, which does nothing unless the set of emails changed.
- **Not in Chat Group** leaves out:
  - ids whose lookup is pending;
  - ids from a snapshot whose metadata read is still out.
  - So nobody flashes as "Unknown · No login yet".
- **Enrolled snapshot counters** (`enrolledGen`, `enrolledGenApplied` and `enrolledGenDone`), in the new methods `loadEnrolledMeta` and `applyEnrolledMeta`.
  - An older result is dropped only when a newer one has already been applied.
  - An older read that lands first still applies, so first paint never waits for a later snapshot.
  - A failed metadata read is now caught. Before, it was an unhandled rejection.

## Why each constraint landed

- **Full SDK, not Lite, for the small read.** Hub WNU-03/04 hold every Lite `runQuery` that reads `new_user_data`, to prove first paint does not wait for it. A Lite read here would also be held.
- **`getDocsFromServer`, not `getDocs`.**
  - When the connection drops, the full SDK's `getDocs` answers from the empty memory cache and does not throw.
  - Late joiners would then be marked as never found, and stay "Unknown" for good.
  - `getDocsFromServer` fails instead, so they are asked again.
  - The lookup also retries twice (after 1 s, then 3 s) and gives up after 20 s, so those people are not left out for long.
- **The fill is called before `recomputeNotInChat`, not at the end.** Called at the end, the recompute would already have listed the person as Unknown and sent them to the `profile_data` login lookup.
- **The fill uses `appliedEnrolledIds`** (the list that the applied metadata read was for), not the newest list. Ids from a newer snapshot have no metadata yet, and would trigger lookups for existing users.
- **Orphan enrolments** (in no collection) are asked about once, then remembered. They show as "Unknown", which is correct for them. This means one small extra read when the big read lands, if any orphans exist.

## Checks

- Production build: exit 0.
- Dashboard unit specs: **274/274**:
  - engine, glance, exist-users (+ the late-enrollee cases), export;
  - including real deferred metadata reads that finish out of order.
- E2E, all 12 `workshop-dashboard*` files: **92/0/0**, both before and after the fix round.
- New hub cases **WDC-LATE-01/02**:
  - two new users enroll while the page is open (the group update comes after the enrolment, as the app does it);
  - the one in the group is not listed;
  - the other is listed **by name** with Add to group, with no "No login yet";
  - New Users +2, Existing unchanged;
  - both shown by name in Total Enrolled.
  - These checks would fail on the old code.
- Readiness gate: **MATCHED**, 185/185 hooks; no new hooks.
- Hub: committed locally as `f47ce32`, **not pushed**.
- Servers stopped; 4200 untouched; the cloud-function repo is clean.

## Left as is

- **An open Existing or New Users panel isn't corrected.** If it was opened between the late enrolment and the lookup landing, it keeps the person in the old group until it is reopened. Fixing that would make those click-time panels live; the review rated it low.
- **A new user who converts to existing while the page is open** stays "New" until a refresh (stale `movedtoexist`). This was out of scope.

- **Hub push (2026-11-19 ~09:50):** the full workshops suite passed 247/0/33. Rebased onto 4 upstream commits by another author (readiness scripts, manifest, atc/comms/journey, version pins; no workshops files). After the rebase, `--list` gives 22 tests and the gate is MATCHED. Pushed `cc177d5..928e9b7`.
