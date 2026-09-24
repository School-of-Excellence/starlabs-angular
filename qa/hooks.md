# Hooks (data-testid map)

Literal `data-testid` strings only — no `${interpolation}` (gate section 1.1 / item 2).

## journey-coach-health-dashboard (JC Health)
| testid | element | contract |
|---|---|---|
| viewing-coach-select | Summary/Participants "Viewing" coach `<select>` | jc-health-3fixes |
| participants-table | Participants `mat-table` | jc-health-3fixes |
| sched-jc-col | Summary Schedule — Journey Coaching column | jc-health-3fixes |
| sched-ob-col | Summary Schedule — Onboarding column | jc-health-3fixes |
| sched-jc-overdue | JC overdue count tile | jc-health-3fixes |
| sched-ob-overdue | Onboarding overdue count tile | jc-health-3fixes |
| ah-needsattention-combined | A&H "Needs Attention · combined" cell | jc-health-3fixes |
| ahd-overlay | Native A&H drill overlay panel | jc-health-3fixes |
| ahd-row | A&H drill overlay row | jc-health-3fixes |

## journeycoach-dashboard (JE Dashboard) — Participant Health + drill table
| testid | element | contract |
|---|---|---|
| jcd-btn-theme | theme toggle button | je-dashboard-jc-fixes |
| jcd-lnk-gross-table | Gross "Open table" link | je-dashboard-jc-fixes |
| jcd-lnk-assured-table | Assured "Open table" link | je-dashboard-jc-fixes |
| jcd-ph-healthboard | Participant Health "Health board" link (opens new tab) | je-dashboard-jc-fixes |
| jcd-ph-tickets | Tickets tile (open-ticket count; click -> health board) | je-dashboard-jc-fixes |
| jcd-ph-needsattn-row | Outreach·top row (shows reason) | je-dashboard-jc-fixes |
| jcd-ph-needsattn-all | Outreach·top "All N" link | je-dashboard-jc-fixes |
| jcd-name-link | drill-table participant name link | je-dashboard-jc-fixes |
| event-status-filter | Participants filter panel · Event confirmation multi-select | jc-health-event-filter |
