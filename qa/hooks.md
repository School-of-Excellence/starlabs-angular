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

## delivery-dashboard-clone (Delivery Dashboard) — Participant Management & Actions
| testid | element | contract |
|---|---|---|
| pm-tab-awaiting | Awaiting Initiation tab label | delivery-dashboard-days-waiting |
| pm-tab-awaiting-count | Awaiting Initiation count badge | delivery-dashboard-days-waiting |
| pm-tab-idle | Initiated – Not Consuming tab label | delivery-dashboard-days-waiting |
| pm-tab-idle-count | Initiated – Not Consuming count badge | delivery-dashboard-days-waiting |
| pm-tab-stuck | Stuck Cases tab label | delivery-dashboard-days-waiting |
| pm-tab-stuck-count | Stuck Cases count badge | delivery-dashboard-days-waiting |
| pm-row | participant row in the PM table | delivery-dashboard-days-waiting |
| pm-days-waiting | DAYS WAITING badge in a row | delivery-dashboard-days-waiting |
| pm-row-info | "Showing X to Y of N entries" footer | delivery-dashboard-days-waiting |

## journeycoach-dashboard — embedded in Journey Coach Health Onboarding tab
| testid | element | contract |
|---|---|---|
| jcd-embed-gross-count | Gross Sales count (embed only) | jc-onboarding-count-only |
| jcd-embed-assured-count | Assured Sales count (embed only) | jc-onboarding-count-only |
| jcd-pipe | Onboarding pipeline card (embed only) | jc-onboarding-pipeline |
| jcd-pipe-notassured | Pipeline stage: Not Assured count | jc-onboarding-pipeline |
| jcd-pipe-ready | Pipeline stage: Ready for Onboarding count | jc-onboarding-pipeline |
| jcd-pipe-scheduled | Pipeline stage: Scheduled for Onboarding count | jc-onboarding-pipeline |
| jcd-pipe-onboarded | Pipeline stage: Onboarded count | jc-onboarding-pipeline |
| jcd-pipe-journey | Pipeline Journey selector | jc-onboarding-pipeline |
| jcd-pipe-journey-all | Journey selector: All | jc-onboarding-pipeline |
| jcd-pipe-journey-opt | Journey selector: one journey | jc-onboarding-pipeline |
| jcd-name-contact | Mobile + email under the name (embed To-be-onboarded tables) | jc-onboarding-pipeline |

## jc-evprep-board — Journey Coach Health Ev. Preparation tab (kanban boards)
| testid | element | contract |
|---|---|---|
| jx-evprep-board | Board component inside the Ev. Prep panel | jc-evprep-board |
| evp-root | Board component root | jc-evprep-board |
| evp-preview | Design-preview banner | jc-evprep-board |
| evp-board | One board (data-board = new / returning) | jc-evprep-board |
| evp-board-total | Board total | jc-evprep-board |
| evp-col | One column (data-stage = stage key) | jc-evprep-board |
| evp-col-count | Column count | jc-evprep-board |
| evp-empty | Empty column text | jc-evprep-board |
| evp-card | Participant card (data-profile = profile id) | jc-evprep-board |
| evp-card-days | "In stage Nd" chip | jc-evprep-board |
| evp-card-next | Move to next stage | jc-evprep-board |
| evp-card-back | Move to previous stage | jc-evprep-board |
| evp-move | Move box overlay | jc-evprep-board |
| evp-move-note | Move note (required) | jc-evprep-board |
| evp-move-save | Save note & move | jc-evprep-board |
| evp-move-cancel | Cancel move | jc-evprep-board |
