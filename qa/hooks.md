# Hooks (data-testid map)

Literal `data-testid` strings only — no `${interpolation}` (gate section 1.1 / item 2).

NOTE (merge onto dynamic-studio-update, 2026-09-23): this screen already carried 138 hooks under the
ONE-PREFIX-PER-COMPONENT rule the readiness gate enforces (`jchd` = dashboard, `jcso` = slide-over), and
the hub specs reference them by those names. The ids below were therefore mapped onto the existing
names rather than added alongside; `qa/checks/jc-health-contract.mjs` greps the merged names.

| testid | element | contract |
|---|---|---|
| jchd-sel-002 | Summary/Participants "Viewing" coach `<select>` (was viewing-coach-select) | jc-health-3fixes |
| jchd-participants-table | Participants `mat-table` (was participants-table) | jc-health-3fixes |
| jchd-sched-jc-col / jchd-sched-ob-col | Schedule columns (were sched-jc-col / sched-ob-col) | jc-health-3fixes |
| jchd-sched-jc-overdue | JC overdue count tile (was sched-jc-overdue) | jc-health-3fixes |
| jchd-sched-ob-overdue | Onboarding overdue count tile (was sched-ob-overdue) | jc-health-3fixes |
| jchd-ahcell-tagged-both | A&H "Needs Attention · combined" cell (was ah-needsattention-combined) | jc-health-3fixes |
| jchd-ahd-overlay | Native A&H drill overlay panel (was ahd-overlay) | jc-health-3fixes |
| jchd-ahd-row | A&H drill overlay row (was ahd-row) | jc-health-3fixes |
| jchd-ahd-close / jchd-ahd-count | overlay close button / header count (added in the merge) | jc-health-3fixes |
