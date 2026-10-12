# 2026-10-12 · Segment Board: change history, one order, no hard delete (plan, approved 2026-10-12)

Screen: `/segmentboard`. Journal (WHY): `specs/journals/2026-09-25-segment-board-component.md`.

## 1. History subcollection

The path is `segmentboardconfig/{segmentId}/segmenthistory/{autoId}`, with one doc per change to that segment. Each entry is written **in the same batch** as the config change.

History is stored **only** as a subcollection of each segment's `segmentboardconfig` doc (operator, 2026-10-12). There is no new top-level collection. The board-wide view reads these same subcollections through a collection-group query, so nothing is copied elsewhere.

| Field | Value |
|---|---|
| `action` | `create` · `edit` · `archive` · `unarchive` · `reorder` |
| `at` | **When:** a Firestore `serverTimestamp()`, set by the server, so the editor's device clock can't skew it |
| `by` | **Who:** `{ email, uid, name }` from the signed-in user. `name` is the auth display name, falling back to the email. It's stored as written, so it still reads correctly if the person later leaves or is renamed. |
| `segmentid` / `segmentname` | id · name at the time of the change |
| `changedfields` | e.g. `["status","rule"]`, for `array-contains` queries |
| `changes` | `{ field: { from, to } }` for changed fields only. The values are the config's own ids and shapes. `rule`/`eligibility` hold the whole before and after arrays. |
| `summary` | A readable line with journey and product names resolved at save, e.g. "Status: Active → Inactive · Conditions: added 'Age at least 22'" |

- **Tracked fields:** `name`, `description`, `status`, `journeys`, `rule` (automated) / `eligibility` (manual), and `order`.
- **Create:** every starting value is recorded as `to`, with `from: null`.
- **Archive and unarchive:** `archived` from → to, plus the order change on unarchive.

## 2. One order (operator: "make them one")

Card order on the board **is** the sequence. `displayIndex` stays the stored order of all cards. An automated segment's `sequence` is its rank among the automated cards in that order (1…n). Manual cards sit in the same order but have no sequence.

| Where | Change |
|---|---|
| Arrange cards → Save | Writes `displayIndex` for every card and `sequence` for every automated card. Each card whose position moved gets a `reorder` entry. |
| Create dialog | The sequence list is the automated cards in board order. The new automated card is placed on the board right after the automated card it follows. Every shifted segment gets a `reorder` entry. |
| Existing data | Load ignores stored `sequence` and derives it from board order. The stored values are aligned, with history, the next time someone saves an arrangement or creates a segment. Nothing is written without a user action. |

## 3. No hard delete

- Remove **Delete** from the Archived view.
- Archive and unarchive are the only lifecycle actions.
- `deleteSegment` is removed from the store.

## 4. Showing the history

| Where | What |
|---|---|
| Side panel → new **History** tab (per segment) | Newest first: who, when, the summary line, and an expandable "from → to" per field |
| Board → **Change history** | All segments, newest first: a collection-group query on `segmenthistory`, ordered by `at` desc, 200 at a time. It replaces today's in-memory list. |

## Console steps (operator)

- **Firestore rule:** `match /segmentboardconfig/{id}/segmenthistory/{h} { allow read, create: if <same as segmentboardconfig>; allow update, delete: if false; }`. History is append-only.
- **Collection-group read:** board-wide history also needs `match /{path=**}/segmenthistory/{h} { allow read: if … }`.
- **Index:** a collection-group single-field index on `segmenthistory.at` (descending), created once. The first query's error links to it.

## Done when

- Build passes and hook-diff is aligned, with new hooks registered in the spec.
- Harness: create, edit (each field), archive, unarchive and arrange each write the expected entry, and both views list them.
- Journal entry with a revert guide.
