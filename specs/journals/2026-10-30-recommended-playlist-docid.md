# 2026-10-30 — Recommended Playlist: group toggle crash on missing docid

## CHANGE LOG & REVERT GUIDE

| Status | Scope | File | Revert |
|---|---|---|---|
| uncommitted | `/recommendedplaylist` group rows | `src/app/AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component.ts` (`loadData`) | `git checkout -- "src/app/AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component.ts"` |

## What happened

Turning a group's slide toggle threw `TypeError: Cannot read properties of undefined (reading 'indexOf')`
from `onToggleGroupDelete`. `doc(firestore, 'buffermix archive', row.docid)` receives `undefined` and the
Firebase path parser fails on it.

## Why this fix

`loadData` built group rows as `{ ...d.data() }`, so `row.docid` existed only when the document happened to
store its own id. The one live writer (`map-recommendedplaylist-toparticipant`) does store it, so documents
without the field come from somewhere else (older data or another client; not identified).

The fix takes the id from the snapshot: `{ ...d.data(), docid: d.id }`. That is the real document key, and it
matches how the `recommended mix playlist` rows are built a few lines lower in the same method.

The same `row.docid` feeds other paths, which all benefit:
- the group edit dialog (`editrecommendedplaylist`), which builds the same document reference
- the personalised rows, which are filtered from `groupPlaylist`
- the share link and the `bufferdocref?.id === docid` lookups that count members per group

## Verified / not verified

- Verified: `tsc --noEmit -p tsconfig.app.json` is clean. A direct SDK call reproduces the failure with an
  undefined id and returns a valid path with a real one.
- Not verified: the toggle in the running app (login-gated, and a real toggle writes to the database).
- Not verified: how many production documents lack `docid`. The read-only query returned nothing usable.

## Pending

- Find what writes `buffermix archive` documents without `docid`, if it is still happening. This fix no longer
  depends on the answer.
