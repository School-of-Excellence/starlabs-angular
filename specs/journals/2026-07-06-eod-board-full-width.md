# 2026-07-06 — event-opportunity-dashboard: Board tab goes full width

Operator request: in the Event Opportunity dashboard, the cards shown in the **Board** tab should take
the full available width and arrange responsively.

## Root cause

The whole screen renders inside `.content-area`, which was capped at `max-width: 1180px; margin: 0 auto`
(centered). The Board tab's two card grids are *already* responsive on their own —
`.auto-grid` uses `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` and
`.drag-drop-container` is `flex-wrap` — but the 1180px parent cap starved them of room, so the scope-card
grid never grew past ~3 columns no matter the monitor. Nothing about the grids themselves needed changing;
only the parent width cap.

## What changed (HTML + CSS only, no TS, no backend)

`event-opportunity-dashboard.component.html`:
- Added `[class.board-active]="activeTab === 'board'"` to the `.content-area` div (line ~3). This is the
  ONLY HTML change. `activeTab` is the existing tab-state property; no new state introduced.

`event-opportunity-dashboard.component.css`:
- New rule `.content-area.board-active { max-width: none; padding: 0 28px 28px; box-sizing: border-box; }`
  — lets the Board tab span the full viewport. `box-sizing: border-box` is load-bearing: `.content-area`
  is `width:100%` with `content-box` default, so without it the 28px side padding overflowed the viewport
  (verified: 56px horizontal scroll at 1680px). The Planning tab and header controls keep the original
  1180px centered width (the base `.content-area` rule is untouched).
- In the existing `@media (max-width: 768px)` block, added
  `.content-area.board-active { padding: 0 12px 24px; }` so the fat 28px side padding doesn't eat ~15% of
  a phone screen.

The `.main-container.panel-open .content-area { width: calc(100% - 500px) }` detail-panel logic keeps
working because it's relative to `.content-area`'s own width, not the removed max-width.

## Verification

Reproduced the Board tab in a static harness (`.preview-demo/eod-board-fullwidth.html`) that links the
**real** component CSS. Confirmed via the preview server (368 real CSS rules loaded):
- 1680px: scope grid auto-fills 4 stretched columns, drag cards 6/row, no horizontal scroll.
- 1024px: 2 columns. 375px (mobile): 1 column, tighter padding, no overflow.
Before/after: `max-width` computed as `none` under `.board-active` (was `1180px`).

## Revert

Two files, three hunks — all additive:
1. `...component.html`: remove `[class.board-active]="activeTab === 'board'"` from the `.content-area` div.
2. `...component.css`: delete the `.content-area.board-active { ... }` rule (right after `.content-area`).
3. `...component.css`: delete the `.content-area.board-active { padding: 0 12px 24px; }` line inside the
   `@media (max-width: 768px)` block.
Removing all three restores the 1180px-capped Board tab exactly. The base `.content-area` rule was never
modified, so no other screen is affected either way. The `.preview-demo/` harness is untracked scaffolding
and can be deleted freely.
