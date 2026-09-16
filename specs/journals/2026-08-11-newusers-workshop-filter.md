# 2026-08-11 — New Users (/newusersprofile): Workshops filter

## What was asked
After the "Select by tags" filter, add a **Workshops** multi-select:
options = every `workshopconfiguration` doc (label = `detailpage.title`),
selection = the doc refs; then show only table rows whose `profileid`
appears in `workshop participant enrolled` (fields `workshopref`,
`profileid`) for the chosen workshops. Commit `a9bc6b51`.

## How it works (and WHY)
- **Options** load once via `getDocs(workshopconfiguration)` (all docs, as
  asked — no evergreen filter here, unlike the ads funnel picker), sorted
  by `detailpage.title`, 'Untitled workshop' fallback.
- **Selection stores ids, queries by ref.** `mat-select multiple` holds doc
  ids (`selectedWorkshopIds`) because mat-select compares values by
  identity — DocumentReference objects would need a compareWith. The doc
  ref the operator asked for is built at query time
  (`doc(firestore, 'workshopconfiguration', id)`) and matched with
  `where('workshopref', '==', ref)` — the exact pattern
  enroll.component.ts uses, so ref-equality semantics are proven.
- **Async filter state lives on `this`, not in the filter string.** The
  MatTableDataSource predicate reads `this.workshopProfileIds`
  (Set<string>); `refreshFilter()` embeds `workshops` + a `wv` version
  counter in the JSON filter string *only to force re-evaluation* — once
  when the selection changes, again when the enrolled set lands.
- **Loading shows nothing rather than everything.** While the enrolled set
  is loading, the predicate hides all rows (null set + active selection):
  a flash of unfiltered profiles would read as wrong data. A 16px spinner
  sits in the field meanwhile.
- **Row identity**: `u.profileid || rowId(u)` — the same resolution the
  screen's comm/email flows already use for new_user_data rows.
- **Cache + token guard.** Enrolled profileids are cached per workshop id
  (toggling selections doesn't refetch), and a monotonically increasing
  token discards out-of-order async results (fast toggle A→B can't let
  A's slower response clobber B's filter). Query errors resolve to an
  empty set (show nothing) instead of silently showing all.
- Clear paths: the field's ✕, and Clear-all resets workshop state too
  (`resetWorkshopFilter()` bumps the token to kill in-flight loads).
- UI matches the toolbar: 210px outline field with `co_present` prefix
  icon, count badge in the trigger (reuses `.tag-badge`), full-width under
  820px.

## Round 2 — tags-style UI + Workshop column (same day, commit `76275f01`)
- Filter UI switched from a toolbar mat-select to the **same button +
  mat-menu pattern as "Select by tags"** (reuses `.tag-select-btn`,
  `.tag-filter-menu`, `tfm-*` classes: count badge, checkbox list capped
  at 240px scroll, Clear, match-count footer). No all/any mode row —
  workshop membership is inherently an OR union. MatSelectModule import
  dropped again; `selectedWorkshopIds` became a Set to mirror
  `selectByTagIds`, with `toggleWorkshopSelect()`.
- **Workshop column, only while filtering.** `displayedColumns` is rebuilt
  (`baseColumns` + `'workshop'`) whenever the selection toggles; the
  column renders each row's enrolled *selected* workshops as indigo pills
  (`detailpage.title` via `workshopTitleById`).
- **No new reads.** The column's data comes from `workshopsByProfile`
  (profileid → selected workshop ids), built as a byproduct of the same
  cached per-workshop `where('workshopref','==',ref)` queries the filter
  already makes — explicitly requested because `workshop participant
  enrolled` is huge and must never be scanned whole. The map is cleared
  with the filter (empty-state '—' otherwise).

## Round 3 — Workshop column in the Excel export (same day, commit `86cd7884`)
- The export panel offers a **Workshop** chip only while the workshop
  filter is active: `exportColumnsView` = base `exportColumns` +
  `workshopExportColumn` (`workshopNames(u).join(', ')`), maintained in
  `updateDisplayedColumns()`. Same zero-extra-queries rule — titles come
  from the cached `workshopsByProfile`.
- **Chip auto-select syncs only on on/off transitions** (`wasActive` via
  `displayedColumns.includes('workshop')`): auto-added when the filter
  activates, removed when it clears — but a manual deselection is NOT
  fought on every workshop toggle while the filter stays active.
- `selectAllExportColumns()`/`exportExcel()`/the chips template all use
  `exportColumnsView`, so a lingering `'workshop'` key exports nothing
  when the filter is off.
- **Adversarial review (3-lens workflow) caught a real window:** Download
  clicked while the enrolled reads were in flight exported empty (first
  activation) or stale (selection changed mid-load) Workshop cells — the
  table hides rows during that window but the export path didn't check.
  Fixed threefold: `workshopsByProfile.clear()` at load *start*, Download
  button disabled with a "Loading workshops…" label during
  `workshopFilterLoading`, and a snackbar guard in `exportExcel()`.

## Round 4 — Funnel-only + Include/Exclude toggles (same day, commit `14cc583d`)
- Two controls at the TOP of the workshop dropdown (as dictated):
  1. **Funnel only** — mat-slide-toggle, **default ON**. Narrows the
     offered list to `evergreenWorkshop === true` configs via a
     `visibleWorkshopOptions` getter over the one-shot load (the flag is
     captured per option at load; no second query). Turning it ON prunes
     selected non-evergreen ids — otherwise they'd keep filtering while
     invisible in the list.
  2. **Include / Exclude** — tfm-modes button pair (same style as the tags
     menu's Match all/any), **default Include**. Include = prior behavior;
     Exclude = keep profiles NOT enrolled in ANY selected workshop
     (complement of the same union set — no refetch on switch).
- Workshop column/export only render in **include** mode (in exclude mode
  every visible row is by definition not enrolled — an all-'—' column is
  noise). Clearing the filter resets mode to include; `funnelOnly` is a
  list preference and survives clears.
- `wmode` joined the filter JSON so mode flips re-run the predicate.
- **Adversarial review (3 lenses; regressions + spec came back clean,
  including confirming the shared `.tag-filter-menu` CSS doesn't leak
  into the tags menu) caught:**
  - *Fail-open in exclude mode:* the old catch-block sentinel
    `workshopProfileIds = new Set()` fails closed for include (empty
    table) but open for exclude — a Firestore error would have shown
    EVERY profile as "not enrolled", exportable/bulk-messageable. Now
    errors keep the set `null` (predicate hides all rows in both modes)
    and surface a snackbar; failed ids aren't cached, so retry refetches.
  - *Chip-sync quirk:* include→exclude→include re-added a manually
    deselected export chip. Sync now keys off `lastWorkshopFilterActive`
    (selection on/off) instead of column-active, so mode round-trips
    never touch `selectedExportKeys`; a lingering key is inert because
    `exportColumnsView` doesn't offer the column outside include mode.

## Round 5 — Excel import-select (`a6254e59` + fixes `464c67b7`)
- **Import button** after Tags: accepts `.xlsx/.xls` only; first sheet must
  have `email` as the A1 header; column-A values from row 2 down are
  matched case-insensitively against `u.email`, and the selection is
  **replaced** with the matching profiles ("select that mails only").
  Reuses the XLSX lib already imported for export; parse pattern matches
  email-input/wati-input (`XLSX.read(new Uint8Array(...), {type:'array'})`).
- **Adversarial review (correctness clean) drove these fixes:**
  - Zero-match imports previously wiped the existing selection —
    matches are now computed BEFORE `selection.clear()`; no match ⇒
    selection untouched, snackbar says so.
  - Snackbar now itemizes: profiles selected, matched/imported email
    counts, emails not found, selections hidden by active filters
    (selection spans ALL profiles, not just filtered ones), non-email
    column-A values ignored (no `@`), and "previous selection replaced".
  - The detached file input is retained on the component while the
    native picker is open (old-WebKit GC hazard).
  - `.table-toolbar` now wraps unconditionally — the extra button could
    clip the search field at ~1366px with the side panel open
    (reviewer's min-content estimate); flex-wrap is inert when it fits.
- Known-lenient (documented, not fixed): header check reads the first
  NON-BLANK row, so `email` in A3 under blank rows passes; A1-empty/B1-
  email correctly fails.

## Round 6 — tags Include/Exclude (`ffd790a7` + refinement `d821d721`)
- Second `tfm-modes` row in the Select-by-tags menu (below Match all/any),
  same style as the workshop filter's. `selectByTagPolarity` travels as
  `tpol` in the filter JSON; include keeps `tagMatch`, exclude keeps
  `!tagMatch`; resets to include on tag-clear and clear-all.
- **Review refinement:** Exclude + Match all (the default mode) hid only
  profiles with EVERY selected tag — misaligned with the workshop
  filter's "none of the selected" complement. Flipping to Exclude now
  auto-sets Match any (still overridable to all for "not all of them").
- Accepted nits (documented): polarity set with zero tags persists
  invisibly until a tag is picked (inert meanwhile; hasAnyFilter ignores
  it); `importFileInput` reference is never nulled (intentional
  keep-alive).

## Pending
- Operator Chrome pass. Note: per-workshop enrolled queries are one-shot
  (`getDocs`), not live — a new enrollment mid-session needs reload or
  reselect to appear (cached).
