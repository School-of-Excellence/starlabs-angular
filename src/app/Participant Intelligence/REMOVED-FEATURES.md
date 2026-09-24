# Participant Intelligence — Removal ledger

Per the JX redesign brief: every removed feature is logged here with a status + reason and kept
**revivable** (disabled/flagged, not hard-deleted).

| Feature | Status | Date | Reason | How to revive |
|---|---|---|---|---|
| Export (table / selection → XLSX) | Disabled | 2026-06-18 | Brief: export/import is explicitly out of scope for this screen (it's not a reporting tool). | Uncomment the `export / import` block in `participant-intelligence.component.ts`, re-add `import * as XLSX from 'xlsx'` and the `Participant` import, restore the `#fileInput` element + the `exportMenu` and toolbar Export button in the template. |
| Import (sample download / upload-and-select-by-email) | Disabled | 2026-06-18 | Same as above — out of scope for this screen. | Same block as Export (they share the disabled region); restore the `importMenu` + Import toolbar button + `#fileInput`. |
| "Queued emails" / "Queued WhatsApp" toolbar icons | Replaced | 2026-06-18 | Superseded by the Communications analytics popover (email + WhatsApp + notifications, status + recent campaigns) in the same toolbar spot. | They were count-only snackbars; the new popover (`components/comms-analytics-panel`) is a superset. No revival needed. |

Notes:
- The disabled Export/Import code remains intact inside `participant-intelligence.component.ts` as a single
  commented block marked `export / import: DISABLED & revivable`.
- `xlsx` and `file-saver` remain in the project (used elsewhere), so revival needs no dependency changes.
