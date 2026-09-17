# Plan — Interim Report Dashboard: Journey / Event filters, Export, Crossover list rule
Operator request 2026-09-16. Follows `2026-09-15-interim-dashboard-tagging.md`.
Operator choices: export = **.xlsx** (project already ships `xlsx`); filtered count shows **on the filter itself**.

| # | Change | Where |
|---|---|---|
| 1 | JOURNEY filter: options from the `journey` collection (`journey` name field, doc id = value), searchable dropdown | component `loadFilters()`; script `filterPanel()` |
| 2 | A participant's journey = `participant metadata/<profileid>`: `activejourney` → `lastcompletedjourney` → `lastsubscribedjourney`, first non-empty (operator's order; not the `customerstatus` branch the analytics engine uses). Also fills the By participant "Journey" column, which was `—` | component `journeysOf()`, `toMember()` |
| 3 | EVENT filter: options from the `event collection`; selecting one reads `event participation request` where `eventref == event collection/<id>` and `status == 'attended'` → the attending profileids; the pool keeps only those | component `attendees()` (cached per event); script `EVENT_SET` |
| 4 | Both filters show the matching participant count on the filter button | script `filterBtn()` |
| 5 | Export (.xlsx) on every list: each drill-down dialog, By participant, and the parent's Love Letter / Ask A&H tabs | script `exportModal()` / `exportPeople()`; component `exportXlsx()`; parent `exportRecords()` |
| 6 | Crossover Meter counts only participants who have a crossover record (`hasCross`) — the matrix, the Areas-changed buckets, the level panel and their drill-downs | script `crossPool()` |

## Reads
| What | Query | When |
|---|---|---|
| journeys | whole `journey` collection | once per dashboard mount |
| events | whole `event collection` | once per dashboard mount |
| participant journeys | `participant metadata` where `documentId() in [...]`, chunks of 30 | with each pool load (the range's profileids only) |
| event attendees | `event participation request` where `eventref ==` + `status == 'attended'` | first time that event is picked, then cached |
