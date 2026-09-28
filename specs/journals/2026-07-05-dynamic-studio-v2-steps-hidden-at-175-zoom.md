# 2026-07-05 — Dynamic Studio v2: Session Steps hidden at 175% zoom (root cause + robust fix)

Operator goal: *"in dynamic studio v2 when I zoom the screen to 175% the steps got hidden — I need
this screen responsive to all screens (laptop, mobile, phone) and all font sizes."*

Working tree only — **not committed to `main`** (branch `dynamic-studio-update`). CSS-only change to
`src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.css`. Verified in a static harness
(no auth needed) across the full device/zoom matrix — see Verification.

## Root cause (the real bug)

The live workspace sidebar (`.ds-side`) holds the participant **identity** block on top and the
**Session Steps** (`.ds-vstep` list) below, as a vertical flex column.

The wider **tablet band** rule (`@media (max-width: 1024px)`) lays the sidebar out *horizontally* and sets
`flex-wrap: wrap` on `.ds-side`. The **two-column-short** rule
(`@media (min-width:460) and (max-width:1024) and (max-height:720)` — which is exactly where a laptop at
175% zoom lands, e.g. 1512×982 → ~864×561 CSS px) switches `.ds-side` back to `flex-direction: column`
**but never reset `flex-wrap`**. So the sidebar was a *fixed-height column with `flex-wrap: wrap`* — and
when identity + steps were taller than the column, the steps **wrapped into a second flex column beside
the identity**, off the right edge of the ~180px-wide sidebar → **invisible**. That is the "steps got
hidden" report. (Confirmed in the harness: both `.ds-side-id` and `.ds-side-steps` computed `offsetTop:12`
— stacked at the *same* top, i.e. side-by-side columns, not stacked rows.)

The earlier 2026-07-02 pass had masked this by giving `.ds-side-id` `flex: 1 1 0` + internal
`overflow-y:auto`, which shrank the identity enough that nothing wrapped — but that shrank the identity to
a scrollable **sliver that hid the participant's visit / journey / specialists** instead. Two bugs, one
root: wrap on a fixed-height column.

## The fix (4 edits, all in the one CSS file)

1. **`flex-wrap: nowrap` on `.ds-side` in the two-column-short block.** The actual root-cause fix — steps
   can no longer wrap into a hidden second column; identity + steps stay in one stacked column.
2. **`.ds-side-id` → `flex: 0 0 auto`** (natural height, no internal scroll) in all three places it was
   `flex: 1 1 0` (base `.ds-side-id`, the two-column-short block, and the `>1025` desktop block; removed
   the now-redundant `>1025 max-height:720` override). Identity keeps its natural height so the
   visit/journey/specialist info is **never** shrunk away. When identity + steps together exceed the
   column, the **whole sidebar scrolls** (`.ds-side` is already `overflow-y:auto; min-height:0`) so the
   steps are always reachable — nothing is clipped off-screen.
3. **Drop the per-step SUB captions at short heights** (`@media (max-height:760)` →
   `.ds-vstep-sub { display:none }` + tighter `.ds-vstep` padding). Makes the 6 steps ~28px each so they
   fit *without* a scroll in the common 150–175% zoom range.
4. **Collapse the inline specialist roster to just its "With · N — View all" header at
   `@media (max-height:560)`** (`.ds-side-specialists__list { display:none }` — was a 13vh masked list).
   Keeps the identity short at heavy zoom so all 6 steps fit; the full roster is one click away in the
   existing "View all" overlay, so no info is lost.

Net effect: steps are **visible without scrolling** through ~175% zoom (worst case: very long name + 5
specialists), and at extreme zoom (~≥200%, ≤430px tall) the sidebar scrolls so steps stay **reachable**,
never hidden.

## Verification (static harness, `.preview-demo/ds-v2-stepper.html`)

No-auth harness that `<link>`s the REAL component CSS and renders the live-stepper markup with worst-case
mock data (long hyphenated name, 3-line journey, 5-specialist collapsible roster, 6 steps). Measured
`clipped step count`, sidebar scroll, and horizontal overflow via `getBoundingClientRect` at each size:

| Viewport | Meaning | Result |
|---|---|---|
| 1440×900 | desktop, 100% | 0 clipped, no scroll, no h-overflow |
| 1097×560 | 1920 monitor @175% | 0 clipped, no scroll |
| 864/823×463 | 14" laptop @175% | **0 clipped** (all 6 steps + name/visit/journey/View-all visible) |
| 585×440 | tablet @175% | 0 clipped |
| 900×400 | ~240% extreme | 2 below fold, sidebar scrolls → 0 clipped after scroll (reachable) |
| 768×1024 | tablet portrait | 0 clipped (horizontal step band) |
| 375×812 / 360×640 | phone | un-pins to static, page scrolls, all steps rendered, no h-overflow |
| 823×463 + root-font 24px | large-font stress | 0 clipped, no h-overflow |

All widths: `scrollWidth == clientWidth` → **zero horizontal overflow**.

## Per-screen revert guide

All in `dynamic-studio-v2.component.css`. Builds on the 2026-07-02 responsive-pass guide.

### Live workspace: Session Steps hidden at 175% zoom · DONE 2026-07-05
| Change | Where | Revert to |
|---|---|---|
| Wrap reset (root-cause fix) | `.ds-side` in `@media (min-width:460) and (max-width:1024) and (max-height:720)` | remove `flex-wrap: nowrap;` |
| Identity natural height | `.ds-side-id` base (~L874), same two-column-short block, and `@media (min-width:1025)` block | change `flex: 0 0 auto` back to `flex: 1 1 0; min-height:0; overflow-y:auto` (and restore the deleted `@media (min-width:1025) and (max-height:720){ .ds-side-id{flex:1 1 0} }` block) |
| Step sub-labels hidden when short | `@media (max-height:760)` — `.ds-vstep-sub{display:none}` + `.ds-vstep` padding + `.ds-side-steps{gap:2px}` | delete those 3 rules |
| Roster collapsed when very short | `@media (max-height:560)` — `.ds-side-specialists--collapsible .ds-side-specialists__list{display:none}` | restore `max-height:13vh` |

**Full revert of this fix:** `git checkout <pre> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.css"` (only that file changed this session).

## Surprises / gotchas
- The `@media (max-height:760/560)` blocks were full of **dead** `.ds-hstep*` selectors (the pre-redesign
  horizontal stepper, removed from the template) — they targeted nothing, which is why the *vertical*
  steps never got compacted at zoom. The new `.ds-vstep*` rules live alongside them. The dead `.ds-hstep*`
  / `.ds-header` / `.ds-stepbar` rules are still a candidate for a later cleanup pass (left untouched to
  keep this change scoped).
- Harness lives at `.preview-demo/ds-v2-stepper.html` (+ `static-demo` config in the gitignored
  `.claude/launch.json`, `python3 -m http.server 4320`). PII-free (mock data) — safe to keep as a
  reusable responsive test rig for this screen.

---

## Follow-up (same day): footer "Move Next Stage" overlay not centered

Operator: on the last step, clicking **Move Next Stage in the FOOTER** showed the "Choose next stage"
overlay pinned above the footer button (bottom of screen), not centered. The header's Move Next Stage
already centered fine.

**Root cause:** `.ds-footer` has `backdrop-filter: saturate(180%) blur(20px)`. A non-`none`
`backdrop-filter` makes the element a **containing block for `position: fixed` descendants** — so the
footer's `.ds-nextmenu--center` (position:fixed, top/left:50%, translate(-50%,-50%)) resolved against the
46px footer box instead of the viewport. (Harness confirmed: menu centre (742,780) vs viewport centre
(640,400).) The header menu centres correctly because `.ds-topbar2` has no backdrop-filter.

**Fix (commit 7536ebe):** while the overlay is open, drop the footer's filter so the fixed child escapes
to the viewport:
```css
.ds-app .ds-footer:has(.ds-nextmenu--center) {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
```
The full-screen dark `.ds-nextmenu-backdrop` covers the footer while open, so losing the frost for that
moment is invisible. Verified: overlay centres on the viewport at both 1280×800 and 823×463 (175% zoom).

**Revert:** delete the `.ds-footer:has(.ds-nextmenu--center)` rule (just after `@keyframes dsNextmenuIn`).

**Gotcha for future:** any ancestor with `transform`, `filter`, `backdrop-filter`, `perspective`,
`will-change: transform`, or `contain: paint/layout/strict` becomes the containing block for
`position:fixed` children — a centred/modal fixed overlay placed inside such an element will anchor to it,
not the viewport. In this component both `.ds-topbar` (old, unused) and `.ds-footer` use backdrop-filter.
