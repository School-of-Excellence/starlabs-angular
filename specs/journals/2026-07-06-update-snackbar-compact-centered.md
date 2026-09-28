# 2026-07-06 — PWA "update available" snackbar → compact + bottom-center

Operator request: the "A new version is available!" snackbar that appears at the bottom should be
**centered** and **compact** ("shouldn't take much space").

## Where it comes from
`app.component.ts` opens it via `SwUpdate.versionUpdates` →
`snackBar.openFromComponent(UpdatesnackbarComponent, {...})` (~L329). The component is
`src/app/updatesnackbar/` (icon + "A new version is available!" + "Update Now"; the "Later"/dismiss
button is already commented out). panelClass is `['update-snackbar']`.

## Changes
1. **Center** — `app.component.ts`: `horizontalPosition: 'end' → 'center'` (kept `verticalPosition:
   'bottom'`). Now bottom-center instead of bottom-right.
2. **Compact component** — `updatesnackbar.component.css`: dropped the `min-width:320px; max-width:400px`
   (→ `min-width:0`), gaps 16→10 / 8→6, icon 20→18px, message `font-size:13px; white-space:nowrap`,
   removed `flex:1` on `.update-content` so the row hugs content.
3. **Shrink the MDC shell** — `src/styles.css` (global, next to the existing `.sx-snack` block): Angular
   Material's `.mdc-snackbar__surface` has a **344px min-width** + roomy label padding, which the
   component CSS can't reach (it's outside the component view). Added global `.update-snackbar` rules:
   `min-width:auto`, surface padding `4px 6px 4px 14px`, zero `__label` padding, and a compact
   `.update-btn` (30px tall, 12px pad, 8px radius). This is what actually makes the pill hug its content.

## Verify
`ng serve` rebuilt clean (styles.css bundle +~0.4 kB, no errors). The snackbar only shows on a real SW
update, so appearance was verified with a static harness (`.preview-demo/update-snackbar.html`) that
mirrors Material's snackbar DOM (`.update-snackbar.mat-mdc-snack-bar-container > .mdc-snackbar__surface >
.mat-mdc-snack-bar-label > component template`) + the real component CSS + the global overrides:
measured 314px-wide dark pill, centered at viewport center (centerX == innerWidth/2), sitting bottom.

## Follow-up: redesigned to "design 5" (minimal dark pill)
After the compact/centered pass, operator reviewed a gallery of options and chose **design 5** — a
minimal dark pill — with the message text set to **"Update available"**.
- `updatesnackbar.component.html`: replaced the icon+message+"Update Now" layout with a green **pulse dot**
  + `Update available` + a green **"Reload"** button (refresh icon). `update()` click handler unchanged.
- `updatesnackbar.component.css`: `.update-dot` (9px green + glow ring), light message text (#EAEDF2),
  green filled button via MDC vars (`--mdc-filled-button-container-color:#39D98A`,
  label `#06251a`), 32px tall, no shadow.
- `src/styles.css` `.update-snackbar .mdc-snackbar__surface`: now dark `#15191F`, radius 13px, padding
  `9px 10px 9px 16px`, soft shadow; label color `#EAEDF2`. (Replaced the earlier neutral compact override
  and the separate blue-button rule — button styling now lives in the component.)
- Still bottom-center (`horizontalPosition:'center'`). Verified: `ng serve` rebuilt clean; harness
  (`.preview-demo/update-snackbar.html`, mirroring Material's snackbar DOM) shows the dark pill centered.

## Revert
`app.component.ts`: `'center' → 'end'`. `updatesnackbar.component.css`: restore `min-width:320px;
max-width:400px; gap:16px`, `.update-content{gap:8px;flex:1}`, icon 20px, message without
`font-size/white-space`. `src/styles.css`: delete the `.update-snackbar ...` block after `.sx-snack`.
