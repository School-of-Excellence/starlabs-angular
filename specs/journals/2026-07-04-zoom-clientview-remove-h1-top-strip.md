# Zoom ClientView — remove leftover `<h1>` top strip (2026-07-04)

**Branch:** `dynamic-studio-update`
**Reported:** grey/black strips at top + bottom of the Zoom call, visible "before loading".

## Diagnosis (verified live in Chrome)
`zoom-clientview.component.html` is a **full HTML document** (`<!DOCTYPE>/<html>/<head>/<body>`) crammed into an Angular component, so Angular renders it as literal nested elements: `<app-zoom-clientview><html><head>…</head><body>…</body></html>`.

- **Top strip** = a leftover `<div><h1>Zoom ClientView Component</h1></div>` inside the nested `<body>`. Measured: block at `y:0`, ~32px, font 24px, colour `rgb(33,37,41)` on a black page bg (`styles.css:268` `body:has(#zmmtg-root){background:#000}`) → a dim grey-on-black bar. It pushed `#zmmtg-root` down to `y:48`, and showed until the Zoom SDK's full-screen `#zmmtg-root` overlay covered it (hence "before loading").
- **Bottom strip** = the black page bg showing where Zoom sizes its gallery slightly under window height (documented Safari quirk, `styles.css:257-268`) — left as-is (already painted black, not white).

## Fix (Fix 1 only)
Removed just the `<div class="d-flex flex-row justify-content-center"><h1>…</h1></div>` block. Nested `<body>` left INTACT (per [[reference_zoom-clientview-template-load-bearing]] it's load-bearing for the Safari gallery). Verified in Chrome: `h1StillPresent:false`, `#zmmtg-root` now starts at `y:0`.

## Per-screen revert guide
### Screen — Zoom ClientView · remove top-strip h1 · DONE 2026-07-04
`zoom-clientview.component.html`: deleted the `<div class="d-flex…"><h1>Zoom ClientView Component</h1></div>` right after `<body>` (replaced with a comment). **Revert:** restore that div+h1.

## Pending / follow-ups
- **Not verified in Safari** — the meeting link used for the check was expired, and Safari verify needs a live meeting + user reload. The change is low-risk (h1 was inert boilerplate) but Safari gallery/name-labels/controls should be eyeballed on next live Safari session.
- **Fix 2 (deferred):** de-scaffold the template fully (drop `<!DOCTYPE>/<html>/<head>`, keep/replace nested `<body>`) — bigger, Safari-sensitive; not done.
- **Bottom strip (deferred):** Zoom Safari gallery under-sizing; mitigation (black paint) kept. Truly removing it risks re-hiding Safari controls (`styles.css:265-266`).
