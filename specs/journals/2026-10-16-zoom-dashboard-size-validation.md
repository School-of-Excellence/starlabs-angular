# 2026-10-16 — Zoom recording dashboard: Zoom vs Dropbox sizes, sortable columns, "gone from Zoom" split

Screen: `/zoom-recording-dashboard` → `src/app/Communication Center/zoom-recording-dashboard/`.

| File | Change |
|---|---|
| `.ts` | `dropboxSizeFor` / `zoomNowFor` / `zoomTotal` / `dropboxTotal` / `bytesTitle`; sort accessor for Meeting (case-insensitive) and Size (Zoom total); Verify-all problems tagged `gone` when the first problem is "No longer in Zoom"; an in-flight repair counts as over after 2 h |
| `.html` | Size column shows Zoom and Dropbox totals with ✓ / ⚠; per-file Zoom vs Dropbox bytes on success; "Zoom now has X (changed since backup)"; Verify-all lists actionable failures and folds "can't be completed" ones into a `<details>` |
| `.css` | `.size-src`, `.size-ok`, `.size-bad`, `.verify-all__gone` |

## Why
- **Dropbox size prefers the last verification**, which is what is really in Dropbox now, over the size the
  upload committed. A file changed or deleted after upload therefore shows ⚠ instead of a stale ✓.
- **"Gone from Zoom" is split out** because nothing can be re-downloaded for those recordings. Listing them
  with the real failures buried the ones someone can still fix.
- **The 2 h cap** stops a repair that never ran from leaving a row "backing up" forever.

## e2e
No new interactive elements (the sort headers are `mat-sort-header`, and the size cells are display-only).
The gate is green and the comms ZRD-* cases still cover the screen. The Zoom/Dropbox mismatch display has
no behavioural case yet.

## Revert
`git checkout <commit-before> -- "src/app/Communication Center/zoom-recording-dashboard"`
