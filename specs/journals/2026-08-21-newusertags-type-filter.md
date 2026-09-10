# 2026-08-21 — newusertags type filter (newusersegments)

## What was asked
Scope the tag system on the New Users side to a tag *type*: both
`NewusersprofileComponent` and `AssignTagsDialogComponent` must fetch
`newusertags` with `where('type','==','newusersegments')`, and tags created
from the dialog must be stamped `type: 'newusersegments'` silently (no UI).
**Only those two components** — the campaign dashboard/dialog readers of
`newusertags` stay unfiltered by explicit scope.

## What changed
- `newusersprofile.component.ts` (~line 171): live tag subscription now wraps
  the collection in `query(..., where('type','==','newusersegments'))`
  (`query`/`where` were already imported).
- `assign-tags-dialog.component.ts` `ngOnInit`: same where-clause on the
  one-shot fetch (added `query`/`where` imports).
- `assign-tags-dialog.component.ts` `createTag()`: payload now includes
  `type: 'newusersegments'` — invisible in the frontend, matching the ask.

## Found during verification — ⚠️ pending operator decision
Read-only REST query against production (`fir-sample-aae4a`, `newusertags`
allows public read): **11 docs total, 0 have any `type` field.** So the
filtered queries return ZERO rows until backfilled — the profile page's tag
chips/tag manager and the assign dialog will look empty, and `tagMap` lookups
for users' existing tag ids will miss. Newly created tags (auto-stamped) will
appear correctly.

**Not backfilled on purpose** — writing 11 production docs is an operator
decision. The fix, when approved: set `type: 'newusersegments'` on all 11
existing `newusertags` docs (additive; the unfiltered campaign readers are
unaffected either way).

## Verification
- `ng build --configuration production` green.
- Runtime not exercisable unauthenticated (profile route/flows need login);
  query semantics confirmed via the REST count above instead.
- Not committed (operator commits manually).

---

## Same day, later round — Workshop & Campaign Calendar (design only)

Operator asked for structure/collection/flow for the reference's
"Workshop & Campaign Calendar" — explicitly NO code yet. Draft plan written
to `~/.claude/plans/2026-08-21-wccalendar-design.md` (moves to specs/plans/
on approval). Key proposal: new `eiflixcalendar` collection for manual
events only; campaign bars DERIVED live from `eiflixcampaign` (no
duplication); empty `wccalendar/` scaffold already exists untracked.
Awaiting operator's structural feedback before any implementation.

---

## 2026-08-26 — /newusersprofile "Converted" filter + Moved On column

Operator: chip filter "Converted" → rows where movedtoexist === true;
while active show a `movedon` (datetime) column; export must cover it.

Implemented by MIRRORING the existing workshop-filter pattern exactly:
- `convertedOnly` state; toggle button in the filter bar (tag-select-btn
  style, swap_horiz icon, active state + inline ✕ clear); counted in
  hasAnyFilter; reset by Clear-all.
- filterPredicate reads convertedOnly off `this`
  (`u.movedtoexist !== true` → hidden); refreshFilter adds `conv` to the
  filter JSON so the string change re-runs the predicate.
- updateDisplayedColumns() reworked to compose columns/exports from BOTH
  dynamic filters: +'workshop' (include-mode workshop filter) and
  +'movedon' (converted). Export chip auto-sync extended with
  lastConvertedActive (same only-on-transition rule so manual chip
  deselection isn't fought).
- 'Moved On' column: sortable (sortingDataAccessor case → epoch ms),
  cell `toDate(u.movedon) | date:'medium'` with '—' fallback; export
  column formats the same way. Export needed no other work — it exports
  the SELECTED profiles, and the header select-all operates on
  dataSource.filteredData, so filter → select all → export yields exactly
  the converted rows (with the auto-selected Moved On chip).
Prod build green. Not committed.
