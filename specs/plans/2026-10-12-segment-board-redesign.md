# 2026-10-12 · Segment Board — visual redesign (Master Segments)

Screen: `/segmentboard`, `src/app/Participants Profile Management/segment-board/`. The operator's brief asks for a modern enterprise dark dashboard with the same features, data and behaviour.
Journal (WHY): `specs/journals/2026-09-25-segment-board-component.md`.

The stack is a vanilla engine (`segment-board.engine.ts`) that renders HTML strings into `#main`, plus one scoped stylesheet (`.sb-root`). There is no component library, so the redesign is CSS plus small markup edits in the engine. Logic, the store, the Firestore shape and the `sgb-*` hooks do not change.

| Area | Change |
|---|---|
| Palette | Dark tokens refined: near-black background, two surface steps, low-contrast borders, restrained indigo primary, muted green, amber and red. The light tokens are tuned to match. |
| Stats | One summary bar of 4 metrics: the number with its label, a coloured dot for Not in a segment / In more than one segment, and the percentage as a muted suffix. |
| Toolbar | Search is first and wide, with an icon. Secondary actions sit in two quiet groups (view: Collapse all · Arrange; records: Activity · Change history · Archived). Refresh all lists is a secondary button and New segment is the only primary. |
| Filters | Compact chips on one bar. Chips show the selected values ("Journey: uP!" or "Journey: uP! +2"). The selected state is accented. Long lists (more than 8 options) get a search box, and the search text survives a re-render. Clear filters sits at the end. |
| Cards | A responsive CSS grid (`auto-fill, minmax(300px,1fr)`). Collapsed cards don't stretch the row. Names wrap to 2 lines. The count and Conditions toggle are styled separately. Line-icon SVGs replace the edit and collapse glyphs. The meta chips are quieter. The footer stays pinned at the bottom with no overlap. |
| Participant rows | Compact rows, a circular initial, the name and a muted journey line. Hover and selected states are subtle. Long names truncate. |
| A11y / responsive | Visible focus rings, aria-labels and titles on the icon buttons. Below 860px the header is static, and below 600px the toolbar groups wrap. No horizontal overflow. |

Out of scope: drawer and dialog internals, which only pick up the new tokens.

Done means:
- `ng build` passes.
- `hook-diff` is aligned.
- A harness check of search, filters, select, collapse, refresh, Actions, arrange and archived at 1400px, 900px and 390px.
- A journal entry with a revert guide.
- No commit until the operator approves.
