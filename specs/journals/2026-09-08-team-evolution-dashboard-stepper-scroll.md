# 2026-09-08 — Team Evolution Dashboard: delivery stepper overflowed the viewport

## Context
`team-evolution-dashboard` arrived on `mahalakshmi-development` and was pulled into
`dynamic-studio-update` on 2026-09-08 (component + its hard dependency
`specialist-appointment-slot`, plus one route line — see the merge notes at the bottom).

Operator reported the delivery stepper in the **Member overview** expanded row running
off the right of the viewport instead of scrolling. Screenshot showed ~9 steps, the last
ones clipped by the window edge, labels colliding ("WiSHImplementation" with no gap).

## Why it happened
`.delivery-stepper` already had `overflow-x: auto`, so the instinct is "it should scroll".
It did not, because **nothing upstream ever constrained its width**. Three layers each
sized themselves to content, so the stepper never became wider than its own box:

1. `.split { grid-template-columns: 1fr 320px }` — a bare `1fr` is `minmax(auto, 1fr)`,
   and an `auto` min-size lets a grid column grow to its **min-content** width. The column
   expanded to fit the table rather than capping at the available space.
2. `.tbl` had default `table-layout: auto`, so column widths are computed from cell
   content. The `<td colspan="2">` holding the stepper has a min-content width of roughly
   `steps × 90px`, so the table stretched to whatever the stepper needed.
3. `.stepper-step { flex: 1; min-width: 90px }` — the 90px floor is what generated that
   large min-content width in the first place, and 90px is too narrow for labels like
   "WiSH Implementation Validation", hence the collisions.

`.panel { overflow: hidden }` then clipped the result, which is why it looked truncated
rather than scrollable. **`overflow-x: auto` only produces a scrollbar when the element's
own width is bounded** — every ancestor here was content-sized, so it never was.

## The change
All in `src/app/Journey Onboarding/team-evolution-dashboard/team-evolution-dashboard.component.{css,html}`.

- **.css `.split`** — `1fr` → `minmax(0, 1fr)`. Kills the page-level horizontal overflow.
- **.css `.tbl-overview`** (new rule) — `table-layout: fixed` + `th:last-child { width: 130px }`.
  Deliberately **not** put on `.tbl`: this component has a second `.tbl` (the 4-column
  product table at `.html:396`) that must keep its auto sizing.
- **.html:150** — `class="tbl"` → `class="tbl tbl-overview"` on the Member overview table
  only. This class exists purely to scope the two rules above.
- **.css `.delivery-stepper`** — added `max-width: 100%`, `overscroll-behavior-x: contain`,
  bottom padding 10→14px so the scrollbar does not sit on the status text.
- **.css `.stepper-step`** — `flex: 1; min-width: 90px` → `flex: 1 0 110px; padding: 0 4px`.
  `flex-grow: 1` keeps steps spread out when a product has few of them; `flex-shrink: 0`
  with a 110px basis is what makes the row genuinely overflow (and therefore scroll) once
  there are many, and gives long labels room.

## Verification
Production build green. The app is Firebase-auth gated, so the screen itself was not
reachable — verified instead with a **static harness**: the real component CSS with
`:host` rewritten to `.host`, wrapped around hand-written markup mirroring the real DOM
(`.split > .panel > .body > table.tbl.tbl-overview` with an expanded row and 11 steps),
dropped in the gitignored `dist/` so the browser pane would load it, screenshotted, then
deleted. Result: table and stepper both stay inside the panel, the 320px sidebar is
visible again, no page-level horizontal scroll, labels no longer touch.

Not verified: actual scroll interaction (the pane renders local files as static
snapshots) and real Firestore step data. Worth a click-through when the screen is
reachable.

## Revert guide (per-screen)
Screen: **Team Evolution Dashboard → Member overview → expanded participant row**.
Two files, both `src/app/Journey Onboarding/team-evolution-dashboard/team-evolution-dashboard.component.{css,html}`.

To fully revert:
1. **.css `.split`** — `grid-template-columns: minmax(0, 1fr) 320px` → `1fr 320px`;
   drop the explanatory comment above it.
2. **.css** — delete the whole `.tbl-overview` block (`table-layout: fixed`) and the
   `.tbl-overview th:last-child { width: 130px }` rule, plus the comment above them.
3. **.html:150** — `class="tbl tbl-overview"` → `class="tbl"`.
4. **.css `.delivery-stepper`** — remove `overscroll-behavior-x`, `max-width: 100%`;
   restore `padding: 10px 4px`.
5. **.css `.stepper-step`** — restore `flex: 1; min-width: 90px`; remove `padding: 0 4px`
   and the comment.

Reverting restores the overflow bug — it does not affect any other screen, since every
rule is either scoped to `.tbl-overview` or lives under the stepper.

## Pending / notes
- The component is only reachable via the `team-evolution-dashboard` route added to
  `app.routes.ts`; the operator added `canActivate: [authGuard]` to it by hand.
- Only the component + `specialist-appointment-slot` were taken from
  `mahalakshmi-development`. `delivery-dashboard-clone`, `userprofile`, `schedule-dialog`,
  `update-delivery` and `book-appointment-dialog` were deliberately dropped, but
  `MERGE_HEAD` was the full branch tip `37440cc8` — so a later
  `git merge mahalakshmi-development` will NOT bring them back; cherry-pick those paths.
- `participantOverviewRows()` / `participantOverviewCount()` calls were commented out in
  the `.ts` by the operator during this session; the overview rows may be empty until
  those are restored.
