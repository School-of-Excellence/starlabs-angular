# 2026-07-05 — "Invite More Specialist(s)" now uses the lobby chips dialog

Operator: the live-studio **Invite More** dialog should match the dialog used after a studio invitation
in the lobby — the **chips design** (activity dropdown + tap-to-select specialist pills).

**Working tree only — NOT committed.** `dynamic-studio-v2.component.ts` carries unrelated prior WIP
(2026-07-04 batch the operator is keeping uncommitted), so bundling it would mix concerns. Build verified
green via the running `ng serve` (both `enter-studio-assign-component` and `dynamic-studio-v2-component`
recompile, only pre-existing warnings, no errors).

## What changed

The lobby "Participant accepted the invitation" popup is `EnterStudioAssignComponent` — it already has the
chips UI (per-activity specialist pills sourced from `big cohorts` via `activityspecialists`). The live
"Invite More" button opened the OLDER `AssignQueueStudioComponent` (mat-select dropdowns). Reused the chips
dialog for Invite More by adding an **`invite` mode** to `EnterStudioAssignComponent`:

- **enter-studio-assign.component.ts** — new `mode: 'enter' | 'invite'` (default `'enter'`) + overridable
  copy (`title`, `subtitle`, `cta`, `headerIcon`, `optionalTitle`, `optionalHint`,
  `optionalShowOptionalTag`). Defaults reproduce the original 'enter' popup verbatim (backward compatible;
  the lobby caller passes no mode). In `invite` mode: no studio-mandatory *required* rows — the whole
  dialog is the optional add-specialist flow (prefills rows from `additionalactivities` if given, else one
  empty row); `canEnter` needs ≥1 specialist chosen and no half-filled row; `enterStudio()` returns ONLY
  `{ bonusactivity }` (no studio/participants payload).
- **enter-studio-assign.component.html** — bound the header icon/title/subtitle, optional-section
  label/hint, and CTA to the new properties (were hard-coded).
- **dynamic-studio-v2.component.ts `inviteMore()`** — for the "Invite More" path (`reviewSpecialist ==
  false`) open `EnterStudioAssign` in `invite` mode (`title: 'Invite more specialist(s)'`, `cta: 'Add to
  Studio'`, passing `mapprofile`/`mapactivity`/`activityspecialists: activitySpecialistMap`). The
  "Confirm who attended" path (`reviewSpecialist == true`, from `moveStage`) keeps `AssignQueueStudio`
  (needs studio selection + attendance semantics). Both return the same `{ bonusactivity }` contract the
  existing merge block already consumes — no downstream change.

**Behaviour note:** invite-mode specialists are cohort-scoped per activity (same source as the lobby
dialog), whereas the old AssignQueueStudio listed all profiles. This is intended — the operator asked to
reuse the lobby chips dialog, which is inherently cohort-scoped.

## Verification
- Build green (ng serve recompiles both components, no errors).
- Chips UI rendered in a static harness (`.preview-demo/esa-invite.html`, links the real
  `enter-studio-assign.component.css`): group_add header, title/subtitle, "Choose activity & specialist(s)"
  with activity dropdown + tap-to-select pills (selected = purple + check tick), "Add Other Specialists",
  "Cancel / Add to Studio" footer. Live dialog is auth-gated so not driven end-to-end; result contract is
  identical to the prior dialog so the write path is unchanged.

## Revert
- `dynamic-studio-v2.component.ts inviteMore()`: restore the single `openAssignQueueStudio({...})` call
  (both branches) — i.e. drop the `if (!reviewSpecialist) openEnterStudioAssign(... mode:'invite' ...)`.
- `enter-studio-assign.component.*`: the added mode/copy is backward-compatible; to fully revert, remove
  the `mode`/copy fields + the `if (this.mode === 'invite')` branches and re-hard-code the template
  strings.
