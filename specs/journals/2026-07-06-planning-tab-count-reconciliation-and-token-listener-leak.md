# Planning tab — card-count reconciliation + queue_token listener leak

**Date:** 2026-07-06
**Screen:** Event Opportunity Dashboard → **Planning** tab (`/eventopportunitydashboard`, Planning)
**Files:**
- `src/app/queue system/event-opportunity-dashboard/planning-tab/planning-tab.component.ts` (`computeCards`)
- `src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard.component.ts` (`fetchQueueTokens`, `ngOnDestroy`, new `queueTokensSub` field)

## Symptoms (operator report, two screenshots, same filters)
1. The queue cards showed **different counts on two machines** with identical filters
   (Mac: Total 618 / Conf+in 453 / Conf+not-in 262 / NotConf+in 165; Dell: 405 / 255 / 318 / 150).
   `Confirmed for the event` (572), `Potential` (910), `Eligible` (0) matched across both.
2. **"Confirmed + not in queue" was wrong** — the cards did not reconcile:
   453 + 262 = 715 ≠ 572 confirmed (Mac). Dell was ~right (255 + 318 = 573 ≈ 572).

## Root causes

### Bug 2 — cards mixed token-counts and person-counts (WHY it's wrong)
`computeCards()` counted the "in queue" cards **per token** (`inQueueTokens++`,
`confInQueueTokens++`) while `Confirmed + not in queue` counted **distinct people**
(`[...ap].filter(id => !holders.has(id))`). A confirmed person holding more than one
active token — e.g. present in more than one selected queue — was counted N times in the
token cards but once in the person card, so `confInQueue + confNotInQueue` overshot
`Confirmed for the event`.

Decisive tell: the **drill-downs were already person-based** (`drillIds()` returns
`[...holders]`, `[...holders].filter(id => ap.has(id))`, …). So each card's number
disagreed with the length of the list you got when you clicked it. The card *values* had
been switched to token-counting; the drill-downs and the `confNotInQueue` card were left
person-based.

**Fix:** count DISTINCT PEOPLE for every "in queue" card, off the same
`queueHolderIds()` set the drill-downs use:
- `inQueue = holders.size`
- `confInQueue = [...holders].filter(id => ap.has(id)).length`
- `notConfInQueue = holders.size - confInQueue`
- `confNotInQueue = [...ap].filter(id => !holders.has(id)).length`

Now two identities hold, so the cards reconcile and match their drill-downs:
- `confInQueue + confNotInQueue = confEvent` (`ap.size`)
- `confInQueue + notConfInQueue = inQueue` (`holders.size`)

Note: `Total in the queue` is now **distinct people**, not raw active tokens. For a
single-queue selection tokens≈people so it still matches the Board; the two only diverge
when a person sits in several selected queues, where "distinct people in the queue" is the
correct planning semantic anyway.

### Bug 1 — leaking/stacking live queue_token listener (WHY counts differed per machine)
`fetchQueueTokens()` created a **new** `collectionData(query(queue_token …)).subscribe()`
on every call and never tore down the previous one — the only teardown was
`takeUntil(this.subscription)`, which fires at component destroy. Every queue-selection
change (Board picker, Planning picker, saved-filter `patchQueues`) stacked another
permanent listener. All of them overwrite `this.queueTokens`, so the value on screen is
"whichever listener emitted last" — nondeterministic and dependent on each operator's
click history. That is why two machines on the same final filter showed different sets.
Per-token counting (Bug 2) amplified the divergence.

**Fix:** single-flight the listener. Added `private queueTokensSub?: Subscription`;
`fetchQueueTokens()` calls `this.queueTokensSub?.unsubscribe()` before opening the new
listener; `ngOnDestroy()` unsubscribes it too. Exactly one live `queue_token` listener at
a time → deterministic token set for a given selection.

## Verification
- `npx tsc --noEmit -p tsconfig.app.json` → exit 0, no errors.
- Not browser-verified: the dashboard is Firebase-auth gated and not reachable from the
  static preview harness. Logic verified by the two reconciliation identities above.

## Revert
- Planning cards: in `computeCards()` restore the token-loop
  (`inQueueTokens`/`confInQueueTokens`) and set `inQueue`→`inQueueTokens`,
  `confInQueue`→`confInQueueTokens`,
  `notConfInQueue`→`Math.max(0, inQueueTokens - confInQueueTokens)`.
- Token listener: in `fetchQueueTokens()` drop the leading
  `this.queueTokensSub?.unsubscribe();`, revert `this.queueTokensSub = collectionData(…)`
  back to a bare `collectionData(…)`, remove the `queueTokensSub` field, and remove the
  `this.queueTokensSub?.unsubscribe();` line from `ngOnDestroy`.
- Both changes are independent; either can be reverted alone.
