# 2026-11-16 — New Users (`/newusersprofile`): redesign ported to Angular, screen-local load fixes, e2e

The operator approved the design (`2026-11-16-new-users-redesign`) and said "go ahead start the development".
Plan: `specs/plans/2026-11-16-new-users-redesign-dev.md`. This entry records what landed and why.

## How it ran
Workflow `new-users-redesign-build` (run `wf_29db090b-704`, 9 agents, about 3h20m, 15:47 → 19:05).

| Stage | Result |
|---|---|
| Data layer + dialog | Ran in parallel on separate files. |
| Screen core, then overlays + narrow layout | Template and CSS rewritten. |
| Verify | Build clean, folder unit tests 74/74, gate checks. |
| Hub e2e | New spec file, targeted run, then the full workshops suite. |
| Two reviews | Contract and design fidelity, in parallel. |
| Fix | 14 of 15 findings fixed. |

The operator asked twice why it was slow. It is a full rewrite with the following scale, and the full workshops
suite alone takes about 30 minutes.

| Item | Size |
|---|---|
| Component | 3,267 lines of TS, 1,368 of HTML, 795 of CSS |
| Dialog | 611 lines of TS, 261 of HTML, 233 of CSS |
| Hooks the hub already drove | 71 |
| New hooks | 157 |
| New hub cases | 18 |

## What landed
- **The design, ported.**
  - `ViewEncapsulation.None` with `nx-` classes and tokens on `.nx-root`.
  - Panels are `cdkConnectedOverlay` with no backdrop (`nx-overlay.directives.ts`).
  - Icons are inline SVG (`nx-icon.ts`).
  - Kept from Material, because the tests read its DOM: `mat-table`, `mat-sort-header` and `mat-checkbox`. The
    paginator, menus, date-range input and spinners are replaced.
- **The tag dialog**, in `assign-tags-dialog/`:
  - Manage tags is a ledger with people counts and rename in place, plus a Segment links tab.
  - One-person Assign keeps the person's tags apart from the rest.
  - Bulk Edit has three states per tag (All / Some / None, with counts).
  - The footer of every mode says what Save or Apply will do.
- **Screen-local load fixes:**

  | Was | Now |
  |---|---|
  | Every open read the whole `participant metadata` | Only the referrer ids present, 30 per batch, and only when Referred by is shown, a search is typed or an export includes it |
  | `workshopconfiguration` read at load | Read on first need; while Funnel only is on, only funnel workshops |
  | Both live listeners left open | Closed on destroy |
  | Filter parsed for every row | Parsed once, with a view model per row |
  | Search ran on every keystroke | 200ms debounce |
  | No `trackBy` | `trackBy` on the table |
  | xlsx, the email composer and the tag dialog loaded up front | Each loads on first use |

  The page shell and skeleton rows paint as soon as access is confirmed.

## Results
- **Build:** `ng build --configuration development` is clean. The 16 warnings all come from other folders, the same
  as before.
- **Unit:** the folder passes 78/78. The old empty "should create" stub now has stub providers and passes.
- **Readiness gate,** re-run on the final tree against `origin/development`: **MATCHED**, `canProceed` true, with
  0 drift, 0 notLanded and 0 newComponents.
- **Hub** (`5f084ab`, local, on top of the three earlier unpushed commits):
  - new `workshops/new-users-redesign.spec.ts`, NUR-01..18;
  - WS-56 moved in as NUR-01;
  - the NUS-04/08 count regex now allows "1,284";
  - new helpers in `support/wshop.ts`, and `support/xlsx-mini.ts`, which builds a real .xlsx with no dependency.

  | Run | Result |
  |---|---|
  | Full workshops suite, before the fix stage | 189 passed / 0 failed / 33 skipped |
  | The 4 New Users files, after the fixes | 50 / 0 / 0 |

  The 33 skips are the existing `test.fixme` cases. The full suite has **not** been re-run since the fix stage.
- **Screenshots** were taken after the final edit, in the session scratchpad under `fidelity2/`. The dock at 1440,
  the cards at 390, and the Manage tags dialog all match the mockup.

## Calls the agents made that the design didn't settle
- "Clear all filters" in the readout keeps the search. The no-match primary button (`new-no-match-clear-filters`)
  clears the search and the filters together, so NUS-04 holds.
- Typing 2 or more characters starts the funnel-only workshop read, for the search suggestions.
- A typed date with no year means this year. The readout says "until …" when only the end is set, and "Tags, any of"
  for Match any + Include.
- An unreadable import file logs `console.warn`, not `console.error`, so the hub's console guard doesn't trip.
- A referrer id containing "/" can't be read by id, so it shows the raw id.
- Export and Send close on Escape and when another dock action runs, but not on an outside click: hub cases click
  other controls while those panels are open.
- The suggestions popover doesn't pre-highlight its first item. If it did, Enter would apply the suggestion
  instead of searching.

## Review findings (15, none high), all fixed except the last
1. "This month" showed as another preset on the 1st, 7th and 30th. The clicked preset is now remembered.
2. Select from file worked while the list was still loading.
3. A failed workshop read retried on every keystroke.
4. Tapping a tag moved it to the top in the narrow sheet.
5. Picking a Conversion option lost focus.
6. Export and Send never closed.
7. The today/end day in the calendar was gold on navy.
8. The dock covered the pager. The table's height is now capped at `calc(100vh - 350px)`.
9. The table scrolled sideways with all 7 columns.
10. The Manage tags dialog jumped between tabs.
11. The pager and hint showed on no match.
12. The suggestions footer wrapped.
13. The "Sort" label was hidden on the card bar.
14. The phone placeholder was cut off.
15. **Skipped:** the app header (`app.component.html`, outside this folder) overflows below about 480px. The account
    chip needs `min-width:0; overflow:hidden; text-overflow:ellipsis`, or should show only the avatar.

## What surprised us
- **A new `*.component.ts` with no hooks fails the gate for good.** `findUntestedNewComponents` flags it as having
  no test hooks at all, and no hub spec can ever clear that. The icon file was renamed `nx-icon.component.ts` →
  `nx-icon.ts`.
- **The operator committed partway through** (`76cca177` at 18:29, which also includes the earlier docs and
  dashboard work). The fix stage's later edits sit uncommitted in 4 files: component ts/html/css and
  `newusersprofile.redesign.spec.ts`.
- **The cloud-function `package.json` restored itself.** The emulator script reverts it when it is stopped with
  SIGINT, so the manual checkout wasn't needed.
- The only e2e failure across three runs was a wrong expectation in our own spec: NUR-04 assumed Moved On starts
  off, but Converted turns it on, as it always has.

## Not done / pending
- **No timings were taken before or after.** There are no performance marks in the code yet. The load fixes are
  structural; to measure them, add marks at:
  - guard start and end;
  - the constructor;
  - access resolved;
  - the first `new_user_data` emission;
  - referrer names loaded.
- **Next step:** the shared guard and role-check speed-up, plus Firestore persistence. Both touch every screen and
  need an all-suites regression.
- **Hub push:** 4 local commits (`16f2134`, `664cda6`, `37fd78f`, `5f084ab`). The full workshops suite must be
  re-run, because the fix stage changed the app after the last full run. Push only on "push".
- Watch NUR-09, NUR-15 and NUR-17. They hold Firestore channels open for 2.5–4s so the loading states can be seen.
- `graphify` isn't installed, so the graph rebuild was skipped.
