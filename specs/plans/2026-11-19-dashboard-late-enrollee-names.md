# Workshop dashboard: people who enroll while it is open show as "Unknown" (2026-11-19)

The operator approved this plan with "ok do" after the Stage 1–3 bugfix review on 2026-11-18. The root cause was agreed in Stage 2.

## Bug

In the Not in Chat Group panel, a person shows as **"Unknown · No login yet"**. On every refresh it is a different person, and after the refresh the person has joined the group and "Unknown" is gone.

## Root cause

**The dashboard sees new enrollees live but read `new_user_data` only once.**

1. Three things are live: the `workshop participant enrolled` list, the `supportchat/{selectedgroup}` members, and `participant metadata`, which is re-read for every enrolled id on each snapshot.
2. `new_user_data` is read **once**, when the page opens (`initializeProfileData`).
3. Someone signs up and enrolls while the page is open. The EiFlix workshop app adds their login to the group (`workshop_service.dart:962`).
4. The dashboard has no record of this person:
   - they are in neither map, so their name is "Unknown";
   - they are not treated as a new user, so `uidOf` finds no login;
   - `resolveProfileUserRefs` caches "no login" (`''`) for good.
5. Result: they are listed as Not in Chat Group with "No login yet", and are also counted under **Existing** instead of New until a refresh.
6. **The same symptom has a second cause.** The `onSnapshot` handler is `async`. When two snapshots come close together, the older one can finish last and overwrite `mapProfile` with its older id list.

This existed before the 2026-11-18 Lite change, which did not cause it.

## Change (`src/app/New-Workshop/workshop-dashboard/`)

1. **Pure helper `missingProfileIds(enrolledIds, metaDocdata, newUserMap, seen)`** in `workshop-dashboard.engine.ts`. It returns the unique, non-empty enrolled ids that are in neither map and have not been looked up yet. It has unit tests.
2. **`fillMissingNewUsers()`**
   - **Runs** only when `newUserDataState === 'ready'`.
   - **Reads** just the missing ids from `new_user_data` with `where(documentId(), 'in', batch ≤ 30)`. It uses the **full SDK** (`firestoreDefault`), **never Firestore Lite**, because hub WNU-03/04 hold every Lite `runQuery` that reads `new_user_data`.
   - **While a read is out:** the ids are marked pending, so a second call skips them.
   - **When the read lands:** it merges into a **new** `mapProfileNew` object and runs the same catch-up as `onNewUserDataSettled`:
     - rebuild `mapProfile` from `participantMetaDocdata` plus `newUserOverlay()`;
     - `refreshOpenPanelPeople()`, `recomputeNotInChat()` and `recomputeDerivedState()`;
     - `markForCheck`, inside `ngZone`.
   - **Ids not found** are remembered and never re-read. These are orphan enrolments, which keep showing as Unknown, correctly.
   - **On error:** it clears the pending flags and logs the error. Nothing breaks, and the next snapshot tries again.
   - **Never blocks:** it is called with `void`, at the end of every enrolled snapshot and at the end of `onNewUserDataSettled`.
3. **`recomputeNotInChat()`** leaves out ids that are pending lookup, so they never show as "Unknown / No login yet", and does not pass them to `resolveProfileUserRefs`.
4. **A counter on the enrolled snapshot** (`enrolledGen`). A handler whose metadata read was overtaken by a newer snapshot drops its result and does not write `participantMetaDocdata` or `mapProfile`.

## Scope and safety

- **What else reads the map:** `mapProfileNew` has 26 uses. They only gain entries, for enrolled people who were unknown before, so they now behave exactly as they would after a refresh.
- **Unchanged:**
  - first paint (the fill is gated on ready);
  - the whole-collection Lite read;
  - `participantMetaDocdata`;
  - every hook and every piece of UI text.
- **No schema change and no writes.**
- **Cost:** one small query per 30 unknown ids, only when someone new enrolls while the page is open.
- **Out of scope:** a new user who converts to existing while the page is open stays "New" until a refresh (stale `movedtoexist`).

## Verify

- **Unit:** `workshop-dashboard.engine.unit.spec.ts`; production build exits 0.
- **Hub:** new cases in `workshops/workshop-dashboard-communication.spec.ts`, using **existing hooks only**. With the dashboard open, the test writes two **late** new users (each with a `new_user_data` doc that has a uid, plus a W_DASH enrolment):
  - one with their uid in the group's members: they must not appear in Not in Chat Group;
  - one without: listed **by name** with Add to group. This is the negative control against "Unknown" and "No login yet".
  - Both show by name in Total Enrolled.
  - The New Users card goes up by 2 and Existing Participants does not change.
- **Then** run every `workshops/workshop-dashboard*.spec.ts` file (12 files).
