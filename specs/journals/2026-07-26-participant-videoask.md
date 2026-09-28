# 2026-07-26 — `participant-videoask`: new screen, why it looks the way it does

New component at `src/app/participant-videoask/`, route `/participantvideoask`.
The old `videoask-display` (route `videoask-display`, `src/app/Events/videoask-display/`)
is **deliberately left untouched and still live** — operator will decide later whether
to retire it.

## What the screen is

Admin/coach review console for `participantvideoask` submissions: filter bar over a
table, one row per submitted video, with per-row participant tagging.

## Constraints the operator set, and what each one forced

### 1. "No composite indexes now, sort by uploaded after query"

This is the widest-reaching constraint. Firestore auto-indexes single fields only;
**any** query touching two fields — including an `orderBy` on a second field — needs a
composite index. So:

- **Every filtered query constrains exactly ONE field and carries no `orderBy`.**
- The union is sorted `uploaded desc` in memory (`setRows`).
- **The date range does not ride along with another filter.** It is server-side only
  when it is the sole filter; in every other combination it is applied client-side in
  `residual()`. Correctness is unaffected because filtered fetches are unbounded — it
  only costs extra bytes over the wire.
- The default 200 query keeps `orderBy('uploaded','desc')` because that is a
  single-field sort with no `where` — legal on the auto index.

If the wire cost ever hurts, the fix is to add composite indexes and push the date
range down. That is a deliberate later decision, not an oversight.

### 2. "First default query alone 200, the rest load all"

- No filter → `limit(200)`, newest first. Status line says
  *"Showing newest 200 — apply a filter to search all submissions"*.
- Any filter → **no limit**.

This was chosen over a uniform 200 cap because a cap plus client-side residual
filtering silently under-reports: fetch the newest 200 for an event, filter to one
participant in memory, and matches beyond the 200th newest vanish with no signal. An
unbounded filtered fetch makes a filtered result *complete*, which removes the whole
class of "did I see everything?" ambiguity. The cost is that a large event can pull
thousands of docs — mitigated by click-to-play placeholders and a >1000 row warning.

### 3. "arenaevent sometimes has other references"

`arenaevent` does **not** always point at `event collection`. So the kind tag is derived
from `ref.parent.id` — the collection the reference actually points at — never from
which field held it. Unknown collection renders the full `ref.path` (operator's call:
show the path, don't guess a label).

Titles resolve through `eventIndex`, keyed by **`ref.path`**. That single map replaces
the old screen's three-branch `*ngIf` chain and makes the "which collection is this"
question answer itself.

### 4. Workshops: `workshopconfiguration` only

Operator decision. `eiflix workshop` is **not** loaded, so legacy submissions pointing
there miss `eventIndex` and render `{{ref.id}} (Workshop)` — the `(Workshop)` label
still resolves because `KIND_LABEL` maps the collection name even though the titles
aren't indexed. Deliberate: the picker stays current, legacy rows stay identifiable.

### 5. Filter semantics

`(Live Event OR Queue Event OR Workshop) AND Participant AND Template AND Date`.

The OR cannot be expressed as one indexable query across three different fields, so it
is **one query per selected event dimension, unioned and de-duped by docid**. When no
event dimension is selected, the single server axis is picked most-selective-first:
Participant → Template → date range. Whatever loses becomes a `residual()` filter.

`in` caps at 30 values, so multi-selects over 30 chunk into several queries feeding the
same union.

## Other deliberate carry-overs and drops

- **Click-to-play video placeholders** (operator request). 200 eager `<video>` elements
  is 200 concurrent Storage connections — a plausible contributor to the open
  Firestore/media perf issue in `HANDOVER.md`. Rows render a dark placeholder with a
  play icon; the `<video>` is only created on click. `playing` is cleared on every
  reload so a new result set never leaks previous play state.
- **Snippet view dropped** (operator). Toggle, `mapProfileToVideoAsk`, `customfilter2`,
  `changeToSnippetView`, `stayingInNonSnippetView` all gone.
- **`onShareToHighlights` not carried over.** It was already dead (button commented out
  at old template line 148) *and* broken — its parameter `doc` shadowed the imported
  `doc()`, so `doc(this.firestore, ...)` would have thrown. Left as-is in the old file.
- **Null guard on the New User badge.** Old line 91 does
  `mapparticipantNew[row.profileid]['workshoponly']` with no guard and throws on any
  unmapped profile. New code uses `isNewUser()` with `?.`.
- **The `n === 3` counter is gone.** Old lines 146/172/185 increment a shared counter
  from three parallel `getDocs`; only the last to finish sets `filteredEventData`, so
  the event filter could start empty. Replaced with `Promise.all`.
- **Tagging is byte-for-byte the same three writes** (`participantvideoask.tags`,
  `participant metadata.profiletags`, `participant tag logs` with `source: 'videoask'`).
  Not touched on purpose: `live-event-data.service.ts:601` reads
  `participantvideoask.tags` to compute the v3 dashboard's "reviewed" metric. Only
  addition is updating the in-memory row after a successful write, since the screen no
  longer has a live subscription to refresh it.
- **Live `collectionData` subscription dropped** in favour of one-shot `getDocs`. A live
  stream over the whole collection is the single most expensive thing the old screen
  did.
- Filter `valueChanges` is debounced 400ms with `distinctUntilChanged` — filtered
  queries are unbounded, so an un-debounced keystroke is genuinely costly.

## Filter bar revision (same day, operator request)

Chips + autocomplete were replaced with **multi-select dropdowns**, and the query now
runs **only when Search is clicked**.

- `form.valueChanges` no longer triggers a query. It only sets `filtersDirty`, which
  surfaces a *"Not applied yet — click Search"* hint in the filter header. The 400ms
  debounce is gone with it — irrelevant once nothing auto-fires.
- `onFilter()` became `onSearch()`, guarded against re-entry while `fetching`.
- **Clear filters** resets the form, the panel search boxes and the option lists, then
  reloads the default newest-200. It is disabled when nothing is applied.
- Each dropdown carries a **sticky in-panel search input**. `(keydown)` is stopped from
  propagating or Material's typeahead would steal the keystrokes and jump the
  highlighted option. The box clears on `(closed)` so a reopened panel starts whole.
- Options are **capped at `MAX_OPTIONS = 100` per panel**, with a *"+N more — keep typing
  to narrow"* footer. Participants run to thousands; rendering them all locks the panel
  on open. The cap is display-only — it never limits what can be selected, because the
  search narrows into the cap.
- Closed dropdowns show `"First Name  +2"` via `mat-select-trigger` rather than a wall
  of comma-joined titles, and a row of **removable pills** under the fields shows what
  is currently applied per dimension.
- Grid layout (3 → 2 → 1 columns) replaces flex-wrap so fields stay aligned rather than
  forming ragged rows at intermediate widths.

The panel styles need `::ng-deep` because `panelClass="filterpanel"` renders in the CDK
overlay, outside the component's view encapsulation.

## Filter bar revision 2 — grouping, and a real selection bug

### The bug: selected participants vanished from the trigger

`visibleOptions()` capped each dropdown at 100 rendered `mat-option`s. **MatSelect
rebuilds its selection model from the options present in the DOM.** A value whose
option is not rendered is not in `_selectionModel`, and on the next selection change
MatSelect writes `_selectionModel.selected.map(o => o.value)` back to the form control —
so the selection is silently dropped, not merely hidden.

It surfaced on Participant Name first because that is the only list long enough to
exceed the cap: select someone via the panel search, clear the search, and their option
is no longer among the first 100, so the value is discarded.

Fix: `visibleOptions()` now takes both the searched list and the **full** list, and
always renders the selected options first, pulled from the full list. `hiddenCount()`
excludes them so the "+N more" figure stays honest. This is a data-integrity fix, not
cosmetic — the previous behaviour would have quietly searched the wrong filter.

### Filter chrome removed (revision 3, operator: "kinda ugly")

The OR/AND teaching UI described below was built, rejected and stripped. Do not
reintroduce it without asking.

Removed: numbered circle badges, green/blue OR and AND rule badges, the `AND` divider
between groups, the per-group explanatory paragraphs, and the "N applied" header badge.

The semantics are unchanged — group 1 still ORs, and still ANDs with group 2. The
grouping alone now carries it. Search and Clear buttons stayed exactly as they were.

### Revision 4 — what the cleanup wrongly took with it

**The "Searching for:" box was removed by mistake and is back.** The operator's
*"keep the search for as it is"* meant the **summary box**, not the Search button; I read
it as the button and deleted the box along with the rest of the chrome. Correction:
*"I said keep the search for box, it is well explained about the query."*

It is restored — `eventPills()`, `narrowPills()`, `clearPill()`, `clearOne()`,
`clearRange()` and the `.summary` markup — but styled in **neutral greys**, not the
rejected green/blue. It renders the actual expression with real connectors: the OR'd
event pills inside one bordered group joined by `or`, then `and` before each narrowing
pill, every pill individually removable. **This box stays.** It is the only thing on the
screen that states the query composition, which is precisely why the operator wants it.

Section headings were also sharpened from the terse *"Filter from Event"* / *"Filter"* to
descriptions of what each group actually does:

1. **Filter by any of these events** — Live Event, Queue Event, Workshop
2. **Then narrow to specific participants, templates or dates** — Participant, Template,
   Date range

### Alignment fixes

Two separate things, initially conflated by me:

- **Table tag checkboxes reverted to the original.** I had rewritten them from absolute
  to flex positioning; the operator wanted them *"proper as it was"*. The block is now
  byte-identical to `videoask-display.component.css` lines 79–149 — absolutely positioned
  `.checkmark` at `left: 0`, row `padding-left: 28px`, tick at `left: 5px; top: 2px`.
- **The three tag-filter toggle buttons** (Both / Tagged / Untagged) were the actual
  complaint. Material left-aligns the toggle label as inline content; the fix centres
  `.mat-button-toggle-button` and `.mat-button-toggle-label-content` on both axes.
  `::ng-deep` is required — that markup lives inside the Material component, not this
  template.

### (rejected) Conveying OR vs AND

Six equal dropdowns in one grid gave no clue that the three event dimensions OR while
everything else ANDs. The bar is now two boxed, numbered groups:

1. **Where the video came from** — Live Event, Queue Event, Workshop. Green `OR` badge,
   plus a one-line explanation under the fields.
2. **Narrow it down** — Participant, Template, Date range. Blue `AND` badge.

An `AND` divider sits between the two boxes. Under both, a **plain-language summary**
renders the actual expression with real connectors — the OR'd event pills sit inside a
green bracket, joined by `or`, then `and` before each narrowing pill. Every pill is
individually removable. Colour is doubled with text (`or`/`and` words, numbered badges),
so the grouping does not depend on distinguishing green from blue.

### Actions

Buttons moved to the **right**, `Clear filters` then `Search`. The
*"Not applied yet — click Search"* hint now sits **directly under the Search button**
rather than in the header, so it is next to the control that resolves it.

## Table-level tag filter

`Both / Tagged / Untagged` toggle in a toolbar above the table, right-aligned opposite
the status line, each showing its count.

This runs entirely over rows already loaded — `MatTableDataSource.filterPredicate` with
the mode string as the filter value. **Deliberately not a query:** `tags` is an array
and "untagged" means *absent or empty*, which Firestore cannot express as a filter at
all (there is no "array is empty" operator, and `!=` on a missing field matches nothing).
Client-side is the only correct place for it, and it also means toggling costs no reads.

`updateVideoAsk` recomputes the counts and re-applies the filter after a successful
write, so tagging a row while the Untagged view is active makes it leave the list
immediately rather than lingering as a stale row.

### Second tag control — "Filter by tags" (operator request)

The Tags area is now **two independent sections** in the toolbar:

1. `Both / Tagged / Untagged` — unchanged, still carrying its counts
2. **Filter by tags** — a multi-select over `videoAskTags`, matching **ANY** selected tag

Also client-side, and here the reasoning is subtler than for section 1. Firestore *can*
express this one: `tags` is an array, so `array-contains-any` with up to 30 values would
work. But it would be a **second `where` on top of** the event/participant/template axis,
and that needs a composite index — which the no-composite-index constraint forbids.
Client-side is therefore forced, not merely convenient. It also keeps both tag controls
behaving identically, which matters because they sit side by side.

**ANY, not ALL** (operator's call) — consistent with the event dropdowns, which already OR.

**The auto-switch.** Picking a tag while Untagged is active can only ever match zero rows,
so `onSelectedTagsChange` moves the mode to Tagged. This is the one place the two
"independent" controls touch, and it exists solely to make the contradictory state
unreachable. Clearing the dropdown deliberately leaves the mode on Tagged rather than
snapping back to Both — an undo that changes a control the operator did not touch is worse
than one that doesn't.

**Counts stay as totals** over everything loaded (operator's call). Re-counting them
against the dropdown they also constrain would be circular.

**Implementation note:** `MatTableDataSource.filter` is typed as a `string`, so the two
controls ride together as `JSON.stringify({mode, tags})` and `filterPredicate` decodes it —
one filtering pass, not two chained ones. `applyTableFilter()` is the single writer; all
three former `dataSource.filter = this.tagFilter` sites now go through it, so a future
control cannot be added in one place and forgotten in the others. The encoded value is
never the empty string, which matters: `MatTableDataSource` **skips the predicate entirely**
when `filter` is falsy.

## Pending / not done

- Operator will wire the menu link themselves; only the route was added.
- Not run or verified in a browser — needs operator verification against real data,
  particularly: whether any `arenaevent` refs point somewhere unexpected (the path
  fallback will make those visible), and whether unbounded filtered fetches are
  acceptable in size for the largest live events.
