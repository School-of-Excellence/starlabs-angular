# 2026-10-02 — EiFlix Mobile App Logs: New users / Existing users filter

Screen: `/eiflixoperationsdashboard` → **EiFlix Mobile App Logs**
Component: `src/app/New-Workshop/eiflixoperationsdashboard/eiflixoperationsdashboard.component.{ts,html,css}`
Coverage: local unit spec `eiflixoperationsdashboard.logs.spec.ts` (13 cases) + hub `workshops/eiflix-ops-dashboard.spec.ts` WS-45

## What changed

A fourth filter on the logs toolbar — **All users / New users / Existing users** — alongside search,
name and Device OS. It stacks with the others, is counted by the Clear chip, and resets with it.

## WHY each constraint landed

### The definition is borrowed, not invented

The screen already answers "who is a new user?" twice, in the two cards above the table:

- **Total New Users** — `new_user_data` with `movedtoexist !== true` ("Signed up · not yet moved to paid")
- **New Users to Paid** — the same records with `movedtoexist === true` ("Moved to existing / paid profiles")

So the filter uses *exactly* that rule (`isNewUserProfile`, sharing `splitUsers`' predicate). Had I
written a second definition, a number on a card and a filter on the table directly beneath it could
disagree about the same person — the kind of inconsistency nobody reports as a bug, they just stop
trusting the screen.

It also matches `isNewUserProfile()` on the workshop dashboard, so "new user" means one thing across
both screens.

**The load-bearing consequence: someone who has been moved to paid is EXISTING, not new.** That is
the whole point of the second card, and it is the half of the rule a careless implementation gets
wrong (treating "has a new_user_data doc" as "is new").

### The split is total

`existing = !isNew` rather than a three-way classification. A log row whose profileid is in neither
directory is a directory gap, not a third kind of person — anyone who can sign in to the app has an
account. Making the two halves exhaustive means no row can vanish from both filters, which is what a
"new or existing?" question actually promises. WS-45 asserts this directly.

### `isNewUser` is resolved at load, not per filter pass

Stored on `LogRow` beside `name`, which is resolved the same way from the same directories. The
alternative — a `nudMap` lookup inside `applyLogFilters` — would re-walk the directory for every row
on every keystroke of the search box. The file already states this convention ("Display strings are
precomputed once per emission so change detection never re-formats rows"), and the trade-off is the
same one `name` already accepts: a realtime `new_user_data` change does not retro-classify rows
already on screen until the next range load.

### The select needed its own width

Measured rather than guessed: "Existing users" renders at **99.6px** in Roboto 16px. An outlined
mat-select of 150px (`.eod-log-select-sm`, which the Device OS filter uses) leaves ~94px of text area
once the 32px padding and ~24px dropdown arrow are taken — **it would have clipped.** Hence
`.eod-log-select-md` at 172px, which leaves 40px of headroom.

`.eod-log-tools` is `flex-wrap: wrap` with the search on `flex: 1 1 240px; min-width: 200px`, so the
fourth control wraps gracefully rather than crushing the row.

## Testing — the local loop finally exists

`eiflixoperationsdashboard.logs.spec.ts` constructs the component with `Object.create(prototype)` and
calls `applyLogFilters()` directly, so it needs neither Firestore nor a browser login. **It runs on
this machine** — `ng test --include='**/eiflixoperationsdashboard.logs.spec.ts'` → 13/13 — which is
the only genuine pre-push feedback loop available here, since the hub suites need the Firebase
emulator and therefore Java.

Four cases added: the two-way split and its totality, stacking with OS/search without resetting them,
unique-people counting within a chosen type, and re-paging when the type shrinks the list.

(The sibling `eiflixoperationsdashboard.component.spec.ts` fails with `No provider for Firestore!`.
That is the untouched Angular CLI stub, failing for that reason before this change — see CLAUDE.md
on the 398/399 empty stubs.)

## Hub coverage (WS-45) — and why it got its own seeder

WS-31 asserts **exact** tallies off `seedLoginLogs()`: "2 of 2 unique people", four rows in 30D,
three name-filter options, "1–4 of 4". Adding people to that seed would have rewritten every one of
those numbers in a passing test.

So WS-45 lives in its own describe with `seedUserTypeLoginLogs()`, which adds two logins today and is
undone in `afterEach`:

- **NU_A** — `new_user_data`, no `movedtoexist` → still **new**
- **NU_C** — the same record flipped to `movedtoexist: true` → **existing**

NU_C is the doc this suite already treats as mutable (`resetNewUserTags`), and flipping a field
changes no document *count*, so WS-30's `countWhere('new_user_data')` floor is untouched.

Before writing it I read `rebuildPaidCard()` end to end, because flipping that flag feeds a path no
test had exercised with a profile that has **no** `participant metadata` row. It handles it
(`const src = pm || nud`, and the `pm ? journeyTag : sourceTag` ternary) — no crash. That check is
the 2026-10-01 lesson being applied rather than restated.

The readiness gate then caught something I had missed: the spec drove `-new` and `-existing` but
never `eif-logs-usertype-all`, relying on Clear to reset. Added as its own step, which is better
coverage anyway — "All users" should restore both halves on its own, not only via Clear.

## Pending

- The table has **no column** showing which rows are new, so filtering to "New users" gives a list
  that looks like any other. Only a filter was asked for; a badge or column would make the result
  self-evident. Worth a follow-up.
