# PROGRESS

## Current state
- **starlabs-angular `nanda-development`**: HEAD `f1124b66`. Everything since 2026-11-12 is **local and
  uncommitted**: 17 modified files and 9 new ones (2 unit specs, 1 plan, 6 journals). Not merged, not deployed.
- **starlabs-e2e-tests `main`**: pushed through `69bd71c`. The full workshops suite ran first: 169 passed /
  0 failed / 33 skipped. The new spec files are gated on hooks that ship with the uncommitted app changes, so
  CI skips them until those land.
- Unit tests:
  - `workshop-dashboard.export.spec.ts` 15/15, `newusersprofile.columns.spec.ts` 5/5,
    `workshop-access.model.spec.ts` 7/7.
  - The dashboard folder has 197 passing and 1 failing; the failure is the old empty "should create" stub.
- The test servers are stopped and the cloud-function `functions/package.json` is restored.

## Last session changes (2026-11-12 → 11-16)
- **Workshop dashboard, Total Enrolled.**
  - The export adds Enrollment Date (with time) and Tags.
  - The side filter is All / New / Exist. People in `movedtoexist` count as Exist everywhere, which also fixes
    the "New" tags.
  - Cards show tag names. There is a Tag filter, and a sort that opens newest-enrolled first.
  - Participant Data shows the enrollment's tags.
  - Journals: `2026-11-12-total-enrolled-*`, `-new-exist-and-export-tags`, `2026-11-13-total-enrolled-sort-and-pd-tags`.
- **Clear button.** Only `Workshop Admin.clearworkshop` or that workshop's own Clear tick grants it; full
  dashboard access no longer does.
  - Fixed along the way: the access editor's save deep-merged the grants map, so removing someone or pressing
    None kept their stored actions. It now uses `mergeFields`.
  - Journal: `2026-11-12-clear-button-access`.
- **New Users screen (`/newusersprofile`).**
  - Manage tags can rename a tag. Before, clicking a tag in that mode did nothing.
  - Column chooser: Name, Phone, Email, Created and Tags by default, saved per browser.
  - Layout:
    - a two-row toolbar;
    - a sticky header;
    - a selection bar under the table instead of the side panel that squeezed it;
    - real loading and no-match states;
    - full tag names;
    - a Created filter that matches the other filters.
  - A two-reviewer pass found 10 small bugs; all are fixed and tested (NUS-06..11).
  - Plan `specs/plans/2026-11-12-new-users-screen.md`; journal `2026-11-12-new-users-screen`.
- **EiFlix home config, Upcoming Workshops.** Confirmed now counts the responses, the same set View lists,
  instead of the number stored on the widget. The stored number is untouched, and EiFlix still shows it.
  Journal: `2026-11-13-eiflix-confirmed-vs-responses`.
- **Failures and their root causes.**
  - WS-40 timed out once in the full suite. It passed on a rerun and nothing touches it, so it was a flake.
  - WNE-07's first negative control used p1, who is "enrolled, not started" and so has no progress row.
    Switched to p0, untagged.
  - Behaviour-only changes need a new hook. The hub-ahead guard only skips a spec file that references a hook
    the branch lacks; otherwise older branches would go red.
  - A session cut-off left one e2e rerun unrun. It ran later, with the follow-up work.

## Pending
1. **Operator: commit all the angular files above together.** The pushed hub specs key on their hooks.
2. **Before deploying to production:**
   - put the right profile ids in `static meta data/Workshop Admin.clearworkshop` (full-access people lose
     Clear on deploy);
   - confirm the Firestore rules allow **updating** `newusertags`, or renames will fail with "Could not
     rename the tag".
3. **EiFlix Confirmed**: the stored `confirmed` can still differ from the real responses. Option 3, a one-off
   repair, is not done; it needs approval and an approved way into production.
4. **New Users audit, not done:**
   - three-state chips in bulk tag edit;
   - search inside the filter menus;
   - debounced search;
   - a load-error state;
   - collapsing the filters on narrow screens.
5. **Known, left as is:**
   - a full-access person's hidden per-workshop Clear tick still grants Clear;
   - a failed admin-lists read can let the editor save empty lists.
6. `graphify` isn't installed here, so the graph-rebuild step was skipped.
7. Carried over:
   - `/engagementdashboardv2` needs a route-config entry and `authGuard`;
   - EiFlix consumers must read `showtext`, and the learner app `allowedit`.
   - Older ATC slider items: see `specs/journals/2026-11-03-participant-view-and-slider-contract.md`.
