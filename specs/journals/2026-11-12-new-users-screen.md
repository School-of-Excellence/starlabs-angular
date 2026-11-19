# 2026-11-12 — New Users screen (/newusersprofile): usable layout, tag rename, column chooser

## What
- **Renaming tags (bug).** The toolbar's Tags button opens the tags dialog in "manage" mode, where
  `toggle()` returned at once, so clicking a tag did nothing. In manage mode a click now turns the tag into a
  name editor: Enter saves, Escape or ✕ cancels, ✓ saves. Hooks: `atd-rename-input/-save/-cancel/-error`.
  - Manage mode now reads "Tags" / "Segment links" with an edit icon on each chip.
  - A tag created there is no longer shown as "selected", which meant nothing in that mode.
- **Column chooser.** A Columns button in the toolbar. Defaults: Name, Phone, Email, Created, Tags. Status and
  Referred by can be turned on. Hooks: `new-columns-btn/-panel/-reset`, `new-column-{name,phone,email,created,
  status,referredby,tags}`.
- **Layout and UX:**
  - Toolbar row 1: search (with a clear ✕), a "N of M users" count, then Columns, Manage tags and
    Select from file. Select from file was labelled "Import", but it only selects matching rows.
  - Toolbar row 2: a "Filters" label, then Tags, Workshops, Created, Conversion and Clear all. The tag filter
    was labelled "Select by tags".
  - Sticky header: the table scrolls inside its card.
  - Emails stay on one line, with the full address on hover. Dates use "12 Nov 2026, 4:02 PM".
  - At most 3 tag pills, then "+N" with a tooltip listing the rest.
  - A spinner row replaces the false "no match" while a workshop's people load. A real no-match says why and
    offers Clear filters.
  - The page shows a spinner during the access check instead of a blank page.
  - The right side panel is gone. Ticked rows open a bar under the table that sticks to the bottom of the
    screen, with Edit tags, Export, Send communication and ✕. Export and Send open one at a time above it. The
    bar says how many ticked people the current filters hide.
  - The send buttons are labelled (Email / WhatsApp / App notification).
  - Checkboxes use the primary colour. Button icons trail their labels (Material puts every icon first unless
    marked `iconPositionEnd`). Button letter-spacing is normal.

## Why it is shaped this way
- **Rename writes only `name`, with `updateDoc`.** Every reader keys tags by id: this screen, campaigns,
  workshop dashboard, calendar, and the EiFlix `?segment=` links. So a rename relabels the tag everywhere and
  breaks nothing. A `setDoc` would have wiped `docid`, `type` and `created`.
  - Duplicates (any case) are refused within the segment type. The workshop dashboard's Tag filter is keyed
    by name, so two tags with one name would merge there.
  - The duplicate check runs again against a fresh read just before writing, because the dialog's list is a
    one-time read.
- **Escape is stopped at the input.** The dialog closes on Escape, which would throw the edit away.
- **Columns are remembered in localStorage.** It is a per-viewer view preference, so no Firestore change. Bad
  or unknown saved values fall back to the defaults.
  - Workshop and Moved On stay outside the chooser and still come and go with their filters; WS-57 depends
    on that.
  - The last visible column can't be hidden. Hiding the column the table is sorted by clears the sort.
- **Export is unchanged.** It still offers every column and exports the selected people, not the visible
  columns. The request was about the table.
- **A selection bar instead of the side panel.** The 316px panel appeared on the first tick and reflowed the
  whole table under the cursor. The bar sits below the table, so the table keeps its width (NUS-05 measures it).
- **Class names.** `.table-card` became `.nu-table-card`, because another screen's stylesheet restyles
  `.table-card` globally. `.active` became `.filter-on` and `.tab-pane` became `.atd-pane` (Bootstrap names).
  Headings pin their typography.
- **Every existing hook stays on the same control.** The tag filter is still the first `.tag-select-btn`. The
  Conversion button still has its leading icon at x≈14 for WS-57's click.

## Review fixes (two-lens review, each finding checked by a separate skeptic)
- **Escape is caught on the whole rename editor**, not just the input, so pressing it on ✓ or ✕ no longer closes
  the dialog. After a refused or failed save, the input gets its focus back; it had been disabled while saving.
- **One rename at a time.** Clicking another tag while a save runs is ignored. A finishing save only closes or
  marks the editor that is still its own.
- **The search re-runs when tag names change** (same filter string, no jump to page 1). After a rename, a
  search on the old or new name stays truthful.
- **The search also matches the date as the column shows it** ("12 Nov 2026"), as well as the old format.
- **Default judges the sort by what is on screen.** Moved On / Workshop aren't chooser columns, so sorting by
  them survives a reset.
- **The Columns menu shows all seven options.** Its list opts out of the shared 240px cap with `.tfm-columns`.
- **The sticky header no longer paints over the selection bar.** `isolation: isolate` on the scroll box keeps
  CDK's z-index 100 inside the table.
- **The table's height budget is `100vh - 400px`.** The old `320px` let the page scroll as well, with the
  paginator half under the fold.
- **Workshop pills get a hover title and room for 240px.** The tag pill cap had been clipping them.
- **Column options carry `aria-pressed`**, so screen readers hear on/off.
- Refuted: "the selection bar's top can never be seen". A sticky box can only move within its container.

## Operator follow-up (same day)
- **Tag pills show the full name.** The 140px cut-off and "…" are gone, and long names wrap the cell onto more
  lines. Still at most 3 pills plus "+N", with a tooltip for the rest.
- **The Created filter now looks like the other filters:** the same 1px outline (`--nu-filter-border`), 10px
  radius, 40px height, a leading calendar icon, a bold dark label instead of faded hint text, and the same
  tint while active. The search box shares the outline. The inputs and hooks are unchanged, so WS-56 still
  types into them.

## Coverage
- Unit `newusersprofile.columns.spec.ts` (5/5): the defaults, table order, the saved choice, Default, the
  last-column guard, Moved On still added, and bad saved values ignored.
- Hub `workshops/new-users-screen.spec.ts` is new and gated on the new hooks:
  - NUS-01: the default headers; ticks reflect the defaults; Status and Referred by on, Email off; survives a
    reload; Default resets.
  - NUS-02: was WS-73, now turns on Referred by first. Negative control: hidden by default.
  - NUS-03: rename on its own seeded tag, never the shared segment. Covers Escape and ✕ cancel, duplicate in
    another case refused, blank refused, nothing written. Then a real rename keeps type and docid, the
    dialog and table show the new name, and the user's tag ids are unchanged. Also the 3 pills + "+1".
  - NUS-04: search and its clear button, the count, the no-match message, and Clear filters.
  - NUS-05: the bar opens on a tick, the table width is unchanged, Export and Send are exclusive, the bar
    shows "1 not shown", and ✕ closes it.
- Review fixes, added 2026-11-16 at the operator's request (`new-users-screen.spec.ts`, 11/11):
  - NUS-06: Escape on ✓, after a refused save, and on ✕ closes only the editor. The dialog stays open and nothing
    is written.
  - NUS-07: the rename's write is held at the network for 3 seconds. A precondition proves the editor is locked.
    Clicking another tag meanwhile opens nothing, and only the first rename is stored.
  - NUS-08: a search on the old tag name drops the user after the rename, without retyping. The count follows,
    and the new name finds them.
  - NUS-09: the Created day exactly as the column shows it finds the row, and a row from another day doesn't
    match.
  - NUS-10: Default keeps a sort on Moved On. Negative control: a sort on Status, which Default hides, is dropped.
  - NUS-11: the Workshops filter (all workshops, funnel off) shows the workshop pill with its full title on
    hover. Negative control: someone not enrolled is filtered out.
- `new-users-profile.spec.ts`: WS-22 and WS-23 now use hooks that exist on every branch instead of
  classes and button text. WS-73 moved out.

## Pending
- The operator commits the angular files. Hub commit is local; push on "push" after a full workshops suite.
- From the audit, not done:
  - three-state chips in bulk tag edit, for tags only some of the selected people have;
  - search inside the filter menus;
  - debounced search;
  - an error state when the users list fails to load;
  - collapsing the filters on narrow screens.
- Production: confirm the Firestore rules allow updating `newusertags`. The client already creates them; a
  create-only rule would refuse the rename. A refused rename shows "Could not rename the tag".
