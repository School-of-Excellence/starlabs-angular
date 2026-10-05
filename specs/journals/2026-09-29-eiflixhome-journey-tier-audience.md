# 2026-09-29 — Journey / Tier audience on an EiFlix Home row

> WHY. Companion to `2026-09-29-homeseries-series-level-fields.md` (same screen, same day).

## The ask

On `/eiflixhomeconfig` › **Create / Assign EiFlix Home**, after each row's **Show to**:
a two-way chooser (Journey **or** Tier — never both), then a searchable multi-select of
whichever was chosen. Selections store **document ids**, not the names shown.

## Where it is stored

Per row, inside the `homeconfig` array of `classify/eiflixwebapp`:

```
audiencetype: 'journey' | 'tier' | ''      // which chooser is active
journey:      ['<journey doc id>', …]      // [] unless audiencetype === 'journey'
tier:         ['<tier doc id>', …]         // [] unless audiencetype === 'tier'
```

Three deliberate choices:

- **The unchosen list is written empty, not omitted.** A consumer can read
  `entry.journey` and `entry.tier` unconditionally; there is never a missing key to guard.
  The same reasoning as the empty-string convention used elsewhere on this screen.
- **`audiencetype` is stored even though it is derivable.** A row with both lists empty is
  ambiguous otherwise — "nobody chose" and "chose Journey, picked none" would look
  identical, and they mean different things to whatever reads this.
- **Ad rows get the fields too.** Each ad map inside a paired `ads` entry already carries
  its own `showto`, so it carries its own audience for the same reason.

## Name vs id — the trap

The dropdowns show `journey.journey` and `tier.tier`, but what is stored is the **document
id**. Those are unrelated strings, and the natural mistake is to bind `[value]` to the
label. The e2e case (WS-40) seeds a journey and a tier whose *name* and *id* differ
visibly, so storing the label instead of the id fails the assertion rather than passing by
coincidence.

Note the existing seeded journey in the workshops world carries `journeyname`, **not**
`journey` — a different field, which this picker does not read. That is why WS-40 needed
its own journey document rather than reusing `JRN_BIG`.

## Exclusivity

`setAudienceType()` clears the other list whenever the choice changes, and `save()` writes
only the chosen one. Clicking the already-selected button clears the choice entirely, which
returns the row to "shown to everyone" — the meaning every existing row already had. There
is deliberately no third "None" button: the operator asked for two options, and a row that
has never been touched must keep behaving exactly as before.

WS-40 proves the exclusivity by switching an already-saved row from Journey to Tier and
asserting the journey array came back **empty**. A case that only ever set one of the two
could not detect a stale leftover.

## One search box for all rows

`audienceSearch` is a single component-level string, not one per row, because only one
`mat-select` panel can be open at a time. It is reset when a panel opens and when the
chooser changes.

## Pending

- Nothing downstream reads `audiencetype` / `journey` / `tier` yet — the EiFlix home
  surface has to honour them before a viewer sees any difference.
- Existing rows in the live document have none of the three keys; they hydrate as "no
  audience chosen" and gain the keys on the next save of that screen.
