# 2026-10-16 — EiFlix Banner: Title and Description optional

## What changed (operator request)
- `eiflix-banner.component.ts`: `title` and `description` lost `Validators.required`, so there is no
  asterisk on their labels.
- The `submit()` guard ("Please fill all fields") is removed. It only ever checked those two fields.
- Empty values are stored as `''` (`|| ''`), never null. `resetForm()` resets them to null, so a
  second save after a reset would otherwise have written null.
- The list's search filter and the description cell now tolerate a missing title or description,
  so a banner saved without them can't break the table.
- The other fields are unchanged.

## Tests
- The app compiles: the emulator dev build came up with no errors.
- Hub WS-66 (`workshops/workshops-list.spec.ts`):
  - Opens the dialog from /workshops and checks neither field is marked required.
  - Saves with both empty and polls `eiflixbanner` for the app-written doc. Its title and
    description must both be `''`.
  - Deletes only the doc it created.
  - Committed locally, NOT pushed and NOT yet run. Port 8080 was taken by the operator's Flutter
    process (dartvm), so the Firestore emulator could not start.
- Next: when 8080 is free, run WS-66, then the full workshops suite (run-isolated.sh with
  SUITE_DIR=workshops), then push.

## Workshops header: one Actions menu (operator request)
- The six header buttons are replaced by one **Actions** button (`wor-actions-menu`) that opens a
  mat-menu.
  - Order: New Workshop first (with a divider after it), then Popup Banner, New Users, Referral Code,
    EiFlix Banner, Products.
  - Each item keeps its old `data-testid` and its old `*ngIf` access rule. New Workshop shows only
    with editing rights, New Users only with new-users rights.
  - `MatDividerModule` was added for the divider.
- Hub:
  - WS-46, WS-47 and WS-66 open the menu before clicking an action.
  - WDA-05 opens the menu and checks Popup Banner is visible before asserting that New Workshop and
    New Users are absent. Without that, a closed menu would make "absent" pass for the wrong reason.
  - New WS-67:
    - The Actions button is the only header button.
    - The actions stay hidden until the menu opens; then the admin sees all six, in order.
    - New Workshop opens the editor tab.
- The app compiles: the emulator dev build came up clean.
- The e2e tests have NOT run yet, because port 8080 is still held by the operator's Flutter dartvm.
  Hub commits are local, waiting for a full-suite run.

## Touch Point (Actions menu -> full-screen dialog)
- `workshops/touchpoint/`: the component plus `touchpoint.logic.ts` (pure rules, unit-tested).
  - **Date range:** between three months back (a short month clamps to its last day) and today.
    Defaults to the last 3 days: today and the two before it.
  - **Picks:** episodes (`episodes.title`) and series (`series.seriesName`) are multi-selects with
    search. A series stands for the episodes in its `sequence`.
  - **Data:** content analytics is read by `videoid in [...]`, 30 ids per query, all in parallel. The
    `logdate` range is applied in memory. An id + date query would need a new composite index in
    production; this one needs only the automatic single-field index.
  - **Rows:** one per profile, with name and email from `profile_data`, the episodes watched, Total Run
    Time and Watched, and the last watched time.
    - Run time is each watched episode's `totalruntime` counted once.
    - Watched is the sum of `totaltimespend`.
    - An exactly repeated entry (same profile, video, time and time spent) counts once, the same
      duplicate rule as the content analytics screen.
  - Read only.
- The Actions button's caret needed `iconPositionEnd`. Without it, Material projects every
  `mat-icon` before the label.
- Checked on screen with seeded data: the default range was 14–16 Oct, so an entry from 3 days ago
  dropped out as it should. p1's run time is 1h 30m with that episode counted once. The total
  watched is 57m.
- Hub (e2e): the operator asked to write the tests AFTER the feature is complete. WS-68 already
  exists and was extended for the 6 untested hooks (calendar button, two search boxes,
  loading/error/empty), but that run was stopped. It also still asserts the old Views column, so it
  must be reworked for Run Time / Watched when tests resume. Three hub commits are local and
  unpushed, and the latest WS-68 edits are uncommitted.

### Touch Point round 2 (operator)
- **Names:**
  - Now from `participant metadata` (existing users), keyed by doc id, then `new_user_data` for anyone
    not in it.
  - Docs with `movedtoexist == true` are skipped; the operator's rule is that those people are in
    participant metadata.
  - `profile_data` is no longer read.
  - New users get a "New user" chip.
- **Episode picker:** sorted by the episode's `date`, newest first, with the date shown in the list. The
  closed picker shows titles only, through `mat-select-trigger`.
- **Result filters:** applied to the loaded rows, with no new reads.
  - Search by name or email.
  - User type: All / New users / Existing users, with counts.
  - Watched ≥ N minutes. The box accepts digits only: anything else is stripped as it is typed.
  - Progress: All / Finished (90%+ of run time) / Not finished. A finished row also shows a small
    "Finished" label.
  - Sort: Last watched / Most watched / Name.
  - Clear.
  - The summary reads "X of Y profiles" while a filter is on.
- **Seeded check:**
  - `3a0` typed into the minutes box becomes `30`.
  - Watched ≥ 30 leaves the one 41m 40s viewer.
  - New users shows only the new_user_data person.
  - A moved-to-existing new user with no metadata doc shows by id only, which is expected.
- Tests are still deferred, by the operator's choice.

### Touch Point round 3: nothing picked = the Hot Leads rule
- With no episode and no series picked, Show Profiles reads `content analytics` by the `logdate`
  range alone, the same query Hot Leads makes.
  - It keeps only `type` eiflix / eiflixcontent, and uses the same profile-id guard.
  - It adds up each person's `totaltimespend` across everything they watched.
  - The "Watched ≥ (minutes)" filter then plays the part of Hot Leads' minimum watch time.
- A note under the filters says so, and the summary reads "All EiFlix content". The column becomes
  "Content watched".
- Titles: the episode title first, then the entry's own `videoname` / `contentname`. Anything still
  unnamed is counted as "+N other".
- Picked episodes/series mode is unchanged.
- Seeded check: a `solarvoice` entry of 9999 s was left out. A non-episode item showed by its own
  name, with its run time and watch time added in.

## 2026-10-21 — Touch Point dropped (operator)
- The operator dropped the feature entirely. Removed:
  - the `workshops/touchpoint/` folder (component, logic, logic spec);
  - the Actions menu item `wor-open-touchpoint`;
  - `openTouchpointDialog` and its guard.
- The Actions menu is back to six items.
- The hub's uncommitted Touch Point work was discarded: WS-68, `seedTouchpoint`/`clearTouchpoint`, and
  WS-67's bump to seven items. The committed WS-67 already expects six.
- The build passes.
- The Touch Point notes above stay as history only; nothing of it ships.

## 2026-10-21 — EiFlix Banner: EiFlix Mobile switch (enableeiflixmobile)
- Visibility now has three switches: Web (`enable`), Mobile (`enableapp`), and EiFlix Mobile, a new
  boolean `enableeiflixmobile`. It behaves exactly like the other two:
  - on by default for a new banner (form default and `?? true` on save);
  - `?? false` when editing an older banner that lacks the field.
- Banner List: a third status pill (`eb-status-eiflixmobile`) and a third quick switch
  (`eb-change-toggle-platform-eiflixmobile`). `togglePlatform` writes only that field.
- Visibility uses a new `.grid-3` (one column on phones).
- Hub WS-70 checks the default, the stored boolean, the pill and the quick switch (Web and Mobile are
  untouched). It passes, and WS-66 still passes. The commit is local.
- (Earlier the same day, a similar pair of switches went into the Popup Banner dialog by mistake.
  The operator meant this dialog, and that change was fully reverted.)
