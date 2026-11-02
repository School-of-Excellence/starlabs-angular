# 2026-10-27 — Zoom recording dashboard: bulk move to Zoom trash

Screen: `/zoom-recording-dashboard` → `src/app/Communication Center/zoom-recording-dashboard/`.

| File | Change |
|---|---|
| `.ts` | `select` column first; `selectedIds`, `selectableRows` (filtered rows where `canTrash`), toggle / select-all / clear, `pruneSelection` after each data refresh, `trashSelected()` (confirm, then 2 workers calling the per-record trash endpoint, tallying moved / refused with each problem) |
| `.html` | Bulk bar: "N selected · size", **Move N to Zoom trash**, Clear, progress, refused list, Dismiss. Header select-all and row checkboxes. Hooks: `zrd-select-all`, `zrd-select-row`, `zrd-bulk-trash`, `zrd-bulk-clear`, `zrd-bulk-dismiss`. |
| `.css` | bulk bar and select column |

## Why
- **Only trashable rows are selectable.** That means completed, ✓ verified and still in Zoom (`canTrash`), the
  same gate as the per-row button. A disabled box carries the reason (`trashBlockedReason`) as its title.
- **Each record still goes through the per-record endpoint**, which re-verifies against Dropbox and Zoom
  first and refuses anything not fully backed up. Bulk is a loop over the safe path, not a new one.
- **Two at a time**, because each call re-verifies (Dropbox + Zoom reads).
- **Selections are pruned** when rows stop being trashable or are filtered out, so the bar never acts on a
  row the user can't see.

e2e: hub `comms/zoom-backup-verify.spec.ts` ZRD-15.

## Revert
`git checkout <commit-before> -- "src/app/Communication Center/zoom-recording-dashboard"`, or remove the `select`
column and the bulk bar from the `.html`, and `selectedIds` … `trashSelected` / `pruneSelection` and `'select'`
in `tableHeaders` from the `.ts`.
