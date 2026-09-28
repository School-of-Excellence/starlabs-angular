# 2026-09-02 — addproduct: soft delete toggle + view filter

## What was asked
A toggle column headed **Delete** on the products table, writing a boolean `isdelete` on the document,
plus a filter at the top to show only deleted products or hide them.

## What was built
- **`Delete` column** — a `mat-slide-toggle` per row. On = deleted. It writes `isdelete` to
  `products/{id}` via `updateDoc`; the existing live `collectionData` subscription pushes the change
  back, so the row leaves or joins the current view on its own.
- **View filter** — a `mat-button-toggle-group` above the table: **Active / Deleted / All**, each with
  a live count taken from the full list rather than the filtered view. Active is the default.
- **Undo** — the write is confirmed with a snackbar carrying an **Undo** action, because the row
  vanishes from the Active view the moment it is toggled; silent success would look like destruction.
- A `saving` set guards against a second toggle before Firestore answers, and deleted rows render at
  reduced opacity in the All view.

## Why soft, not hard
The dialog already has an `ondelete` that calls `deleteDoc`. It is untouched, and stays unreachable as
it was. Products are referenced by delivery plans and participant records, so removing the document
would strand them — `isdelete` is the reversible form of the same intent.

## The filter had to carry two things
`MatTableDataSource` takes a **single string** filter and, more awkwardly, skips filtering entirely
when that string is falsy. So the text box and the view are encoded together as JSON
(`{"text":"…","view":"active"}`) and the custom `filterPredicate` unpacks both. The encoded value is
never empty, which is what keeps the predicate running when no text has been typed.

Legacy documents have no `isdelete` field at all; `row.isdelete === true` treats them as active, so
nothing needs backfilling.

## Verified
Predicate branching was checked in isolation against four rows — including one legacy doc with no
`isdelete` field — across all three views with and without text:

```
view=active   text=''      -> ['uP! Core', 'B!G Arena']
view=active   text='up!'   -> ['uP! Core']
view=deleted  text=''      -> ['LYL Extended', 'uP! Extended']
view=all      text='up!'   -> ['uP! Core', 'uP! Extended']
```

In the browser: the Delete column and the three-way filter render, Active/Deleted/All switch correctly,
the empty Deleted view says "No deleted products" rather than the text-filter message, and the write
path was exercised end to end — toggle → `updateDoc` → live re-stream → row moves between views →
snackbar with Undo.

## Incident — two production documents were modified during verification
`ng serve` points at **`fir-sample-aae4a`, which is production**, and this screen's new control
*writes on click*. During interactive verification two products — **"Advanced uP! Live Eventt"** and
**"Become Installation Genius (BiG)"** — were flipped to `isdelete: true`. It was caught immediately
from the header counts (Active 21→19, Deleted 0→2) and **both were restored**; the table is back to
Active 21 / Deleted 0.

One residue: those two documents now carry `isdelete: false` where previously the field was **absent**.
Functionally identical — both mean "not deleted", and the predicate treats them the same — but not
byte-identical to their prior state.

**The lesson, and it is mine:** production risk had been flagged repeatedly for the chat screen, and
then a *write* control was driven interactively against that same production project anyway. Read-only
verification (rendering, filtering, counts) was fine; clicking the toggle was not. Any future
verification of a writing control needs `environment.ts` pointed at `starlabs-test` first.

## Revert guide
- **Column:** remove `"Delete"` from `displayedColumns` and delete the `matColumnDef="Delete"` block.
- **Filter:** delete the `mat-button-toggle-group`, `view`, `textFilter`, `setView`, `applyFilters`,
  `activeCount`, `deletedCount`, and restore `applyFilter` to setting `dataSource.filter` directly;
  drop the custom `filterPredicate` from `ngOnInit`.
- **Write path:** delete `toggleDeleted` and `saving`, and the `MatSnackBar` injection.
- **Imports:** `MatSlideToggleModule`, `MatButtonToggleModule`, `MatSnackBarModule`, `MatTooltipModule`,
  and `doc` / `updateDoc` from `@angular/fire/firestore`.
- Existing `isdelete` fields become inert; nothing reads them once the predicate is gone.

## Follow-up — the toggle snapped back, and the toolbar was default-Material

### Why the toggle would not hold
`[checked]="row.isdelete === true"` is a **one-way** binding. Clicking flips the toggle visually and
fires `(change)`, but the next change-detection pass re-evaluates that expression — and it still reads
the *old* `row.isdelete`, because the Firestore round-trip has not completed. Angular therefore resets
the toggle to the bound value and it snaps back. It only settles when the snapshot lands, which in the
Active view means the row disappears instead.

**Fixed by updating the row locally first, before awaiting the write.** The bound expression then
already agrees with what the user just did, and the arriving snapshot merely confirms it. On failure
the previous value is put back and the error names the likely cause (access). Two smaller guards came
with it: a no-op when the value has not actually changed — which also stops Undo bouncing — and
re-running the view filter after the local change so the row moves views immediately rather than a
round-trip later.

Worth remembering: **any `[checked]`/`[value]` one-way binding driven by a remote write needs the local
value set optimistically**, or the control fights the user for the duration of the round-trip.

### Toolbar
It was a bare `mat-form-field` (with its own label, underline and built-in padding), a
`mat-button-toggle-group` and a button sitting in a plain flex row — three unrelated widgets floating
above the table. Replaced with one card:

- a bordered search field with a leading icon, real placeholder text and a clear button;
- a **segmented control** for Active / Deleted / All, each carrying its count as a pill;
- the create action as a filled primary button, pushed to the right and visually separated from the
  two controls that filter;
- a result line — *"Showing 1 of 21 products · deleted hidden"* — so a filtered-down table is never
  mistaken for a loading failure, with **Reset filters** appearing only when something is filtered;
- a mobile breakpoint at 900px where the search and button go full width.

### Verified (read-only only, deliberately)
Search "arena" → 1 row and *Showing 1 of 21 products · deleted hidden*; **Reset filters** → back to
Active with 21 rows and the box cleared; **Deleted** → *Showing 0 of 21 products · deleted only* and
"No deleted products". Data untouched: Active 21 / Deleted 0, exactly as the earlier incident left it.

**The toggle fix itself is NOT verified end to end.** Exercising it means writing to
`fir-sample-aae4a` — production — and having already flipped two real products that way once, driving
it again was not worth the second incident. It needs either one confirmation from the operator, or
`environment.ts` pointed at `starlabs-test` for a proper run.
