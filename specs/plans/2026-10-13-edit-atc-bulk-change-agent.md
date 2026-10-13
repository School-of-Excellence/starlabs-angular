# 2026-10-13 — Edit ATC: "Apply to all procedures" under NEW ADJUSTMENTS

Status: **APPROVED — implementing**. Same logic as Prescribe ATC
(`specs/journals/2026-09-28-prescribe-atc-apply-agent-to-all.md`), scoped to the NEW ADJUSTMENTS
section only (operator: "simple and easy"). View Prescribed ATC done 2026-10-13
(`specs/plans/2026-10-12-view-atc-bulk-change-agent.md`).

## Scope

`src/app/ATC/edit-atc/` — `.html`, `.ts`, `.css`, additions only. No `data-testid` hooks
(ATC e2e testing not started). Saved procedures, new procedures added to saved adjustments, and
the ATC submit are **unchanged**.

## Logic (identical to Prescribe)

1. One boxed section per `assignedtoActivity`, directly under the "NEW ADJUSTMENTS" heading:
   multi-select + its own **Apply to all procedures** button. Apply only touches that activity.
2. Options = `authorList` (same as the per-procedure dropdown), with separate search text per section.
3. Apply disabled until ≥1 agent is selected.
4. `confirm()` first: "Apply A, B as <Activity> to all N procedures? This will replace the current
   <Activity> on every procedure." Cancel = no change.
5. On OK: every procedure of every **new adjustment** (`newTranscription[].procedure[]`) gets
   `procedure.bigactivity[activityId] = [...selected]` — overwrite, own copy, nothing skipped.
6. Then `autoSave()` (draft `temporary_edit_ATC`).
7. Selection kept after Apply. Procedures added later start empty until Apply is clicked again.
8. The section is never saved to the draft; starts empty on reopen.
9. ATC submit already writes new-adjustment procedures' `bigactivity` + `assigned_to`
   (`edit-atc.component.ts` ~1603) — no change.

## Verification (operator — Claude does not run ATC)

1. Apply disabled with nothing selected.
2. Apply → confirm shows names, activity, N; Cancel changes nothing.
3. OK → every New Adjustments procedure shows the selection for that activity (overwriting);
   saved procedures and new procedures under saved adjustments untouched; draft saves.
4. A procedure added afterwards is empty until Apply again; selection still in the box.
5. Submit the ATC → new procedures carry the applied agents.
