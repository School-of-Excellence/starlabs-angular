# Zoom ClientView — Safari grey strip hiding controls (2026-07-05)

**Reported:** In Safari a grey strip sits at the bottom of the Zoom call and hides the
control bar (Unmute / Video / Participants / … / Leave). Chrome shows the controls fine.
Question was also: "is anything written for Safari specifically?" — yes, two blocks.

## Where the Safari-specific code lives

NOT in the component (`src/app/queue system/zoom-clientview/*`). It's in **global `src/styles.css`**:
- `styles.css:268` — `body:has(#zmmtg-root) { background: #000; }` — paints the page black behind
  the under-sized Safari gallery so the bottom gap reads black, not white. (See
  [[reference_zoom-clientview-template-load-bearing]] / the 2026-07-04 h1 journal.)
- `styles.css:327-373` — `@supports (-webkit-hyphens: none)` (Safari-only) — pins the Zoom footer
  control bar to the viewport bottom and forces it visible. THIS is the fix for this bug.

## Root cause (verified against Zoom SDK 6.1.0 CSS in node_modules)

The footer control bar is Zoom's `.footer.main-footer` (real combined class — confirmed
`className: a()("footer main-footer", …)` in `zoomus-websdk-main-client.umd.min.js`). Its CSS:
- `.footer { position:absolute; bottom:0; height:52px; background:rgba(0,0,0,.698); z-index:200 }`
  → translucent black = **reads as a grey strip** over the video.
- `.footer__hidden` / `.footer__hidable { transform: translateY(52px) }` → Zoom's auto-hide slides
  the bar down by its own height after mouse inactivity.
- Newer meetings can render a `.footer-tesla` bar (`background:#000; height:130px; position:relative`)
  instead — the old selector matched neither.

The first Safari fix pinned `.footer.main-footer` with `position:fixed; bottom:0` and forced
`visibility/opacity`, but did NOT override the `translateY(52px)` transform. With `position:fixed`,
that transform pushes the bar 52px BELOW the viewport → controls vanish, leaving only the grey strip.
And it never touched `.footer-tesla`.

## Fix attempt 1 — CSS (partial / probably not the real cause)

Hardened the existing `@supports (-webkit-hyphens: none)` block in `styles.css` (Safari-only,
so Chrome — confirmed working — is untouched):
1. Added `transform: none !important` to defeat the auto-hide slide.
2. Extended every rule to also cover `.footer-tesla`.
3. Painted the bar solid `rgba(0,0,0,0.92)` so it reads as a real control bar, not a translucent smear.

After hot-reload the strip looked the same in Safari → the CSS pin wasn't the whole story.

## Key finding (from user testing) — it's a layout re-measure, not just CSS

User: **the strip shows on load in BOTH Chrome and Safari; Chrome hides it after loading, Safari
doesn't.** Screenshot math: host bubbles at `bottom:132`/`88` put the viewport bottom ~y844, and the
control bar area at y800–844 is a black strip with the page background (white) showing below — i.e.
the meeting content is measured SHORTER than the viewport and never re-measured in Safari. Chrome
fires an internal reflow on join that snaps the client-view to the true viewport height; Safari does
not.

## DECISION — it's a regression; revert yesterday's Safari changes

User: **"it doesn't have this strip before, but some yesterday's/today's change made it like that."**
Attempts 1 & 2 didn't clear it. `git log -S` shows BOTH Safari CSS blocks
(`body:has(#zmmtg-root){background:#000}` + the `@supports (-webkit-hyphens: none)` footer pin) were
added yesterday **2026-07-04 in commit `1a7269f`** ("Studio & zoom-clientview UI updates") — and that
commit's OTHER zoom changes are cosmetic (recording-popup text wrap, leaveUrl → /queue-web), so those
two CSS blocks are the only layout-affecting change. Tellingly, the `body:has` rule was meant to make
the bottom strip BLACK but the screenshot shows it WHITE → the rule isn't even taking effect (likely
the component's nested `<body>` template means `body` is shorter than the viewport and the `<html>`
white shows below it). So yesterday's "fix" introduced/worsened the strip rather than curing it.

**Action (this session, 2026-07-05):** removed all of it to restore the pre-`1a7269f` state —
- `styles.css`: deleted both the `body:has(#zmmtg-root){background:#000}` block AND the whole
  `@supports (-webkit-hyphens: none)` footer block (41 lines).
- `zoom-clientview.component.ts`: removed the attempt-2 `forceZoomReflow()` + its call.
Awaiting user confirmation in live Safari that the strip is gone. NOT yet committed.

If reverting does NOT clear it, the strip predates `1a7269f` and I need the console-snippet DOM dump
(footer element class + rect + zmmtg-root height vs innerHeight) to target the real container.

## RESULT of the revert + the actual fix

After the full revert the strip turned **WHITE** and was still present → it is **structural** (Safari
under-sizes the Zoom gallery a hair below the window), NOT purely a yesterday-CSS artefact. Yesterday's
`body:has(#zmmtg-root){background:#000}` was the right idea but only painted `body`; the component's
nested `<body>` is shorter than the viewport, so the `<html>` element's default white showed below it
= the persistent strip.

**Actual fix (color-only, no layout change → cannot clip video/names):**
```css
html:has(#zmmtg-root),
body:has(#zmmtg-root) { background: #000; }
```
Added `html` so the black reaches the true viewport bottom. Did NOT re-add the `@supports` footer
`position:fixed` block (that was a separate, unverified change and possibly harmful). Awaiting live
Safari confirmation that the strip now blends to black. If a truly gap-free result is wanted (not just
blended), that needs closing the Zoom container height in Safari — deferred, higher risk (name-clip).

User confirmed the strip turned white→black — but ALSO that the strip is HIDING the CONTROLS (they're
still clickable underneath). So black paint only masked the symptom; the control bar is genuinely
displaced. Root cause found in the SDK CSS:

`#zmmtg-root { width:100%; height:100%; position:fixed; top:0; left:0; background:#000 }`

A `position:fixed` element with `height:100%` is a known Safari weak spot — Safari resolves it a
toolbar-height SHORT of the visual viewport (Chrome fills it). So #zmmtg-root ends ~50px above the
true bottom, the Zoom control bar sits up there, and the page bg shows as a strip below/around it.

**Fix (2026-07-05, Safari-only):** pin #zmmtg-root top-to-bottom so it reaches the real viewport
bottom —
```css
@supports (-webkit-hyphens: none) {
  #zmmtg-root { bottom: 0 !important; height: 100vh !important; height: 100dvh !important; }
}
```
`100dvh` = dynamic viewport height (excludes the Safari toolbar); `bottom:0` stretches the fixed box.
Height/inset only — NOT background (that hides controls). Kept the `html,body{background:#000}` paint
as belt-and-braces. Awaiting live Safari confirm that the controls now sit at the true bottom with no
strip. If it still fails, need the strip element identity (right-click strip → Inspect) — it may be a
separate overlay, not the #zmmtg-root gap.

### Screen — Zoom ClientView · Safari bottom strip · PENDING SAFARI VERIFY 2026-07-05
- **Files/rules in `src/styles.css`:** (1) `html:has(#zmmtg-root),body:has(#zmmtg-root){background:#000}`
  (blend). (2) `@supports(-webkit-hyphens:none){ #zmmtg-root{ bottom:0; height:100dvh } }` (the real fix).
- **Revert:** delete rule (2) first if it clips video; delete (1) to restore white strip. Earlier
  `@supports` footer block + `forceZoomReflow()` already gone.
- **Risk:** low — Safari-only, meeting-route scoped, matches the height Chrome already uses.

## (superseded) Fix attempt 2 — force the reflow

`zoom-clientview.component.ts`: added `forceZoomReflow()` and call it in the `ZoomMtg.join` success
callback (right after `isJoined = true`). It dispatches `window.dispatchEvent(new Event('resize'))`
at 0/150/400/800/1500/3000 ms so the Zoom client-view recomputes its height to the real viewport as
its DOM settles over the first few seconds after join — reproducing what Chrome does natively.
Standard Zoom Web SDK Safari remedy. Keeps the CSS hardening from attempt 1 as a belt-and-braces.

## Verification

**NOT verified in Safari** — the view is Firebase-auth + live-Zoom-meeting gated, and the
Chromium preview cannot render `@supports (-webkit-hyphens: none)` rules at all. Needs eyeballing on
a live Safari call: controls visible + clickable at the bottom, no grey strip, and (regression check
per the load-bearing template note) participant name labels on video-off tiles not clipped.

### Screen — Zoom ClientView · Safari footer grey strip · PENDING SAFARI VERIFY 2026-07-05

- **Files:** (1) `zoom-clientview.component.ts` — `forceZoomReflow()` + its call in the join-success
  callback (the primary fix). (2) `src/styles.css` — hardened Safari `@supports` block (~line 346).
- **Revert:** (1) delete `forceZoomReflow()` and its call after `isJoined = true`. (2) restore the
  previous single-selector CSS block (only `.footer.main-footer`, no `transform: none`, no
  `background-color`, no `.footer-tesla`). The `body:has(#zmmtg-root){background:#000}` line is
  separate — leave it.
- **Risk:** low. The resize dispatch is a no-op in browsers that already lay out correctly (Chrome);
  the CSS is Safari-scoped. If it clips name labels or breaks the tesla layout, revert the CSS hunk.
