# 2026-09-28 — prescribe-atc: "Apply to all procedures" for assigned_to agents

## Context

In `src/app/ATC/prescribe-atc/`, every procedure row (under every adjustment)
has its own agent multi-select per `bigActivityAssignedto` activity — i.e. per
`bigactivity` doc with `atcproperty == "assigned_to"` (e.g. "Change Agent").
The value lives on the procedure as `procedure.assignedMap[activityDocId] =
[authorpath, ...]`. When one change agent handles every procedure, the
prescriber had to pick the same agent(s) again on every row.

The operator asked for a single place to pick the agent(s) and push them to all
procedures. Logic was agreed step by step with the operator **before** any code
was written; every decision below was explicitly signed off.

## What landed

Three files, additions only (no existing lines changed):

- **`.ts`** — two page-only state maps and two methods:
  - `bulkAssignedSelection = {}` — section selection per activity docid.
  - `bulkAssignedFilter = {}` — section search text per activity docid.
  - `availableBulkSpecialistList(activityId)` — `specialistList` filtered by
    that section's own search text.
  - `applyAssignedToAllProcedures(assigned)` — `confirm()`, then overwrite
    `assignedMap[assigned.docid]` on every procedure of every adjustment with
    a copy of the selection, then `autoSave()`.
- **`.html`** — one boxed section per `bigActivityAssignedto` entry, directly
  under the "ADJUSTMENTS & PROCEDURES" heading and above adjustment 1: a
  multi-select + an "Apply to all procedures" button.
- **`.css`** — `.bulk-assign-section / -title / -row / -apply:disabled`
  (light-blue box, wrapping row, faded disabled button).

## Decisions and WHY (do not re-litigate)

- **Per-procedure dropdowns are kept.** The section is a shortcut, not a
  replacement — a single procedure can still be changed after Apply.
- **One section per `assigned_to` activity, Apply scoped to that activity.**
  The per-procedure dropdowns are data-driven (one per `assigned_to` doc), so
  the shortcut mirrors that; applying "Change Agent" must never touch another
  activity's field.
- **Multiple selection**, matching the per-procedure field.
- **Overwrite, not merge.** Apply replaces whatever each procedure had.
- **Apply button disabled until ≥1 agent is selected.** Because Apply
  overwrites, an empty Apply would silently clear the field on every procedure.
- **Native `confirm()` before the overwrite** (OK/Cancel; Cancel = no change).
  Chosen over a Material dialog because this component already uses `confirm()`
  for "Sure, Remove this adjustment and its procedures?", and the existing
  `AtcAelConfirmComponent` is submission-specific. Message names the agents,
  the activity and the procedure count.
- **Each procedure gets its own copy (`[...selected]`).** Sharing one array
  reference would make a later edit on one procedure's dropdown mutate all.
- **Separate search text, same list.** `filteredSpecialist` is shared by all
  per-procedure dropdowns (and reset by `runAutoSave()`); giving each section
  its own text keeps section searching from filtering the procedure rows.
- **Section selection is page-only — never written to the draft**, and starts
  empty on reopen (operator: "no need draft for the new field"). The saved data
  shape (`transcript[].procedure[].assignedMap`) and submit are unchanged.
- **Keep selection after Apply** so it can be re-applied after adding rows.
- **Procedures/adjustments added later start empty**; they only receive the
  agents when Apply is clicked again (no auto-inheritance).
- **Draft save via existing `autoSave()`** — same path the per-procedure
  dropdowns' `(selectionChange)` uses; no new save path. Picking in the section
  alone does not save.

## Verification

Not run, built or tested by Claude — ATC is off-limits for Claude-driven
running/testing and for the e2e pipeline (`src/app/ATC/**` excluded), so no
e2e coverage was added. Operator to verify in the app:

1. Apply disabled with nothing selected.
2. Apply → confirm shows names + count; Cancel changes nothing.
3. OK → every procedure's field for that activity shows the selection
   (overwriting prior values); "Saving to Draft..." appears.
4. Editing one procedure afterwards doesn't affect others.
5. A newly added procedure is empty until Apply is clicked again.
6. Reopened draft: section empty, procedures keep the applied agents.

## Surprises / housekeeping

- `graphify` Python module is not installed on this machine, so the
  post-edit graph rebuild could not run.
- Change is uncommitted pending operator verification (branch `offline-ATC`).

## Pending

- Operator verification in the app, then commit.
- `PROGRESS.md` rewrite at session end.
