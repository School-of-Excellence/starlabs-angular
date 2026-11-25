# 2026-11-23 — JC Health: participant slide-over fits every width

## Problem
The participant slide-over (row click on Journey Coach Health) looked shifted left and clipped: name, labels and
values cut off at the left edge, header pills crowding the close button.

## Cause
The header put the name block and **three labelled pills + close** (~480px, `flex: 0 0 auto`) on one row inside a
≤520px panel with 20px gutters, and `.so-id` had no `min-width: 0`. The header overflowed horizontally; the dialog
autofocuses `.so-close` (a11y), so the browser scrolled the `overflow: hidden` surface sideways to reveal it — the
whole panel slid left. Long dd values / list names had no wrap either, and `100vh` hid the footer behind mobile
Safari's toolbar.

## What changed
| File | Change | Why |
|---|---|---|
| `participant-slideover.component.ts` (template) | Close button moved out of `.so-head-actions`, next to the name | Name + close on row 1, action pills on their own row — fits at any panel width |
| same (styles) | `.so-header` → 2-col grid; `.so-head-actions` spans both columns and wraps; `.so-id min-width:0`; name/email/phone `overflow-wrap:anywhere` | No header overflow → no sideways auto-scroll |
| same (styles) | `.so-kv dt/dd`, `.so-list-main` shrink + wrap | Long values wrap instead of widening the panel |
| same (styles) | `.so-root` is a size container; `@container so (≤420px)`: 16px gutters, list rows stack (status/date under the name), coach select full width; `(≤340px)`: header pills icon-only (aria-labels already present) | Rules follow the panel width, not the viewport. Block sits at the END of styles so it beats `.so-coach-*` / `.so-footer` on source order |
| `journey-coach-health-dashboard.component.ts` + `src/styles.css` | Panel height `100dvh` (`100vh` kept as fallback in CSS) | Pinned footer stays above mobile Safari's toolbar |

No `data-testid` added or removed (close button kept its attributes; `jcso-export` unchanged).

## Verified
Static harness with the component's real CSS at 520 / 420 / 375 / 320px panel widths: `scrollWidth == clientWidth`
for every panel and header (no horizontal overflow); screenshots checked. Dev build compiles. Not yet checked
in the live app (auth-gated).

## Revert guide (per screen)
Before commit: `git diff` the three files above and drop the hunks. After commit: `git revert <sha>`.
Partial: put the `<button class="so-close">` back as the last child of `.so-head-actions` and restore
`.so-header { display:flex; justify-content:space-between }` + `.so-head-actions { flex:0 0 auto; display:inline-flex }`.
