# 2026-11-23 — Pull from dharshan-working: map a live event to a queue

**Operator ask:** "get the code from dharshan-working" → "pull 1". dharshan-working tip `10cf331e` already contains
charan-release `7be9e74f`, so the only new work is `a07e5ce9` (Dharshan, 2026-11-20, "mapping live event to queue") —
one component, `queue system/queue-creation-v3` (ts + html, +32/−4), taken whole.

## What it adds
- "Map Live Event to Queue" select (`qcv3-sel-20b`, formControlName `liveeventid`): None or one event from `eventList`
  (the same list the "Select Event" multi-select uses).
- Saved as `liveeventid` on the `queue generation` doc (null when None).
- In the same save batch: when the choice changed, `mappedqueue: arrayRemove(queueRef)` on the previous
  `event collection` doc and `arrayUnion(queueRef)` on the new one.

Our last change to the file (`07d55dca`, delete:false forms + dropdown search) is in his history; every line it added
is still present.

## Worth knowing (not changed)
- `batch.update` fails the whole save if the previous / new event doc no longer exists (deleted event).
- The previous event comes from the doc the screen was opened with (`this.data.liveeventid`), so two editors saving
  the same queue can leave a stale `mappedqueue` entry on an event.

## e2e
New hook `qcv3-sel-20b` is not referenced by any hub spec yet (queue suite; `qcv3-sel-20` lives in
`queue/queue-dialog-addressable-planning.spec.ts`). Add it before push.

## Revert guide
Before commit: `git checkout 07d55dca -- "src/app/queue system/queue-creation-v3/"`. After commit: `git revert <that commit>`.
Self-contained — no other screen reads `liveeventid` / `mappedqueue` on this branch.
