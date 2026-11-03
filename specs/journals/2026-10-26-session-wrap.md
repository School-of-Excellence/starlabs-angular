# 2026-10-26 — Session wrap (2026-10-22 → 26): ATC templates end to end

Long session; the detailed WHY lives in the topic journals:
- `2026-10-15-map-appointment-role-atc.md` — role dialog, `syncAtcRoles` fix, scoped e2e cleanup
- `2026-10-22-prescribe-atc-product-check.md` — Prescribe flow, Ask / Outcomes, WiSH UI, micro-ATC hiding,
  appointment change agents
- `2026-10-23-atc-edit-view-templates.md` — Edit + View, View Prescribed prototype UI, readiness / CI fixes
- `2026-10-24-review-log.md` — Review log, storage decision, undelete, CI runs

## Done
Everything listed in PROGRESS.md "Last session changes". Both repos are pushed; CI branch suites are green (15/15,
atc 98/98); local atc 98/98.

## Found / surprised us
- **Angular forms:** re-creating controls inside a NESTED FormGroup leaves the template bound to dead controls. The
  form goes silently invalid — this was the real "Update not working".
- **`*ngFor` over `atc.data()`:** each call builds a new object, so the list re-renders without end and froze the browser.
- **Material 19 class names:** `.mat-mdc-form-field-disabled` doesn't exist (it's `.mat-form-field-disabled`).
- **Editing copies, it doesn't update in place:** Edit creates a NEW ATC doc per version. Anything that must survive
  versions either rides on a shared key (notes) or is copied — hence the live subscription and the live base for
  the new version.
- **CI broke from outside our code:** GitHub's runner image moved to Ubuntu 26.04, and a GPU download from NuGet timed
  out. An old test (PATC-09) raced only on slower runners.
- **My process gaps:**
  - I ran the readiness gate per file instead of as CI does;
  - I seeded and browsed a shared emulator mid-run.
  - The local emulator slows down after hours; `scratchpad/emu/start.sh` restarts it with a larger heap.

## Pending (next session)
- **Flutter specialist ATC view:** plan in `Breakthroughs-Achievement/specs/plans/2026-10-26-atc-wish-ei-specialist-view.md`.
- **Edit subscription UX:** what to do with an orphaned draft after an upgrade.
- **Before go-live:** deploy the appointments index.
- **Merge:** `atc-development` → `development` when approved.

## Update (later 2026-10-26)
- The Flutter specialist ATC view is dropped: the app is participant-only. The specialist draft plan was deleted. The
  work became the participant ATC screen; see `plans/2026-10-26-flutter-participant-atc-wish-ei.md` and
  `journals/2026-10-26-flutter-participant-atc.md`.
