# 2026-07-06 — dynamic-studio-v2: "Move to Next Stage" popup → card modal

Operator request (with mockup screenshot): the "Move to Next Stage" popup that opens from the header
**and** footer "Move Next Stage" buttons should look like the mockup — a centered modal card with a
bold **"Move to Next Stage"** title + close X, a subtitle *"Complete the session and choose where
**{participant}** goes next."*, and each next-stage option as a large card (lilac rounded icon square
with a paper-plane/`send` icon, bold label, right chevron).

## What changed (HTML + CSS only, no TS, no backend)

`dynamic-studio-v2.component.html`:
- **Header** container (`nextStageMenuOpen === 'header'`) and **footer** container
  (`nextStageMenuOpen === 'footer'`): replaced the old `.ds-nextmenu.ds-nextmenu--center` +
  `.ds-nextmenu__head` "Choose next stage" popup with the new `.ds-nextmodal` structure —
  `__head` (`__title` + `__x` close), `__body` (`__sub` subtitle naming the participant via
  `mapProfile[participantProfileId]`, fallback `'this participant'`), then the shared `#nextStageItems`.
  Both triggers reuse the same `.ds-nextmenu-backdrop` (unchanged) and the same close handler
  `closeNextStageMenu()`.
- **`#nextStageItems`** template (shared by both): each button restyled from `.ds-nextmenu__item*` rows
  to `.ds-nextmodal__item` cards — `__icon` square (`send` for the next-stage routes; the
  next-month-review item keeps its `calendar_today`/`check_circle` state icon), `__label`, and a
  trailing `chevron_right` `__chev`. **Behaviour unchanged**: same `*ngIf` guards (variation vs
  non-variation routes), same `moveStage(config.stage, config.markascompleted)` /
  `movetoNextMonthReview()` clicks, same `data-testid`/`data-stage` attributes.

`dynamic-studio-v2.component.css`:
- Added `.ds-nextmodal` block (fixed-centered card, 560px, 24px radius, soft shadow, reuses the existing
  `dsNextmenuIn` keyframe) + `__head`/`__title`/`__x`/`__body`/`__sub`/`__item`/`__icon`/`__label`/`__chev`.
  All colors via existing theme vars (`--surface`, `--border`, `--ink`, `--ink-3`, `--primary`,
  `--primary-soft`) — so the accent is the app's magenta-purple `#9A258F`, **not** the mockup's violet
  (intentional: stay on-theme).
- Extended the footer-`backdrop-filter`-defeat rule to also match `.ds-nextmodal`
  (`.ds-footer:has(.ds-nextmodal)`) so the footer's frost doesn't become a containing block and de-center
  the fixed modal (same fix that existed for `.ds-nextmenu--center`).

### Now-dead code (left in place)
The old `.ds-nextmenu*` CSS rules (`.ds-nextmenu`, `--down`/`--up`/`--center`, `__head`, `__item*`) are no
longer referenced by the template but were kept (harmless) to keep the diff small. `.ds-menu-anchor` and
`.ds-nextmenu-backdrop` are still used.

## Build / verification
Preview (`ng serve`, port 4310) HMR-recompiled clean each edit: **"Application bundle generation
complete"**, `dynamic-studio-v2-component` chunk rebuilt, only pre-existing unrelated warnings.
The live modal needs an authenticated queue session (prod Firestore off-limits, app auth-gated), so it was
verified via a **static harness** (`.preview-demo/ds-v2-nextstage.html`, linking the real component CSS)
and screenshotted at 900px: header + close, participant-named subtitle, five `send`-icon cards with
chevrons — matches the mockup layout. On-device the accent is the app's theme purple.

## Compact + responsive pass (same day, follow-up request)
Operator: "make it compact and responsive to all screens." CSS-only follow-up on `.ds-nextmodal*`:
- Shrunk everything: width `min(440px, calc(100vw - 32px))` (was 560px), title 17px (was 22px), icon
  square 38px (was 48px), item padding 10/13px, gaps/margins tightened.
- Made it clip-proof on short screens: `.ds-nextmodal` is now `display:flex; flex-direction:column;`
  capped at `max-height: calc(100dvh - 32px)`; `__head` is `flex-shrink:0` (stays pinned) and `__body`
  has `overflow-y:auto` — so a tall option list scrolls inside the modal instead of overflowing the
  viewport. `dvh` (not `vh`) so mobile browser chrome is accounted for.
- Two breakpoints (matching the component's existing conventions): `@media (max-width: 640px)` (phones:
  tighter chrome, 34px icons, 15.5/13.5px text) and `@media (max-height: 620px)` (short/landscape:
  reduced vertical rhythm, 32px icons).
- Verified in the harness at 1000×760 (compact), 375×812 (edge-to-edge, labels wrap), 800×480 (fits),
  760×360 (caps to viewport, header pinned, body scrolls — measured `bodyScrolls:true`,
  `bottomWithin:true`).

## Revert
Restore the two containers to `.ds-nextmenu.ds-nextmenu--center` + `.ds-nextmenu__head` "Choose next
stage", restore `#nextStageItems` to the `.ds-nextmenu__item`/`--go` icon+span rows, drop the new
`.ds-nextmodal*` CSS, and revert the `:has()` selector to `.ds-nextmenu--center` only. All prior CSS is
still present, so it's a pure HTML + small-CSS restore.
