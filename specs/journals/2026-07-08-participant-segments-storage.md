# 2026-07-08 — How participant segments are stored (Participant Analytics)

**Scope:** documentation-only investigation. No code changed. Captures the data model
behind "putting people in segments" in Participant Analytics, so future sessions don't
have to re-derive it.

Primary source:
`src/app/Participants Profile Management/participants-analytics/create-segments-dialog/create-segments-dialog.component.ts`
(the segment CRUD lives entirely in this dialog; the parent
`participants-analytics.component.ts` only opens it at ~line 2725).

---

## TL;DR

A "segment" is **not** a bag of individual participants. It is a named grouping that
**references participant *lists* and *tags* by id**. The actual people live in the
`participant list` documents. So "putting people in a segment" = attaching one or more
*participant lists* (and optionally *tags*) to a segment.

Storage is a top-level Firestore collection **`segments`**, with **bidirectional
back-references**: each referenced `participant list` / `participant tags` doc also gets
a `segmentid` array pointing back.

---

## The `segments` document

Created in `createSegment()` (~line 524-532) via a `writeBatch`:

```ts
// doc id auto-generated, then stored redundantly in a `docid` field
const segmentsRef = doc(collection(this.firestore, 'segments'));
batch.set(segmentsRef, {
  docid: segmentsRef.id,           // duplicates the Firestore doc id
  segmentname: formValue.segmentname.trim(),
  participantlistid: formValue.participantlistid,  // string[] of `participant list` doc ids
  tagids: formValue.tagids || [],                  // string[] of `participant tags` doc ids
  createddate: new Date(),
  // updateddate: added on later edits (arrayUnion/arrayRemove paths)
});
```

Field summary:

| field              | type            | meaning |
|--------------------|-----------------|---------|
| `docid`            | string          | copy of the Firestore doc id (redundant) |
| `segmentname`      | string          | unique, min 3 chars (client-side enforced) |
| `participantlistid`| string[]        | ids into the `participant list` collection — this is the membership |
| `tagids`           | string[]        | ids into the `participant tags` collection |
| `createddate`      | Date            | set on create |
| `updateddate`      | Date            | set on add/remove-list edits only |

## Back-references (the other half of the model)

In the same batch, every referenced list and tag gets the segment id appended to a
`segmentid` array:

```ts
batch.update(doc(this.firestore, 'participant list', participantlistid),
             { segmentid: arrayUnion(segmentsRef.id) });
batch.update(doc(this.firestore, 'participant tags', tagid),
             { segmentid: arrayUnion(segmentsRef.id) });
```

So the relationship is stored **twice** (segment → lists/tags, and list/tag → segments).
Add/remove/delete all keep both sides in sync with `arrayUnion` / `arrayRemove`.

## Reads

`loadSegments()` (~line 454) does a full-collection read:
`getDocs(query(collection(firestore,'segments')))`, mapped to `{ id: doc.id, ...data }`.
No pagination, no `where` — the whole `segments` collection is pulled client-side, and
duplicate-name / duplicate-participant checks run in memory against that array.

## Constraints enforced (client-side only)

- **Unique segment name** — case-insensitive check against loaded `segments` (line 494).
- **A participant list belongs to at most one segment** — `checkDuplicateParticipants()`
  (line 583) blocks adding a list that already appears in another segment's
  `participantlistid`.
- Both are **client-side**; there are no Firestore rules backing them here, so concurrent
  writers could still violate uniqueness.

## Audit trail — `participant_list_log`

Every create / edit / delete also writes an activity-log doc into
`participant_list_log` with:

```ts
{ doc_id, action_type: 'create'|'edit'|'delete', created_date, type: 'segment',
  edited_by: loggedInUser,
  referals: doc(firestore,'segments', <id>),   // a DocumentReference, not a string
  metadata: { previous?, current?, description } }
```

`loadSegmentLogs()` (~line 167) reads `participant_list_log` and filters
`type === 'segment'` to show segment history.

---

## Gotchas / things that surprised me (candidates for follow-up, NOT fixed today)

1. **Activity log is outside the batch.** `createSegment()` commits the `writeBatch`,
   then does a separate `setDoc` for the log (line 562). If the log write fails after the
   commit, the segment exists with no create-log entry. Not atomic.

2. **`add/removeListFromSegment` write the same log doc twice.** Both functions call
   `setDoc(participant_list_log/<activityDocId>, …)` with the *same* `activityDocId` and
   *identical* metadata twice in a row (lines ~739 & ~759 for remove; ~824 & ~844 for
   add). The second overwrites the first — redundant write, likely a copy-paste slip.

3. **Delete is not batched.** `deleteSegment()` (line 1013) loops `updateDoc` over each
   list and tag sequentially, then `deleteDoc`s the segment. A mid-loop failure leaves
   dangling `segmentid` back-refs on lists/tags pointing at a deleted segment.

4. **`docid` duplicates the Firestore id.** Code reads `segment.docid` everywhere rather
   than the mapped `id`; both hold the same value.

5. **Indirection naming.** The UI says "segments of participants," but the stored
   membership is participant *lists* + *tags*, never individual participant ids. To find
   the people in a segment you must resolve `participantlistid[]` → `participant list`
   docs → their `participants`.

---

## Related

- `manage-participantlist-dialog/` owns the `participant list` collection (the docs that
  actually hold people; columns `listname`, `participants`).
- See memory `project_participant-intelligence-status` — this analytics area is a partial
  prototype; the segment CRUD above is real/wired, distinct from the mock stubs.
