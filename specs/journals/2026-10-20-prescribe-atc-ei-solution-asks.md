# 2026-10-20 — EI Solution asks in prescribeATC

**Plan:** `specs/plans/2026-10-20-prescribe-atc-ei-solution-asks.md`.

## Why each choice
- **Keyed on the ATC model name `EI Solution`** (`product`, case-insensitive) — that is the only signal on the
  page for "this ATC is for EI Solution"; no config flag exists yet.
- **One-key maps `{askedby: askedfor}`** — operator's explicit shape. Lowercase keys so data is stable regardless
  of display labels.
- **Only complete rows are saved**, so a half-filled row never reaches Firestore; the UI keeps at least one row.
- **Native `<select>`/`<input>`** to match the operator's mock; autosave mirrors the page's existing triggers
  (`change` / `focusout`).
- **`asks` only on EI Solution final docs** (spread), so other ATCs' documents are byte-for-byte unchanged.
- **Validation after the directive check**, using the existing `focusMissingField('atcfield-asks', …)` pattern.

## Verified (emulator, starlabs-cicd)
- Card hidden until EI Solution is picked; then 1 row, options Choose/Self/Spouse/Family/Friends.
- Two rows filled → "2 complete", "Draft saved"; draft in `firestore-atc/temporary_ATC` has
  `asks: [{"self":"for health"},{"spouse":"less anger at home"}]`; reopening the draft restores both rows.
- `tsc` + `ng build` (development) green. Final submit path not exercised (needs a full ATC); covered by code review.
