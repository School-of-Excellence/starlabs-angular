# 2026-07-05 — AEL read-only display + collaborator-studio entry fix

Two operator issues on dynamic-studio-v2. Working-tree only (ds-v2.ts carries prior uncommitted WIP;
not committed). My edited files compile clean — see build note.

## Issue 2 (DONE, verified in harness): AEL not shown even when validated

The AEL Validation step showed only the "Validate AEL / AEL Validated" button — the participant's actual
five areas + levels were hidden inside the edit modal. Legacy `dynamic-studio` lists them
(`participantAEL['crossovermetric'] | keyvalue` → area name + level). Ported that as a **read-only list**
onto the v2 step.

- **dynamic-studio-v2.component.html** (AEL step) — added an `.ael-areas` block: one `.ael-area` row per
  `crossovermetric` entry (`{{ i+1 }}. {{ crossover.key }}` + `aelBandLabel(crossover.value['value'])`
  badge), shown whenever `crossovermetric != null` (i.e. even after validation). The modal stays the
  edit path.
- **dynamic-studio-v2.component.css** — `.ael-areas` / `.ael-area` / `__num` / `__name` / `__level`
  (bordered rows, area name flex-grows + wraps, level as a purple pill). Verified desktop + 390px mobile
  (harness `.preview-demo/ds-v2-ael.html`): five areas render with level pills, names wrap on mobile.
- Reused existing `aelBandLabel()` (no TS change).

**Revert:** delete the `.ael-areas` block in the HTML and the `.ael-area*` CSS rules.

## Issue 1 (FIX APPLIED — needs live 2-session verification): collaborator studio, second specialist stuck

Symptom: in a collaborator studio (2 specialists), once the participant accepts, only ONE specialist
enters the live studio; the other stays on the invitation / pre-live view.

**Root cause (code analysis):** `getStudio()`'s `liveassignmentSubscription` (live-assignment listener)
was built **once** behind an `if (this.liveassignmentSubscription == null)` guard. Its query is
`where('status','==','live'), where('studioid','in', studioID)` where `studioID` = the specialist's
studio-doc-ids captured in the closure. Because the listener was never rebuilt, that `studioID` set is
**frozen at first creation**. A collaborator studio added to the specialist's `studioList` afterwards is
NOT in the frozen filter, so its live assignment (created when the co-specialist assigns) never reaches
this specialist → `mapStudioLiveAssignment[collabStudio]` stays null → the auto-enter at the
`mapStudioLiveAssignment[selectedStudio.docid] != null` check never fires → they're stuck, while the
specialist whose filter already contained the studio enters normally. Only the invitation `createdby`
calls `assignStudio()`; everyone else depends entirely on this listener, so a stale filter strands them.

**Fix (dynamic-studio-v2.component.ts):**
- New field `liveAssignmentSubStudioIds = ''` — the sorted studio-id set the listener was last built with.
- Rebuild guard changed from `== null` to `== null || liveAssignmentSubStudioIds !== studioIdKey`
  (`studioIdKey = [...studioID].sort().join(',')`): unsubscribe + recreate the listener whenever the
  studio set changes, so the `studioid in studioID` filter always includes newly-added collaborator
  studios. Keying on the sorted set means it rebuilds ONLY when the set actually changes (not on every
  check-in/status emission) — single-specialist path is unchanged.
- `resetSubscription()` also resets `liveAssignmentSubStudioIds = ''`.

**NOT verified end-to-end** — needs two simultaneous sessions on the TEST project (prod Firestore is
off-limits; app is auth-gated; can't reproduce a 2-specialist accept here). Operator to confirm: open the
same collaborator studio as two specialists, send + accept an invite, and check BOTH enter the live studio.

**Alternative considered (not taken):** switch the listener query to
`where('pairing','array-contains', this.profileid)` — inherently staleness-proof and avoids the
`in`-10-item limit, but needs a NEW Firestore composite index (deploy risk), so kept the same query shape.

**Revert:** restore the `if (this.liveassignmentSubscription == null)` guard, drop the
`liveAssignmentSubStudioIds` field + its reset.

## Build note
`ng serve` was RED while writing this — but the errors are in `web-studio-invitation.component.ts`
(`secondsRemaining`) and `zoom-clientview.component.ts` (`forceZoomReflow`/`returnToStudioTab`), NOT my
files, and their error line numbers don't match current file content → those two files were being edited
live in parallel. Per the stale-bundle gotcha, while the build is red ng serve serves the last good
bundle, so none of these changes appear in the app until those two files compile again.

## Legacy cross-check (confirms the fix)

Compared against legacy `dynamic-studio.component.ts` (lines 515–537). Legacy has the SAME
`if (this.liveassignmentSubscription == null)` guard BUT **never assigns** `this.liveassignmentSubscription`
— so the guard is permanently true and legacy spawns a NEW live-assignment listener on every
studio-pairing emission, each capturing a FRESH `studioID`. That's why collaborators work in legacy: a
studio added later is picked up by the next emission's new listener. The cost is a leaked listener per
emission.

v2 fixed that leak (store handle + `== null` guard) but thereby froze `studioID` at first build — the
regression that stranded the 2nd collaborator. My rebuild-on-set-change fix reproduces legacy's
"fresh studioID for new studios" behaviour WITHOUT the per-emission leak — the correct middle ground.

Also confirmed: v2's *invitation* subscription (getStudio ~L1865) already unsubscribes + rebuilds every
emission, so it stays current with studioID. Only the *live-assignment* subscription had the frozen-filter
bug. So the single-listener fix is sufficient — no other subscription needs the same treatment.
