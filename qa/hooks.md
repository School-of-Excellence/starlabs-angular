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
| jcd-pipe-board | Pipeline card board (embed only) | jc-onboarding-board |
| jcd-pipe-col-notassured | Board column: Not Assured | jc-onboarding-board |
| jcd-pipe-col-ready | Board column: Ready for Onboarding | jc-onboarding-board |
| jcd-pipe-col-scheduled | Board column: Scheduled for Onboarding | jc-onboarding-board |
| jcd-pipe-col-onboarded | Board column: Onboarded | jc-onboarding-board |
| jcd-pipe-card | Participant card on the board | jc-onboarding-board |
| jcd-pipe-card-schedule | Card button: Schedule / Re-schedule | jc-onboarding-board |
| jcd-pipe-card-onboard | Card button: Mark Onboarded | jc-onboarding-board |
| jcd-pipe-card-plan | Card button: Journey Plan | jc-onboarding-board |
| jcd-pipe-card-notes | Card button: Notes | jc-onboarding-board |

## journey-coach-health-dashboard — Overall Summary tab
| testid | element | contract |
|---|---|---|
| ov-date-month-mode | Date mode: Month | jc-overall-summary |
| ov-date-range-mode | Date mode: Range | jc-overall-summary |
| ov-date-prev | Previous month | jc-overall-summary |
| ov-date-month | Month input | jc-overall-summary |
| ov-date-next | Next month | jc-overall-summary |
| ov-date-start | Range start | jc-overall-summary |
| ov-date-end | Range end | jc-overall-summary |
| ov-date-label | Active date range label | jc-overall-summary |
| ov-viewing-select | Viewing as | jc-overall-summary |
| ov-sales | Sales by Journey card | jc-overall-summary |
| ov-sales-row | Sales by Journey row | jc-overall-summary |
| ov-sales-total | Sales by Journey total Overall | jc-overall-summary |
| ov-onboarding | Onboarding status card | jc-overall-summary |
| ov-ob-tobe | To be onboarded | jc-overall-summary |
| ov-ob-le7 | <= 7 days | jc-overall-summary |
| ov-ob-gt7 | 7+ days | jc-overall-summary |
| ov-ob-onboarded | Onboarded | jc-overall-summary |
| ov-ob-avg | Avg days from ASV to Onboarding | jc-overall-summary |
| ov-schedule | Scheduled & completed card | jc-overall-summary |
| ov-jc-today | JC scheduled today | jc-overall-summary |
| ov-jc-week | JC next 7 days | jc-overall-summary |
| ov-jc-done | JC completed in range | jc-overall-summary |
| ov-obs-today | Onboarding scheduled today | jc-overall-summary |
| ov-obs-week | Onboarding next 7 days | jc-overall-summary |
| ov-obs-done | Onboarding completed in range | jc-overall-summary |
| ov-se | Ready for SE card | jc-overall-summary |
| ov-se-pending | Ready for SE pending note | jc-overall-summary |
| ov-health | Participant health card | jc-overall-summary |
| ov-health-total | Active Ecosystem participant total | jc-overall-summary |
| ov-ah | Ask A&H & Love Letter card | jc-overall-summary |
| ov-ah-needsattention-combined | A&H Needs Attention combined | jc-overall-summary |

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
