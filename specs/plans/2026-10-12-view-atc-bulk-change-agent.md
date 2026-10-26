# 2026-10-12 — View Prescribed ATC: bulk Change Agent per activity

Status: **APPROVED logic, awaiting "implement"**. Follows the Prescribe ATC bulk apply
(`specs/journals/2026-09-28-prescribe-atc-apply-agent-to-all.md`). Edit ATC is deferred.

## Scope

`src/app/ATC/view-prescribed-atc/` only — `.html`, `.ts`, `.css`. No `data-testid` hooks
(ATC e2e testing not started — operator, 2026-10-12).

## Placement

Inside the opened ATC (`full-atc-view`, html ~line 291), above the first adjustment, `nonprintable`.
One box per opened ATC; it acts on that ATC only (the screen lists many ATCs).

```
┌─ Assign Change Agent — all open procedures ───────────────────────┐
│ [ Change Agent ▾ ]                          [ Submit ]            │
│ [ <2nd assigned_to activity> ▾ ]            [ Submit ]            │
│ Applies to N procedures (skips deleted and completed)             │
└───────────────────────────────────────────────────────────────────┘
```

## Logic (operator decisions)

1. **One row per `assignedToActivity`**: multi-select + its **own Submit**. A Submit updates only
   that activity; other activities on the procedures are untouched.
2. **Options** = `assignerList` (same list as the per-procedure "Assign Change Agent"), with its
   **own search text** per ATC × activity.
3. **Submit disabled** when that activity's selection is empty, OR until the ATC is fully loaded.
4. **"Fully loaded"** = adjustments loaded AND every adjustment's procedures subscription has emitted
   at least once. Tracked with a Set of adjustment paths: one line added in `openATC`'s procedure
   subscription (record the path on first emit) and one at the start of `openATC` (forget the
   previous paths for this ATC so a re-open waits for fresh data). Until loaded the box shows
   "Loading procedures…".
5. **Eligible procedures** = loop the procedures **already loaded on screen** (no re-query), skipping:
   adjustment `isdelete`, procedure `isdelete`, procedure `status == 'completed'` (includes
   Auto Generalized, stored as completed).
6. **`confirm()` first**: names the agents, the activity, and N. Cancel = no change.
7. **Per eligible procedure** (mirrors `onSelectProcedureEdit` + `updateProcedureValue`):
   - current agents from `bigactivity` (ids); legacy `assigned_to`-only → mapped to the first activity;
   - **replace** `bigactivity[activityId]` with the selected ids;
   - recompute `assigned_to` = union of all activities' agents (refs);
   - write **only** `bigactivity` + `assigned_to` (status / mandatory / last_activity untouched).
8. **One atomic `writeBatch`** straight to the submitted ATC (`atc_alpha` / `atc_to_validate`) —
   no draft, same as the existing per-procedure Update. Live snapshots re-render the list.
9. **Success** → clear that activity's selection. **Failure** → show the error, keep the selection.

## Verification (operator — Claude does not run ATC)

1. Submit disabled with an empty selection, and while "Loading procedures…".
2. Submit → confirm shows agents, activity, N; Cancel changes nothing.
3. OK → every non-deleted, non-completed procedure shows the new agents for that activity; other
   activities unchanged; completed and deleted procedures unchanged.
4. A legacy procedure (only `assigned_to`) keeps its agents under the other activities correctly.
5. Box clears that activity after success; close + re-open the ATC waits for load again.
