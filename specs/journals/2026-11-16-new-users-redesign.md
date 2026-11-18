# 2026-11-16 — New Users (`/newusersprofile`): full redesign, design only, plus why it loads slowly

The operator asked for a complete redesign of the New Users screen, "world-class premium classic", delivered
as design only: "dont change anything in the code now". Load time is to be fixed when development starts.
No app source was changed. `find src -newermt` is empty for the whole session window.

Deliverables (plain HTML+CSS, no scripts, house vocabulary):
- `2026-11-16-new-users-redesign/new-users-ui.html`: the live screen. One file covers 1440, 1280, the 820
  tablet and the 390 phone. The layout keys off the content width, not the window.
- `2026-11-16-new-users-redesign/new-users-states.html`: 54 frames in 8 sections:
  1. loading;
  2. empty and error;
  3. filters and search;
  4. columns and file tools;
  5. tag dialogs;
  6. table behaviour;
  7. selection;
  8. below 900px.

## How it was made
Workflow `new-users-redesign` (run `wf_ffdbc228-e34`, 7 agents, ~70 min).
- **Three designers** worked in parallel, each building both files in its own direction:
  - **A, Heritage Ledger:** classic and editorial; a navy-and-gold ledger table.
  - **B, Facet Studio:** a left filter rail, saved views and a person drawer.
  - **C, Concierge Overview:** summary tiles, a person drawer and a floating action bar.
- **A read-only load-time investigator** ran alongside them (findings below).
- **Two judges** scored each design on five criteria, out of 50: usability, premium/classic feel, completeness,
  responsiveness and feasibility. One judge looked through a UX lens, the other through a craft lens.

  | Design | UX judge | Craft judge | Total |
  |---|---|---|---|
  | A, Heritage Ledger | 42 | 43 | **85** |
  | B, Facet Studio | 39 | 36 | 75 |
  | C, Concierge Overview | 37 | 40 | 77 |

  A won both. It was the most restrained and classic design, fitted 1280 with no sideways scroll, drew every
  state, and maps most directly onto the existing component, so it adds no new load-time reads.
- **A merge agent** built A plus grafts from B and C, and fixed all 19 items the judges listed. It then checked
  the result with the app's real global sheets loaded (Bootstrap 5, both Material themes, `src/styles.css`):
  - with the app's load order, position, size, font and colour are identical for every element;
  - the main screen renders pixel-identical with and without those sheets.

  It found and fixed two clashes on the way:
  - Material's letter-spacing on h2;
  - Bootstrap's table border-collapse.
- **My review pass** after the merge fixed four details:
  1. The tag list's separator was an inline span, so its line never drew and left an odd gap. It now shows as a
     line.
  2. In bulk Edit tags, the strike-through on a tag being removed also crossed out its "removes from 1" count.
     Flex items take the decoration, so the name is now wrapped and only the name is struck.
  3. Phone cards read "Referred by Subscriber". A subscriber has no referrer, so the badge now stands alone.
  4. The phone Filters sheet (8.2) now matches the readout beside it (8.1): Tags, excluding Corporate.

  After a rebuild, the main screen is still pixel-identical with the global sheets loaded. In the states file,
  the only differences are spinners caught at different animation frames.

## Why the design is shaped this way
- **Heritage Ledger as the base.** The operator asked for "premium classic", and A is the classic one:
  - Playfair only for display headings: the page title, dialog and sheet titles, and empty-state headings;
  - DM Sans with even-width figures for every number;
  - 1px ledger rules;
  - gold only as accents (the title rule, unsaved-change rings, focus), never as fills.
- **Filter values appear once.** The pills show only a label plus a count or dot. The readout line under the
  toolbar spells each filter out in words ("Tags, excluding Corporate", "Created 1 Oct – 15 Nov 2026"), with
  its own × and "Clear all filters". Showing the values in both places cost a row and read as noise.
- **Rules in plain words.** Match any/all with Include/Exclude is hard to decode, so a sentence under the
  switches restates the rule: "Hides everyone tagged Corporate."
- **Selection scope is always stated.** The current header checkbox already selects every filtered person on
  every page (`isAllSelected` walks `filteredData`), but nothing says so. The design adds:
  - the banner "All 148 people matching these filters are selected, including 128 on other pages · Select
    only this page";
  - "Select all N matching" on the dock;
  - "2 not shown" when filters hide ticked people;
  - the hidden count restated in Export ("Includes 2 hidden by filters") and Send ("2 are hidden by filters
    and still included").
- **The dock is sticky** 20px above the bottom edge, with space reserved below the table. With 50 or 100 rows a
  page, a dock that scrolled away would hide the bulk actions.
- **A tag button next to each row's tags.** A bordered 32px edit button sits right after the pills and "+N".
  "+N" is a focusable chip whose tooltip names the hidden tags. Untagged rows get a dashed "+ Add tag".
- **Emails never cut.** They break only before the @, with the full address as a tooltip. No "…" and no
  mid-word break at 1440 or 1280.
- **Tag names in full**, as the operator asked earlier this week (2026-11-12 follow-up).
- **Below 900px:**
  - rows become dense cards (about 135px at 820);
  - the four pills fold into "Filters N", a bottom sheet with "Show 12 people";
  - a Sort select replaces the header row;
  - the dock keeps labelled Tags / Export / Send.
- **Loading is staged** (1.1–1.3): checking access, then the tools with skeleton rows, then rows first with
  the count a moment later. This is the visual half of the load-time fix below. The page is never blank, and
  rows hold their height so nothing jumps.
- **Left out on purpose:**
  - B's facet rail and saved views, and C's summary tiles: tiles need whole-collection counts on every open,
    against the slow-load complaint;
  - the person drawers and per-row Message buttons: not asked for;
  - a desktop "Sorted by …" line: the header arrow already says it.
- **Must hold in the Angular port:**
  - no Firestore field names in any text;
  - every class carries the `nx-` prefix, so none can collide with Bootstrap;
  - tokens live on the screen root, not `:root`.

## For the development phase
### What the design adds beyond today's behaviour (scope to agree)
- "Select all N matching" and "Only this page", the cross-page banner, and the "not shown" chip.
- A Sort select on cards.
- Search suggestions that turn a typed tag or workshop name into a filter.
- Quick ranges (Today, Last 7 days, Last 30 days, This month) and typable dates in Created.
- Per-tag counts in the Tags panel and Manage tags. These are counted from the list already in memory.
- The no-match chips, each with that condition's own count. Also counted in the browser.
- A file-result banner that stays until dismissed, with "Show unmatched emails".
- A plain-language rule line, and footers saying exactly what Save or Apply will do.
- Export column chips with the row and column count.
- The Workshop and Moved On columns join automatically while their filters are on, as today.

Every existing feature and `data-testid` hook must survive the port. Hub NUS-01..11 and WS-22/23 key on them.

### Why it loads slowly (read-only investigation; nothing measured live)
Ranked by impact. Collection sizes come from the 2026-06-02 counts in `specs/data-reliability.md`, and are
probably larger now.

1. **High: the whole `participant metadata` collection is read on every open**, 3,310+ heavy documents with no
   cache, only to turn referrer ids into names (`newusersprofile.component.ts:237-239` →
   `authguard.service.ts:759-785`, `doc.data()` called 3× per document). The Referred by column is **off by
   default**.
   - Fix: read only the referrer ids actually present (`documentId() in`, batches of 30). Do it only when Referred
     by is shown, a search is typed or an export includes it. Then re-run the filter when the names arrive;
     today referrer-name searches miss until the next filter change.
   - Also: call `doc.data()` once per document and add the cache. This helps the 10 other callers.
2. **High: access checks run one after another before any data is read.**
   - The guard runs `getRoles`, then `username` (the same `profile_data` query again), then `routeConfig`, which
     reads the whole `dashboard` collection on every navigation.
   - The router fetches the screen's code only after that.
   - The constructor then resolves roles again.
   - The screen opens with `window.open` in a new tab, so every open is a cold start. Roughly 4 sequential round
     trips, 0.5–2 s of pure waiting.
   - Fix: one cached profile and roles lookup, shared and reusing `AppComponent`'s; `Promise.all` in the guard;
     cache `dashboard`; start `getAdminLists()` early. **This touches the shared guard, so it needs regression
     across all suites.**
3. **High: nothing renders until all of `new_user_data` has arrived.** Everything sits behind `!loading`.
   - Fix: paint the frame and skeleton rows once access is confirmed (frames 1.1–1.3). Show a first page from
     `orderBy('created','desc'), limit(pageSize)` and the total from `getCountFromServer`, while the full
     stream loads for filters, search and export.
4. **Medium: Firestore has memory cache only.** `main.ts:46 initializeFirestore(app, {})`, though a comment
   there says persistence is kept. Either add `persistentLocalCache` for the whole app (wide impact; check the
   Arena two-tab note), or cache the slim new-users list in IndexedDB like `getParticipantDirectory`.
5. **Medium: all of `workshopconfiguration` is read at load**, with the full challenge trees, only for a closed
   menu. Load it when the Workshops menu opens. While Funnel only is on, query `evergreenWorkshop == true`.
6. **Medium: live listeners are never closed** (`new_user_data`, `newusertags`). Add `takeUntil(destroy$)`.
7. **Medium: each filter pass is costly.**
   - `JSON.parse` runs on the filter string for every row.
   - Each row's date is formatted twice per search.
   - The search has no debounce.

   Fix: parse once, precompute each row's search text, and debounce by 150–250 ms.
8. **Low: every refresh repeats per-row work.**
   - `tagNames` runs 6× per row, and `toDate` returns a new Date each time.
   - `isAllSelected` and `hiddenSelectedCount` walk every filtered row.
   - The table has no `trackBy`, and closed menus are still checked.

   Fix: a row view model, `trackBy`, OnPush, and `matMenuContent`.
9. **Low: about 1.09 MB of JS loads up front**, including `xlsx` (432 KB) twice via `EmailInputComponent`.
   Load it, and that dialog, with `await import()`.
10. **Low:** the workshop filter's enrollment cache dies with the component. Move it to a root service.

None of these needs a schema change; two optional slim-collection ideas would. Before starting, add performance
marks at: guard start and end, the constructor, access resolved, the first `new_user_data` emission, and
metadata loaded. That gives a before/after baseline.

## What surprised us
- The seven "current screen" screenshots the brief pointed at had never been saved. Every agent worked from the
  component code instead.
- `shot.cjs --global` silently skips `src/styles.css`, because `addStyleTag` fails on its `@import` lines. The
  merge agent checked with a copy that has the imports removed. Fix `shot.cjs` before relying on it again.
- An inline `<span>` used as a separator was invisible but still took up space. It was easy to miss at
  thumbnail size.

## Pending
- Operator sign-off on the design, and on the scope additions listed above.
- Development: port the design, then do the load-time fixes in the order above. Measure first, and run the
  full regression for the guard changes.
- Build sources (`build.py`, templates and CSS) are in the session scratchpad only. The two HTML files are
  self-contained and are the record.
