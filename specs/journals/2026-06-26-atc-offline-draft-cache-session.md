# Journal — ATC offline draft: local-first cache (design → implementation session)

**Date:** 2026-06-26
**Repo:** Starlabs 19 (Angular app — ATC)
**Plan/ADR:** `specs/plans/2026-06-26-atc-draft-local-first-cache.md` (ADR-001, ACCEPTED) + `…-TESTPLAN.md`
**Predecessor:** `specs/journals/2026-06-23-atc-draft-firestore-assertion-recovery.md` (the `FirestoreRecoveryService` this work replaces)
**Outcome:** Designed **and implemented** in one session. Reconciliation logic proven by a throwaway non-ATC Node
harness (43/43, since removed); 3 new shared files type-check clean against the app tsconfig. NOT built/run as the
real ATC app (project rule) — manual matrix + Playwright suites are the operator's.

---

## Progress achieved this session

Went from an open design (ADR "Proposed") to a fully wired implementation, verified the logic with a dummy harness,
and documented it. Concretely:

1. **Removed Firestore's persistence cache** (`persistentLocalCache` + `persistentMultipleTabManager`) from
   `src/main.ts`. This was the root cause of the fatal SDK assertion `b815` (bricked the client for the page session
   under multiple ATC tabs) and the prime suspect for app-wide slow reads + media-needs-hot-reload. Firestore now
   runs with its default in-memory cache. (The default DB was already memory-cache, so blast radius is ATC-only.)
2. **New `ATCDraftService`** (`src/app/shared/atc-draft.service.ts`) — explicit local-first draft cache over
   IndexedDB `atc_draft_cache`, modeled on `MediaCacheService`. Writes every change to IndexedDB first, then pushes
   to the Firestore draft doc inside a `runTransaction`. Serves offline draft list/load (`listLocalDocs`/`loadLocal`)
   — replacing the removed `getDocsFromCache`.
3. **Pure logic extracted** to `src/app/shared/atc-draft.logic.ts` (no Angular/Firebase) — `decideSync`,
   `decideOpen`, `computeDirty`, `pickWinner`, `nextRev`, `canonical` — so the decisions are unit-testable alone.
4. **Conflict picker dialog** `src/app/ATC/shared/draft-conflict-dialog.component.ts` — whole-draft pick, shown only
   on a true conflict; the rejected version is archived to `…/{docId}/conflicts/{rev}` (never lost).
5. **Wired both flows** (`prescribe-atc`, `edit-atc`): swapped `recovery.*` → `draftService.*`; reconcile at
   draft-open; autosave refuses-to-clobber on divergence; submit soft-deletes + purges locally with a
   `pendingDelete` self-heal. **Deleted `FirestoreRecoveryService`** and its REST-fallback + window assertion watcher.
6. **Service field name normalized to `draftService`** in both components (Edit was `draft`, now consistent).
7. **Verification:** a dependency-free Node harness exercised the real logic against fake Firestore/IndexedDB —
   **43/43** checks — then was removed (tests move to the Playwright e2e project). `tsc --noEmit` clean on the 3 new
   Angular-facing files.
8. **Docs/cleanup:** ADR moved to Accepted with an As-built addendum; test plan written; `PROGRESS.md` rewritten;
   outdated `Journal/EDIT-ATC.md` + `Journal/PRESCRIBE-ATC.md` deleted and `Journal/README.md` updated; a session
   journal added to the `starlabs-e2e-tests` repo.

## Key decisions and WHY (kept here since the standalone WHY journal was removed)

- **Remove the persistence cache, not work around it.** `FirestoreRecoveryService` treated the *symptom* of b815
  (REST fallback + assertion watcher around a bricked client). The trigger IS the persistence cache, so removing it
  removes the bug and makes the recovery apparatus dead weight. One change fixes b815 and the perf regression.
- **A server `rev` counter in a transaction decides ordering — never clocks.** Two offline devices have unsynced
  clocks, so "latest timestamp wins" can overwrite the *newer* edit. Conflict ⇔ `remote.rev > baseRev && dirty`.
- **Whole-draft pick + archive, not field-level merge** (operator: "data loss is never an option, minimal easy UX").
  Conflicts are rare (one specialist, occasionally two devices/tabs); a pick dialog + one archive `setDoc` is a
  fraction of the code and still loses nothing. Field-level auto-merge is documented as a deferred enhancement.
- **Reconcile at draft-open; autosave refuses to clobber.** The open path already hydrates ~20 fields, so feeding it
  the reconciled winner is a tiny change. Autosave returning `'conflict'` (and keeping local safe) avoids a
  mid-typing dialog; the picker fires on next open.
- **`lastupdated` stays a JS `Date`** (local cache stores it; `serverTimestamp()` isn't structured-cloneable);
  hydration normalises via `toJsDate` since a draft can arrive as a Timestamp (server) or Date (cache). `rev` +
  server-only `serverUpdatedAt` carry the authoritative ordering; `lastupdated` is excluded from comparison via
  `VOLATILE_FIELDS`.

## What surprised us / findings

- **The harness caught a real `ng build` blocker before any build.** `sync()` set `outcome` inside the transaction
  closure; TS literal-narrowed it to `'unchanged'`, breaking the post-transaction comparisons (TS2367 — fires even
  under `strict:false`). Fixed with a holder object.
- **`LocalDraftService` is NOT ATC** — used only by a Product Designer form; left untouched.
- **The default Firestore DB was already memory-cache** — only `firestore-atc` carried persistence, so non-ATC
  screens are unaffected by its removal.
- **`specs/` is entirely git-ignored** (`.gitignore` line 8 `/specs`), so this journal, the ADR, and the test plan
  are **local-only** and won't reach other developers via git. The tracked doc location is the root `Journal/`
  folder. (This contradicts CLAUDE.md's claim that plans/journals are git-tracked.)

## Verification

- Dev harness (now removed): 43/43 — decision tables, dirty lifecycle, rev create/update, took-remote, two-device
  conflict (both branches) + loser archived, submit soft-delete + crash self-heal, two-offline-devices,
  competing-write-mid-transaction race (no clobber).
- `tsc --noEmit` clean for the 3 new shared/Angular files against the app tsconfig.
- Not built/run as the ATC app (project rule). Operator + Playwright own live verification.

## Pending (operator / next session)

1. **Recreate the 43 reconciliation cases as Playwright suites** in the e2e project.
2. Operator manual matrix (`specs/plans/…-TESTPLAN.md`): two-tab b815 check, two-device conflict + archive,
   crash/refresh durability, offline list/load, submit self-heal, media path, migration off old `atc_draft_outbox`,
   app-wide perf/media-regression re-check.
3. No in-app read UI for the `conflicts/{rev}` archive yet (Firestore console only).
4. Media-URL patch after upload still bypasses the rev transaction (additive fields only; converges next autosave).
5. Decide whether to track the ATC docs (move dev guide to root `Journal/`, or un-ignore `specs/journals/`).
6. Commit is operator-gated; branch `offline-ATC`. Suggested one-line: `feat(ATC): local-first offline draft cache
   with rev-based conflict resolution; drop Firestore persistence cache`.
