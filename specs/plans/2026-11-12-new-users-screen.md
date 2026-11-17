# 2026-11-12 — New Users screen: usability pass, tag rename, column chooser

Approved by the operator ("ok go ahead", 2026-11-12) after this outline.

1. **Tag rename.** In the toolbar's Tags dialog (manage mode), clicking an existing tag opens its name for
   editing. Only `name` is written. An empty name, or one that matches another segment tag in any case, is
   refused. It is re-checked against a fresh read before writing.
2. **Column chooser.** Name, Phone, Email, Created and Tags show by default. Status and Referred by are opt-in.
   The choice is kept per browser. Workshop and Moved On keep appearing with their filters.
3. **Usability.** Fixes taken from a read-only audit of the screen:
   - toolbar in two rows (search, count and tools; then filters);
   - sticky header with the table scrolling inside its card;
   - one-line emails and short dates;
   - at most 3 tag pills plus "+N";
   - proper loading and no-match states;
   - a selection bar under the table instead of a side panel that squeezed it;
   - labelled send buttons;
   - Bootstrap-colliding class names renamed.
4. **E2E.** A new gated hub file `workshops/new-users-screen.spec.ts`. WS-73 moves into it. WS-22 and WS-23
   switch to existing hooks.
