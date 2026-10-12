# 2026-09-29 — Series-level fields on Add Home Series

> WHY, for a future session. The WHAT is five form controls; the parts worth knowing are the
> name collision, the episode precondition, and the empty-vs-null choice.

## The ask

On `/eiflixhomeconfig` › **Home Series** tab, the Add/Edit dialog was to gain six fields
beside the series **Title** (`buttontext` was asked for straight after the first five):

| Field | Type |
|---|---|
| `pickoftheweek` | boolean toggle |
| `heading` | text |
| `headleft` | text |
| `headright` | text |
| `subtitle` | text |
| `buttontext` | text |

All five are written at the **top level** of the `eiflixhomeseries` document, alongside the
existing `title` and `homeseries[]`.

## The one genuinely confusing thing: two `subtitle`s

The dialog now has two fields called Subtitle, and they are not the same field:

- **Series subtitle** — the new one, top level of the document, one per series.
- **Episode subtitle** — pre-existing, inside each `homeseries[]` entry, one per episode
  card, built in `makeGroup()`.

They live in different form groups (`form.subtitle` vs the `homeseries` FormArray's per-row
group), so Angular keeps them apart on its own, and `save()` builds them from different
places — the array rows from `this.homeseries.controls`, the series fields from
`this.form.get(...)`. Nothing had to change to make that safe, but anyone reading the save
payload should know both exist. The e2e case (WS-39) pins it deliberately: it asserts the
typed value at the top level *and* that the episode row's own subtitle is still its own.

## Empty string, never null

Every text field is trimmed to `''` when blank (`(value || '').trim()`) and the toggle is
coerced with `=== true`, matching the convention set on the Cost field five days earlier
(`2026-09-24`, same screen family). A consumer never has to distinguish "absent", "null"
and "empty" — there is only ever an empty string or a real value.

Edit mode hydrates the same way: `s.pickoftheweek === true`, `s.heading || ''`, and so on,
so a document written before today (which has none of these keys) opens with the toggle off
and the inputs blank rather than showing `undefined`.

## None of them are required

Only `title` and "at least one episode" gate the save, exactly as before. Adding a required
validator here would have made every pre-existing series un-editable until someone filled
the new fields in.

## What the e2e case needed, and why

`workshops/eiflix-home-config.spec.ts` **WS-39** drives the real dialog and reads the
created document back out of Firestore. Two things were load-bearing:

- **The suite had to seed an `episodes` document.** The dialog refuses to save with no
  episode picked (`homeseries.component.ts` `save()`), and the workshops seed had never
  created one — the episode multi-select would have been empty and the case could never
  have reached the write at all. The seeded episode mirrors the content seeder's shape
  exactly; the `episodes` schema is frozen, so no new keys were introduced.
- **The created document has no run tag.** The app generates the id and writes no
  `testrunid`, so the run-scoped teardown sweep cannot see it. The case cleans up by
  *title*, before and after, which also makes it re-run independent.

## Pending

- The Home Series **list** on the tab does not show any of the new fields — only the dialog
  writes them. If they should be visible in the table, that is a separate change.
- Whatever consumes `eiflixhomeseries` (the EiFlix home surface) has to read the new keys
  before `pickoftheweek` does anything visible to a viewer.
