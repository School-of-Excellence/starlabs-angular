# 2026-10-08 — Workshop dashboard side panel: search by name

Screen: `/workshop_dashboard/:id` → the side panel opened from a metric card
Component: `workshop-dashboard.component.{ts,html,css}` + `workshop-dashboard.engine.ts`
Coverage: local `workshop-dashboard.engine.unit.spec.ts` (125 cases) + hub WS-48

## What changed

A name search at the top of the side panel's participant list, with a clear button. It narrows the
panel only — the progress table behind it is untouched.

## WHY each constraint landed

### The rule went in the engine

`filterParticipantsByName()` is a pure function in `workshop-dashboard.engine.ts`, so it runs in the
local unit spec. The component itself needs Firestore and cannot be spec-built, which is why that
engine was extracted in the first place; putting the rule there is the difference between a rule
tested before pushing and one tested by CI after.

Same matching rule as everything else on this screen — trimmed, lower-cased, CONTAINS — so "search"
means one thing here.

### `nameOf` is a parameter, not a field read

The panel's entries come from several different builders: some carry `name` directly, others only a
profileid the component resolves against `mapProfile` / `mapProfileNew`. Passing the accessor in
keeps the rule honest about that, and `sideNameFor()` is the one place the fallback chain lives.

### An empty term returns everything, and the list is copied

A cleared box must show the whole list again, and a stray space must not empty the panel — so the
term is trimmed and an empty one short-circuits. The function returns a copy so a caller cannot
mutate the panel's source array through it.

### The search resets wherever the filter does

Fifteen places open the panel, and every one of them already sets `filterOption = 'all'`. The search
is cleared alongside each, because otherwise opening a different metric card with a stale term would
show an empty panel and look broken.

## Two mistakes I made, both caught locally

- **A broken import.** My script inserted the new symbol assuming the import list ended with a
  trailing comma. It did not, and the whole app stopped compiling (`TS1005: ',' expected`). Caught by
  `ng test`, which compiles before it runs.
- **A wrong expectation, not wrong code.** I asserted that searching `ita` matches "Chitra". It does
  not — "Chitra" contains `itr`. The implementation was right and the test was wrong; corrected, with
  a `hit` case added to keep a genuine mid-name match covered.

Both are the argument for having a local loop at all: neither would have been worth a CI round trip.

## Testing

**Local — 125/125** (eight new cases): case-insensitive substring, empty/whitespace/null returning
everything, trimming, no match, order preservation, a ragged list (an entry with no `name`, a null,
a number), and the returned copy.

**Hub — WS-48.** Opens the panel from the Exist Users Enrolled card, waits for the name to actually
render (it arrives from a separate metadata query that lags on a slow emulator — the trap WDC-02
already documents), then asserts the match, a negative control that empties the panel, and the clear
button restoring both.

**Typing note, recorded in the spec so nobody "fixes" it:** this input is `[(ngModel)]` +
`(ngModelChange)`, *not* `(keyup)`. ngModel listens to the `input` event, which `fill()` dispatches,
so `fill()` is correct here. The `pressSequentially` workaround is only needed for the
`(keyup)`-bound boxes elsewhere on this screen.
