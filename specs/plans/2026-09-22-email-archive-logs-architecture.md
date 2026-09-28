# Email archive + email logs → fan-out architecture

> **Status: PLAN — decisions D1–D6 SIGNED OFF by operator 2026-09-23. Not yet implemented.** Two repos.
> **starlabs-angular** (this) — writers (27 files), `email-record`, `communication`, `communication-grid-planner`, `channel-record`, indexes.
> **starlabs-cloud-function** (`/Users/macbook/Projects/Functions/starlabs-cloud-function`, branch `development`) — `functions/components/communication.js`.
>
> Precedent to mirror: `specs/plans/2026-09-22-bulk-add-products-queue.md` (`bulkProductJobs` chunk docs + claim/retry lifecycle).

**Problem as stated:** on large sends the archive doc's success / map / failure fields overload, the doc grows past its limit, and logs stop being stored.

---

## 1. Root cause — the archive doc holds NINE per-recipient structures

`email archive/{docid}` today (client + CF both write it):

| Field | Written by | Per-recipient cost | Note |
|---|---|---|---|
| `profileid[]` | client (`email-input:106`) | ~22 B | |
| `emailid[]` | client (`:119`) | ~28 B | index-paired with `profileid` |
| `emailmap{}` | client (`:120`) | ~50 B | the "map fields" |
| `postmark_msgid[]` | CF `arrayUnion` (`communication.js:2130`) | ~40 B | **the webhook's only lookup key** |
| `response{}` | CF (`:2133`) | ~68 B | 🐞 **overwritten every 400-batch** — only the last batch survives |
| `sent[]` | CF (`:2134`) | ~28 B | 🐞 **same overwrite bug** |
| `communicationhold[]` | CF (`:2096`) | ≤28 B | |
| `delivery[] open[] click[] bounce[] spamcomplaint[] subscriptionchange[]` | **webhook `arrayUnion`, one write per event** (`:1859`) | up to 6 × 28 B | `[RecordType]: arrayUnion(Recipient)` |
| `body`, `datamodel`, `postmarkAttachments` | client | fixed 5–80 KB | |

≈ **N × 330 B + body**. The 1 MiB ceiling lands at **~3,000 recipients** — sooner with a large body or sheet datamodel.

### Why logs stop being stored (the causal chain)
`postmarkResponseCapture` finds the archive by `where('postmark_msgid','array-contains', MessageID)` (`:1824`).
Once the archive can no longer grow, the `update()` that appends msgids fails → the MessageID is never stored → **every subsequent webhook for that recipient returns "Doc Not Found" and writes no log row at all**. Log loss is a *consequence* of doc bloat, not a separate fault.

### Four more faults that bite before the size limit does

| # | Fault | Where | Effect |
|---|---|---|---|
| F1 | Every webhook event does `update()` on the **same** archive doc | `communication.js:1859` | Firestore sustains ~1 write/s/doc. 3k recipients × ~4 events = ~12k writes on one doc → contention aborts → counters wrong even under 1 MiB |
| F2 | Webhook reads the **entire `profile_data` collection per event** | `:1812` | ~12k full-collection scans per broadcast; >10 s latency → Postmark retries |
| F3 | When `profileIds.length >= 30` the sender **full-scans `participant metadata`, then `new_user_data`** | `:1948`, `:1965` | whole collections into memory at 512 MiB, all N in one 540 s invocation → OOM/timeout kills the send *and* its logs. The WATI sender in the same file already chunks by 30 (`:2925`) — the fix is demonstrated 1000 lines away |
| F4 | Error path does `update({...archiveData, mailstatus, error})` | `:2196` | re-writes body + every array; on a large doc **this write itself fails**, and it resurrects stale field values |

### Two collateral bugs found while reading

- **The queue is dead.** `sendBatchEmailTest` is `onDocumentCreated` and skips `status=='queued'` (`:1759`,`:1770`). Promoting a queued doc to `'send'` is a **merge-update**, which fires no trigger — and `emailArchiveTriggerOnWrite`, which used to handle `queued → validated`, is commented out (`:1387`, `index.js:97`). **Queued emails never send.** The new `retry`-flag + `onDocumentWritten` lifecycle fixes this for free.
- **Collection split-brain:** `'email logs'` (sender, webhook, `email-record`, `communication-grid-planner`) vs **`'email log'`** singular in `communication.component.ts:1741` (`fetchLogProfiles`) → that screen's status drill-down reads an empty collection.
- **Field mismatch:** logs are written with `time`; `email-record` reads `log.timestamp` (`EmailLog.timestamp`, `email-record.component.ts:38`, `:1220`) → every `statusTimestamps` entry is `undefined`.
- **Webhook profileid always null for open/click:** `:1845` looks up `mapProfileEmail[responseData['Recipient']]` *after* normalising the address into `responseData['email']` — events carrying only `Email` get `profileid: null`.

### Read side is the other half of "overloaded"
`email-record.subscribeToEmailArchives()` (`:441`) holds a **live** `collectionData` over `email archive` (7-day default, **no limit**), and inside `next` it `await`s `fetchEmailLogsForArchives()` — which `getDocs` **every log of every archive** in `in`-30 batches (`:489`). Then `processData` attaches the full `logs` array to each row and keeps it in memory for the participants modal (`:1152`).
Because the subscription is live and the sender + webhook write the archive repeatedly, **every write re-runs the full log refetch**. One 10k send ⇒ tens of thousands of doc reads per tick in the browser.

---

## 2. Target architecture — manifest + chunks + events + a by-id index

Same shape as `bulkProductJobs`. Nothing per-recipient stays on the archive doc.

```
email archive/{archiveid}                 ← MANIFEST. fixed size. counters only.
  └─ chunks/{n}                           ← WORK QUEUE. ≤400 recipients. claim/retry/reset.
  └─ recipients/{emailkey}                ← ROLLUP (decision D1). one doc per recipient, boolean flags.
email logs/{logid}                        ← EVENT STREAM. one doc per (recipient, event). exists today.
emailMessageIndex/{MessageID}             ← NEW. doc id = Postmark MessageID. the webhook's O(1) lookup.
```

### 2a. `email archive/{archiveid}` — manifest
Keep: `docid`, `date`, `createdby`, `subject`, `body`, `from`, `cc`, `bcc`, `templateid`, `templatedocid`, `postmarktemplateid`, `servername`, `broadcastname`, `notes`, `status`, `datamodel`, `attachments`, `postmarkAttachments`, `communicationplannerid`, `participantjourneyproductid`.
**Add:** `schemaversion: 2`, `recipientcount`, `chunkcount`, `heldcount`, `counters: {sent, notsent, delivery, open, click, bounce, subscriptionchange, failed}`, `countersupdatedat`.
**Remove (v2 docs only):** `profileid[]`, `emailid[]`, `emailmap{}`, `postmark_msgid[]`, `response{}`, `sent[]`, `delivery[]`, `open[]`, `click[]`, `bounce[]`, `spamcomplaint[]`, `subscriptionchange[]`, `communicationhold[]`.
→ constant size; the only per-event writes disappear entirely.

### 2b. `email archive/{archiveid}/chunks/{n}` — work queue
`recipients: [{profileid, email}]` (≤400, the Postmark batch cap the sender already uses at `:2081`), `seq`, `retry` (init `true`), `processing` (init `false`), `claimedAt`, `success: [email]`, `failures: [{email, reason}]`, `heldprofileids: []`, `finishedat`.
400 × ~50 B = **20 KB**. Lifecycle identical to `bulkProductJobs`:

```
create {retry:true, processing:false}
  → onDocumentWritten → CLAIM txn: retry==true && (processing==false || now-claimedAt>10min)
  → work set: recipients not yet in success/failures
  → per 400: postmark batch → write email logs (batched) + emailMessageIndex (batched)
  → ONE final write: success/failures, processing:false, retry:false, finishedat
manual retry → set retry:true → reprocesses failures only
```
State: `retry:true & !processing` = queued · `processing` = running · `!retry & failures:[]` = done · `!retry & failures:[…]` = needs attention · `processing & claimedAt` stale = stuck (Reset).
**This is also the queued-email fix:** "queue it" = write chunks with `retry:false`; "send it" = flip `retry:true`. `onDocumentWritten` fires on the update, unlike today's `onDocumentCreated`.

### 2c. `emailMessageIndex/{MessageID}` — the single highest-leverage change
Doc id **is** the Postmark MessageID. Value `{emailarchiveid, profileid, email, templateid, chunkid, createdat}`. Written once per recipient by the chunk function, `batch()` of 500.
The webhook becomes `doc('emailMessageIndex', MessageID).get()` — **one read by id**. This kills at once:
- the `postmark_msgid[]` array (the doc-size driver), and
- the full `profile_data` scan (F2) — `profileid` is already in the index row.

### 2d. `email logs/{logid}` — unchanged collection, fixed writers
Keep the shape `email-record` already reads: `emailarchiveid`, `email`, `profileid`, `msgstatus`, `postmark_msgid`, `templateid`, `time`, `errormsg?`.
**Stop dumping the raw Postmark payload** (today `docref.set(responseData)`, `:1899`, carries `Geo`, `UserAgent`, `OriginalLink`, `Details`… on every Click). Keep a whitelisted `metadata{}`.
Add `time` **TTL** (decision D3) — this collection is the one that grows without bound.

### 2e. `email archive/{archiveid}/recipients/{emailkey}` — rollup (decision D1)
`{email, profileid, name?, sent, delivery, open, click, bounce, subscriptionchange, failed, notsent, lastactivity}`, `set(merge)` by the webhook.
**Why:** the participants modal wants per-recipient union-of-statuses with search + status filter. Deriving that from `email logs` needs every log row in the browser (today's problem). A rollup doc makes the modal a **paginated, server-filtered query**. Cost: one extra webhook write per event — but spread across N docs, so no contention (unlike F1).

### 2f. Counters without contention
`FieldValue.increment()` on the manifest is still one write per event to one doc → F1 again. Instead:
- **`counters.sent / notsent / failed / heldcount`** — known exactly at send time; written **once** by each chunk's final write (`increment` per chunk = at most `chunkcount` writes total).
- **`counters.delivery / open / click / bounce / subscriptionchange`** — engagement, does not need to be live. **Scheduled rollup** every 5 min over archives newer than 7 days: `count()` aggregation per status on `email logs`, one manifest write. (decision D2)

Result: the list view reads stored integers with **zero** extra queries.

---

## 3. Cloud Function edits — `communication.js` (branch `development`)

| # | Change | Watch out |
|---|---|---|
| CF1 | **`postmarkResponseCapture`** — replace `array-contains` lookup with `doc('emailMessageIndex', MessageID).get()`. **Keep the old `array-contains` path as a fallback** while v1 archives are still in flight. | land this FIRST, with fallback — the index does not exist until CF3 ships |
| CF2 | Same fn — **delete the `profile_data` full scan** (`:1812`); take `profileid` from the index row. Fix the `Recipient` vs `Email` lookup bug. Write the log with a **whitelisted** payload, not raw `responseData`. Stop the `[msgstatus]: arrayUnion(...)` archive write (`:1859`); `set(merge)` the `recipients/{emailkey}` rollup instead (D1). | webhook must stay ≤10 s and always return 200 |
| CF3 | **New `sendEmailChunk` = `onDocumentWritten('email archive/{archiveid}/chunks/{chunkid}')`**, `retry:false` platform retry. Claim txn → resolve metadata **chunked by 30** (kill F3, copy `:2925`) → build models → `sendEmailBatchWithTemplates` → batch-write `email logs` + `emailMessageIndex` → ONE final chunk write. | `onDocumentWritten`, not `Created` — the manual retry and the queued→send flip are both updates |
| CF4 | Move `sendBatchEmailArchive`'s per-recipient model building (`buildPerVariableModel`, sheet, attachments) into CF3 **per chunk**. Sheet + attachments are archive-level → fetch once per chunk (or cache in Storage). | attachments are base64'd in memory — a 10 MB attachment × parallel chunks is the new memory ceiling; cap `maxInstances` |
| CF5 | **Retire `sendBatchEmailTest`** (`onDocumentCreated` on the archive) and the `sendBatchEmail` onRequest — or keep them as **v1-only** shims guarded by `schemaversion != 2`. | 27 Angular files still write v1 until the client lands; do not break them mid-flight |
| CF6 | Fix F4: the error path writes **only** `{status:'failed', error}`, never `{...archiveData}`. | |
| CF7 | Delivery-hold check stays **fail-closed**, but move it to a **single read per archive** (in CF3's first chunk or a small pre-pass) instead of per-invocation. | keep the existing `profile_data where deliveryonhold==true` query |
| CF8 | **New `rollupEmailCounters` = `onSchedule('every 5 minutes')`** — `count()` per status on `email logs` for archives with `date > now-7d`, one manifest write each. (D2) | needs the composite indexes below |
| CF9 | `emailMessageIndex` TTL — same retention as `email logs`; the index is useless once no more webhooks can arrive (Postmark stops at ~45 days). | |

**Also in this file, same disease, out of scope unless you say otherwise:** `watiResponseCapture` (`:3556`) reads all of `profile_data` per event, finds the archive by `where('numbers','array-contains',…).orderBy('date','desc').limit(1)` — which **misattributes the event to the most recent broadcast** containing that number — and then calls `.data()['sent'].includes(…)` unguarded, which **throws when `sent` is undefined**. `wati archive` carries the same `numbers[]`/`numbermap{}`/`sent[]`/`failed[]`/`pending[]` fan-in. Same fix applies (`watiMessageIndex` by `id`). → decision D5.

---

## 4. Angular edits — `starlabs-angular`

| # | File / area | Change | Watch out |
|---|---|---|---|
| A1 | **new `src/app/Communication Center/email-broadcast.service.ts`** | `createBroadcast(payload, {queued})` → writes the manifest + N chunk docs in one `writeBatch` per 400; `retryChunk`, `resetChunk`, `listChunks`, `watchArchive`. Mirrors `bulk-product-job.service.ts`. | this is what keeps the blast radius to one line per caller |
| A2 | **`email-input.component.ts`** | `closeWithPayload` keeps returning ONE payload (unchanged caller contract) — the service does the split. Keep `applyDeliveryHoldFilter` (`:943`) as-is. | `onSendTest` must stay unfiltered and must NOT create chunks — send test inline |
| A3 | **26 caller files** — `participants-analytics:1424`, `big/{cohort-management:3597, cohort-detail:1720, big-dashboard:1339, big-cohort-clone:855, big-cohort-clone-2:1067}`, `queue system/{dynamic-queue-manager:1942, -clone:4661, queue-planning:848, -clone:2838, -review:3997, initiate-event-product:1063}`, `New-Workshop/{newusersprofile:939, workshop-dashboard:742}`, `AppEngagement/{channel-record:464, interim-report-log:901}`, `Communication Center/{communication:1548, send-individual-email:153, validate-template:57}`, `Journey Onboarding/onboarding-remark:825`, `map-recommendedplaylist-toparticipant:400`, `Events/{product-funnel, live-event-dashboard-v2, -v3}` | Replace `setDoc(doc(collection(fs,'email archive'), result.docid), result, {merge:true})` with `await this.emailBroadcast.createBroadcast(result)`. **One-line edit each.** | `workshop-dashboard` uses `firestoreDefault`, not `firestore` — different app instance |
| A4 | **`email-record.component.ts`** | Stop eager log fetch. List view reads stored `counters` (`schemaversion==2`) and falls back to today's log-derived counts for v1 rows. Add `limit()` + paging to the archive subscription. Participants modal → **paginated query** on `recipients/` (D1) or on `email logs` by `emailarchiveid` with `startAfter`. Fix `log.timestamp` → `log.time`. | keep both shapes working; `isLoadingLogs` becomes per-modal, not global |
| A5 | **`communication.component.ts:1741`** | `'email log'` → `'email logs'`. Straight bug fix. | |
| A6 | **`communication-grid-planner.component.ts:620,805`** | `fetchEmailLogs` is already per-archive and lazy — keep. Switch its `record.sent`/`record.failed` reads (`:939`,`:1027`) to `counters`. | those two lines are shared with the WATI path — branch on channel |
| A7 | **`channel-record.component.ts:464,522,557`** | resend path writes an archive — route through A1. | `email_archiveid` DocumentReference shape at `:522` must survive |
| A8 | **`firestore.indexes.json`** | `email logs`: (`emailarchiveid` ASC, `time` DESC) and (`emailarchiveid` ASC, `msgstatus` ASC, `time` DESC). `recipients` collection-group: (`sent` ASC, `email` ASC) etc. per modal filter. `fieldOverrides`: TTL on `email logs.time`, `emailMessageIndex.createdat`. | none exist today — the CF repo's `firestore.indexes.json` has **zero** email indexes |
| A9 | **`firestore.rules`** (production, console-side) | `email archive` + `chunks`: authed create/read; update limited to `retry`/`status`. `email logs`, `emailMessageIndex`, `recipients`: **read-only to clients** (Admin SDK bypasses). | this repo's `firestore.rules` is emulator-only — the real rules live in the console |

---

## 5. Landing order (each step is independently deployable)

1. **CF1+CF2** — webhook: by-id lookup **with v1 fallback**, no `profile_data` scan, no archive array writes. Immediately stops F1/F2 for *existing* sends.
2. **A8** — indexes + TTL (must precede CF8 and A4).
3. **CF3+CF4+CF6+CF7** — the chunk function, alongside the v1 sender (CF5 shim).
4. **A1+A2+A3** — client writes manifest + chunks. Sends now go down the new path.
5. **A4–A7** — read side.
6. **CF8** — counter rollup.
7. Remove the CF1 fallback + CF5 shim once no v1 archive is younger than the Postmark webhook window.

**Migration:** no backfill. `schemaversion` discriminates; v1 archives keep their arrays and stay readable. (D4)

---

## 6. Limits check (10,000 recipients)

| Limit | Value | New design |
|---|---|---|
| Doc size | 1 MiB | manifest constant; chunk = 400 × 50 B = 20 KB ✅ (today: breaks at ~3k) |
| Sustained writes / doc | ~1 /s | manifest: `chunkcount` (25) + one rollup / 5 min ✅ (today: ~40k on one doc) |
| Postmark batch | 500 msgs | chunk = 400, one API call per chunk ✅ |
| `in` query values | 30 | metadata resolved in chunks of 30 ✅ (today: full collection scan) |
| Batched write | 500 ops | logs + index written 500/commit ✅ |
| Function timeout | 540 s | 25 chunks in parallel, seconds each ✅ (today: all 10k in one invocation) |
| Webhook reads/event | — | **1** doc get ✅ (today: entire `profile_data`) |
| Browser reads / screen | — | ~50 manifests + one paginated modal query ✅ (today: every log of every archive, re-run per archive write) |

---

## 7. e2e coverage (project rule — before push)
`email-record` (changed screen) + the chunk History/Retry surface (new) need hooks + a suite via the `screen-e2e-coverage` skill. One literal `data-testid` prefix per component, declared in the spec header. Seed a world with: a v1 archive (arrays), a v2 archive done, a v2 archive with `failures>0`, a stuck chunk (stale `claimedAt`), and an archive with 0 sendable recipients (all held) as negative controls.
`python3 .claude/skills/screen-e2e-coverage/scripts/hook-diff.py src/app/AppEngagement/email-record <suite>`

---

## 8. Decisions — RESOLVED (operator, 2026-09-23)

| # | Decision | Resolution |
|---|---|---|
| D1 | Per-recipient `recipients/` rollup docs? | ✅ **YES** — build them. One extra webhook write per event, spread across N docs (no contention). The participants modal becomes a paginated, server-filtered query. |
| D2 | Engagement counters — scheduled rollup vs on-demand `count()`? | ✅ **Scheduled 5-min `count()` rollup** (CF8). List view reads stored integers, zero extra queries; engagement numbers may be up to 5 min stale — accepted. |
| D3 | `email logs` / `emailMessageIndex` retention? | ✅ **180 days** for `email logs`, **60 days** for `emailMessageIndex` — via Firestore TTL `fieldOverrides` (A8). |
| D4 | Backfill existing archives to v2? | ✅ **No backfill.** `schemaversion` discriminates; v1 archives keep their arrays and stay readable. Every reader handles both shapes (A4, A6). |
| D5 | Include the WATI fan-in? | ✅ **Separate plan, same pattern** — `watiMessageIndex` by `id`, in its own change. **Exception:** take the unguarded `.includes` crash (`communication.js:3627`, `:3645` — `.data()['sent'].includes(…)` throws when `sent` is undefined) as a one-line guard **now**, inside this change. |
| D6 | Chunk size? | ✅ **400** — matches the Postmark `sendEmailBatchWithTemplates` cap the sender already batches on (`communication.js:2081`). |

**Still open (not blocking — decide at build time):**
- Whether `chunks` is a subcollection of the archive or a top-level `emailSendChunks` collection. Subcollection is cleaner for rules and lifecycle; top-level is easier to query across archives for a global "stuck jobs" view. Default: **subcollection**.
- Where the base64 attachment build happens (per chunk vs once into Storage). A 10 MB attachment × 25 parallel chunks is the new memory ceiling — see CF4.
