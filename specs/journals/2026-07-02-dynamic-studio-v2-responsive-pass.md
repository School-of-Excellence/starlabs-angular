# Dynamic Studio V2 — responsive pass (2026-07-02)

**Branch:** `dynamic-studio-update`
**Scope:** CSS-only. `dynamic-studio-v2.component.css` + `app.component.css` (host toolbar). No HTML/TS changed. No backend/data-flow changes.
**Goal:** make the studio responsive across phone / tablet / laptop-zoom / desktop.

---

## Zoom-stable STARLABS host toolbar (2026-07-02, added later)
Operator: "starlabs topnav should be fixed height even when zoomed." The host `.toolbar` (app.component.css, shown on EVERY screen) was `height: 64px` — but px scales with browser zoom, so at 150% zoom the bar became ~96px physical and looked chunky. Fixed by sizing the bar AND its content in **viewport units** (same zoom-stable trick the studio chrome uses): `vh` shrinks in CSS-px as you zoom in, cancelling the scale → constant physical height. Validated live in Chrome at the operator's actual 150% zoom (`innerHeight` 575): toolbar = `42.57px` CSS = **~64px physical** (identical to 100%), studio `--host-toolbar-h` offset tracks it exactly (gap 0), all visible content fits (spans 1–41px inside the 0–43px bar; the only "overflow" is Material's invisible `.mat-mdc-button-touch-target` a11y hit-area).

### Revert guide — host toolbar (all in `app.component.css` unless noted)
| Change | Where | Revert to |
|---|---|---|
| Bar height | `.toolbar` + `.toolbar .mat-toolbar-row`/`.mat-toolbar-single-row` height/min/max | `64px !important` (all three) |
| Studio offset (sync) | `--host-toolbar-h` in **dynamic-studio-v2.component.css** `.ds-app` | `64px` |
| Logo | `.title` font-size | `1.5rem` |
| Notif/settings/hamburger button font | BOTH `.menuicon` blocks (~line 44 and ~line 308) font-size | `36px !important` |
| Header icon glyphs | new rule `.toolbar .header .mat-icon,mat-icon` | delete rule (Material default 24px) |
| Profile name | `.toolbar .header .profile-name` font-size | `14px` (from the base `.profile-name` rule) |
| Avatar img | new `::ng-deep .toolbar .header .profile-img` | delete rule (falls back to inline `[size]="32"`) |
| Icon-buttons | new `.toolbar .mat-mdc-icon-button` size rule | delete rule (Material default ~48px) |

Clamp expression used everywhere: bar `clamp(40px, 7.4vh, 64px)`; content anchored to original px at ~865px-tall viewport (7.4vh≈64 at innerHeight 863). Floor 40px caps zoom-stability at ~160% zoom (beyond that the bar grows again — unavoidable with a min).

---

## High-zoom (~175% ≈ 460px tall) → pinned two-column + compact chrome (2026-07-02, added later)
Operator zoomed to 175% (viewport 864×460) and wanted the layout to "adjust to give more space for the content" + "make the top bar compact." Changes:
1. **Stay pinned, go two-column:** lowered the wide-short two-column breakpoint `min-width:900px → 760px` (dynamic-studio-v2.component.css) so an 864-wide zoomed viewport keeps the sidebar-left layout (content gets its own full-height column). Lowered the un-pin threshold `max-height:460px → 380px` in BOTH dynamic-studio-v2.component.css AND src/styles.css (kept in sync) so 460px stays a pinned workspace instead of becoming a scroll page; only ≤380px un-pins.
2. **Compact chrome at `@media (max-height:560px)`:** top bar → single row (hide `.ds-waiting-sub`, shrink icon, tighten buttons + padding: 55px→41px); stage-note → 1 line (`.ds-app.dyn-studio-v2-app .ds-stagenote__text.is-clamped{-webkit-line-clamp:1}` — higher specificity needed to beat the base 2-line rule defined LATER in the file); trimmed step-header/eyebrow/main-scroll/footer.
Result (validated live at 864×460): content scroll area **148px(stacked)→281px**, top bar 41px, footer pinned, no h-overflow.
**Revert:** min-width 760→900; max-height 380→460 (both files); delete the `@media (max-height:560px)` block.

## Stage switch didn't reset scroll (2026-07-02, added later)
Operator: switching stages while scrolled down showed the new stage mid-content, not its top. Cause: the step content swaps via `*ngIf` inside a single persistent scroll container (`.ds-main-scroll`), so its `scrollTop` carried over. Fix (TS + HTML): added `#dsMainScroll` ref + `@ViewChild`, and a `scrollMainToTop()` (immediate + `setTimeout` after render; handles the un-pinned page-scroll mode too) called at the end of `setActiveStep()` and `goToStep()`. Validated live: scrolled Zoom Session to 319px, switched to Prescribe ATC (scrollHeight 1417, could-have-scrolled) → destScrollTop 0.
**Revert:** remove the two `this.scrollMainToTop()` calls + the method + the `dsMainScroll` ViewChild + the `#dsMainScroll` template ref.

## Bonus-activity name in sidebar roster (2026-07-02, added later)
Operator: "for the bonus activity show the activity name also." The sidebar "With <specialists>" line (`.ds-side-specialists__names`) only showed each bonus specialist's `name`; the redesign had dropped the activity that the old header showed. Restored it: `dynamic-studio-v2.component.html` now renders `{{ sp.name }}<span class="ds-side-specialists__role" *ngIf="sp.activity"> ({{ sp.activity }})</span>` (data already on `additionalSpecialists[].activity`, resolved from `liveAssignment.bonusactivity` via `mapActivity`). Added `.ds-side-specialists__role{color:var(--ink-3);font-weight:600}` (muted). Validated live: "Dharshan S (Changework Shadow)".
**Revert:** drop the `<span class="ds-side-specialists__role">` from the ngFor and delete the `__role` CSS rule.

**Follow-up (multi-specialist roster):** with several bonus specialists the single comma-wrapped "With …" line got messy. Restructured `.ds-side-specialists` (HTML + CSS) into a `flex-direction:column` block: a "With · N" header (`__head` + `__label`, uppercase, shows count when >1) over a one-per-line `<ul>` list (`__list`/`__item`/`__name`/`__role`). Two-column profile-card overrides (min-width:1025 + wide-short) now `align-items:center;text-align:center` the roster (replaced the old `__names` white-space override, which no longer exists). Validated live at 864×460 with 3 specialists — clean centered roster, block ~101px, no overflow. **Revert:** restore the old single `__names` span markup + the inline `.ds-side-specialists{display:flex;align-items:center}` / `__names` CSS and the `justify-content:center;flex-wrap:wrap` overrides.

## Sidebar identity → vertical profile card (2026-07-02, added later)
Operator: "in the sidenav, place the image and below name, time at uP! and specialists, product." The `.ds-side-id` was a horizontal row (avatar LEFT, text right). Changed to a centered vertical stack (avatar on top, then name / "…at uP! · product" / "With <specialists>" beneath) — CSS-only, no HTML change (the markup already nests avatar + `.ds-side-idbody`{name, sub, specialists}). Applied only in the TWO-COLUMN cases: `@media (min-width:1025px)` + the wide-short block, each adding `.ds-side-id{flex-direction:column;text-align:center}` + centered specialists + name-wrap. The stacked ≤1024 band keeps the compact avatar-beside-name row (base rule untouched). Validated live at 1512×807.
**Revert:** remove the `.ds-side-id{flex-direction:column…}` / `.ds-side-idbody` / `.ds-side-specialists` rules from those two blocks.

## Desktop sidebar — center content on tall windows (2026-07-02, added later)
Operator: "the sidebar looks very empty spaces." On a TALL desktop (>1024px) two-column window the sidebar far exceeds its content (identity + 6 steps ≈ 436px), dumping all the void at the BOTTOM (measured 16px above / 884px below at 1330×1400). Fix (`@media (min-width:1025px)`): `.ds-side { justify-content: safe center }` + roomier `gap`/step padding, so identity+steps center as one group → balanced whitespace (validated: 404px above / 404px below at 1400h; at 807h it's a tidy ~146/152). `safe center` prevents top-clipping if content ever exceeds the sidebar on a short window. Only affects desktop two-column; stacked/wide-short/phone untouched.
**Revert:** delete that `@media (min-width:1025px)` block.

## Stacked layout → steps on the identity row (2026-07-02, added later)
Operator screenshot at a taller zoom (~1010×760: `≤1024` width but `>720` height, so the two-column-short rule below does NOT apply → it stacks). There the identity and the session-steps each took a full row, wasting the wide horizontal space. Fix (in the existing `@media (max-width:1024px)` block): `.ds-side` → `flex-direction:row; flex-wrap:wrap`, identity `flex:0 1 auto` (left), `.ds-side-steps` `flex:1 1 340px` (right, chips wrap). So identity + steps share ONE row; they only wrap to two rows when too narrow (small tablets/phones). Validated live via a 1010×760 iframe: `stepsOnSameRowAsName:true`, content scroll area 403px.
**Revert:** in that `@media` block restore `.ds-side` to `flex-direction:column`-default (`border-bottom` only) and drop the `.ds-side-id`/`.ds-side-steps` flex rules.

## Wide-but-short viewport → keep two-column (2026-07-02, added later)
Operator zoomed a 1512px desktop to ~150% → 1008×538 CSS px. That hit the `≤1024` breakpoint and **stacked** (topbar→identity→steps→note→content→footer), crushing the scroll area to **148px**. Fix (dynamic-studio-v2.component.css, right after the `≤1024` block): a new `@media (min-width:900px) and (max-width:1024px) and (max-height:720px)` restores the two-column `sidebar | topbar/main/footer` layout + vertical step list. Validated live at 1008×538: content scroll area **148px → 326px** (2.2×), sidebar holds identity + 6 steps with no overflow. Genuine tablets/phones (<900px) and tall windows (>720px) keep stacking. Sidebar widened to `clamp(184px,19vw,300px)` (was 16vw≈161px, which truncated the participant name) and `.ds-side-name` set to `white-space:normal` so the name wraps instead of showing an ellipsis.
**Revert:** delete that `@media` block.

## What was already responsive (left as-is)
The **live workspace** (`.ds-app` grid: `.ds-side` sidebar + vertical stepper, `.ds-topbar2`, `.ds-main`, `.ds-footer`) was already heavily responsive before this session:
- `clamp()`-based "zoom-stable chrome" sizing on sidebar/topbar/footer (fonts, icons, buttons, avatar).
- Breakpoints: `≤1024px` stacks to topbar → sidebar → main → footer and turns the vertical stepper horizontal-wrap; `≤680px` compacts; `≤640px / ≤460h` **un-pins** the fixed shell into normal document flow so the host page scrolls.
- Content breakpoints at 1440/1180/1024/720px tune density; zoom/short-height handled by `max-height` queries.

## What was NOT responsive → fixed this session
The **pre-live screens** (lobby, studio-list, waiting-list) render OUTSIDE the `.ds-app` grid and had almost no breakpoints. The waiting stages used Bootstrap `.col-sm`, which keeps every stage on one row until 576px — cramped on tablets.

---

## Per-screen revert guide

### Pre-live: Lobby + Waiting List · responsive · DONE 2026-07-02
All in `dynamic-studio-v2.component.css`.
| Change | Where | Revert to |
|---|---|---|
| Lobby grid min-width | `.studio-grid` `grid-template-columns` | `repeat(auto-fill, minmax(320px, 1fr))` |
| Waiting stages → wrapping grid | new rules `.mainscreen > div > .row` + `.mainscreen [data-testid=studio-stage-col].col-sm` (after `.stagequeue`) | delete both rules — reverts to Bootstrap `.row`/`.col-sm` behaviour |
| Pre-live @media 900px | new block (end of file) — stage grid min 260px | delete block |
| Pre-live @media 640px | new block (end of file) — `.mainscreen` padding, single-col stages, wrap `.checkin-card`, tighter `.ds-lobby/list` titles, full-width `.otherstudio` buttons | delete block |

### Live workspace: topbar actions on phones · DONE 2026-07-02
| Change | Where | Revert to |
|---|---|---|
| Phone topbar stacking | new `@media (max-width: 640px)` block placed right after the `≤640/≤460h` un-pin block (before `/* ===== MAIN */`) — stacks `.ds-topbar2__left/__right`, grows buttons to full tap targets | delete block |

**Full revert of this session:** `git checkout <pre-branch> -- "src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.css"` (only that file changed).

## Cross-browser validation — DONE 2026-07-03 (Chrome + Safari + Firefox)
The connected browser MCP (claude-in-chrome) is **Chrome-only** and the live studio is auth-gated, so Safari/Firefox couldn't reach the real live view. Validated cross-browser instead via a **static harness** (`_xbrowser/`, since removed): a no-auth page that `<link>`s the REAL committed `app.component.css` + `dynamic-studio-v2.component.css` and renders the studio markup (toolbar, two-column .ds-app, profile card + 3-specialist roster, stepper, topbar, footer) inside iframes at 1180×640 (desktop), 864×460 (≈175% zoom), and 390×640 (phone). Served via `python3 -m http.server`, opened in all three browsers.
- **Chrome (Blink):** baseline — all three sizes correct.
- **Safari (WebKit):** desktop two-column + high-zoom short — pixel-matches Chrome (grid areas, `clamp()`, `safe center`, profile card + roster all correct).
- **Firefox (Gecko):** phone stacked + desktop — renders correctly (stacking, roster, step-chip wrap, zoom-stable toolbar).
No engine divergence. Confirms the feature set (CSS grid/`grid-template-areas`, flexbox, `clamp()`/`min()`, `dvh`+`vh` fallback, `:has()` only in styles.css scroll-lock which all three support) is safe across Blink/WebKit/Gecko.

## Verification note — DONE 2026-07-02 (live, Chrome MCP)
Validated against the **real live session** (Vignesh S) on `localhost:4200/dynamicstudio` while logged in.
- Chrome MCP pins its screenshot viewport at 1512px, so `resize_window` / zoom-keys don't move the media-query breakpoints. Worked around it by loading `/dynamicstudio` in a **same-origin iframe** resized to each device width — the iframe gets its own viewport, so the component's `@media` rules evaluate against the iframe width (identical to how browser zoom scales the CSS-px viewport).
- **386px** (phone / heavy zoom): grid stacks `topbar/sidebar/main/footer`, `position:static` (un-pinned), step list `flex-direction:row` (chips wrap), topbar buttons fill rows. `scrollWidth==clientWidth` → **no horizontal overflow**.
- **764px** (tablet / ~200% zoom): stacked, still `position:fixed`, 6 step-chips one row, all 3 action buttons one row. No overflow.
- **1196px** (laptop): two-column `sidebar | topbar/main/footer`, cols `191px + 1004px`, vertical stepper. No overflow.
- Cross-browser: validated **Chrome (Blink)** live via the Chrome MCP, and **Safari (WebKit)** via a self-contained DOM+CSS snapshot. Technique for Safari: the browsers-tier is "read" (screenshot-only, no login), so Safari can't reach the auth-gated app. Worked around it by exporting a snapshot from the live Chrome session — grabbed the component's inlined `<style>` (dev-mode `<style>` tag containing `.ds-vstep`, ~149KB, has the emulated-encapsulation `_ngcontent` attrs) + the live `.ds-app` outerHTML (matching attrs) + Google-Fonts links, wrote it to `snapshot.html`, and rendered it in Safari inside fixed-width iframes (390/768/1200) via a tiny CORS python server (Chrome POSTs the snapshot to it; avoids the MCP tool-result content filter that blocks raw HTML with query strings). Safari rendered **identically to Chrome** at all three widths: 1200px two-column, 768px stacked single-row topbar + 6 chip-row, 390px un-pinned wrapped. **Firefox (Gecko)** — was not installed; installed it via `brew install --cask firefox` (cleared quarantine with `xattr -dr com.apple.quarantine`), then rendered the same `snapshot.html` with Firefox **headless screenshot mode** (`firefox --headless --profile /tmp/ffprof --window-size=W,1100 --screenshot out.png URL`) at 390/768/1200 — no display or computer-use grant needed (the computer-use grant dialog for Firefox kept timing out, and shell `screencapture` is blocked by TCC). Gecko rendered **identically** to Blink/WebKit at all three widths. CSS features used (grid, flexbox, `clamp()`, `min()`, `grid-template-areas`, `dvh`+`vh` fallback, no `:has()`) — all cross-engine safe. **Result: 3 engines × 3 widths all pass, zero horizontal overflow.** All snapshot/harness/PII files deleted after (they contained the live participant name).

**Still pending (couldn't reach while a live session is active):** live QA of the PRE-LIVE screens (lobby grid, waiting-stage columns, check-in card) at phone/tablet widths — those only render when `liveAssignment == null`. Their responsive rules are code-reviewed but not yet screenshotted.

## Surprises / gotchas
- Several OLD media queries still reference the pre-redesign classes (`.ds-header`, `.ds-stepbar`, `.ds-hstep*`) that no longer exist in the template (workspace was moved to `.ds-side` + `.ds-topbar2`). They are now dead but harmless — left in place to avoid scope creep. Candidate for a later cleanup.
- `.mainscreen > div > .row` is safe because there is exactly ONE `class="row"` in the template (waiting stages, ~line 159); all other rows are `form-row`/`zoom-link-row`/etc.
