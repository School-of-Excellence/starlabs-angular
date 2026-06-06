# OPERATOR — Queue Manager surface recon

Mapped from the REAL Angular source (production branch, files dated Jun 4 16:21).
All line numbers are 1-based against the cited file at recon time. Selectors are NOT invented;
where no stable hook exists it is listed under NEEDS-TESTID with file+line and a proposed `data-testid`.

## Components & routes

| Surface | Route | Component | Files |
|---|---|---|---|
| Live board (operator) | `/dynamicqueuemanager` | `DynamicQueueManagerCloneComponent` (selector `app-dynamic-queue-manager-clone`) | `src/app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.{ts,html}` |
| Queue admin list | (rendered inside admin shell; opens dialogs) | `QueueListComponent` (selector `app-queue-list`) | `src/app/queue system/queue-list/queue-list.component.{ts,html}` |
| B!G Planner | `/queuebigplanner?queueid=<docid>` | `BigPlannerComponent` (selector `app-big-planner`) | `src/app/queue system/big-planner/big-planner.component.{ts,html}` |
| People-Involved dialog | (modal) | `PeopleInvolvedComponent` | `src/app/queue system/people-involved/people-involved.component.{ts,html}` |
| Assign-Queue-Studio dialog | (modal) | `AssignQueueStudioComponent` | `src/app/queue system/assign-queue-studio/assign-queue-studio.component.{ts,html}` |

Route source: `src/app/app.routes.ts:177` (queuebigplanner), `:179` (dynamicqueuemanager → clone).
The B!G Planner link is built in `queue-list.component.html:25` as `routerLink="/queuebigplanner" [queryParams]="{queueid: row['docid']}"`.

Login (used by `e2e/queue/support/actors.ts loginAs`): `src/app/login/login.component.html` — `input[formcontrolname="email"]` (`:16`), `input[formcontrolname="password"]` (line ~28), submit `button[type=submit]` text "Login" (`:41`). These already-working selectors should NOT be changed.

---

## (1) SELECTOR TABLE

Legend for "Best stable selector": `T` = data-testid is REQUIRED (see section 2, element has no stable hook today); otherwise the listed selector exists in source now.

### A. Queue-list (admin queue table) — `queue-list.component.html`

| Element | Best stable selector (exists now) | Source |
|---|---|---|
| Queue table | `table[mat-table]` inside `.mainscreen .body` | html:14 |
| Filter input | `input[matInput]` after `mat-label "Filter"` (also `#filter`) | html:5-7 |
| Create Queue button | `button.queuebtn` / `getByRole('button',{name:'Create Queue'})` | html:11 |
| A row | `tr[mat-row]` (Material row; no per-row id) | html:68 |
| Row "Delivery Name" cell | column `queuename` cell text = `row.queuename` | html:32-35 |
| Row menu (⋮) | `button.editbtn[mat-icon-button]` with `more_vert` icon | html:19-21 |
| → "B!G Planner" menu item | `a[mat-menu-item][routerLink="/queuebigplanner"]` text "B!G Planner" | html:25-27 |
| → "Clone Event" item | `button[mat-menu-item]` text "Clone Event" | html:23 |
| Row edit button | `button.editbtn` with `edit` icon (calls `createQueue(row)`) | html:53-55 |
| Soft-delete toggle | `mat-slide-toggle` text "Soft Delete" | html:63 |
| Paginator | `mat-paginator` | html:75 |

NOTE: queue-list is NOT how the operator board selects a queue. The operator board has its own
"Select Queue" mat-select and "Live Queue" buttons (below). queue-list is the admin CRUD surface
and the entry point to B!G Planner.

### B. Operator board — header & queue selection (`dynamic-queue-manager-clone.component.html`)

| Element | Best stable selector | Source |
|---|---|---|
| "Select Queue" dropdown | `mat-select` under `mat-label "Select Queue"` (bound `[(ngModel)]="selectedQueue"`, `(selectionChange)="onQueueSelect()"`) | html:822-831 |
| → a queue option | `mat-option` text = `item.queuename` (from `returnQueue()`) | html:830 |
| **Total Participants label** | `getByText(/Total Participants\s*:\s*<N>/)`; value is `{{totalParticipants}}` inside `h5` next to bold "Total Participants". `*ngIf="selectedQueue != null"` | html:834-837 |
| Board header title | `h4.title` text `Queue Manager - <queuename>` | html:842 |
| **Live Queue list** container | `div` containing `.fw-bold.h5` text "Live Queue", shown when `liveQueueList.length != 0` | html:1011-1012 |
| → a Live Queue button (select queue) | `button[mat-stroked-button]` text = `live.queuename`; selected one has class `.selectedqueue` (sets `selectedQueue=live; onQueueSelect()`) | html:1013-1018 |
| Export CSV button | `getByRole('button',{name:'Export CSV'})` (`button[mat-stroked-button]` text "Export CSV", calls `exportCSV()`) | html:866-867 |
| Admin Stage button | `button[mat-stroked-button]` text "Admin Stage" (opens comms for stage `queueadmin`) | html:868-869 |
| View Timeline button | `button` text "View Timeline" | html:875-878 |
| **Filters open button** | `button[mat-icon-button]` containing `mat-icon` text `tune`, `matTooltip="Filters"` (sets `sidenavMode='filter'; snav.open()`) | html:881-887 |
| **Filter active badge** | `span.filter-btn-badge` text = `{{getActiveFilterCount()}}` (only when >0) | html:884-886 |
| Quick-links (eye) button | `button[mat-icon-button][matTooltip="Quick Access"]` with `visibility` icon | html:871-873 |
| Participant search box (board) | `input#searchBox` (`[(ngModel)]="searchFilter"`, placeholder "Search participants...") | html:1032-1035 |

### C. Operator board — stage columns & per-card move (`...clone.component.html`)

| Element | Best stable selector | Source |
|---|---|---|
| Scrolling board wrapper | `.stagebox`, `*ngIf="selectedQueue != null"` | html:1141 |
| **Stage column** | `.example-container` (one per `filteredStageQueue` entry) | html:1176 |
| **Stage column header** | `.stagename[data-stage-key="<stageKey>"]` — stageKey = `<stage>_<i>` (simple) or `<stage>_queued_<i>` / `<stage>_waiting_<i>` / `<stage>_activity_<i>` (typed). STABLE attribute. | html:1178; key built ts:1927,1946,1960,1973 |
| Stage display name | text inside header `span` = `column.stagename` (+ ` (type)` if `column.type`) | html:1180-1184 |
| **Stage displayed count** | trailing `- <span>{{column.allTokens?.length \|\| column.tokenlist.length}}</span>` inside `.stagename` header | html:1185 |
| Stage comms (message) icon | `button[mat-icon-button]` with `message` icon inside header (opens comms for that stage) | html:1186-1189 |
| Stage 24hr-activity icon | `button.stage-activity-btn` (`people_alt` icon) | html:1193-1195 |
| Token list (scroll area) | `.example-list` | html:1200 |
| **Token card** | `[data-token-id="<profile_id>"]` (= `token.profile_id \|\| token.docid`); class is `.example-box` / `.example-box-locked` / `.example-box-defaulted` | html:1202 |
| Token number value | `span` after `span.label "Token Number:"` | html:1331-1332 |
| Token name value | `span` after `span.label "Name:"` = `mapProfileData[token.profile_id].name` | html:1337-1338 |
| **Move button** (per card) | `button.move-btn` (glyph `⇄`); within the card scope. Calls `toggleMoveMenu($event,token,stagename,type)` | html:1218-1224 |
| **Move dropdown** (open) | `.move-dropdown` — rendered only for the token whose menu is open (`isMenuOpen(token)`, keyed by `showMoveMenu[profile_id]`) | html:1226; state ts:4392-4412 |
| → move dropdown search | `.move-dropdown .search-box input` (`[(ngModel)]="stageSearchTerm"`) | html:1227-1229 |
| → **move target option** (commit move) | `.move-dropdown .stage-item` button text = `targetColumn.stagename`; click calls `moveTokenToStage(token, from, type, targetColumn.stagename, targetColumn.markascompleted)` | html:1235-1239 |
| Token kebab menu | `.token-menu-wrapper .menu-btn` | html:1250-1255 |
| → Pre-Assign Token item | `.token-dropdown .menu-item` text "Pre-Assign Token" | html:1258-1265 |
| → Add/View Notes & Tags | `.menu-item` text "Add Notes & Tags" / "View Notes & Tags" | html:1267-1291 |
| → Mark as unattended | `.menu-item.checkbox-item input[type=checkbox]` ("Mark as unattended") | html:1295-1300 |

The single-token move target picker IS the `.stage-item` list inside `.move-dropdown` (NOT a mat-dialog).
After clicking a `.stage-item`, the **PeopleInvolved confirm dialog** opens (see D) before the write commits.

### D. PeopleInvolved confirm dialog (`people-involved.component.html`)

Opened by `moveTokenToStage` (clone ts:2895) for every NON-Activity target move.

| Element | Best stable selector | Source |
|---|---|---|
| Dialog title | `h5.title` text starts "Update ... Specialist" | html:2 |
| **Target (Specialist) picker** | `mat-select[formControlName="person"]` under `mat-label "Specialist"` (multiple when `option.multiperson`) | html:6-10 |
| → a specialist option | `mat-option` text = `specialist.name`, value `specialist.value` | html:8 |
| **Confirm (commit)** | `button[type="submit"]` text "submit" (calls `submit(specialist.value)`) | html:27 |
| Cancel | `button` text "Close" (calls `submit(null)`) | html:26 |

NOTE: `mentor`/`shadow` selects are commented out in the template; only `person` is live.
Returns `{person, mentor?, shadow?}` → flattened into `people_involved` (clone ts:2948).

### E. Assign-Queue-Studio control (`assign-queue-studio.component.html`)

Opened by `moveTokenToStage` when the TARGET stage is an Activity stage (clone ts:3088). This is the
"open a studio" path (creates a `live assignment`, sets pairing `status:"live"`).

| Element | Best stable selector | Source |
|---|---|---|
| Dialog title | `h5` text = data.title ("Assign Studio to the Participant") | html:2 |
| **Studio picker** | `mat-select[formControlName="selectedstudio"]` under `mat-label "Studio Specialist"` | html:4-9 |
| → a studio option | `mat-option` text = `option.name`, value `option.value` (the studio docid) | html:7 |
| Add other specialists | `button[mat-raised-button]` text "Add Other Specialists" | html:41-43 |
| Bonus activity row(s) | `div[formArrayName="bonusactivity"] > div[formGroupName=i]` with Activity + Participant selects | html:12-39 |
| **Assign (commit)** | `button[type="submit"]` text "Assign Specialist" (`[disabled]` until form valid) | html:46 |
| Cancel | `button` text "Close" (`dialogRef.close(null)`) | html:45 |

### F. Comms sidebar (`...clone.component.html`)

Opened by the per-stage message icon, the "Admin Stage" button, or `sidenavMode='comms'`.
Container: `mat-sidenav#snav` (`position=end`, `*ngIf="sidenavMode === 'comms'"`).

| Element | Best stable selector | Source |
|---|---|---|
| **Open comms** (per stage) | the stage-header message button (html:1186-1189) OR Admin Stage button (html:868-869) | — |
| Comms panel header | `.panel-header h3 b` = `selectedChatStage selectedChatStageType` | html:5-9 |
| Close comms | `.panel-header .close-panel-btn` (icon `close`) | html:10-13 |
| Stage multi-select | `mat-select[multiple]` under `mat-label "Select Stages"` (`[(ngModel)]="selectedStages"`) | html:19-26 |
| **Recipient count** | every comm button shows `(<n>)` where n = `getSelectedTokens().length`; e.g. WhatsApp btn text `Whatsapp(<n>)`. Also Participants header `Participants (<n>)`. | html:45,50,55, 171-174 |
| Whatsapp button | `button.comm-btn.whatsapp-btn` (text `Whatsapp(n)`) | html:42-46 |
| Email button | `button.comm-btn.email-btn` | html:47-51 |
| Notification button | `button.comm-btn.notification-btn` text starts "Notification(" | html:52-56 |
| BulkInvite button | `button.comm-btn` text "BulkInvite(" | html:57-61 |
| Add Tag button | `button` text "Add Tag" (`addBulkTags()`) | html:144-147 |
| Bulk Move (open panel) | `button` text starts "Bulk Move (" (`openBulkMovePanel()`) | html:148-155 |
| **Select All** | `.select-all-wrapper` (click toggles; contains `.select-all-text` text "Select All"); checked state = `.custom-checkbox.checked` via `areAllSelected()` | html:175-180 |
| Participant search (panel) | `input[placeholder="Search participants..."]` (`[(ngModel)]="participantSearchTerm"`) | html:182 |
| A participant row | `.participant-item` (click toggles selection); checkbox `input[type=checkbox]` `[checked]="isTokenSelected(token)"` | html:185-193, 247-254 |
| **Send button** | `.send-btn` text `Send <Type> to <n> participant(s)`; only rendered when `selectedCommType` set (`*ngIf="selectedCommType"`); calls `sendCommunication()` | html:160-164 |

To enable Send: pick stages in "Select Stages" → select participants (Select All) → click a comm-type
button (sets `selectedCommType`) → the `.send-btn` section appears.

### G. Filters sidebar (`...clone.component.html`)

Container: `mat-sidenav#snav` with `*ngIf="sidenavMode === 'filter'"`. Body `*ngIf="selectedQueue != null"`.

| Element | Best stable selector | Source |
|---|---|---|
| **Open filters** | the `tune` icon button (html:881-887) → sets `sidenavMode='filter'; snav.open()` | — |
| Filter panel header | `.panel-header h3 b` text "Filters" | html:363-367 |
| Close filters | `.panel-header .close-panel-btn` | html:368-370 |
| Active count + Clear-all header | `.fsb-header` shows `<n> filter(s) active — <total> participants` | html:375-381 |
| **Clear all filters** | `button.fsb-clear-btn` text "Clear all" (`clearAllFilters()`) | html:378-380 |
| Segment filter row | `.fsb-expandable` whose `.fsb-row` shows label "Filter by Segment" | html:384-395 |
| Tag filter row (open) | `.fsb-expandable` whose `.fsb-row` shows "Filter by Tags"/`<n> Tag(s)` (click toggles `tagDropdownOpen`) | html:423-434 |
| → **apply a tag** | inside `.fsb-dropdown`, `.fsb-option` whose text = `tag.name`; click `toggleTagSelection(tag.docid); onTagFilterChange()` (live filter, no Apply button) | html:445-451 |
| → tag search | `.fsb-dropdown-search input` (`[(ngModel)]="tagSearchTerm"`) | html:436-443 |
| → tag clear-selection | `.fsb-dropdown-footer button` text "Clear selection" | html:454-456 |
| **Active filter chip / badge** | in the chips row (top of board) `mat-chip` per active tag = `{{getTagName(tagId)}}` with `mat-icon[matChipRemove]`; remove calls `removeTag(tagId)` | html:1058-1060 |
| Preassigned row | `.fsb-expandable` label "Preassigned" (radio options All/Pre-assigned/Not) | html:461-494 |
| Stage Slot row | `.fsb-expandable` label "Stage Slot" | html:497-522 |
| Customer Support row | `.fsb-expandable` label "Customer Support" | html:569-596 |
| Event Participation row | `.fsb-expandable` label "Event Participation" | html:598-... |
| ATC filter options | `selectATCFilter('none'\|'validated'\|'unvalidated')` rows | html:725-749 |

Filters are LIVE (each option click re-runs `processTokensIntoStages`/`onTagFilterChange`); there is no
explicit "Apply" button. The persistent badge for "filters active" is `span.filter-btn-badge` on the
tune button (B). The removable chips live in the top chips row `mat-chip-set` (html:1049-1093).

### H. Bulk Move panel (`...clone.component.html`)

Overlay `*ngIf="showBulkMovePanel"`; opened from comms "Bulk Move" button.

| Element | Best stable selector | Source |
|---|---|---|
| Panel | `.bulk-overlay .bulk-dialog` | html:1805-1807 |
| Header title | `.bulk-header-title span` = `Bulk Move — <stage> (type)` | html:1810-1819 |
| **Target picker** | `mat-select[(ngModel)="bulkMoveTargetStageKey"]` under `mat-label "Move to Stage"`; option value = `stage.stagename` (from `availableStagesForBulkMove`) | html:1831-1844 |
| Per-participant row | `.bulk-list-row` (name = `.bulk-name`, variation `.bulk-variation`, DFU tag `.bulk-dfu-tag`) | html:1859-1865 |
| **Commit button** | `button.bulk-action-btn[mat-raised-button]` text `Move <bulkMovableCount> Participant(s)`; disabled until `bulkMoveTargetStageKey` set | html:1869-1884 |
| Close (in progress) | `button[mat-icon-button]` (icon close), disabled while `bulkMoveInProgress` | html:1820-1824 |
| Completed state | `.bulk-done` (`.done-ok` / `.done-fail`); "Done" button closes | html:1888-1903 |

Bulk move does NOT open PeopleInvolved per token: `executeBulkMove` loops `moveTokenToStage(..., prefilledPeople)`
with empty/prefilled people, suppressing the dialog (clone ts:5927-5946, and `prefilledPeople` short-circuit ts:2884).

### I. B!G Planner (`big-planner.component.html`)

Route `/queuebigplanner?queueid=<docid>`. Reads `queueid` from queryParams and sets
`selectedQueue = queuelist.find(docid==queueid)` (ts:220-222). **Most content is gated by an Event
select AND by `viewOnly`.**

| Element | Best stable selector | Source |
|---|---|---|
| Page title | `h1.main-title` text `B!G Planner - <queuename>` | html:8 |
| **"View Only" toggle** | `mat-slide-toggle[(ngModel)="viewOnly"]` text "View Only" | html:10-12 |
| **Select Event** dropdown | `mat-select[placeholder="Select Event"]` (`[(ngModel)]="selectedEvent"`, `(selectionChange)="eventSelected()"`) — main content `*ngIf="selectedEvent != null"` | html:16-25, 28 |
| → event option | `mat-option` text = `event.name`, value `event.docid` | html:21-23 |
| Participants sidenav | `.participants-sidenav` `*ngIf="!viewOnly"` (opened when `displayParticipantRole`) | html:31 |
| Cohort count | `.participant-count .count-value` = `cohortparticipantsList.length` | html:45-48 |
| A participant row | `mat-list-item.participant-item` (one per `cohortparticipantsList` entry = a profileid) | html:55 |
| Participant name | `.participant-name` = `mapProfile[invitation]` | html:80 |
| **profileStudioCount** value | within a `.participant-item`: `.stat-chip.chip-studio .stat-value` = `{{profileStudioCount[invitation]?.length \|\| 0}}` | html:89-93 |
| **profilePairCount** value | `.stat-chip.chip-pair .stat-value` = `{{profilePairCount[invitation]?.length \|\| 0}}` | html:95-99 |
| Shadows value | `.stat-chip.chip-shadow .stat-value` | html:83-87 |
| Duplicate value | `.stat-chip.chip-duplicate .stat-value` | html:101-105 |
| **Studio pairing table** | `table.roles-table[mat-table]` (dataSource `filteredStudioPairingList`) | html:273 |
| → displayed columns | `['status','participants','preassign','activities','atcModel','mandatoryActivities','actions']` | ts:147 |
| → a table row | `tr[mat-row]` (Material; no per-row id) | html:428 |
| → Participants cell | `td` (col participants) `.participant-cell` text = `mapProfile[participant]` | html:300-305 |
| → ATC chip | `.chip.chip-atc` | html:361 |
| → **Studio toggle (open/close)** | actions cell `button.action-pill` (icon meeting_room/no_meeting_room) `(click)="toggleStudio(studio)"`; `*ngIf="!viewOnly"` | html:392-398 |
| → Check-in toggle | `button.action-pill` text "In"/"Out" `(click)="toggleCheckin(studio)"` | html:400-406 |
| → Pre-assign select | actions/participants cell `mat-select[(ngModel)="studioPreAssign[docid]"]` under "Pre-Assign Token" | html:307-325 |
| Table paginator | `mat-paginator` | html:430 |

**completedToken** and **stageTokenMap** are computed (ts:549, ts:552) but have NO template binding in
big-planner.html — they are internal state only. To assert them in a test you must either drive a UI that
reflects the same numbers (e.g. operator board stage counts) or read the underlying Firestore data the
app aggregates (see section 4) — NOT the planner DOM.

---

## (2) NEEDS-TESTID list

There are currently ZERO `data-testid` attributes in `src/app/queue system/**` (grep verified).
The board already exposes two STABLE custom attributes that should be PREFERRED and need no change:
`data-stage-key` (stage column header, html:1178) and `data-token-id` (token card, html:1202).

The following elements lack any stable hook (Material-generated DOM, generic classes shared across many
rows, or text that varies with seed data). Proposed testids:

| # | Element | File | Line | Proposed `data-testid` |
|---|---|---|---|---|
| 1 | Total Participants value `<h5>` | dynamic-queue-manager-clone.component.html | 835-836 | `qm-total-participants` (put on the `<h5>` or a span around `{{totalParticipants}}`) |
| 2 | "Select Queue" mat-select | dynamic-queue-manager-clone.component.html | 824 | `qm-queue-select` |
| 3 | Live Queue button (per queue) | dynamic-queue-manager-clone.component.html | 1014 | `qm-livequeue-btn` + `[attr.data-queue-id]="live['docid']"` |
| 4 | Stage column displayed count span | dynamic-queue-manager-clone.component.html | 1185 | `qm-stage-count` (on the count `<span>`; pair with header `data-stage-key`) |
| 5 | Per-card Move button | dynamic-queue-manager-clone.component.html | 1218 | `qm-move-btn` (already scoped by card `data-token-id`) |
| 6 | Move-dropdown target option | dynamic-queue-manager-clone.component.html | 1235 | `qm-move-target` + `[attr.data-stage-name]="targetColumn.stagename"` |
| 7 | Export CSV button | dynamic-queue-manager-clone.component.html | 866 | `qm-export-csv` |
| 8 | Filters open button | dynamic-queue-manager-clone.component.html | 881 | `qm-filters-open` |
| 9 | Filter-active badge | dynamic-queue-manager-clone.component.html | 884 | `qm-filter-badge` |
| 10 | Comms Send button | dynamic-queue-manager-clone.component.html | 161 | `qm-comms-send` |
| 11 | Comms Select-All wrapper | dynamic-queue-manager-clone.component.html | 175 | `qm-comms-selectall` |
| 12 | Comms recipient count (use any comm btn) | dynamic-queue-manager-clone.component.html | 45 | `qm-comms-recipient-count` (wrap the `({{getSelectedTokens().length}})`) |
| 13 | Tag filter option | dynamic-queue-manager-clone.component.html | 445-451 | `qm-tag-option` + `[attr.data-tag-id]="tag.docid"` |
| 14 | Tag active chip | dynamic-queue-manager-clone.component.html | 1058 | `qm-tag-chip` |
| 15 | Clear-all-filters button | dynamic-queue-manager-clone.component.html | 378 | `qm-filters-clearall` |
| 16 | Bulk Move target select | dynamic-queue-manager-clone.component.html | 1833 | `qm-bulk-target` |
| 17 | Bulk Move commit button | dynamic-queue-manager-clone.component.html | 1869 | `qm-bulk-commit` |
| 18 | PeopleInvolved person select | people-involved.component.html | 7 | `pi-person-select` |
| 19 | PeopleInvolved submit | people-involved.component.html | 27 | `pi-submit` |
| 20 | AssignQueueStudio studio select | assign-queue-studio.component.html | 6 | `aqs-studio-select` |
| 21 | AssignQueueStudio submit | assign-queue-studio.component.html | 46 | `aqs-submit` |
| 22 | B!G Planner "Select Event" | big-planner.component.html | 17 | `bp-event-select` |
| 23 | B!G Planner View-Only toggle | big-planner.component.html | 10 | `bp-viewonly-toggle` |
| 24 | B!G Planner participant row | big-planner.component.html | 55 | `bp-participant-row` + `[attr.data-profile-id]="invitation"` |
| 25 | B!G Planner studios stat value | big-planner.component.html | 93 | `bp-stat-studios` |
| 26 | B!G Planner pair stat value | big-planner.component.html | 99 | `bp-stat-pair` |
| 27 | B!G Planner studio toggle (open/close) | big-planner.component.html | 392 | `bp-studio-toggle` + `[attr.data-studio-id]="studio['docid']"` |
| 28 | B!G Planner studio-pairing row | big-planner.component.html | 428 | `bp-studio-row` (add `[attr.data-studio-id]` via the row def) |

Until these land, the "Best stable selector" column in section 1 is what tests must use
(role+name, unique class, or `getByText`). Prefer the `data-stage-key`/`data-token-id` attributes that
already exist for any stage/token scoping.

---

## (3) Firestore WRITE SHAPES

All writes target the project from the Playwright config (emulator OR `slabs-queue-e2e-exdcz`); never hardcode.

### 3.1 Operator NEXT-STAGE move (single token, NON-Activity target)
`moveTokenToStage()` — `dynamic-queue-manager-clone.component.ts:2846`. A single `writeBatch`:

**a) `queue_token/{token.docid}` — `batch.update` (ts:2958)** merges `{...token, ...data}` where `data` =
```
previousstage  : <fromStage>            // dragStage.stagename
currentstage   : <toStage>              // dropStage.stagename
logdate        : serverTimestamp()
stagestatus    : "Approved"
quicknotes/cwmentoring/cwshadowing/cwperson/diagnostic*  : null
people_involved: [...person, ...mentor, ...shadow]   // from PeopleInvolved dialog (ts:2948)
arenaid        : null
liveassignmentid: null
studioid       : null
manuallymoved  : true
status         : dropType=="Queued" ? "queued" : dropType=="Waiting" ? "ready" : null   // ts:2953
```
(field defs ts:2936-2954; write ts:2958)

**b) `queue stage log/{logdocid}` — `batch.set` (ts:2964)** = the SAME `log` object plus
`logdocid`, `movedby = this.profileid`, `movedthrough = 'queue manager'` (ts:2960-2964).
NOTE collection name literally contains spaces: `"queue stage log"`.

**c) Last-stage completion (ts:2980-2984):** if the drop is the final stage, calls
`guard.updateDeliveryStatus("/queue_token/<docid>", "completed", …)` (this is the CF-observable
delivery-status path; see cf.md for the CF side-effects).

The CF-OBSERVABLE OUTPUT for an anti-circular assertion is the **`queue stage log` row** (b) — written by
the app with `movedthrough:'queue manager'`, `currentstage`, `previousstage` — and the board's re-rendered
stage counts. Do NOT assert by reading back the value the test itself wrote.

### 3.2 OPEN a studio (move INTO an Activity stage)
Same method, Activity branch — `dynamic-queue-manager-clone.component.ts:2987` onward; opens
AssignQueueStudio (ts:3088). On confirm, a `writeBatch`:

- **`queue studio pairing/{result.docid}` — update `{ status: "live" }`** (ts:3136-3138)
- **`live assignment/{liveassignmentid}` — `set` (merge)** new doc (ts:3140-3159):
  ```
  docid, pairing: result.participants, participantid: token.profile_id,
  stagename: <dropStage.stagename>, status: 'live', atcmodel,
  queueid: selectedQueue.docid, created: serverTimestamp(),
  studioid: result.docid, participantsactivity, bonusactivity, zoomlinkrequired
  ```
- **`queue_token/{docid}` — update** with `status:"instudio"`, `liveassignmentid`, `studioid`,
  `currentstage/previousstage`, `people_involved`, `manuallymoved:true` (ts:3161-3184)
- **`queue stage log/{logdocid}` — set** = same log + `movedby`/`movedthrough:'queue manager'` (ts:3186-3190)

### 3.3 CLOSE a studio (move OUT of an Activity stage)
When `dragType == "Activity"` (ts:2901 and ts:3104):
- **`live assignment/{liveassignmentid}` — update** `{ isactivitydone, status:"completed", updated: serverTimestamp() }` (ts:2908-2912 / 3110-3113)
- **`queue studio pairing/{studioid}` — update `{ status: null }`** (ts:2913 / 3114)
(If moving forward with `markascompleted != true` a `HoldAlertDialogComponent` confirm is shown first, ts:2915/3116.)

### 3.4 B!G Planner studio open/close + check-in (operator toggles)
`big-planner.component.ts`:
- **Open/close studio:** `toggleStudio(studio)` → `updateDoc("queue studio pairing", studio.docid, { studioin: !studioin })` (ts:883-887)
- **Check-in/out:** `toggleCheckin(studio)` → `updateDoc(... { checkin: !checkin })` (ts:891-895)
- **OpenVidu:** `toggleOpenVidu` → `updateDoc(... { openvidu: !openvidu })` (ts:899-903)
- **Pre-assign:** `updatePreAssigned(studioid, value)` → `updateDoc("queue studio pairing", studioid, {...})` (ts:953)

### 3.5 Misc operator writes (for reference)
- **Mark unattended:** `onCheckboxChange` → `updateDoc("queue_token", token.docid, {...})` (ts:2609)
- **Quick link save:** `setDoc("classify","queuesystem",{quicklinks:[...]} ,{merge:true})` (ts:1447)
- **Stage chat send:** `setDoc("queue generation/{qid}/stagechat/{id}", {...})` (ts:3264, 3345)
- **Export CSV:** NO Firestore write — builds CSV client-side from `stageQueue` + `fetchAllLogs()` and triggers a download (ts:3442). It READS `queue stage log` (`fetchAllLogs`).
- **Comms Send:** `sendCommunication()` branches by `selectedCommType` (ts:4189): `notification`→`sendNotification` (CF-triggering write), `whatsapp`/`email`/`appactionpending` open further dialogs (Wati / AddPendingAction). Assert via the CF/notification side-effect, not the click.

---

## (4) SOURCE OF EACH DISPLAYED NUMBER

| Displayed number | Where | Collection / field / computation |
|---|---|---|
| **Total Participants** (board) | html:836 `totalParticipants` | Sum of `stage.allTokens.length` over `stageQueue`, EXCLUDING the "Unattended Participants" stage (ts:2009-2011). `allTokens` per stage = `queue_token` filtered `currentstage==stage && delete∈{null,undefined,false} && tokenstatus=="Active"` (ts:1935), after `applyFilters` (active filters reduce it). Source stream: `queue_token where queueref==queue generation/{docid} orderBy logdate` (ts:1826). |
| **Per-stage column count** | html:1185 | `column.allTokens?.length ?? column.tokenlist.length`. For typed stages the list is split: Queued = status∈{null,queued,invited} (ts:1950); Waiting = status=="ready" (ts:1964); Activity = `liveassignmentid != null` (ts:1977). All also require `delete` falsy + `tokenstatus=="Active"`. |
| **Stage chip badge** (Stage Counts) | html:1135 `getStageCountTotal(card)` | Card docs from `stage opportunity count where queuelist array-contains queueid` (ts:1333). Total = Σ `getIndividualStageCount(stageConfig)`; per-stage looks up the matching `stageQueue` column and filters its tokens by `stageConfig.status` (waiting→ready, queued→null/queued/invited, instudio→instudio) (ts:1363-1392). |
| **Filter "active" badge** | html:884 `getActiveFilterCount()` | Count of active filter dimensions (search, segments, tags, preassigned, stageSlot, DFU, arena event, ATC, CS). |
| **Comms recipient count** | html:45/171 `getSelectedTokens().length` | Size of `selectedTokens: Set` (ts:175), populated by Select-All / per-row toggles in the comms panel. |
| **B!G Planner studios** (`profileStudioCount[id].length`) | html:93 | From `queue studio pairing where queueref==queue generation/{docid}`: per participant, push studio when `studio.studioin` truthy (ts:478-485, 494). |
| **B!G Planner pair** (`profilePairCount[id].length`) | html:99 | Same stream: per participant, push studio when `participants.length > 1` (ts:483, 496). |
| **B!G Planner shadows** | html:87 | `studio activity log where queueid==<id> && activity in shadowActivityList`, grouped by profileid (ts:511-516). |
| **B!G Planner cohort count** | html:47 | `cohortparticipantsList.length` (built from event/cohort participants, ts:243/317). |
| **completedToken** (no UI binding) | ts:549 | Count of `queue_token` (queueref==queue, tokenstatus=="Active") whose `currentstage == lastStage` (last entry of `selectedQueue.stages`). |
| **stageTokenMap** (no UI binding) | ts:552-578 | `queue_token` reduced by `currentstage` → `{ waiting, queued, instudio, total, tokenlist }` using the same status buckets as the board. |
| **B!G Planner studio-table rows** | html:273 | `filteredStudioPairingList` = `MatTableDataSource(studioPairingList)`; `studioPairingList` = `queue studio pairing where queueref==queue generation/{docid} orderBy created desc` (ts:460-462), then `filterStudios()`. |

### Underlying collections (for anti-circular seeded assertions)
- `queue generation` — queue config docs (drives queue list / Select Queue).
- `queue_token` — one per participant-in-queue; key fields `currentstage`, `previousstage`, `status` (null/queued/invited/ready/instudio), `tokenstatus` (Active/inActive), `delete`, `profile_id`, `tokennumber`, `queueref`, `liveassignmentid`, `studioid`, `people_involved`, `preassigned`.
- `queue stage log` — append-only move audit (`movedby`, `movedthrough`, `currentstage`, `previousstage`, `logdate`, `manuallymoved`). **Best CF/app-output target for the silent-data-gap invariant.**
- `queue studio pairing` — studios; `studioin`, `checkin`, `openvidu`, `status` (live/null), `participants`, `participantsactivity`, `created`, `queueref`.
- `live assignment` — open studio sessions; `status` (live/completed), `studioid`, `participantid`, `stagename`, `queueid`, `pairing`, `created`.
- `stage opportunity count` — precomputed stage-count cards; `queuelist` (array of queue docids), `stage[]`, `sequence`.

NOTE for anti-circularity: to verify a move, assert the **app/CF output** — the new `queue stage log` row
(written with `movedthrough:'queue manager'`) and/or the board's recomputed `Total Participants` / per-stage
count after the stream re-renders (use `expect.poll`, since the board reads `collectionData` async). Never
assert by reading back the exact `queue_token` field the test (or the move click) just wrote.
