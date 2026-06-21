# 2026-06-21 — Dynamic Studio v2: in-studio queue/studio navigator (legacy multi-queue parity)

## What was asked
Operator: "in the dynamic studio v2, I need option to select multiple queues as like in
legacy dynamic studio screen." Clarified to: *"in the legacy we show multiple queue even
we are in studio, we will show all queues and studios they are in."*

## What it actually meant (root cause)
Both legacy `dynamic-studio` and `dynamic-studio-v2` use a **single active queue**
(`ongoingQueue`) and switch via `selectQueueCard()` / `onStudioSelect()` — neither runs
multiple queues simultaneously. The real difference:

- In **legacy**, the queue cards (`queuesWithStudios`) and the studio buttons (`studioList`)
  sit in normal document flow, so they stay visible **even while in a live assignment** —
  you can hop between queues/studios without leaving the session.
- In **v2**, the live-assignment view `.ds-app` is a **full-viewport overlay**
  (`position: fixed; z-index: 30; height: calc(100vh - host-toolbar)` — see
  `dynamic-studio-v2.component.css` `.ds-app`). It covers the queue cards entirely, and the
  "Your Studios" section is also gated `*ngIf="… && liveAssignment == null"`. So once you
  enter a studio in v2 you lose all cross-queue / cross-studio navigation.

So this was **not** a multi-queue-aggregation request — it was "bring back legacy's
always-visible navigation while in a studio."

## What changed
Added an **in-studio top strip navigator** (`.ds-qnav`) inside the v2 live-studio overlay.
Decisions taken from operator: **placement = top strip**; **switch while live = confirm first**.

- `dynamic-studio-v2.component.html` — new `.ds-qnav` block as the first child of
  `<main class="ds-main">` (renders only inside `liveAssignment`, since the whole `.ds-app`
  is). Shows queue chips (`queuesWithStudios`, count from `queueStudioCounts`) when >1 queue,
  and studio chips (`studioList`, `live_tv` from `mapStudioLiveAssignment`) when >1 studio.
  Clicks call the new confirm wrappers. `data-testid="studio-qnav-queue"` /
  `studio-qnav-studio`.
- `dynamic-studio-v2.component.ts` — added `confirmSwitchQueue(queue)` and
  `confirmSwitchStudio(studio)`. Each no-ops on the already-active item, and when
  `liveAssignment != null` shows `window.confirm(...)` before delegating to the existing
  `selectQueueCard()` / `onStudioSelect()` (no change to switch logic itself).
- `dynamic-studio-v2.component.css` — `.ds-qnav` + `.ds-qchip` styles (non-shrinking strip
  under the status pill; scroll area below flexes as before), using existing design tokens.

No data-model / Firestore changes. `selectQueueCard()` still calls `checkoutQueue()`
(`checkin:false` on the previous queue's pairings), same as before.

## Verification
- Dev server (preview, port 4310) recompiled `dynamic-studio-v2-component` cleanly — AOT
  template compiler validated all new bindings; only pre-existing unrelated warnings remain.
- Full visual repro not reachable from preview (needs an authenticated specialist live in a
  studio with >1 queue/studio of real data). Logic is isolated and compiles green.

## Revert guide (per-screen)
This change is fully contained in the three `dynamic-studio-v2` files. To revert just this
feature:
1. `dynamic-studio-v2.component.html` — delete the `<div class="ds-qnav" …>…</div>` block
   (first child of `<main class="ds-main">`, marked by the "In-studio navigator (legacy
   parity)" comment).
2. `dynamic-studio-v2.component.ts` — delete the `confirmSwitchQueue` and
   `confirmSwitchStudio` methods (between `selectQueueCard` and `onQueueSelect`).
3. `dynamic-studio-v2.component.css` — delete the `.ds-qnav` / `.ds-qchip` block (after the
   `.ds-app .ds-main {…}` rule, marked "IN-STUDIO QUEUE/STUDIO NAV").
Nothing else references these; legacy `dynamic-studio` is untouched.

## Pending / follow-ups
- Live visual + interaction QA on a real account with multiple queues (confirm dialog,
  chip highlighting, switch-while-live behavior).
- Optional: studio chip currently shows "Studio N" — could surface the paired specialist's
  name for clarity if operator wants.
