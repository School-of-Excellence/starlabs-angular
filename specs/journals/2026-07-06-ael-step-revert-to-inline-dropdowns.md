# 2026-07-06 — dynamic-studio-v2 AEL step: revert slider modal → old inline dropdowns

Operator request: "in dynamic studio v2 the AEL validation dialog comes [slider modal] — I need the
old UI only, before this slider one."

## What changed

The AEL Validation step (`activeStepId === 'ael-validation'`) had evolved into two pieces:
1. an in-step **read-only** `.ael-areas` list (added 2026-07-05, see that journal's Issue 2), plus a
   **"Validate AEL"** button that opened
2. the **AEL slider modal** (`aelModalOpen`, `.ael-modal` / `.ael-slider-row`, `<input type="range">`
   per area) — introduced in commit `10ac0a7` "Redesign dynamic-studio-v2 UI to mockup".

Operator wanted the pre-slider UI back: the **old inline editor** — one `mat-select` dropdown per
crossover area, edited in place, then a single **"Mark as Validated"** button
(`updateCurrentAEL()`). No modal, no slider, no read-only pill list.

HTML-only change (`dynamic-studio-v2.component.html`):
- **Replaced** the `.ael-areas` read-only block + the slider-modal-opening `.ael-actions` button with
  the old `.ael-form` block: `.ael-field` rows each with a labelled
  `<mat-form-field><mat-select [(ngModel)]="crossover.value['value']" (selectionChange)=…'edited'>`
  over `aelLevelList` (options `startpoint---endpoint`), and the old
  `updateCurrentAEL()` action button (`Mark as Validated` / `Update Changes & Mark as Validated` /
  `AEL Validated`).
- **Deleted** the entire `AEL SLIDER MODAL` block at the bottom of the template.

No TS, no CSS edits needed:
- `updateCurrentAEL()`, `getCurrentAEL()`, `aelLevelList`, `trackById`, `trackByDocId` all still exist.
- Old CSS classes `.ael-form` / `.ael-field` / `.ael-label` / `.req` / `.ael-intro` were never removed —
  still present in the CSS, so the reverted markup styles correctly.
- `FormsModule` + `MatSelectModule` + `MatFormFieldModule` already imported.

### Now-dead code (left in place, harmless)
The slider/modal machinery is no longer referenced by the template but was **kept** to keep the diff
small and the revert clean:
- TS: `aelModalOpen`, `openAelModal()`, `closeAelModal()`, `aelBandIndex()`, `aelBandLabel()`,
  `setAelBand()`, `validateAelFromModal()`.
- CSS: `.ael-modal*`, `.ael-slider-row*`, `.ael-areas` / `.ael-area*`.
If a later cleanup pass wants them gone, they can be deleted without touching behaviour.

## Build
`ng serve` (preview, port 4310) recompiled clean: **"Application bundle generation complete"**, the
`dynamic-studio-v2-component` chunk built. Only pre-existing unrelated warnings (unused-import notices,
direct-eval in email-validation, css-nesting in journey-onboarding-detail) — none touch the AEL step.
Not verified in-browser at the AEL step: it needs an authenticated live queue session (prod Firestore
off-limits, app auth-gated) — clean compile of reused, previously-shipped markup is the proof here.

## Revert (to bring the slider modal back)
Restore, from git history at commit `f10a225` (or the state before this file), the AEL step's
`.ael-areas` read-only block + the `openAelModal()` `.ael-actions` button, and re-add the
`AEL SLIDER MODAL` (`*ngIf="aelModalOpen"`) block at the bottom of the template. All supporting TS/CSS
is still present, so it's a pure HTML restore.
