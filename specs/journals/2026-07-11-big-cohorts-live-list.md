# 2026-07-11 — Big cohorts: make the cohort list live (real-time Firestore listener)

**Screen:** Big cohorts (`<app-big-cohort-clone-2>`), routed at `/bigcohorts` (`app.routes.ts:243` → `BigCohortClone2Component`).
**File:** `src/app/big/big-cohort-clone-2/big-cohort-clone-2.component.ts` (TS only — no HTML/CSS/import/`ngOnDestroy` changes).

> Note the trap: the intuitively-named `big/big-cohorts/` (`BigCohortsComponent`) is **dead** (only in a commented-out route at `app.routes.ts:670`). The live screen is the `big-cohort-clone-2` variant. `big/big-cohort-clone/` is also not the routed one.

## What changed
The core cohort list was a **one-time `getDocs("big cohorts")`** read taken at load. Converted it to a **live `collectionSnapshots` listener** so cohorts created / edited / deleted / moved reflect on screen instantly, across users, without a reload.

**Edit 1 — the load (~line 341).** `getDocs(...).then(...)` → `collectionSnapshots(collection(this.firestore, "big cohorts")).pipe(takeUntil(this.subscription)).subscribe(...)`. Reuses the existing `this.subscription` Subject (declared line 231, completed in `ngOnDestroy` line 444) — the same cleanup already used by the `live assignment` / `queue studio pairing` / `big assignment` listeners in this file. `collectionSnapshots` was **already imported** (line 6); `getDocs` stays imported (still used 12× for the reference collections).

**Merge-by-`docid` (the load-bearing detail).** `contentview` (`'participants'` ↔ `'activities'`) is a **transient per-row UI flag stored on the cohort object** and toggled at runtime (lines ~1729, ~1875–1890). A naive re-map on every snapshot would wipe whichever cohorts the user has expanded whenever *any* cohort changes in Firestore. So the listener looks up the existing row by `docid` and carries `contentview` forward: `existing?.['contentview'] ?? 'participants'` (new rows default to `'participants'`). Selection state (`selectedCohortIds`, a `Set` of docids) already lived off-object, so it survives untouched.

**Edit 2 — create handler (~line 2002).** Removed the now-redundant manual `getDocs("big cohorts")` re-fetch inside `dialogRef.afterClosed()` (the live listener now covers it). This also **removed a quirk** where that re-fetch force-set *every* cohort's `contentview` to `'activities'`.

## Why
- Operator wants the big cohorts screen to update live (real-time data), cohort-list-only scope (reference collections — marathons, zones, journeys, tags, invitations, participants, log — deliberately stay one-time `getDocs`; they rarely change mid-session and an extra listener each is unnecessary read cost).
- Chose `collectionSnapshots` + `takeUntil(this.subscription)` to match the established pattern in this exact file rather than introducing `onSnapshot`/manual unsub.

## Bug fixed as a side effect
`deleteCohort()` (~line 2465) deletes the Firestore doc but **never updated `cohortsList`** — so a deleted cohort card lingered on screen until reload. No edit to that function; the Edit-1 listener now removes the card automatically. (Create had a manual refresh; delete never did — the live listener makes both consistent.)

## Risk
- Low, contained: one read swapped for a listener + one dead refresh removed. No template/CSS/schema change.
- One extra always-open listener on `"big cohorts"`; negligible for a small collection.
- Validated: `tsc --noEmit -p tsconfig.app.json` clean for this file.

## Revert guide (per-screen)
Single file, self-contained — to restore the one-time-read behavior:
1. **Edit 1 (~line 341):** replace the `collectionSnapshots(collection(this.firestore, "big cohorts")).pipe(takeUntil(this.subscription)).subscribe(snapData => { ... })` block with the original:
   ```ts
   getDocs(collection(this.firestore, "big cohorts")).then(snap => {
     this.cohortsList = snap.docs.map(e => {
       let element: any = e.data()
       element['contentview'] = 'participants'
       return element
     })
     this.filteredCohortsList = this.cohortsList
     this.toRunFilterFunctions()
   })
   ```
2. **Edit 2 (~line 2002):** restore the manual re-fetch inside `dialogRef.afterClosed()`:
   ```ts
   dialogRef.afterClosed().subscribe((result) => {
     if (result) {
       getDocs(collection(this.firestore, "big cohorts")).then(snap => {
         this.cohortsList = snap.docs.map(e => {
           let element: any = e.data()
           element['contentview'] = 'activities'
           return element
         })
         this.toRunFilterFunctions()
       })
     }
   });
   ```
No import cleanup needed either way (`getDocs` and `collectionSnapshots` are both still used elsewhere). Reverting reintroduces the delete-lingers bug.

## Pending
- Not deployed. Recommend an in-browser smoke test (create / delete / move a cohort in one tab, watch it reflect without reload; confirm expanding a cohort's activities view isn't reset when another cohort changes) before build + deploy.
- No commit yet (operator gates commits).
