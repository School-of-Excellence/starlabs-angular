# 2026-10-12 · Segment Board — testing feedback round 1 (plan, approved)

Screen: `/segmentboard` — `src/app/Participants Profile Management/segment-board/`. Journal (WHY): `specs/journals/2026-09-25-segment-board-component.md`.

| # | Feedback | Change | Operator decision |
|---|---|---|---|
| 1 | List should update when conditions change | Saving a new / edited **active automated** segment rebuilds and stores its list straight away | — |
| 2 | 29 more profiles than Participants Analytics | Load `participant metadata` with `orderBy('name')` like Participants Analytics, so docs with no `name` field are left out | Hide nameless docs |
| 3 | Remove IDs next to names | Drop the profile ID under names in cards, View all, duplicates, Add picker, search, compare dialog, change history | Keep Profile ID in CSV exports |
| 4 | Move to manual segments; manual must win | **Move to manual segment…** for selected rows in any list side panel. A person is in at most one manual segment (moving to B takes them out of A). Anyone in an active manual segment is left out of every automated list and View all. Add / Remove / Move / Archive then rebuild the automated lists that changed | Exclusive manual membership |
| 5 | Search should filter, not pick | Board search filters the cards to segments holding a matching participant and each card to the matching rows (name or email), like B!G Cohort; no dropdown | — |
| 6 | View / unarchive archived segments | **Archived (N)** view with **Unarchive** (back at the end of the sequence and board) | — |
| 7 | Delete segment | **Delete** in the Archived view only: removes the `segmentboardconfig` and `segmentboardlist` docs after a confirm | Archive first |
| 8 | Filters show wrong data | Remove Events, Queue, Workshop, B!G Level filters (no real data behind them) | Remove for now |
| 9 | uP! / CPM count filters | Two filters: pick products, then at least / at most / exactly / between | Products picked in the filter |

Done = `npx tsc` 0, `npx ng build --configuration development` ok, harness run of every row, journal entry with a per-change revert guide. No commit until the operator says so.
