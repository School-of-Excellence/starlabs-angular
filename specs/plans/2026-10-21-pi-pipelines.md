# PI — Saved filters as pipelines (one-time view, nothing stored)

| # | Edit | Where |
|---|---|---|
| 1 | `pipelineRows(members, mode)` pure fn: names in every / not every / any pipeline | component.ts (engine) |
| 2 | `ParticipantStore.audienceMembers(id)` — public wrapper over `resolveAudienceIds`, sorted by name | store |
| 3 | `PipelinesDialogComponent` (pi-dialog kit, wide): pick saved filters (search + checkboxes) → one pipeline per filter, header = name + count, body = names only; toggle **All / In every pipeline / Not in every pipeline**; name search | component.ts |
| 4 | Toolbar "Pipelines" button opens it | .html + component |
| 5 | Hooks prefix `pi-pipe-*`; unit tests for #1 | spec |

Not stored in Firestore, no column/attribute config (names only).
