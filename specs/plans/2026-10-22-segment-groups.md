# 2026-10-22 · Segment Board: segment groups + history field names (plan, approved 2026-10-22)

Screen: `/segmentboard`. Journal (WHY): `specs/journals/2026-09-25-segment-board-component.md`.

Groups are for reference only: they label what a segment is for. They never change lists, order or sequence.

## Data
| Where | Fields |
|---|---|
| `segmentboardgroups/{autoId}` | `name` (unique among non-deleted groups), `order`, `deleted`, `createdAt/By`, `updatedAt/By`, `deletedAt/By`. The By fields hold profile ids. Soft delete only: a group doc is never deleted. |
| `segmentboardconfig/{id}.groupid` | the group's id, or absent |
| `segmentboardgroups/{id}/grouphistory/{autoId}` | `action` (`create` · `rename` · `segment-added` · `segment-removed` · `delete`), `segmentid` / `segmentname` (for segment events), `changes`, `summary`, `updatedby` (profile id), `updatedat` (serverTimestamp) |
| Segment history (renamed fields) | `segmentboardconfig/{id}/segmenthistory`: `at` → **`updatedat`**, `by: {profileid}` → **`updatedby: "<profileid>"`** |

## Writes (each in one batch)
| Event | Writes |
|---|---|
| Create group | group doc + `create` entry |
| Rename | group doc (`name`, `updatedAt/By`) + `rename` entry. Segments are untouched. |
| Segment created or edited with a group change | segment doc (`groupid`) + segment history `groupid from → to` + `segment-removed` in the old group + `segment-added` in the new group |
| Delete group | group `deleted: true` + `deletedAt/By` + `delete` entry listing the removed segments, plus, for every segment holding it (live and archived): `groupid` removed + a segment history entry |
| Archive / unarchive segment | `groupid` kept; no group entry |

## Screen
- **Card and side panel:** a group label.
- **Segment dialog:** Group dropdown (non-deleted groups + "New group…").
- **Manage groups** (header): create, rename, delete with confirm ("Remove from N segments?"), and a per-group History.
- **Filter bar:** Group filter (groups + "No group"). It narrows the cards, not the participants.

## Backfill of older segment history (`at`/`by` → `updatedat`/`updatedby`)
- Part of the existing one-time **Migrate** action. The banner also appears while any entry still has `at`, found with a collection-group `orderBy('at')` limit 1.
- For each old entry:
  - `updatedat = at`;
  - `updatedby` = profile id, resolved from `by.profileid`, then `by.email` → `profile_data`, then `by.uid` → `profile_data.user_ref`;
  - `at` and `by` removed;
  - an unresolved `by` is kept as is, and is flagged in the preview.
- **Reads during the transition:**
  - Per-segment history reads every entry and sorts on `updatedat ?? at`, so nothing is hidden before the backfill.
  - The board-wide view orders by `updatedat`, so old entries appear there once backfilled. This needs a new collection-group index on `segmenthistory.updatedat` (desc).

## Rules (operator, console)
- `segmentboardgroups`: read, create, update; no delete.
- `grouphistory`: read, create.
- `segmenthistory`: **update** during the backfill, so it can be tightened again afterwards.

## e2e
- SGB-07 covers: group create → assign → move → rename (segment unchanged) → delete (`groupid` removed, group doc kept as `deleted: true`, group and segment history written).
- SGB-06 switches to `updatedat` / `updatedby`.
- New hooks are registered.
