# 2026-10-09 — EiFlix Report: unique users per surface

Screen: `/eiflixoperationsdashboard` → new **EiFlix Report** section, after EiFlix App Logs
Component: `eiflixoperationsdashboard.component.{ts,html,css}`
Coverage: local `eiflixoperationsdashboard.logs.spec.ts` (36 cases) + hub **WS-52** — run and green

## What changed

A new section with its own Today / 7D / 30D control and two cards:

- **EiFlix Mobile App Users** — Android, iOS, Total; each split Existing / New.
- **EiFlix Web App Users** — the same split, counted on its own.

## WHY each constraint landed

### No new query in the common case

The operator asked to reuse the existing fetch. A `LogRow` already carries everything the report
needs — `profileid`, `date`, the **normalised** `device_os` (already `'web'` for an `eiflixweb`
sign-in) and the resolved `isNewUser`. So the report counts off `logAll` whenever its window fits
inside the table's, which costs **zero reads**. Both default to Today, so the first paint is free.

`refreshReport()` falls through three cases: table's rows → the report's own cached rows → one read,
cached for the session. Picking Today while the table sits on 30D still costs nothing.

The fetch+map was extracted into `fetchLoginRows(days)` and is now shared, so there is exactly one
definition of "an EiFlix login row" — same range query, same app/web filter, same OS normalisation,
same cohort resolution. Without that the two surfaces would drift apart the first time either
changed.

### Unique PEOPLE, and the mobile total is a union

Counts are of profileids, not rows: nine sign-ins by one person is one person.

**Mobile Total deduplicates** — someone who used both an Android and an iPhone is one person, so the
total is normally **less** than Android + iOS. That looks wrong at a glance, so the card says so in a
footnote. It is the honest answer to "I want to show the unique only".

**Web is counted separately and deliberately NOT deduplicated against mobile.** The operator was
explicit: people use both, and collapsing them would hide exactly that overlap. The two cards answer
different questions and their totals are not meant to be added.

### `existing = total − new`

Derived rather than counted independently, so the two halves can never disagree with the total shown
beside them.

### `deviceClass` matches on substrings, except web

`device_os` is free text from the client — "Android 13", "iOS 17.2", "iPadOS", "iPhone" all arrive.
Web is tested **first and exactly**, because `logDeviceOs()` already rewrote an `eiflixweb` row to
precisely `'web'` and nothing else may claim it. Anything unrecognised is `other` and is counted
nowhere rather than guessed into a bucket.

## Testing

**Local — 36/36** (12 new): the OS classifier over real-world strings, people-not-rows, the
existing/new split, mobile-total dedup, web kept separate and out of the mobile buckets,
`existing + new === total` in every bucket, blank profileids, unknown OS, and empty input.

One test failed first and the **code** was wrong, not the test: a whitespace-only profileid slipped
past a truthiness guard. `fetchLoginRows` already trims so it is unreachable in practice, but the
counter should be right on its own terms — it trims now.

**Hub — WS-52**, run against the emulator. The seed is arranged so every assertion can fail:

| | | |
|---|---|---|
| android | p0, p1, NU_A | 3 — NU_A is the only NEW user |
| ios | p1, NU_C | 2 — NU_C has a `new_user_data` doc but `movedtoexist: true`, so **existing** |
| mobile total | p0, p1, NU_A, NU_C | **4, not 5** — p1 used both phones |
| web | p0 | 1 — p0 is on Android **and** web, counted in both |

`seedReportLoginLogs()` exists for one reason: to put p1 on a second phone. Without it every person
has one surface, the union and the sum agree, and a broken dedup passes unnoticed.

The range control is exercised for the two outcomes that differ: 7D adds an older row for someone
**already counted** (the unique count must hold at 3), 30D adds a person not seen today (iOS must
grow by exactly one).

### Two things only running caught

1. **My testids were on the wrong elements.** They sat on the wrapper spans, so each read `"1 new"`
   rather than `"1"`. The value was right all along; the locator was not. Moved onto the numbers.
2. **A loop defeats the readiness gate.** I first asserted the four cell labels in a `for` loop over
   `[tid, label]` pairs — the gate's scanner reads **literal** `getByTestId` ids only and cannot see
   a variable, so all four stayed uncovered. Written out one per line.

## Pending

- `deviceClass` returns `other` for an unrecognised OS and nothing displays it. If real data turns
  out to carry a meaningful fourth platform, it is currently invisible in this section — worth a
  look at the actual distinct `device_os` values in production before assuming Android/iOS is total.

---

# Addendum — Total Content Consumption (same day)

Both report cards gained a **Total Content Consumption** block: Existing Users / New Users / Total,
each as `"127 hours 06 minutes 42 seconds"`, summed from `content analytics.totaltimespend` over the
report's own Today / 7D / 30D window.

- **Mobile** = `platform_name` `eiflixapp`. One bucket, not split by OS — Android and iOS both
  record the same platform, so there is nothing to split.
- **Web** = `platform_name` `Eiflixweb`.

## WHY each constraint landed

### It does NOT piggyback on fetchEngagement's pass, and that is deliberate

Engagement already reads `content analytics` by `logdate`, so reusing it looks obvious. But the two
windows are not the same: `engBounds()` starts 7D at **today − 7**, while the report's
`logRangeStart(7)` starts at **today − 6** — seven calendar days including today, matching the user
counts directly above it.

Sharing the aggregate would make "7D" mean two different things inside one card. One extra read,
cached per range for the session, is the cheaper mistake. (The one-day disagreement between the
dashboard's own two "7D"s is pre-existing and left alone.)

### Case-insensitive platform matching

`platformKey()` elsewhere in this component **preserves** case, so `'Eiflixweb'` and `'eiflixweb'`
are already distinct keys in the register and in Device Breakdown. Matching case-sensitively here
would silently split one surface in two and under-report both halves.

The hub case seeds the two app rows with **different** casing (`'eiflixapp'` and `'EiflixApp'`) so a
regression to case-sensitive matching fails immediately rather than quietly halving the number.

### `existingSeconds = total − new`

Derived, so the two rows can never disagree with the Total beneath them.

### Zero-second and negative rows are skipped

A row with no usable time is not a session worth counting; `Number(...) || 0` then `<= 0` drops
junk without letting a negative subtract from somebody's watch time.

### A row with no profileid still counts its seconds

The time was genuinely watched — only the cohort is unknown. Dropping it would under-report the
Total, which is the number most likely to be quoted. It lands in Existing (it is not demonstrably
new), and the unit test pins that choice so it is a decision rather than an accident.

### Hours are not capped at 24

This is a running total across many people, so three-figure hours are normal. Minutes and seconds
are zero-padded so a column of these lines up; `font-variant-numeric: tabular-nums` does the rest.

## Testing

**Local — 49/49** (13 new): the formatter (padding, no 24h rollover, fractional floor, NaN/negative/
null → zero), platform matching across five casings, other platforms ignored, the cohort split,
`existing + new === total`, zero/negative/NaN seconds skipped, missing profileid counted as existing,
and empty input.

**Hub — WS-53**, run against the emulator alongside WS-52 (2 passed). The seed's totals are chosen so
the rendered strings are unmistakable, and **the Total is never seeded** — 3661 + 7322 = 10983s has
to be summed by the app. A 99999-second SolarVoice row must appear in neither total; without the
platform filter it would dominate both.

One thing the gate caught again: the two block-level hooks were uncovered because I nearly looped the
assertions. Literal `getByTestId` ids only — the scanner cannot see a variable.

## Addendum 2 — Workshop Videos / Library Videos

Both consumption blocks gained two rows under Total, summing the same `totaltimespend` by the
`from` field:

- **Workshop Videos** — `from === 'eiflixworkshop'`
- **Library Videos** — `from === 'eiflixcontent'`

### It is a SECOND cut, not a subdivision

This is the thing to understand before changing it. `ConsumptionCounts` now carries two independent
slices of the same seconds:

- by **cohort** — existing / new, which do sum to Total by construction;
- by **origin** — workshop / library, which **do not have to**. A row whose `from` is missing or is
  some third value still counts towards Total and belongs to neither row.

So `workshop + library <= total`, and a reader should not expect the two pairs to reconcile with
each other. A unit test pins exactly that, with a row whose `from` is `'somewhere-else'`.

### `from` is matched case-insensitively, like `platform_name`

Same reasoning and the same hazard: it is free text from the client, and `platformKey()` elsewhere
in this component preserves case. The hub seed writes `'EiflixWorkshop'` mixed-case on purpose.

## Testing (updated)

**Local — 54/54** (5 more): the per-surface split, case-insensitive `from`, unknown/missing `from`
still counting towards Total while belonging to neither row, independence from the cohort split
(the same seconds appearing in both cuts), and another platform never reaching either row.

**Hub — WS-53 extended**, run against the emulator. The app gets one workshop row (3661s) and one
library row (7322s) so the two figures **differ** and a swapped mapping is obvious; web gets a
workshop row only, so its library figure must be exactly zero rather than merely a different number.
The 99999s SolarVoice row now also carries `from: 'eiflixworkshop'`, so dropping the platform filter
would poison the workshop rows as well — all four are asserted.

## Addendum 3 — Purchases & Signups

A third card after EiFlix Web App Users, with three counts over the report's window:

| Label | Source |
|---|---|
| Journey Purchased | `new_user_data.movedon` in window |
| New Users Joined in EiFlix | `new_user_data.created` in window |
| Masterclass Purchase | `workshoppaymentlog.datetime` in window **and** `status === 'captured'` |

(The card heading "Purchases & Signups" is mine — the operator named the three rows but not the
card. Rename freely.)

### Two of the three cost nothing

`ngOnInit` already holds a **realtime listener over the whole of `new_user_data`**, keeping every
document in `nudMap`. Journey Purchased and New Users Joined are therefore a filter over data
already in memory — no query, and they re-count for free whenever the listener emits.

Only `workshoppaymentlog` needed a read, cached per range for the session.

### One `where`, status in an `if` — as asked, and for a reason

The payment query filters on `datetime` only; `status === 'captured'` is tested in code. A second
equality alongside a range would require a composite index, and **every** query on this dashboard is
deliberately kept to a single-field range for that reason. The operator's instruction matches the
screen's existing convention exactly.

### The NaN guard

`toDate()` falls through to `new Date(value)` for anything it does not recognise, which yields an
Invalid Date. NaN comparisons are all false, so such a row was already excluded — but by accident.
`countInWindow` now checks `Number.isFinite` explicitly so it is a decision.

Worth knowing: `toDate()` does **not** handle the raw `{seconds}` shape. That comes from the Admin
SDK and never reaches this component (the Angular SDK returns real `Timestamp`s), so it is not a
gap here — but a unit test pins that such a value is simply not counted rather than throwing.

## Testing (updated)

**Local — 61/61** (7 more): window edges inclusive, documents outside on either side, **counting
only the field asked for** (movedon and created live on the same documents, so a count reading the
wrong one would still look plausible), the timestamp shapes this path produces, unparseable values
ignored, and empty input.

**Hub — WS-54, and it failed first for a reason worth recording.** I asserted literal counts and got
**4 instead of 1** for New Users Joined: the base seed's own `new_user_data` rows are 1–3 days old
and legitimately enter the 30D window. **The app was right; my test was wrong to assume it owned the
collection.**

These three counts are over *whole collections* that the shared emulator also fills from other runs
— the same situation WS-30 documents. So the case now computes each population itself with the Admin
SDK and requires the app to agree: two separate computations over one population, never the app's
own number read back into the expectation.

The seed still does the falsifiable work. The two `new_user_data` rows are deliberately
**asymmetric** — each carries the counted field today and the *other* field 300 days out — so
reading the wrong field makes **both** counts wrong rather than neither. And the payment log
separates the two filters that could be confused: a `failed` row dated today (excluded by the IF)
and a `captured` row 200 days old (excluded by the WHERE).

`workshoppaymentlog` was missing from the suite's teardown sweep; added as a backstop for a run that
dies before its afterEach.
