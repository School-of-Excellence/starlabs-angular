# 2026-10-13 · Segment Board: random doc ids + profile ids for "who" (plan, approved 2026-10-13)

Screen: `/segmentboard`. Journal (WHY): `specs/journals/2026-09-25-segment-board-component.md`.

## Operator decisions (2026-10-13)
| # | Decision |
|---|---|
| 1 | `segmentboardconfig` doc ids become Firestore auto ids, and **existing segments are migrated**. |
| 2 | `segmentboardlist` follows: doc id = the new id, and the `segmentid` field = the new id. |
| 3 | The migration runs as a one-time **in-app admin action** with a dry-run preview, under the admin's sign-in and the Firestore rules. |
| 4 | `createdBy` / `updatedBy` / `archivedBy` store the **profile id**. Existing config docs are backfilled from email to profile id. |
| 5 | History entries store `by: { profileid }` only. Old entries stay as written (the rules block updates). The view looks up the name. |

## A. New writes (code)
| Where | Change |
|---|---|
| Create | `doc(collection(db,'segmentboardconfig')).id` replaces `segIdFor(name)`. The `id` field = the doc id. The name must stay unique, as the dialog already checks. |
| `segmentboardlist` | The doc id and `segmentid` are always the config doc id; unchanged code. |
| Who | `profileid` from `profile_data` where `user_ref == user_data/{uid}` (as `authService.username()`), read once and cached. It goes into `createdBy`, `updatedBy`, `archivedBy` and history `by: { profileid }`. If no profile is found, the write is refused with a message: no email fallback. |
| History view | Names come from `profile_data/{profileid}`, read once per unique editor and cached. Old entries that hold `email`/`name` show as written. |

## B. One-time migration ("Migrate segment ids", admins only, Archived toolbar menu)
1. **Preview (no writes).** A table of each segment with a text id: old id → new id, list size, history count, and createdBy/updatedBy email → profile id. Unresolvable emails are flagged.
2. **Run.** One `writeBatch` per segment, so each segment is atomic and the run can be repeated; segments already migrated are skipped.
   - `segmentboardconfig/{newId}`: the same data, `id: newId`, `legacyid: oldId`, and the who fields as profile ids.
   - `segmentboardlist/{newId}`: the same list, `segmentid: newId`.
   - `segmentboardconfig/{newId}/segmenthistory/*`: a copy of each old entry, with `segmentid: newId`, `copiedfrom: oldId` and its original `at`/`by`. Then one `migrate` entry: `changes.id {from: oldId, to: newId}`.
   - **The old docs are retired, not deleted (no hard delete).** The old config is set to `archived: true` and `migratedto: newId`, hidden from the Archived view. The old list doc is deleted, since lists are derived data that the next refresh rebuilds anyway. The rules must allow list deletes, or the old list is left in place.
   - Batch size: config 1 + list 1 + history n + 1, which stays under 500 per segment. Segments with long histories split their history copy into extra batches.
3. **Verify.** After the run: live segment count, every list size and every history count match the preview, and the board reloads on the new ids.

## C. Other readers
| Reader | Change |
|---|---|
| Participant Intelligence | It joins config↔list by id, which still works after migration. Its **saved filters** (`searchquery`) may hold old segment ids, so the migration also remaps those (old → new). This needs a read of `searchquery` to confirm the shape first. |
| e2e (hub) | The seed and spec look the app-created segment up by **name**, not `sbSegId(name)`. The seeded manual segment keeps a fixed test id; it is test data, not migrated. |

## Safety
- Back up `segmentboardconfig` and `segmentboardlist` (console export) before running on production.
- Run on **starlabs-test** first. The dev environment points at production today, so switch it for the trial.
- Nobody edits segments during the run, which takes about a minute.
- Firestore rules needed for the run: `segmentboardconfig` create/update and `segmentboardlist` create/delete for the admin, plus `segmenthistory` create (already in place).

## Done when
- Build passes; hook-diff aligned (the new Migrate control is registered in the spec).
- Harness: preview → run → verify on the mock store, with a re-run skipping everything.
- e2e updated.
- Journal entry with a revert guide. Revert = the old docs still exist, archived and holding `migratedto`, so it is reversible by un-archiving them and archiving the new ones.
