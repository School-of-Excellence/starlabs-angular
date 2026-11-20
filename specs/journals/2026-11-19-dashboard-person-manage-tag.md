# 2026-11-19: Workshop dashboard, "Manage tag" in the side-panel person menu

Plan: `specs/plans/2026-11-19-dashboard-person-manage-tag.md`.

## Operator decisions

- **Access:** only the `static meta data/Workshop Admin.clearworkshop` list. The per-workshop Clear tick does not grant it, and neither does full dashboard access.
- **Tags:** segment tags only (`newusertags` where `type == 'newusersegments'`).
- **Behaviour:** add and remove.
- **Enrolments:** one enrolment doc per person per workshop. A second doc, if one ever exists, gets the same change.

## What landed

All of this is uncommitted in starlabs-angular; the operator commits.

- **`WorkshopAccess.inClearList()`** (`workshop-access.model.ts`):
  - it is just the list check;
  - `can('clear')` now calls it, with the same result as before;
  - there is **no** `WORKSHOP_ACCESS_KEYS` entry, so no new tick appears in Dashboard Access.
- **Pure engine helpers**, unit-tested:
  - `segmentTagList` (drops blank or duplicate rows, trims, sorts A→Z case-insensitively);
  - `personTagIds`;
  - `tagTogglePlan` (`{docIds, add}`);
  - `applyTagToggle`.
- **Component:**
  - **Menu items.** After View participant data:
    - the **Manage tag** item, shown only when `canManageTags`;
    - for a person not enrolled in this workshop, a disabled "Not enrolled in this workshop" item instead.
  - **Submenu:** a `menuitemcheckbox` per tag, ticked from the live enrolled snapshot.
  - **Choosing a tag** writes one `writeBatch` of `update({ tags: arrayUnion | arrayRemove })` on the person's enrolled doc(s) for this workshop:
    - the `tags` field only;
    - `update()` never creates a doc.
  - **While it saves:** the item is disabled with a spinner. A second click is ignored.
  - **On failure:** a snackbar says "Could not update the tag".
  - **The submenu stays open after a choice**, because the click stops propagation. Several tags can be set in a row.
  - **The tag list is read on the first person-menu open**, with `getDocsFromServer`. A failed read is retried on the next open.
  - **After a change**, the open panel's chips and Tag filter options are patched (`patchPersonTagChips`), and so is Participant Data if that person is open there.

## Why each constraint landed

- **List-only method, not `can('clear')`.** The operator wants the shared list as the only rule. Going through `can('clear')` would also let the per-workshop Clear tick through.
- **No access key.** Any `WORKSHOP_ACCESS_KEYS` entry turns into a tick in the Dashboard Access settings, which would make it grantable per workshop. The operator ruled that out.
- **`getDocsFromServer` for the tag list.** Offline, `getDocs` answers from the memory cache. That cache already holds the few tags `loadTagNames` read by id, so the answer would be partial and non-empty, get kept as `'ready'` for the whole visit, and tags would be silently missing. `getDocsFromServer` fails instead, so the read is retried.
- **`trackBy: trackPanelPerson` on the panel rows, and `closePersonMenuIfGone()` at the end of `applyFilterSide`.** These came from the review (medium).
  - **The problem:** Material 19.2 does not close a menu when its trigger is destroyed. In Not in Chat Group, every enrolled snapshot (which a tag write causes) rebuilt every card. With a Tag filter ticked, removing that tag removed the row. Either way, the person menu vanished, `personMenuOpen` stayed true (which hid the Sale Achieved hover card), and the Manage tag submenu was left floating.
  - **The fix:** trackBy keeps the row and its trigger for the same person. When the person really leaves the list, the menu is closed properly first, and its submenu closes with it.
- **The tick reads the live snapshot, but the chips are patched.** The ✓ and Top tags already follow the live enrolled list. The side panels are click-time snapshots (see the 2026-11-19 live-update answer), so only the changed person's chips are patched rather than making the panels live.
- **The person-meta re-read on every enrolled snapshot was left alone.** Each tag click re-reads `participant metadata` for every enrolled id.
  - **Why not skip it:** that re-read is the only way metadata changes reach an open dashboard, because metadata has no live listener. Skipping it whenever the id list is unchanged would leave people stale or "Unknown".
  - **Status:** this predates this change. It was rated low by the review and is left as is.

## Checks

- **Production build:** exit 0.
- **Unit tests** (all with the scoped tsconfig `scratchpad/mtg-tsconfig.unit-scope.json`):
  - New-Workshop unit specs + person-tags + exist-users + access model: **348/348**;
  - every `src/app/**/*.unit.spec.ts` plus those three: **2584/2584**.
- **E2E,** all 13 `workshop-dashboard*` files: **107/0/0**, with no emulator restarts.
  - The new file has 15 cases: WPT-01..13, with WPT-04 split into a/b/c.
  - Before the fix round: 101/0/0.
  - Hub cases:
    - list order, and that non-segment tags are not offered;
    - add, and remove, writing only `tags` and touching no other doc (including p0's enrolment on another workshop);
    - access: admin not on the list → hidden; per-workshop Clear tick → hidden; on the list → shown; list emptied → hidden;
    - not enrolled → disabled and inert;
    - Total Enrolled chips and Top tags follow without reopening;
    - a second enrolment doc gets the same change;
    - a live change moves the ✓;
    - the busy guard holds the write in flight against double clicks;
    - keyboard;
    - the tag list is not read before the first menu open;
    - Not in Chat Group keeps the same row node across two choices;
    - with the Keep filter ticked, removing Keep closes both menus with nothing left floating.
- **Readiness gate:** MATCHED. 1699 selectors, nothing uncovered. The 3 new hooks (`wd-side-person-tags`, `wd-side-person-tag`, `wd-side-person-tags-note`) are all tested.
- **Hub:** committed locally as `4393677` on main, 1 ahead of `origin/main` (`928e9b7`). **Not pushed.**
- **Servers and other repos:**
  - test servers are stopped;
  - port 4200 (pid 835) was untouched;
  - the cloud-function repo is clean;
  - no git write in starlabs-angular.

## What surprised us

- A dev-server rebuild that failed mid-edit (the HTML referenced `trackPanelPerson` before the TS had it) left a `<vite-error-overlay>`, which blocked WPT-01's login click in a solo run. This was environmental. The full run after it passed.
- The functions emulator still fails to load the CF triggers (`functions.config()` was removed in firebase-functions v7). It made no difference to these cases.

## Open, for the operator

1. **A clear-list member without the participant progress right can't reach Manage tag.** The name is a menu trigger only with `can('participantprogress')`, which hub WDP-04 relies on. Should the clear list alone make the name clickable, showing only Manage tag?
2. **Unit specs CI never runs:**
   - **The files:** `workshop-access.model.spec.ts` (holding the list-only cases) and the new `workshop-dashboard.person-tags.spec.ts`.
   - **Why:** CI's unit gate only picks up `*.unit.spec.ts`.
   - **Suggestion:** rename the model spec to `workshop-access.model.unit.spec.ts`. It has no imports, so it compiles under `tsconfig.unit.json`.
   - **Until then,** run them with the scoped tsconfig above.
3. **Before production:** fill `clearworkshop`, and confirm the rules allow admins to update `tags` on `workshop participant enrolled`.
