# 2026-10-08 — Extended Participants dialog: days remaining per profile

Screen: `/workshop_dashboard/:id` → evergreen **Extended** node → Extended Participants dialog
Component: `extended-timeline/extended-timeline.component.{ts,html,css}` + `workshop-dashboard.engine.ts`
Coverage: local `workshop-dashboard.engine.unit.spec.ts` (134 cases) + hub WS-49

## What changed

Each profile in the dialog now carries a pill saying how long their extension has left:
**"12 days left" / "Last day" / "Expired"**, beside the date it runs to.

## WHY each constraint landed

### Calendar days, not elapsed hours

`extenduntill` is stored at **23:59** on the chosen day (that is how `confirmExtend` writes it). An
hours-based count would therefore read "0 days left" for most of a participant's final day, and
would call 00:01 tomorrow "0" while calling 23:59 tomorrow "1" — the same day, two answers.

So both sides are flattened to local midnight and the calendar days between them are counted. That
is what someone asking "how long have they got?" means.

### `Math.round`, not `Math.floor`

A DST change makes a calendar day 23 or 25 hours long. Dividing the raw millisecond gap and flooring
would be off by one for every date past the switch. Rounding over midnight-to-midnight is correct on
both sides of it.

### Today is "Last day", not "0 days left"

Zero reads as *gone*; the participant still has today. A day count that tells someone their access
has run out while it has not is worse than no count at all.

### No extension → nothing, not "Expired"

`daysRemainingLabel(null)` is `''` and the template hides the pill. A participant with no extension
has not expired — there is simply nothing to say. `'Expired'` is reserved for an extension that
genuinely lapsed.

### The rule is in the engine

`workshop-dashboard.engine.ts` is pure and has a unit spec that runs on this machine; the dialog
imports Firestore and cannot be spec-built. Same reasoning as the side-panel search.

### `.soon` is declared after `.on`

Both are `.ext-days.<class>`, so they have equal specificity and source order decides. The
three-days-or-fewer amber must win over the plain green, so it comes second. Noted in the CSS,
because a tidy-up that sorts those rules alphabetically would silently break it.

## Testing

**Local — 134/134** (nine new). The ones that matter: today is `0` → "Last day"; time-of-day on
*either* side is ignored (early-morning now, late-evening now, 00:01 target, 23:59 target all agree);
month and year boundaries (8 Oct → 1 Nov = 24, 8 Oct 2026 → 1 Jan 2027 = 85); negatives for lapsed;
and `null` / `NaN` / `Infinity` / a string returning `null` rather than "NaN days".

**Hub — WS-49.** Nothing in the suite seeded an evergreen workshop before, so the dialog and
everything behind it were uncovered. `seedEvergreenExtended()` builds what the trigger needs:
`evergreenWorkshop: true` + `evergreenWorkshopMeta.workshopDays > 0`, two participants enrolled past
that day count, and a participant-workshop doc each carrying `evergreenaccessto.extendworkshop`.

The active extension is written to 23:59 exactly `WS_EVERGREEN_DAYS_LEFT` days out and the case
asserts the app rendered "12 days left" — the test supplies the date, the app does the arithmetic.
The second participant's extension is seeded in the **past**, so the lapsed branch is a real negative
control: without it, "12 days left" would pass on a component that never handled expiry at all.

It also asserts the two states are styled differently. A pill that reads correctly but looks
identical whether you have twelve days or none defeats the point of putting it in a list.

## Pending

- The pill is computed once per change-detection pass from `Date.now()`, so a dialog left open across
  midnight keeps yesterday's number until something re-renders. `isActive()` has the same property
  and the existing comment accepts it; not worth a timer.
