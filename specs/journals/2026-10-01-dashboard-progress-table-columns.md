# 2026-10-01 — Participant Progress Details: parked columns, Email column, text "New" tag

Screen: `/workshop_dashboard/:id` → **Participant Progress Details** card
Component: `src/app/New-Workshop/workshop-dashboard/workshop-dashboard.component.{ts,html,css}`
Coverage: `starlabs-e2e-tests` → `workshops/workshop-dashboard.spec.ts` (WS-41 … WS-44)

## What changed

1. **Total, Status and Assignment are parked, not deleted.**
2. **A new Email column**, immediately after Participant.
3. **The search box matches on email** as well as name.
4. **The "New" marker is a text tag**, not `assets/new.png`.

## WHY each constraint landed

### Parked, not deleted — and parked in TWO places that must move together

The operator was explicit: *"dont remove the column but comment out the columns … why im saying is
in future we will use this so comment it."* So the three cell definitions stay in the template
inside `<!-- -->`, and their ids stay in `displayedColumns` as a commented line directly beneath the
live ones.

The thing a future session must not get wrong: **mat-table throws `Could not find column with id`
if an id is in `displayedColumns` and its `<ng-container matColumnDef>` is commented out.** The two
edits are a pair. That is why the comment above `displayedColumns` says so in as many words, and why
each parked template block carries a matching note.

A second trap, specific to Status: its cell holds `<ng-template #defaultStatus>` and the `*ngIf`
that references it. Both live inside the same `<ng-container>`, so commenting the container out
takes the template and its only reference together — no dangling `#defaultStatus`. Uncommenting must
likewise restore the whole block, not the `<td>` alone. A note in the template records this.

HTML comments do not nest. The parked blocks sit immediately above an older set of commented-out
duplicates (a previous parking of progress/completed/total/status). They are siblings, not nested —
verified by a clean `ng build`.

### Email goes after the name, so the Type splice had to move

`updateWorkshopHeader()` splices the runtime-only `type` column in at `indexOf('participantId') + 1`
on category-based workshops. With Email now sitting at that index, the splice would have pushed
Email to third place and put Type between the name and the email — not what was asked. The anchor is
now Email, falling back to `participantId` if Email is ever removed, so the order survives either
edit.

### The email cell must not shred into a vertical strip

First attempt used `overflow-wrap: break-word`. The harness screenshot showed the exact failure the
operator has already rejected once on the Dashboard Access picker ("see the names are overlapping"):
mat-table sizes columns by content, so under width pressure a breakable address collapses into a
one-character-wide column of letters.

The fix is to make the address **unbreakable**: `white-space: nowrap` + `text-overflow: ellipsis`,
capped at `24em`, with a `[title]` carrying the full address for hover. A `min-width: 13em` floor on
`.mat-column-email` stops the column being squeezed to nothing when every visible address is short.

Keep this in mind for any future column: in a `mat-table`, *breaking* a long value is what collapses
a column; *truncating* it is what protects the row.

### The "New" tag is text because an image is a dependency

`assets/new.png` was a 40px image rendered next to the name. The operator asked for a highlighted
tag instead. A text pill scales with the row, survives a failed/slow asset load, is legible at any
zoom, and can be asserted on. It is styled as a purple pill (`#ede7ff` on `#b39ddb`, `#5e35b1`
text), `flex: 0 0 auto` so the flex row cannot shrink it. All three live usages on the screen were
converted — the table cell, the Participant Data hero strip and the side-panel list — because one
screen showing two different "new" markers is worse than either.

### Search

`filterPredicate` already searched name, challenge, status, profileid and the three numbers; email
is simply added to that list. The placeholder now reads "Search by name or email" so the capability
is discoverable — plain English, not a field name.

## Test design notes (WS-41 … WS-44)

- **WS-41** reads p0's email back from Firestore rather than hard-coding it. `participant metadata`
  `.name`/`.email` are **CF-owned** (`profiledata_to_participantmetadata` merges them from
  `profile_data`), so the value on screen depends on whether the seed or the trigger wrote last.
  Reading it back makes the assertion correct in both orders.
- **WS-43** had to defeat a coincidence: that same CF sets `metadata.name` from `profile_data.name`,
  which the auth seed sets to the actor's **email** — so p0's name and email are normally the *same
  string*, and a search for the email would pass through the name path while proving nothing. The
  case stamps a name sharing no substring with the email, asserts that precondition explicitly, then
  searches the email's local part. Restored via `alignWorkshopMetadataNames()`.
- **The `fill()` trap.** The search input is bound to `(keyup)`. Playwright's `fill()` dispatches
  only `input`, so it sets the box and `applyFilter()` never runs — the case would have failed on
  first push for a reason that looks like an app bug. `typeSearch()` clears with `fill('')` then
  `pressSequentially()`, which sends real key events.
- **WS-42** exact-matches each parked header rather than using substring/`hasText`: "Total" is also
  inside the "Total Enrolled" metric card on the same page. It also asserts the kept columns are
  still present and that the data row's `<td>` count equals the header count — which is what would
  catch the `displayedColumns`/`matColumnDef` mismatch described above.
- **WS-44** asserts the tag's `tagName` is not `img`, that no `new.png` is in the row, and that the
  computed `background-color` is not transparent — "highlighted" is the requirement, so it is tested
  rather than assumed.

## Hub hooks that had to be parked too

`wd-review-assignment-38` lived only in the Assignment cell, so it no longer exists in the app. Two
hub references were parked with it, or the readiness gate would have reported a selector the suites
drive that the app no longer has:

- `workshops/new-workshop-controls.spec.ts` — the reference-only registration line.
- `workshops/workshop-dashboard-access.spec.ts` WDA-02 — the `toHaveCount(0)` check for Review. It
  would still *pass*, but vacuously: the button is now absent for everyone, so it no longer proves
  the grant is withheld. `wd-move-participant-to-next-37` carries that proof in the same case.

Readiness gate re-run after the change: `wd-review-assignment-38` is **not** in the missing-selector
list. The 35 entries that are there (`bap-*`, `cman-*`, `mcoh-*`) are pre-existing, from other
branches in the `development...HEAD` diff.

## Pending / not done

- The dashboard **CSV export has no Email column** (`prepareCSVData` writes "Participant Name" but
  no address). The table now shows one; the export does not. Not asked for, so not changed.
- `visibleColumns` still filters `'assignment'` out for ungranted users. Harmless (the id is no
  longer displayed) and left in place so uncommenting the column restores the gating for free.
