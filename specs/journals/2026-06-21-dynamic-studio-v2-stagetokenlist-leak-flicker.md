# 2026-06-21 — Dynamic Studio v2: `stageTokenList` leak → console spam + name flicker

## Symptoms (operator report, with screenshot + console)
- On the in-studio "My Arena" screen, `console.log(..., 'stageTokenList')` fired
  **repeatedly** (and `this.studioList` / `Live Studio` logs cycled alongside).
- **At the same time the participant names on screen flickered** (Scope
  Enhancement queue cards — avatar + name re-rendering).

## Root cause
Same family as [2026-06-20 subscription-leaks journal] — two more **un-stored**
nested subscriptions, this time inside `onStudioSelect()`
(`dynamic-studio-v2.component.ts`):

1. **`studio conversation`** listener (~L1716) — created anonymously, handle
   never stored.
2. **`queue_token`** listener (~L1738) — created anonymously, handle never
   stored. Its callback ends with `this.stageTokenList = localTokenList` +
   `console.log(this.stageTokenList, 'stageTokenList')`.

The class already **declares** `tokenSubscription` and
`studioconversationSubscription` and tears them down in `resetSubscription()` —
but `onStudioSelect` never assigned to them, so the teardown was a no-op and the
leak was invisible to it.

`onStudioSelect` is called from many paths (the studio-select click, auto-enter
~L1536, "Bring to Studio" ~L1312, the live-assignment re-enter ~L1627) and the
outer `queue studio pairing` subscription re-fires on every check-in/out. Each
call stacked **another** live `queue_token` listener. N parallel listeners all
fired on every token change, each reassigning `this.stageTokenList` to a fresh
array of fresh objects → repeated console logs + N writes per change.

The **flicker**: the stage/token `*ngFor`s had **no `trackBy`**, so each fresh
array of fresh objects made Angular tear down and re-create every row (and its
`<img>` avatar + name) on each write — visible flashing, amplified by the leak.

## Fix
1. **Leak:** in `onStudioSelect`, `?.unsubscribe()` the previous handle and
   store the new one for both listeners — assign the `studio conversation`
   listener to `this.studioconversationSubscription` and the `queue_token`
   listener to `this.tokenSubscription`. `resetSubscription()` already cleans
   both up, so they now genuinely subscribe once-per-selection. Mirrors the
   existing `studioGroupingInvitationSubscription` pattern a few lines below.
2. **Flicker:** added `trackBy` to both `*ngFor`s in the in-studio panel —
   `trackByStageName` (keyed on `stage.stagename`) and `trackByTokenDocId`
   (keyed on `token.docid`). Updates now patch rows in place instead of
   rebuilding avatars/names. Methods added just above `onStudioSelect`.

## Verification
- Preview HMR rebuilt the `dynamic-studio-v2-component` chunk clean (template
  compiler validated the two new `trackBy` bindings; only pre-existing unrelated
  warnings remain).
- Full visual repro not reachable from preview (needs an authenticated
  specialist live in a studio with real queue_token data). Logic is isolated and
  compiles green.

## Revert guide (per-screen)
Fully contained in two `dynamic-studio-v2` files:
1. `dynamic-studio-v2.component.ts` —
   - In `onStudioSelect`, drop the two added `this.<x>?.unsubscribe()` lines and
     the `this.<x> =` assignment prefixes (revert to the anonymous
     `collectionData(...).subscribe(...)` calls) for the `studio conversation`
     (~L1716) and `queue_token` (~L1738) listeners.
   - Delete the `trackByStageName` and `trackByTokenDocId` methods (immediately
     above `onStudioSelect`).
2. `dynamic-studio-v2.component.html` — remove `; trackBy: trackByStageName`
   from the `stageTokenList` `*ngFor` (~L145) and `; trackBy: trackByTokenDocId`
   from the `stage.tokenlist` `*ngFor` (~L149).
Nothing else references these; legacy `dynamic-studio` is untouched (it has the
same latent leak at its own L811/L812 — left alone per scope).

## Pending / follow-ups
- Live QA on a real multi-token studio: confirm `stageTokenList` now logs once
  per selection/token-change (not in a repeating cycle) and names no longer
  flicker.
- The two remaining `console.log(this.stageTokenList, 'stageTokenList')` /
  `console.log(token)` debug lines could be removed once verified in the field.
- Legacy `dynamic-studio.component.ts` (L811) carries the identical leak if it's
  still reachable — fix there too if it's still in use.
