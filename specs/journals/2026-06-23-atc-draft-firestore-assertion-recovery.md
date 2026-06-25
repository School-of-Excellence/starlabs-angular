# 2026-06-23 — ATC draft save: surviving Firestore's `b815` internal assertion without a reload

## What was wrong (production)

On the Prescribe ATC screen, saving a draft failed with a misleading **"network issue"** message while the internet was fine. The real console error was:

```
FIRESTORE (11.10.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)
CONTEXT: { "hc": "TypeError: Cannot read properties of null (reading 'target')" }
```

This is a Firestore Web SDK bug thrown from the SDK's internal **async queue**, triggered by `persistentLocalCache({ tabManager: persistentMultipleTabManager() })` when **multiple ATC tabs** are open (the app opens new tabs via `createNewATC()` → `window.open(_blank)`, and Prescribe + Edit are commonly open together). Once it fires, the Firestore client is **bricked for the rest of the page session** — `setDoc` hangs or fails. The old `catch` in `runAutoSave()` relabelled every failure as *"Couldn't save draft. Waiting for network..."*, masking the crash.

## Why we did NOT take the "obvious" fixes (verified by deep research, 2026-06-23)

- **Upgrade firebase.** `11.10.0` is already the latest 11.x; the only newer is 12.x, which **no `@angular/fire` release supports** (both 19 and 20 pin `firebase: "^11.8.0"`) and would force an Angular 19→20 migration. And the *same* assertion still appears in **12.3.0** ([#9267](https://github.com/firebase/firebase-js-sdk/issues/9267)); the `ca9` race fix only landed in **12.13.0**, and even that is not confirmed to cover the `b815` multi-tab variant. Necessary eventually, not a fix now.
- **`persistentSingleTabManager`.** Breaks the multi-tab requirement, and a maintainer found the underlying IndexedDB error becomes **fatal** specifically when multi-tab is disabled ([#8250](https://github.com/firebase/firebase-js-sdk/issues/8250)). Worse, not better.
- **Reload to recover.** Rejected by the operator: confuses users mid-prescription and risks losing in-progress work.
- **In-place client revival** (`terminate()` → `getFirestore()`). Documented but **not reliable** — verified refutation (the cached-terminated-instance defect, angularfire [#2411](https://github.com/angular/angularfire/issues/2411)); `terminate()` also leaves awaited writes hanging and `clearIndexedDbPersistence()` rejects in multi-tab and would wipe the draft.

**Conclusion:** the persistent client cannot be reliably un-bricked in-session, so the draft save must **not depend on it**. Source of truth stays Firestore (server) because `getDocs`/`getDoc` read from it and cross-device resume needs it.

## What we built (this session)

New service **`src/app/shared/firestore-recovery.service.ts`** — an *outbox + crash-proof writer + global detector*:

1. **Durable local outbox** in our **own** IndexedDB (`atc_draft_outbox`), independent of Firestore's persistence → cannot be corrupted by `b815`, survives reload/close. Every draft is written here **first**, so it can never be lost.
2. **`writeDraft()`** — outbox first; then the live primary client (raced against an 8s **timeout** so a bricked/hung client can't freeze the screen); if that fails or the client is degraded, a **direct Firestore REST `PATCH`** using the signed-in user's ID token (`getAuth().currentUser.getIdToken()`) — this reaches the server **without the SDK client**, so the write lands in the same screen, no reload. Returns an outcome (`primary` / `fallback` / `pending-local` / `error`).
3. **Global assertion detector** — `window` `error` + `unhandledrejection` listeners match `INTERNAL ASSERTION FAILED` / `Unexpected state` and flip a `degraded` flag (the assertion is async and bypasses local `try/catch`).
4. **`flushPending()`** — on screen load, pushes any not-yet-synced drafts to the server (fresh client, or REST), then the existing `getDocs` reads them. Idempotent (fixed doc id), so re-flush/duplicate tabs are safe.
5. **Honest status** via `draftStatusFor()` — recovered → "Draft saved."; offline/bricked-but-safe → "Saved on this device — will sync automatically."; hard failure → "Could not save the draft just now — your changes are kept on this device and will retry." **No more false "network" message.**

### Wiring (additive — happy path untouched)
- `prescribe-atc.component.ts`: inject service; `runAutoSave()` draft write → `recovery.writeDraft(..., 'temporary_ATC', ...)`; media upload block now also guarded by `!recovery.isDegraded()`; `getATCoptions()` calls `flushPending()` before reading; honest catch message.
- `edit-atc.component.ts`: same pattern with collection `temporary_edit_ATC`; `flushPending()` at the top of `getATC()`.
- **`lastupdated: serverTimestamp()` → `new Date()`** in both draft writes — required so the draft is structured-cloneable for the outbox and serialisable for REST. Firestore still stores it as a Timestamp on write, so reads (`.toDate()`) are unchanged; only difference is client clock vs server clock (acceptable for a draft).

The recovery path only engages on error/offline, so a bug in it cannot break a normal save; the REST fallback is best-effort (never throws) and is backstopped by `flushPending()` on next load.

## Not covered / deferred (follow-ups)
- **Final submit** path still uses the primary client + `serverTimestamp()` directly — if bricked it can still hang. Out of scope for "draft save"; revisit.
- **App-wide reads** on other screens in a bricked session can still be stale until next navigation; we only routed the ATC draft flow.
- **De-dup `initializeApp`** (main.ts + app.config.ts) was deliberately NOT changed this pass (touches bootstrap/env resolution, untested) — recommended separate, low-risk follow-up to reduce `b815` frequency.
- **REST encoder** (`toValue`/`toFields`) is hand-rolled for the draft shapes (string/number/bool/null/Date/array/map). Needs verification against the real draft payload and security rules.

## Verification handed to operator (ATC not run/built by Claude, per standing rule)
1. Two tabs (Prescribe + Edit), edit a draft in each → no frozen "Saving…"; status shows saved.
2. Force `b815` (multi-tab) mid-save → message is honest, user keeps editing; check the draft appears in `temporary_ATC` / `temporary_edit_ATC` on the server (REST fallback) or after a refresh (outbox flush).
3. Reload / reopen / different device → `getDocs` returns the draft.
4. Offline save → "Saved on this device…"; reconnect or reload → it syncs.
5. Confirm `atc_draft_outbox` IndexedDB empties after a successful sync.

## Addendum — 2026-06-25: `DataCloneError` on Edit ATC outbox

**Symptom:** `Draft outbox: could not store draft locally DataCloneError: ... e=>new re(e) could not be cloned` on the Edit ATC screen (a warning, caught — the draft still saved). Also a benign `Failed to obtain primary lease for action 'Backfill Indexes'` (normal `persistentMultipleTabManager` message when another tab holds the lease; not from our code).

**Cause:** the Edit draft payload contains Firestore **`DocumentReference`** objects (`e=>new re(e)` is a ref's internal converter). `setDoc` accepts refs, so the server write worked — but IndexedDB's structured clone rejects them, so the outbox copy failed and the durability net was missing for Edit drafts.

**Fix (service-only):** added `sanitize()` — produces a clone-/REST-safe copy (Timestamp→Date, `DocumentReference`→`{__ref: path}` marker, functions dropped) used for the **outbox + REST**, while the live `setDoc` still receives the **original** data (full ref/Timestamp fidelity, happy path unchanged). `flushPending` and the REST encoder `revive`/encode the `{__ref}` markers back into real references (`doc(firestore, path)` / `referenceValue`).

**Known caveat:** revived refs and REST `referenceValue` assume the ref lives in the `firestore-atc` database. A draft field holding a ref to the **default** DB would be revived against the wrong DB — but only on the recovery path (flush/REST after a primary-write failure), never on the normal `setDoc`. Capture the ref's database in `sanitize` if this proves to matter.
