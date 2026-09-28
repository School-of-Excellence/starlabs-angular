# 2026-09-23 — email archive / email logs: why the fan-in has to become a fan-out

Companion to [`specs/plans/2026-09-22-email-archive-logs-architecture.md`](../plans/2026-09-22-email-archive-logs-architecture.md).
Planning session only — **no code changed in either repo.** Decisions D1–D6 signed off by the operator.

Operator's report: *"when we send email to large amount of members the success, map fields, failures is
getting overloaded and the doc size is being increased and the logs are not being stored."*

That is three symptoms of **one** cause, and the third one is a *consequence* of the second. Establishing
that chain was the session's main finding, because it changes what has to be fixed first.

## The causal chain (this is the load-bearing insight)

1. `email archive/{docid}` accumulates **nine** per-recipient structures — three written by the client
   (`profileid[]`, `emailid[]`, `emailmap{}`), three by the sender (`postmark_msgid[]`, `response{}`,
   `sent[]`), and six more appended by the webhook, one `arrayUnion` per Postmark event
   (`delivery`/`open`/`click`/`bounce`/`spamcomplaint`/`subscriptionchange`). ≈330 B per recipient plus a
   5–80 KB body. The 1 MiB ceiling arrives at **~3,000 recipients**.
2. `postmarkResponseCapture` locates the archive with
   `where('postmark_msgid','array-contains', MessageID)` (`communication.js:1824`). The **only** key
   linking a Postmark event back to a broadcast lives inside the array that is overflowing the doc.
3. So when the doc stops accepting writes, the msgid append fails → the MessageID is never recorded →
   **every later webhook for that recipient finds no archive and writes no log row.**

Hence: *logs not being stored* is not a logging bug. It is doc bloat, one step downstream. Any fix that
only trims fields buys headroom and nothing else — the lookup key has to leave the document. That is why
`emailMessageIndex/{MessageID}` (doc id **is** the MessageID) is step one of the plan and not a
nice-to-have: it removes the largest array *and* converts the webhook's lookup from a collection query to
a single `get()` by id.

## Why the doc would have failed even under 1 MiB

Three independent limits were already being violated, and each explains operator-visible behaviour that
"the doc got too big" does not:

- **~1 write/sec per document.** Every webhook event `update()`s the *same* archive doc. 3k recipients ×
  ~4 events ≈ 12k writes onto one document within minutes. Contention aborts mean the status arrays were
  already lossy well below the size limit — so the counts on screen were wrong before anything broke
  visibly. This is why the new design puts **zero** per-event writes on the manifest.
- **The webhook reads the entire `profile_data` collection on every event** (`:1812`), only to map one
  address to one profileid. ~12k full-collection scans per broadcast, each adding seconds of latency;
  Postmark gives up at 10 s and retries. The `emailMessageIndex` row already carries `profileid`, so this
  read disappears rather than being optimised.
- **The sender full-scans `participant metadata`, then `new_user_data`,** whenever recipients ≥ 30
  (`:1948`, `:1965`) — the `in`-query branch only covers `< 30`. All N recipients in one 512 MiB / 540 s
  invocation. This is the most likely cause of a large send dying *silently and completely*: OOM or
  timeout takes out the send and its log batch together. **The fix already exists 1,000 lines away in the
  same file** — `sendWatiBroadCast` chunks `profile_data` by 30 at `:2925`. The email path simply never
  got that treatment.

## Surprises

- **`sent[]` and `response{}` are overwritten, not accumulated.** Both are assigned (not `arrayUnion`ed)
  once per 400-recipient Postmark batch (`:2133`, `:2134`). For any send above 400 recipients, only the
  **last** batch survives. Every "success" number derived from `sent[]` has been wrong for large sends —
  and wrong in a direction that looks like a delivery failure rather than a bookkeeping bug.
- **The email queue has never worked.** `sendBatchEmailTest` is `onDocumentCreated` and skips
  `status=='queued'` (`:1759`, `:1770`). Promoting a queued archive to `'send'` is a **merge-update**,
  which fires no create trigger — and `emailArchiveTriggerOnWrite`, the function that used to handle
  `queued → validated`, is commented out (`:1387`, `index.js:97`). Nothing in the deployed function set
  reacts to that update. The chunk design fixes this incidentally, because `onDocumentWritten` + a `retry`
  flag makes "queue it" and "send it" the same mechanism — which is a better reason to adopt the
  `bulkProductJobs` lifecycle than the size problem alone.
- **The error path re-writes the whole document.** `update({...archiveData, mailstatus, error})`
  (`:2196`) spreads the entire archive — body, every array — back into the doc. On a large archive *this
  write is itself too big*, so the failure that was being recorded is what prevents it being recorded. It
  also resurrects stale field values read at the top of the invocation.
- **The read screen amplifies the write problem.** `email-record` holds a **live** `collectionData` over
  `email archive` with no `limit()`, and inside `next` it eagerly fetches **every log of every archive**
  in `in`-30 batches (`:441`, `:489`). Because the sender and webhook write the archive repeatedly during
  a send, each of those writes re-runs the full log refetch. The screen gets slowest exactly while a large
  broadcast is in flight — which is when an operator would open it to see what is happening.
- **Two collections, one name apart.** `'email logs'` everywhere except
  `communication.component.ts:1741`, which reads `'email log'` singular. That screen's status drill-down
  has been querying an empty collection.
- **Timestamps were never displayed.** Logs are written with `time`; `email-record` reads `log.timestamp`
  (`:38`, `:1220`). Every `statusTimestamps` entry is `undefined`.

## Why counters are split rather than incremented

The obvious move — `FieldValue.increment()` on the manifest — reintroduces the ~1 write/sec contention
it is meant to solve, just with smaller payloads. Sharded counters would work but add a subcollection
whose only purpose is arithmetic. Instead the plan splits by **what is knowable when**:

- `sent` / `notsent` / `failed` / `heldcount` are known exactly at send time → written once per chunk, in
  the chunk's single final write. At most `chunkcount` (~25) manifest writes for a 10k send.
- `delivery` / `open` / `click` / `bounce` / `subscriptionchange` are engagement, and **engagement does
  not need to be live.** A 5-minute scheduled `count()` rollup writes the manifest once per archive.

The list view then reads stored integers with zero extra queries. The operator accepted up to 5 minutes of
staleness on engagement numbers in exchange for that — the alternative (on-demand `count()`) costs ~4
aggregation queries per visible row on every page load.

## Why the client blast radius stays small

**27 files** write `email archive`, 26 of them with the same line:
`setDoc(doc(collection(fs,'email archive'), result.docid), result, {merge:true})`. Splitting a payload into
a manifest plus N chunk docs at each of those 26 call sites would be 26 chances to get the split wrong.

So `email-input`'s contract does **not** change — it still closes with one flat payload — and a new
`email-broadcast.service.ts` owns the split, exactly as `bulk-product-job.service.ts` does for
`bulkProductJobs`. Each caller becomes a one-line edit. Watch out for `workshop-dashboard.component.ts:742`,
which writes through `firestoreDefault`, a different app instance.

## Deliberately out of scope

`wati archive` has the identical disease — `numbers[]`, `numbermap{}`, `sent[]`, `failed[]`, `pending[]`
fanned into one doc, and `watiResponseCapture` (`:3556`) reads all of `profile_data` per event. It is
**worse** in one respect: it finds the archive with
`where('numbers','array-contains',…).orderBy('date','desc').limit(1)`, so an event is attributed to the
**most recent** broadcast containing that number — wrong archive whenever a number appears in two
broadcasts. Kept as a separate plan (same `*MessageIndex` pattern) to keep this change reviewable.

One exception taken now: `.data()['sent'].includes(…)` at `:3627` and `:3645` is unguarded and **throws
when the field is undefined**, which is the normal state of a fresh archive. One-line guard.

## Pending

- Implementation, in the landing order at plan §5. Step 1 (webhook by-id lookup **with a v1
  `array-contains` fallback**) is independently deployable and stops the contention and the `profile_data`
  scans for sends that already exist — do it first, before any client change.
- Two non-blocking build-time calls remain open in plan §8: `chunks` as a subcollection vs a top-level
  collection (default: subcollection), and where the base64 attachment build happens (a 10 MB attachment ×
  25 parallel chunks is the new memory ceiling).
- Production `firestore.rules` for the new collections live in the Firebase console — this repo's
  `firestore.rules` is emulator-only (and says so).
- e2e coverage before push, per project rule: `email-record` is a changed screen and the chunk
  History/Retry surface is new.
