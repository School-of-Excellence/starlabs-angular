# ADR-001: Replace Firestore Persistence Cache with an Explicit Local-First ATC Draft Cache

**Status:** Accepted — **implemented 2026-06-26** (see "As-built" addendum at the end for the shipped API).
**Date:** 2026-06-26
**Deciders:** Operator (appexperience@soexcellence.com)
**Scope:** design + implementation. ATC was not run/served/built/tested by Claude; the design was verified by a non-ATC dummy harness (`tools/atc-draft-sim/`).

---

## Context

ATC ("Awareness, Transformation & Coaching") drafts are authored in two flows:
- **Prescribe ATC** (`src/app/ATC/prescribe-atc/prescribe-atc.component.ts`) → draft collection `temporary_ATC`, random doc id, many drafts per participant.
- **Edit ATC** (`src/app/ATC/edit-atc/edit-atc.component.ts`) → draft collection `temporary_edit_ATC`, doc id = the ATC's `atcid`, one draft per ATC.

The ATC is **structured, not a blob**: top-level scalar fields (`directive`, `notes`, `consultationsummary`, `date`, `product`, …), object maps (`author`, `observer`, `mentor`, `bigactivity`), media URL arrays (`audioRecordings`, `noteImageURLs`, `atcImageURLs`), and a nested `transcript` array of adjustments, each holding a `procedure[]`.

**Two problems forced this change:**

1. **The b815 bug.** `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` (configured in `src/main.ts`, on both the default DB and the named `firestore-atc` DB) fires `FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)` when multiple ATC tabs are open. Once it fires, the Firestore client is **bricked for the page session** — `setDoc` hangs. The journal (`specs/journals/2026-06-23-atc-draft-firestore-assertion-recovery.md`) confirms no in-version fix exists (present through 12.3.0; Angular 19→20 migration not feasible).
2. **App-wide regression.** After offline persistence shipped, Firestore reads are slow across the *whole* app and Storage media needs a hot reload to appear (see `HANDOVER.md`, `project_open_issue_firestore_perf`). The global `persistentMultipleTabManager` on the **default** DB — IndexedDB writes on every snapshot + cross-tab locks — is the prime suspect.

The current mitigation, `FirestoreRecoveryService` (`src/app/shared/firestore-recovery.service.ts`), works *around* the bricked client with a durable IndexedDB outbox + a direct REST PATCH fallback + a global `window` assertion watcher. It treats the symptom. **This ADR removes the root cause** (the persistence cache) and replaces the recovery service with a purpose-built local-first cache, `ATCDraftService`, that owns draft durability and cross-device reconciliation explicitly.

**Intended outcome:** drafts never lost (single-device crash *or* two-device divergence), Firestore is just a sync target (not a brittle local store), and the app-wide slowness regression is removed with the persistence cache.

---

## Decision

1. **Remove the Firestore persistence cache** from `src/main.ts` for both the default and `firestore-atc` databases. Initialize Firestore with memory/default settings (no `persistentLocalCache`, no `persistentMultipleTabManager`).
2. **Introduce `ATCDraftService`** (`src/app/shared/atc-draft.service.ts`), an explicit IndexedDB-backed, local-first draft cache modeled on the proven `MediaCacheService` pattern. It absorbs the *durable-outbox* responsibility of `FirestoreRecoveryService` and adds **optimistic-concurrency reconciliation**.
3. **Delete `FirestoreRecoveryService`** and its b815 machinery (REST PATCH encoder, `window` assertion watcher, 8s write timeout). Removing the persistence cache removes the trigger, so the machinery is dead weight (operator decision, 2026-06-26).
4. **Conflict policy: never lose data, user picks, minimum code** (operator decision, Option 1 minimal form). The `rev` counter detects a genuine conflict (both sides changed since the last sync); when one occurs, a small dialog — cloned from the existing `AtcOptionComponent` — lets the user pick which whole version to keep, and the unpicked version is **archived** to a `conflicts/{rev}` subdoc (never deleted). In the common single-device case no dialog ever fires. No field-level merge engine in scope (see Part 2a optional enhancement). Resolution never uses date/clock comparison — clocks across offline devices are untrustworthy.
5. **Media is unchanged** — `MediaCacheService` keeps its `atc_media_cache` IndexedDB + Firebase-Storage-on-submit path. `ATCDraftService` only stores the *text/structured* draft (incl. the already-uploaded media **URL arrays**), never blobs.

---

## Part 1 — Validation of the Proposed Approach (flaws, races, gaps)

The proposal ("write local first keyed by doc id, then Firestore when online; on open load both and MERGE if both exist; on submit soft-delete Firestore + delete local") is directionally correct but has **five load-bearing gaps**:

1. **"If both exist, MERGE" can't even tell whether there's a conflict.** With only *local* and *remote* in hand, differing fields are ambiguous (local changed? remote? both?). **Fix:** track **`baseRev`** (the Firestore `rev` the local copy was last synced from) + a **`dirty`** flag. A real conflict is precisely `remote.rev > baseRev && dirty`; everything else is a clean take-one. Resolution is then the user pick (Part 2a). *(A `base` snapshot is also kept — cheap — to enable the optional future field-level auto-merge, but the pick-based flow needs only `baseRev` + `dirty`.)*

2. **Client clocks cannot order two offline devices.** `lastupdated: new Date()` is device-local; two offline devices have unsynced clocks, so "newest wins by timestamp" can silently pick the *older* edit. **Fix:** a **server-authoritative monotonic `rev` counter** on the Firestore draft doc, written inside a transaction. Conflict detection compares `rev`, not wall-clock time. (`updatedAt` stays, but advisory only.)

3. **Autosave-every-change × Firestore write = a write storm / out-of-order races.** Every keystroke issuing a `setDoc` can land out of order and burns quota. **Fix:** local cache write truly fires every change (cheap IndexedDB put); the **Firestore leg is coalesced** — keep the existing `autoSaveInFlight` promise-chain serialization (prescribe `:1440`, edit `:590`) and add a short debounce. One in-flight transaction at a time, last state wins *within a device*.

4. **Removing the persistence cache breaks offline reads.** Today offline resume uses `getDocsFromCache` / the SDK cache to list and load drafts. With persistence gone, **Firestore reads fail offline**. **Fix:** `ATCDraftService` must also serve **list-my-drafts** and **load-this-draft** from its own IndexedDB when offline — the local cache becomes the offline read source, not just a write outbox.

5. **Submit cleanup is not crash-safe.** If submit succeeds but `local delete` fails (or vice-versa), a stale draft resurfaces. **Fix:** make cleanup **idempotent + convergent** — on every open, if the Firestore draft has `delete: true` (soft-deleted/submitted), purge the local entry; mark the local entry `pendingDelete` before the Firestore soft-delete so a crash between the two self-heals on next open.

**Minor gaps:** (a) *Only if the optional field-level auto-merge is later built* — `transcript` array merge would need **stable element `uid`s** (index alignment corrupts on insert/delete) and media URL arrays would need **union-dedupe by URL**. The in-scope pick-based flow takes one whole version, so neither is required now. (b) The ATC draft flow has **two** local layers today — `MediaCacheService` (IndexedDB `atc_media_cache`) and the `FirestoreRecoveryService` outbox (IndexedDB `atc_draft_outbox`); `ATCDraftService` replaces the outbox and leaves `MediaCacheService` untouched. (**Do NOT touch `LocalDraftService`** — verified it is unrelated to ATC: used only by `src/app/Product Designer/delivery-set/formtemplate/formtemplate.component.ts`, zero references under `src/app/ATC`, out of scope.)

---

## Part 2 — Recommended Architecture

### Components & data flow

```
 Prescribe / Edit ATC component
        │  (every change)
        ▼
   ATCDraftService.saveLocal(key, working)         ← IndexedDB put, ALWAYS, instant, never throws
        │  (debounced, serialized via autoSaveInFlight)
        ▼
   ATCDraftService.sync(firestore, key)            ← only when online
        │  runTransaction on temporary_(edit_)ATC/docId
        ├─ doc.rev === local.baseRev  → write working (rev+1); base ← working; dirty=false   ("primary")
        ├─ doc absent                 → create (rev=1);        base ← working; dirty=false
        └─ doc.rev  >  local.baseRev  → 3-way merge(base, working, remote)
                                          ├─ no field clash → write merged (rev=remote.rev+1); base ← merged
                                          └─ field clash    → KEEP BOTH (see below); never overwrite
        ▼
   MediaCacheService (unchanged)  ── blobs → Firebase Storage on submit; URLs go into the draft text
```

Online/offline transitions keep using the existing `ConnectivityGuardService` / `NetworkStatusService`: on reconnect, call `ATCDraftService.flushDirty(firestore)` (replaces `recovery.flushPending`).

### Part 2a — The merge on draft selection (`getATCoptions`), step by step

This is the question "once a draft is selected, how do local and remote merge?" answered against the **real code**. Today `getATCoptions` (`prescribe-atc.component.ts:1004`) does this when the user picks a draft from the `AtcOptionComponent` dialog:

```
:1051  this.autoSaveID = atc["doc"].id
:1053  const freshSnap = await getDoc(.../temporary_ATC/autoSaveID)   // REMOTE only
:1054  var value = freshSnap.exists() ? freshSnap.data() : atc["doc"].data()
:1056  this.date = value['date']; this.product = value['product']; ... // destructure ~20 fields
```

`value` is **remote-only** today. The change is surgical: **`value` becomes the merge of local + remote**, and everything downstream (the destructure at `:1056+`, media load, reattach) is unchanged.

```
:1051  this.autoSaveID = atc["doc"].id
       // was: getDoc(...).  now: one call that fetches remote, reads local, and merges.
:1053  const value = await this.draftCache.load(this.firestoreATC, 'temporary_ATC', this.autoSaveID)
:1056  this.date = value['date']; ...   // unchanged — value is now the reconciled draft
```

**What `load()` does internally — detect, then (rarely) ask.** Conflict resolution is **user-choose, whole-draft** (operator decision, 2026-06-26: Option 1, minimal form — easy to implement, usable, zero loss). It deliberately does **not** auto-splice fields; that keeps the code tiny because a real conflict is rare.

`load()` reads the cached record `{ working, base, baseRev, dirty }`, and (when online) `getDoc` → `remote { ...fields, rev }`, then branches on **`rev` only** — no clock comparison:

| Condition | Meaning | Action — UI? |
|-----------|---------|--------------|
| `remote.rev === baseRev` | this device is the only writer since last sync | take **local.working** (or remote if not dirty) — **no UI** (~99% of opens) |
| `remote.rev > baseRev` **and** `!dirty` | someone else wrote; this device had nothing unsaved | take **remote** silently — **no UI** |
| `remote.rev > baseRev` **and** `dirty` | **genuine conflict**: both sides changed since base | **show the pick dialog** |

- **Method 1 — silent (the common case).** Rows 1–2 above. No dialog ever fires in normal single-device editing, because `remote.rev` only moves past `baseRev` when a *second* device/tab wrote the same draft.

- **Method 2 — user picks (only on a genuine conflict).** A small MatDialog — **cloned from the existing `AtcOptionComponent` pattern**, opened at the *same point in `getATCoptions`* the draft-select dialog already opens — shows two cards:
  *"Keep this device's version (edited 2:14 PM)"* vs *"Keep the other version (edited 2:31 PM)."*
  The user clicks one; that version becomes `value` and loading continues normally. **No data loss:** before continuing, the *unpicked* version is written to `temporary_ATC/{docId}/conflicts/{rev}` (one `setDoc`) — archived, recoverable, never deleted. `updatedAt` is shown on the cards only as a human hint; it does **not** decide the winner (clocks across offline devices are untrustworthy — that's exactly why we don't auto-pick by date).

  *Total new code for Method 2:* one ~`AtcOptionComponent`-sized dialog + one archive write. No merge function, no per-element ids, no dedupe.

> **Optional later enhancement (NOT in scope now):** field-level 3-way auto-merge so *disjoint* edits (A edits `directive`, B edits `transcript[0].awareness`) reconcile silently and never prompt. Requires a `merge(base,mine,theirs)` function + stable `uid`s on transcript elements + URL-array union-dedupe. Deferred to honor "minimum coding"; the `base`/`rev` groundwork laid here is exactly what it would build on.

**Offline selection.** When `navigator.onLine` is false, `load()` skips the `getDoc` and returns `local.working` directly (this is the offline read path that `getDocsFromCache` used to serve at `:1021`/`:1030` — now served by the cache, since Firestore persistence is gone). The draft **list** in `getATCoptions` is likewise served by `ATCDraftService.listDrafts()` when offline.

**Why this is safe at the selection point specifically:** the merge reads `base` (what was last in sync) — so even though `getATCoptions` only had `remote` in scope before, the service supplies the missing ancestor from its own store. That is what turns an ambiguous 2-way "which of these two do I keep" into a decidable 3-way "who changed what."

### `ATCDraftService` interface (design)

```typescript
export type SyncOutcome =
  | 'synced'        // pushed cleanly (rev matched)
  | 'conflict'      // both sides changed since base; user must pick (loser archived)
  | 'pending-local' // offline; held locally, will retry on reconnect
  | 'error';

@Injectable({ providedIn: 'root' })
export class ATCDraftService {
  // --- local-first write (every change) ---
  saveLocal(collection: string, docId: string, working: any): Promise<void>;

  // --- sync one draft to Firestore (online); does reconciliation ---
  sync(firestore: Firestore, collection: string, docId: string): Promise<SyncOutcome>;

  // --- retry every dirty draft (call on reconnect / screen load) ---
  flushDirty(firestore: Firestore): Promise<void>;

  // --- load for resume: returns merged(local, remote) ready to render ---
  load(firestore: Firestore, collection: string, docId: string): Promise<any | null>;

  // --- offline-capable list of a participant's drafts (reads local when offline) ---
  listDrafts(firestore: Firestore, collection: string, where: {field:string,value:any}[]): Promise<any[]>;

  // --- submit cleanup: idempotent + convergent ---
  markSubmitted(firestore: Firestore, collection: string, docId: string): Promise<void>;

  // --- conflict pick (only when 'conflict'): archive the loser, keep the chosen ---
  // The component opens an AtcOptionComponent-style dialog with {mine, theirs} and
  // calls this with the user's choice; the other version is written to conflicts/{rev}.
  resolveConflict(firestore: Firestore, collection: string, docId: string,
                  chosen: 'mine' | 'theirs'): Promise<any>;  // returns the chosen draft to render

  // user-facing status string for the draft banner (replaces draftStatusFor)
  statusFor(outcome: SyncOutcome): { message: string; code: number };
}
```

### Local schema — IndexedDB `atc_draft_cache`, store `drafts` (keyPath `key`)

```typescript
interface CachedDraft {
  key: string;            // `${collection}/${docId}`  — stable, idempotent
  collection: string;     // 'temporary_ATC' | 'temporary_edit_ATC'
  docId: string;
  working: any;           // current local edits (full structured ATC; Date ok, no Blobs)
  base: any | null;       // last-synced snapshot — the 3-way merge ancestor
  baseRev: number;        // Firestore rev the base came from (0 if never synced)
  deviceId: string;       // stable per-browser id (one-time uuid in localStorage)
  updatedAt: number;      // client time — advisory only
  dirty: boolean;         // working !== base (has unsynced edits)
  conflict?: { theirs: any; theirsRev: number };  // set on keep-both
  pendingDelete?: boolean;// submit started; soft-delete not yet confirmed
}
```

### Firestore draft doc — added fields

```
rev: number               // server-authoritative, incremented in-transaction each write
lastWriterDevice: string  // deviceId of last writer (debug/telemetry)
serverUpdatedAt: <serverTimestamp()>  // cross-device ordering, set only on the Firestore write
delete: boolean           // soft-delete on submit (already exists)
```

Note: `serverTimestamp()` is safe again here because it is only in the **Firestore write payload**, never cloned into IndexedDB (the local `working`/`base` use plain `Date`). This is why the b815-era switch to `new Date()` is no longer needed for the local layer.

### Conflict handling (detect → pick → archive)

No field-level merge in scope. Reconciliation is **whole-draft, by `rev`**:

- **Detect:** a conflict exists **iff** `remote.rev > local.baseRev` **and** `local.dirty`. Otherwise there is no conflict (take local or remote per the Part 2a table) — no dialog.
- **Pick:** the component opens an `AtcOptionComponent`-style dialog with the two whole versions (`mine` = `local.working`, `theirs` = `remote`), `updatedAt` shown only as a human hint. User chooses one.
- **Archive (no loss):** `resolveConflict` writes the **unpicked** version to `temporary_*ATC/{docId}/conflicts/{rev}` (one `setDoc`), then writes the **chosen** version as the new draft (`rev = remote.rev + 1`) and sets `base = chosen`, `dirty = false`. The loser is recoverable from the subcollection; nothing is destroyed.

*(Optional future field-level auto-merge — `merge(base,mine,theirs)`, transcript `uid`s, URL-array union-dedupe — is described in Part 2a and intentionally deferred.)*

---

## Part 3 — Paper Stress-Test

**(A) The required two-device conflict case**
1. Device A writes → `saveLocal` (dirty) → `sync`: doc absent/`rev` matches → Firestore `rev=1`; A.base=working, A.baseRev=1.
2. A drops offline / crashes → A's newest edits live in A's `working` (dirty=true, baseRev=1) only.
3. Device B opens same draft (`load` reads Firestore rev=1, B.base=remote, B.baseRev=1), edits, `sync`: rev matches → Firestore `rev=2`; B.base updated.
4. A reconnects / reopens the draft → `load`/`sync`: `doc.rev(2) > A.baseRev(1)` **and** A.dirty → **conflict detected**. The pick dialog shows A's version vs B's version. User picks one → it's written as `rev=3` and becomes the new base; the **unpicked version is archived to `conflicts/2`**. **Neither side's work is lost** (loser recoverable from the subcollection). If A had *not* been dirty, B's version is taken silently — no dialog. ✓

**(B) Crash mid-save (single device)**
- `saveLocal` commits to IndexedDB *before* the Firestore leg. Crash after local, before Firestore → on next open, `dirty=true`, `baseRev` unchanged; `flushDirty` re-syncs (transaction idempotent on fixed docId). ✓
- Crash after Firestore commit, before local `base` update → local still `dirty`; re-sync sees `doc.rev === baseRev+1`?  No — local.baseRev is stale by one. Guard: on `rev` mismatch where `remote == last-written-working`, treat as already-applied (no-op, advance base). Else fall to merge (still non-destructive). ✓

**(C) Two offline devices, both edit, both reconnect**
- First to reconnect syncs cleanly (rev bump). Second reconnects → `doc.rev > baseRev` → merge path (case A step 4). Server `rev` — not client clocks — decides ordering, so the later *arriver* merges against the earlier, regardless of which device's clock was ahead. No silent loss. ✓

**(D) Refresh during sync**
- Refresh mid-transaction: Firestore transactions are atomic — either `rev` bumped or not. Local `working` already durable. After reload, `flushDirty` reconciles from whatever `rev` the server actually holds. A half-written state is impossible (transaction) and a re-push is idempotent. ✓

**(E) Submit race**
- `markSubmitted`: set local `pendingDelete=true` → soft-delete Firestore (`delete:true`) → delete local entry. Crash between steps → next open sees Firestore `delete:true` → purge local; or sees local `pendingDelete` → re-attempt soft-delete. Convergent either way. ✓

---

## Part 4 — Materially Better Alternative (considered, not recommended)

**CRDT document (Yjs or Automerge) for the ATC draft.** Model the structured ATC as a CRDT; merges become automatic and conflict-free by construction, with no `rev` counter, no transaction, no keep-both UI — strictly stronger "never lose data."

| Dimension | 3-way merge (recommended) | CRDT |
|-----------|---------------------------|------|
| Complexity | Med — hand-rolled merge, one transaction | High — new data model, encode/decode, new dep |
| Never-loses-data | Yes (keep-both backstop) | Yes (by construction) |
| UX on conflict | Rare non-blocking banner | None (auto) |
| Fit to existing code | High — same IndexedDB/MediaCache idiom, plain JSON in Firestore | Low — Firestore stores opaque CRDT blobs; reporting/queries over draft fields break |
| Bundle / migration | None | Large dep; rewrite draft read/write everywhere |

**Verdict:** Conflicts here are *rare* (one specialist, occasionally two devices/tabs) and the draft is short-lived (submitted then deleted). A CRDT is the right tool for high-frequency real-time co-editing, not for a rarely-contended form. The 3-way merge gives the same never-lose guarantee at a fraction of the cost and keeps Firestore docs query-friendly. Recommend 3-way; revisit CRDT only if true real-time multi-author co-editing becomes a requirement.

---

## Consequences

**Easier:** drafts are durable by construction; Firestore is a plain sync target; the b815 brick path and its REST encoder/assertion-watcher are gone; the app-wide slowness regression should lift with the persistence cache; one local source of truth for drafts.
**Harder / watch:** offline draft *list/load* now depends on `ATCDraftService` (must cover what `getDocsFromCache` did); transcript merge needs stable `uid`s added at creation; a small migration so existing in-flight drafts/outbox entries are read once and re-homed; non-ATC screens that *relied* on the default-DB persistence cache for offline reads must be re-checked (the default DB loses its cache too).
**Revisit:** the final **submit** path itself (still SDK + `serverTimestamp()`); whether the default DB needs a lighter, single-tab cache rather than none.

---

## Critical files

- `src/main.ts` — **remove** `persistentLocalCache` / `persistentMultipleTabManager` for both DBs (the change that kills b815 + the slowness regression).
- `src/app/shared/atc-draft.service.ts` — **new** `ATCDraftService` (model on `src/app/shared/media-cache.service.ts`).
- `src/app/shared/firestore-recovery.service.ts` — **delete**; remove imports/usages in prescribe `:14,:281,:1013,:1512,:1517` and edit `:14,:215,:393,:628,:629`.
- `src/app/shared/local-draft.service.ts` — **DO NOT TOUCH.** Out of scope — unrelated to ATC (used only by Product Designer's `formtemplate.component.ts`).
- `src/app/ATC/prescribe-atc/prescribe-atc.component.ts` — swap `recovery.*` for `draftCache.*`; the conflict check + pick dialog go in **`getATCoptions` at `:1053`** (see Part 2a); route offline list/load through the cache.
- `src/app/ATC/edit-atc/edit-atc.component.ts` — same swap; same offline-read change (conflict point is `getATC`'s draft load).
- **New small dialog component** (clone of `AtcOptionComponent`) — two-version conflict picker. Only new UI in scope.
- `src/app/shared/media-cache.service.ts` — **unchanged** (reference pattern only).

## Verification (handed to operator — Claude will not run ATC)

1. Two ATC tabs (Prescribe + Edit), edit both heavily → no frozen "Saving…", no b815 in console, status shows saved.
2. Whole-app read latency back to normal; Storage media loads without a hot reload (the regression check).
3. Offline edit → "Saved on this device" → reconnect/refresh → syncs; `atc_draft_cache` row goes `dirty:false`.
4. **Two-device test:** edit same draft on A (then go offline) and B (online); bring A back → disjoint edits merge silently; same-field edit shows the keep-both review with both values intact on the server.
5. Submit → Firestore draft `delete:true` AND local cache row gone; kill the tab mid-submit and reopen → state self-heals (no stale draft, no double-submit).
6. Confirm `atc_draft_outbox` (old) is migrated/empty and `FirestoreRecoveryService` is fully removed from the bundle.

---

*Journal: `specs/journals/2026-06-26-atc-draft-local-first-cache.md`.*

---

## As-built addendum (implemented 2026-06-26)

The design above is preserved as-is. The shipped code follows it faithfully; where names/shape differ, the
as-built version is authoritative:

- **Pure logic extracted** to `src/app/shared/atc-draft.logic.ts` (no Angular/Firebase) so the decision tables are
  unit-testable in isolation: `decideSync`, `decideOpen`, `computeDirty`, `pickWinner`, `nextRev`, `canonical`,
  `VOLATILE_FIELDS`. `ATCDraftService` is a thin IndexedDB + Firestore-transaction shell over them.
- **`SyncOutcome`** widened to `'created' | 'updated' | 'unchanged' | 'took-remote' | 'conflict' | 'pending-local'
  | 'error'` (finer than the design's 4; `statusFor` maps them to honest banners).
- **Reconciliation entry point** is `reconcileOnOpen(firestore, collection, docId, remote, pick)` — it takes the
  remote the component already read and returns the winner to hydrate; conflict detection at autosave time lives in
  `sync()` which returns `{ outcome, remote }` and **refuses to clobber** on divergence (keeps local safe, surfaced
  on next open). This replaces the design's single `load()` and keeps the components' existing field-hydration
  blocks untouched (the reconciled `value` is fed straight in).
- **Submit:** `finalizeSubmit` (Prescribe) does the soft-delete + local purge with a `pendingDelete` self-heal;
  Edit soft-deletes via its existing batch and calls `purgeLocal`. Offline list/load served by `listLocalDocs` /
  `loadLocal`.
- **Conflict archive** keyed by the remote rev: `…/{docId}/conflicts/{remoteRev}` (the design said `{rev}`; same
  intent — the loser is always preserved).
- **Conflict policy stayed whole-draft pick** (operator: "data loss is never an option; minimal easy UX"); the
  field-level auto-merge remains the documented optional future enhancement.
- **`new Date()` for `lastupdated` was kept** (not reverted to `serverTimestamp()`): the local cache stores it as a
  JS Date and the hydration paths now normalise via a `toJsDate` helper (handles Timestamp *or* Date). `rev` +
  `serverUpdatedAt` (server-only) carry the authoritative ordering; `lastupdated` is advisory and excluded from
  dirty/conflict comparison via `VOLATILE_FIELDS`.
- **Verification:** `tools/atc-draft-sim/` exercises the real logic + a faithful orchestration port against fakes —
  **43/43** checks (decision tables, C5, E1–E3, F1–F4 both branches, G1–G2, J3–J4). All three new Angular-facing
  files type-check clean against the project tsconfig. The harness also caught a real `ng build` blocker (a
  closure-narrowed `outcome` literal in `sync()`), now fixed. **The harness has since been removed from this repo**
  — its 43 checks are to be recreated as suites in the separate Playwright e2e project. Manual matrix remains
  operator-run per the test plan.
