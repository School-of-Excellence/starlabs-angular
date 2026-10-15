# 2026-10-05 — /contentanalytics: the new-user rule, and email + status in the export

Screen: `/contentanalytics` → **Analytics Table** tab
Component: `src/app/content/content-analytics/content-analytics.{component.ts,engine.ts}`
Coverage: local `content-analytics.engine.unit.spec.ts` (43 cases) + hub `content/content-analytics.spec.ts` CN-47 / CN-48

## What changed

1. `new_user_data` now answers only for people who are **still** new — a record flagged
   `movedtoexist: true` no longer stands in for its person.
2. The CSV export gained an **email** column (after the name) and the **status** column the table
   already showed.

## WHY each constraint landed

### The rule went in the component, not the shared service

`AuthguardService.getProfileMapNewUser()` is read by **ten** screens — customer chat, videoask,
workshop config, telemetry, view-participants and more. Filtering inside it would have silently
changed every one of them. The ask was for this screen, so the filter is applied where the component
takes the map.

### …but the rule itself went in the engine

`content-analytics.engine.ts` is pure functions with a unit spec that **runs on this machine**. The
component cannot be spec-built at all — it imports Node's `console` module, which does not resolve
under `tsconfig.spec` (that is why `content-analytics.component.spec.ts` is a stub and why the engine
was extracted in the first place). Putting `isStillNewUser` / `stillNewUserMap` / `csvCell` there is
the difference between a rule that is tested before pushing and one that is not.

It is also the *same* rule as the workshop dashboard's `isNewUserProfile()` and the EiFlix ops
dashboard's user-type filter, which is what the operator asked for in as many words ("like in the
workshop dashboard we did like this only"). Three screens, one definition.

### A missing document KEEPS the person, it does not drop them

`stillNewUserMap` removes only ids it can positively see have moved. The map and the documents come
from the same read so a gap should not arise — but if it ever did, keeping means the filter quietly
does nothing, while dropping would blank out every name on the screen. The cheap failure is the
right one to choose.

### `csvCell` exists because ConvertToCSV quotes nothing

`ConvertToCSV` joins values with bare commas and escapes nothing — which is why the export already
strips commas out of `videoname` by hand before writing it. **Any** field added to that export needs
the same treatment or it shifts every column after it on that row, and the file still looks plausible
at a glance. `csvCell` is that treatment, applied to both new fields and unit-tested.

(`name` is still unescaped — pre-existing, and out of scope here.)

### Email falls through metadata first, then new_user_data

`participant metadata` is primary, exactly as the name resolution already is. The ordering matters
*because* of change 1: somebody who has moved across is no longer in the new-user map, so their email
comes from their full profile rather than their stale signup row. The two changes are the same idea
applied twice.

## Testing

**Local — 43/43.** Fourteen new engine cases: the flag's truthiness (`'true'` the string is *not*
moved — treating it as moved would silently drop anyone whose record was written by something that
stringified it), the missing-document behaviour, and `csvCell` over commas, newlines, null and zero.

**Hub — CN-47 / CN-48.** Renumbered from CN-43/44, which `arena-video-ask.spec.ts` already owns;
duplicate ids make a failure report ambiguous.

- **CN-47** gives the moved person **no `participant metadata` row on purpose.** With metadata
  present the template prefers that name anyway, so the case would pass whether or not the filter
  exists. A still-new person is the positive control, so "the other name is absent" cannot pass
  merely because the screen never read `new_user_data` at all.
- **CN-48** clicks the real export button, takes the real download off disk and reads the CSV —
  asserting both headers by exact name, both email sources, the seeded status, and that the seeded
  rows have exactly as many cells as the header.

Both filter by a run-unique **prefix** first. Three reasons, all of which would otherwise have bitten:
the table paginates (25/50/100) so a row lookup could land on another page; the 7-day window covers a
collection the shared emulator also holds other runs' rows in; and filtering makes the exported file
deterministic, since `exportCSV` writes `filteredData` when a filter is active.

### Applying the 2026-10-01 lesson

CN-47/CN-48 are the **first cases to actually drive `ca-inp-005` and `ca-btn-004`** — they were
addressability-only references before. So, per the rule added after the last CI failure, I read
`customfilter`, `exportCSV`, `downloadFile` and `ConvertToCSV` end to end before writing them:

- `customfilter` optional-chains both name lookups, so a profile now absent from the new-user map
  returns false instead of throwing — the exact shape of the bug that broke the workshop dashboard's
  search.
- The filter is `indexOf(term) === 0` — a **prefix** match, not a substring one. A fragment would
  have matched nothing.
- The name box is bound to `(keyup)`, so the helper types with `pressSequentially`; `fill()`
  dispatches only `input` and the filter would never run.
- `downloadFile` bails on an empty array, so the case asserts rows are present before exporting.

## Pending

- The CSV's `name` column is still written unescaped, unlike `videoname` and the two new fields. A
  person whose name contains a comma would shift that row. Pre-existing; not touched.

---

# Addendum — Video Name dropdown: typeahead (same day)

The Video Name filter on the Analytics Table is a `mat-select multiple` over `videoNameList`. It now
carries an `ngx-mat-select-search` typeahead, matching the house pattern used by the eight dropdowns
on /participants-analytics and the name filter on the EiFlix ops dashboard.

## The part that is not cosmetic

A multi-select whose options can disappear is a data-loss hazard, and I checked Angular Material's
source rather than assuming it was handled:

- On every options change, `MatSelect._initializeSelection()` → `_setSelectionByValue()` **clears the
  selection model** and re-selects only the options **currently rendered**.
- `_propagateChanges()` then writes back `selected.map(o => o.value)`.

So: choose three videos, type a term that hides one of them, click any option — and the value array
written back is missing the hidden one. The user silently loses a choice they already made, with no
error and nothing on screen to show it happened.

`filterVideoNameOptions(options, query, selected)` therefore **always renders the already-selected
names**, whatever the term. It also preserves the source list's order rather than hoisting the
selected ones, because `MatSelect._sortValues()` sorts by `options.indexOf` — hoisting would reorder
the chosen values behind the user's back.

This is the 2026-10-01 rule applied again: the control was new to me, so I read the handler before
writing the test. Here the handler was Material's own, and reading it changed the implementation, not
just the spec.

## Smaller decisions

- **Matching rule** is the same as `filterOptions` in `participants-analytics.engine.ts` — trimmed,
  lower-cased, CONTAINS. Reimplemented in this engine rather than imported, so the content bundle
  does not pull in that 500-line module for five lines. The comment names the sibling so the two stay
  recognisably one rule.
- **`videoNameOptionsShown()` is a method called from `*ngFor`**, which runs each change-detection
  pass. That is the existing house pattern (`onfilterjourneylist()`, `onParticipantMode()`), and the
  list is small.
- **Clear filters empties the typeahead too**, or a stale term would still be narrowing the options
  after the user cleared everything.
- No `name=` on the `ngModel`: checked, there is no `<form>` wrapper on this screen — unlike
  /participants-analytics, where the siblings need one.
- The options got `data-testid="ca-videoname-option"` so the spec can count them instead of matching
  `mat-option` text.

## Testing

**Local — 53/53** (ten new engine cases), including: the selected-option rule with one and with
several selections, no duplicate when a name both matches and is selected, order preservation, a
ragged list (a log with no `videoname` pushes `undefined` into `videoNameList`), and that the
returned array is a copy.

**Hub — CN-49.** Selects a video, searches a term that excludes it, and requires it to still be
rendered *and* still `aria-selected="true"` — the assertion that fails without the rule. Also: the
term narrows to the three seeded names (now run-scoped, so it matches exactly those), typing does
**not** filter the table behind the dropdown, and clearing restores every option.

Uses the interaction pattern already proven in WS-31, which cost two CI runs to establish:
ngx-mat-select-search renders a hidden helper `<input>` beside the visible one (so address it by
placeholder), and marks its host `<mat-option>` `aria-disabled` while keeping `pointer-events: all`
(so click with `force` and type real keys — `fill()` waits out its timeout on "element is not
enabled").

---

# Addendum 2 — `phonenumber` in the export

Added beside `email`, rendered as the country code then the number ("+91 9000000001") — the way
every other surface in this app presents a phone, and the only form that is useful in a file somebody
will actually dial or import from.

## The field names are a trap, and I checked rather than guessed

- **The number** is `phonenumber` on **both** `participant metadata` and `new_user_data`.
- **The country code is NOT the same key in the two.** `new_user_data` carries `countryCode`;
  `participant metadata` carries the lower-cased `countrycode`, which is what the Cloud Function
  `profiledata_to_participantmetadata` writes. `profilePhone()` accepts both.

Reading only one spelling would have blanked the code for half the people — a column that looks
populated, is quietly wrong, and nobody notices until a number fails to dial.

Confirmed from `/newusersprofile`, which reads both collections directly and renders exactly
`countryCode || countrycode` + `phonenumber` (newusersprofile.component.html:224, ts:1050).

**A wrong source I nearly used:** `AuthguardService.getProfileMapNewUser()` returns a `phonenumber`
map — but it is built from `doc.data()['number']`, which is the **`profile_data`** shape. On
`new_user_data` and `participant metadata` documents that field is absent, so the map would have
produced an empty column while looking like the obvious thing to use. The engine comment records
this so the next person does not rediscover it.

## `||`, not `??`

`profilePhone()` returns `''` for a document that exists but carries no number, and the export falls
through with `||` so an empty metadata record does not beat a populated new_user_data one. `??` would
have stopped at the empty string. (Email keeps its per-field `??` fallback, which is correct there:
the value is either present or `undefined`, never a meaningful empty.)

## Testing

**Local — 61/61** (eight new engine cases): each collection's spelling, both spellings on one
document, a bare number with no code, a number stored as a *number* rather than a string, whitespace
trimming on both parts, and the empty-string return that makes the caller's fallthrough work.

**Hub — CN-48 extended.** The seed now gives its two people **different** country-code spellings on
purpose — `+91` via `countryCode` on the new user, `+44` via `countrycode` on the existing one — and
the case asserts the rendered `"<code> <number>"` for each. One column, both shapes, one case that
fails if either regresses.
