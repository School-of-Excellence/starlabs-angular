# 2026-08-27 — eiflixhomeconfig "Create / Assign EiFlix Home" tab: builder redesign

## What was asked
Operator: the Create / Assign EiFlix Home tab (first tab of `/eiflixhomeconfig`,
component `src/app/New-Workshop/upcomingworkshops/eiflixhomeconfig/`) is
"not usable, worst UX, multiple scroll" — redesign it completely into
something premium and usable.

## What was wrong (root causes, not symptoms)
1. **Adding items lived inside a `mat-select multiple`** with optgroups: no
   search, constant open/close, and the trigger collapsed into an unreadable
   comma list. Discovery and add were the same cramped control.
2. **Every selected item rendered as a permanently-expanded form card**
   (Title/Subtitle/ShowTo + tag rows). With a realistic config the page was
   several screens tall — that is the "multiple scroll" complaint: page
   scroll + select-panel scroll + drag across a huge list.
3. **Reordering by drag over a multi-screen list** is nearly impossible.
4. **Save button only at the top**, out of reach after editing below.

## The redesign (WHY each choice)
Two-pane **home-screen builder**, one scroll context (the page):
- **Library rail (left, sticky)**: sections Widgets / Home Series / Ads with
  a search box; click an item to add it. Replaces the dropdown because adding
  is a browsing task, not a form field. Added items show a green check and
  disable (keys are unique in homeconfig). Sticky + own overflow so it is
  always at hand without adding a page-level second scrollbar.
- **Layout list (right)**: ONE white surface, one compact row per home row
  (drag handle, position number, type icon, name, showto/tag chips, remove,
  chevron). Rows are **collapsed by default**; clicking expands an inline
  editor (accordion, keyed by the group's first item key so it survives
  reorders). Collapsed-by-default is what kills the scrolling; short rows
  also make drag-reorder practical again.
- **Sticky action bar** above the list: row count, an **"Unsaved changes"**
  pill (set by form.valueChanges subscribed only after hydrate; structural
  ops that suppress events set it explicitly), and Save always in view.
- **Show To became a custom segmented control** (New/Exist/Both) instead of a
  select — 1 click instead of 2, and deliberately NOT mat-button-toggle to
  avoid depending on Material theme tokens the app theme may not emit.
  Same values written ('new'/'exist'/'both') via setValue on the same control.
- **Tags became pill chips + inline input** (Enter or blur adds, max 3) —
  custom markup, not mat-chip-grid, for the same theme-token reason. Storage
  is still the same FormArray of ≤3 strings.
- **Ad pairing kept**: consecutive ads still group into one "Ad row" card
  with 2 slots (mirrors save-time pairing); single-ad rows show an amber
  "1 of 2 slots" chip and a hint that the next library ad fills the slot.
  The old `border-left` amber stripe was dropped (design ban) in favor of
  the amber type chip.

## What did NOT change (load-bearing)
- Firestore I/O is byte-identical: reads of `eiflixhomeseries`,
  `eiflixhomewidgets` (widgettype=='ads'), and `classify/eiflixwebapp`;
  `hydrate()` including missing-ref resilience and legacy Ads-widget drop;
  `save()` including ad pairing (≤2 maps + adref per index), series
  `seriesref`/`enabletag`/`tags`, and the `{merge:true}` write with
  `homeconfigupdated`.
- Item FormGroup shape (`key/title/subtitle/showto/enabletag/tags`) —
  only the `selected` FormControl was deleted (the library derives added
  state from the items array itself via a Set).

## Gotchas found en route
- The tab lives under the app toolbar inside `mat-drawer-content` (the
  scroll container), so `position: sticky; top: 12px` works; a
  `height: calc(100vh - X)` fixed studio would have been fragile — that is
  why the sticky-rail + page-scroll pattern was chosen over a fixed-height
  two-scrollbar studio.
- `expandedKey` is the group's first-item key, not the group index — group
  indices shift when reorders merge/split ad pairs.

## Status
- Prod build: PASSED (see PROGRESS.md). Not committed (operator commits
  manually), not deployed. Visual pass behind login pending — Claude has no
  prod login.
