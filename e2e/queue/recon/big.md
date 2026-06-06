# RECON: BIG surface (BIG-00 … BIG-11)

> Source of truth: `starlabs-angular/src/app/big/**` + `src/app/app.routes.ts` + `src/app/auth.guard.ts` + `src/app/authguard.service.ts`.
> All citations are `path:line` against the **starlabs-angular** repo (the worktree mirrors it).
> **There are ZERO `data-testid` attributes in the entire `src/app` tree** (verified by grep). Every selector below is class / id / formcontrolname / role+text / icon-text until the test-hooks step adds the testids in §2.
> Folder names with spaces exist in Firestore collection STRINGS (`big participants assignments`, `big cohorts log`, `big assignment manual`, `big aggregate event level`, `atcmodel level config`) — these are Firestore paths, not file paths; no Glob/grep escaping needed when they appear only inside quotes.

---

## 0. ROUTE MAP — the BIG screens (what each BIG-NN drives)

All BIG routes are registered flat in `src/app/app.routes.ts` and gated by the SAME generic `authGuard` (`auth.guard.ts:10`). There are **no per-route role arrays in code** — see §4.

| BIG-NN | Screen | Route path | Component | Route reg |
|---|---|---|---|---|
| BIG-00 | Dashboard (counts/cohorts) | `big-dashboard` | `BigDashboardComponent` | `app.routes.ts:229` |
| BIG-01 | Participant Assignment Board (PAB) | `particiant_assignment_board` *(sic, typo in path)* | `ParticipantAssignmentBoardComponent` | `app.routes.ts:233` |
| BIG-02 | Manual Assignment submit/review | `manualassignment` | `ManualAssignmentsComponent` | `app.routes.ts:236` |
| BIG-03 | Form-based submission | `formbasedsubmission` *(legacy)* / live forms use `formtemplate` | `FormBasedSubmissionComponent` (route) / `FormtemplateComponent` (live) | `app.routes.ts:231` / `:32` |
| BIG-04 | Validate participant assignments (kanban) | `validateParticipantAssignments` | `ValidateParticipantsAssignmentComponent` | `app.routes.ts:237` |
| BIG-05 | AEL upload (aggregate event level) | `bigaggregateeventlevel` | `BigAggregateEventLevelComponent` | `app.routes.ts:240` |
| BIG-06 | Aggregate level (B!G level upload) | `big_aggregate` | `BigAggregateComponent` | `app.routes.ts:242` |
| BIG-07 | Cohorts (size / audit / move) | `bigcohorts` | `BigCohortClone2Component` | `app.routes.ts:235` |
| BIG-08 | ATC-Model level config | `modellevelconfig` | `AtcmodelLevelConfigComponent` | `app.routes.ts:239` |
| BIG-09 | B!G level config | `biglevel` | `BigLevelComponent` | `app.routes.ts:238` |
| BIG-10 | Activity monitor / activity log | `bigactivitymonitor` / `bigactivitylog` | `MonitorActivityLogComponent` / `BigActivityLogComponent` | `app.routes.ts:241` / `:245` |
| BIG-11 | Zoom meeting (big participant) | `zoommeeting_bigparticipants` | `ZoomMeetingComponent` | `app.routes.ts:234` |

Embedded (no route, opened as dialog): **WatchVideos** (`WatchVideosComponent`, opened by PAB `OpenVideos`, `participant-assignment-board.component.ts:618`). **arena-space** (`ArenaSpaceComponent`, `selector app-arena-space`, `arena-space.component.ts:10`) is a CHILD component — the `arena_space` route (`:244`) actually loads `CreateArenaSpaceComponent`, NOT `ArenaSpaceComponent`.

### ⚠ Load-bearing route bugs (affect specs that drive "perform action → Manual Assignment")
- **`manual_assignment` (underscore) is NOT a registered route.** Both PAB (`participant-assignment-board.component.ts:497`) and Validate (`validate-participants-assignment.component.ts:988`) navigate via `createUrlTree(['manual_assignment'], …)` → URL `/manual_assignment`. The registered route is `manualassignment` (no underscore, `app.routes.ts:236`). `/manual_assignment` falls through to the `**` wildcard (`app.routes.ts:324` → `ExceptionalroutingComponent`). A spec that clicks the PAB "Open Activity" button for a Manual-Assignment card and expects to land on the manual screen WILL hit the exception page. Treat the destination as `/manual_assignment` (broken) when asserting the PAB nav, OR drive `manualassignment` directly with query params.
- `formbasedsubmission` route (`:231`) is the LEGACY screen. The live PAB/validate Form flow navigates to `formtemplate` (`participant-assignment-board.component.ts:544`, `:593`; route `app.routes.ts:32` → `FormtemplateComponent` in Product Designer). `FormBasedSubmissionComponent` is still routed and still writes the same shapes (§3), so it is a valid target for a Form write-shape spec, but it is NOT what a participant reaches from the live board.

---

## 1. SELECTOR TABLE (BIG-00 … BIG-11)

> `tag:line` = line in that screen's `.component.html`. Polled values (collectionData streams) noted as **[stream → expect.poll]**.

### BIG-00 — Dashboard counts + cohorts (`big-dashboard.component.html`)
| What | Selector (current) | Cite |
|---|---|---|
| Total Participants count | text `Total Participants:` then `{{ dataSource.data.length }}` — the `<span>` at | html:235 |
| Filtered Participants count | text `Filtered Participants:` then `{{ dataSource.filteredData.length }}` | html:236 |
| Name filter input | `mat-form-field` `mat-label`="Name" → `input[matInput][ngModel=filterForm.name]` (`#input`) | html:221 |
| Tag filter | `mat-label`="Tag" → `mat-select[ngModel=filterForm.tags][multiple]` | html:225 |
| Clear filter | `button` text "Clear" → `(click)=onFilterReset()` | html:229 |
| Email btn | `button` text "Email" `(click)=sendEmailToSelectedParicipant()` (disabled when 0 selected) | html:240 |
| Wati btn | `button` text "Wati" `(click)=sendWatiMessage()` | html:244 |
| Notification btn | `button` text "Notification" `(click)=sendNotificationinBreakthrough()` | html:248 |
| Cohorts btn (open ManageCoherts) | `button` text "Coherts" `(click)=onManageCoherts()` [disabled when selection empty] | html:268 |
| Manage Tag | `button` text "Manage Tag" `(click)=OnManageTag()` | html:272 |
| Manage Notes | `button` text "Manage Notes" `(click)=OnManageNotes()` | html:276 |
| Export menu | `button` text "Export" `[matMenuTriggerFor]=exportmenu`; items "All Columns" / "Selected Columns" | html:280, 291-292 |
| Cohort card name (patch to table) | `.cohort-card .cohort-name` `(click)=onPatchDataToTable(item.participantidlist,item)` | html:149 |
| Cohort card count | `.cohort-card .cohort-count` → `{{item.participantidlist?.length || 0}}` **[stream `big cohorts`]** | html:156-157 |
| Cohort edit | `.cohort-card .edit-btn mat-icon` text "edit" `(click)=onEditCohorts(item)` | html:153 |
| Assignment card (per-cohort) title | `.assignment-card .assignment-title` `(click)=onPatchDataToTableFromActivity(...)` | html:167 |
| Assignment card count | `.assignment-card h4` → `{{assignment.participantidlist.length}}` | html:171 |
| Marathon title + edit | `h3 strong` `{{selectedMarathon.title}}`; edit `button mat-icon-button (click)=onEditMarathon()` | html:11-13 |
| Marathon prev/next | `mat-icon` "arrow_back_ios" `(click)=onChangeMarathon('backward')` / "arrow_forward_ios" forward | html:28-29 |
| Per-row name link → bigProfile | table cell `a.namehover` `(click)=bigProfile(element)` | html:388 |
| Per-row ATC Written count cell | `span[matMenuTriggerFor=atcMenu]` → `mapATCWritten[profileid].length` (this is the **ATC** count) | html:612-613 |
| Current/Completed/Total AEL cells | `*ngSwitchCase 'currentaelcount' / 'completedaelcount' / 'totalaelcount'` (AEL counts) | html:728-732 |
| Master select-all | `mat-checkbox` (header `select`) `(change)=masterToggle()` | html:325 |
| Row select | `mat-checkbox` `(change)=onToggleSelection(element)` | html:384 |
| Paginator | `mat-paginator[pageSizeOptions=[15,25,50,100]]` | html:840 |

> Dashboard does NOT label a "cohort/assignment/ATC/AEL" headline counter row; those live as table COLUMN cells and as per-cohort card counts. The two top-level numbers are **Total Participants** (035) and **Filtered Participants** (036).

### BIG-01 — Participant Assignment Board (`participant-assignment-board.component.html`)
| What | Selector (current) | Cite |
|---|---|---|
| Loading bar | `mat-progress-bar[mode=indeterminate]` | html:2 |
| Developer participant picker | `mat-select[ngModel=selectedProfile]` (only `*ngIf=developerAccess`) | html:16 |
| Marathon button (per marathon) | `button.marathon` `(click)=fetchMarathonData(marathon)`; active class `.selected` | html:33 |
| Marathon pending badge | `span.pending` → `{{marathonMap[docid].pending}}` **[stream `big assignment` + `big participants assignments`]** | html:35 |
| Status filter buttons | `button.filter-btn` over `['myactivities','review','rework','missed','completed']` `(click)=applyStatusFilter(status)`; active `.active` | html:45-48 |
| Status count badge | `span.status-count` → length of that status bucket | html:50-55 |
| Keyword search | `input.search-input[placeholder="Search activities..."]` `(keyup)=applyKeywordFilter($event)` | html:58 |
| Activity card | `.activity-card` (`*ngFor dataSource.data`) | html:85 |
| **Type badge** | `.type-badge` (+ class `type-zoom/type-manual/type-triple/type-micro/type-form/type-video`) → `{{activity.assignmenttype}}` | html:87-95 |
| **Status indicator badge** | `.status-indicator` (+ class `status-ongoing/status-upcoming/status-completed/status-rework/status-review/status-missed`) → Ongoing/Upcoming/<status> | html:97-105 |
| Card title | `.activity-title` → `{{activity.title}}` | html:110 |
| Start/End dates | `.date-value` (Start then End) → `formatDate(...)` | html:115,119 |
| **Perform-action button** | `.card-footer button.action-btn` `(click)=performAction(activity, checkActivityStart(activity))`, `[disabled]=isButtonDisabled(activity)`; visible only when `shouldShowButton(activity)` | html:235-237 |
| Button label | `getButtonText()` → "Open Activity" / "Yet To Start" / "View Submitted Activity" / "Rework Activity" / "Completed" | ts:712-725 |
| No-activities empty state | `.no-activities .empty-state p` text "No activities found" | html:82 |

PAB action routing (what `performAction` opens — all `window.open(_blank)` except confirm-only `sent`):
- Zoom Call → `joinMeeting` → `/zoommeeting_bigparticipants` (ts:485)
- Form → `fillForm` → `/formtemplate?...` (ts:544) ; review/completed → `reviewLastForm` → `/formtemplate?...&viewCompleted|viewFilledForm` (ts:593-595)
- Manual Assignment → `fillManualAssignment` → `/manual_assignment` **(broken route, see §0)** (ts:497)
- Video → `OpenVideos` → opens `WatchVideosComponent` dialog (ts:618)
- ATC → prescribe `/prescribeATC` (ts:648) / rework `/editATC/:atc/atc_to_validate` (ts:662) / review `/previewATC` (ts:678)
- Triple ATC → `/addtripleATC` (ts:743) / `/edittripleATC/:atc` (ts:763) / `/previewtripleATC` (ts:785)
- Note: PAB hides the button entirely for `Manual Assignment` via `shouldShowButton` returning false (ts:693) — a Manual Assignment card shows NO action button on the board; the participant reaches manual submit via Validate-screen "review" or a direct link.

### BIG-02 — Manual Assignment (`manual-assignments.component.html`)
| What | Selector | Cite |
|---|---|---|
| Root guard wrapper | `main[*ngIf="viewAccess == true"]` | html:1 |
| Given directive text | `.directive-text` → `{{assignmentDoc.directive}}` | html:7 |
| Drop zone (create/rework) | `.upload-area` (`*ngIf create|rework`) drag handlers | html:13-19 |
| Browse / hidden file input | `span.browse-text (click)=fileInput.click()` → `input[type=file][#fileInput][hidden] (change)=onFileInputChange($event)` | html:21,25-31 |
| Selected file list | `.file-list .file-item` (`*ngFor files`), name `.file-name`, size `.file-size` | html:54-69 |
| Remove file | `button[mat-icon-button][aria-label="Remove file"]` `(click)=removeFile(i)` | html:71 |
| Upload progress % | `.upload-percentage` → `{{progress}}` ; bar `.progress-bar-fill[style.width.%]` | html:37,42 |
| Review notes form (review only) | `form[formGroup=notesForm] [formArrayName=notes]` → `textarea[matInput][formControlName=note]` | html:130-141 |
| **Submit** (participant) | `button (click)=onSubmit('submit')` text "Submit" — only `viewType != 'review' && files.length != 0` | html:191 |
| **Mark As Rework** (reviewer) | `button[color=warn] (click)=onSubmit('rework')` text "Mark As Rework" — only `viewType=='review'` | html:190 |
| **Mark As Completed** (reviewer) | `button[color=primary] (click)=onSubmit('completed')` text "Mark As Completed" — `viewType=='review'` | html:192 |
| Rework notes display (rework view) | `.notes-list mat-card.note-item p` over `profileAssignmentDoc.activitylog[0].notes` | html:121-126 |

Query params it reads (set them when driving directly): `assignmentid`, `profileid`, `participantAssignmentId`, `type` ∈ `create|rework|review` (ts:93-96).

### BIG-03 — Form-based submission (`form-based-submission.component.html`)
Form fields are rendered dynamically from `delivery forms` template (`formarray`). Stable handles:
| What | Selector | Cite |
|---|---|---|
| Dynamic form group | bound to `deliveryForm`; controls named `control0,control1,…` (assigned at `ts:181,213`) and array sub-controls `arraycontrol0,…` (`ts:249`) | ts |
| Submit (new) | calls `onSubmit(deliveryForm.value)` (ts:318) — button is in html (form submit) |
| Update (patched) | `onUpdate(...)` (ts:458) |
| Rework notes (reviewer) | `notesForm` FormArray of required controls (`ts:666`); `reworkNotes()` (ts:678) |
| Complete (reviewer) | `completeNotes()` (ts:719) |
Query params: `id` (form template), `queueid` (= assignmentid), `profileid`, `participantAssignmentId`, `patchdata`, `reviewLast`, `viewFilledForm`, `viewCompleted`, `reviewNotes`, `source` (ts:141-159).
> Driving the dynamic form is brittle; prefer asserting the WRITE-SHAPE in §3 against a known seeded `delivery forms` template, or assert the resulting `big participants assignments.status` the CF/app re-renders on PAB.

### BIG-04 — Validate participant assignments (`validate-participants-assignment.component.html`)
| What | Selector | Cite |
|---|---|---|
| Loading | `.loading-container` (text "Loading...") | html:2 |
| Marathon dropdown | `select.select-input[ngModel=selectedMarathonId]` `(ngModelChange)=onMarathonChange($event)`; options text = `marathon.title` | html:22-30 |
| "Needs Validation (Review)" filter | `mat-checkbox (change)=onToggleReworkFilter($event.checked)` | html:37-41 |
| "Activity Given by Me" filter | `mat-checkbox (change)=onToggleMyActivities($event.checked)` | html:46-50 |
| Cohort filter dropdown | `select.select-input[ngModel=selectedFilterCohortId]` `(ngModelChange)=onCohortFilterChange($event)` | html:57-65 |
| Assignment search | `input[placeholder="Search assignments..."]` `(input)=onAssignmentSearch($event)` | html:74-78 |
| Assignment list item | `.assignment-item` `(click)=onAssignmentChange(assignment.id)`; active `.active`; title `.assignment-title`, status `.assignment-status` | html:90-103 |
| Kanban column (per status) | `.kanban-column` over `statusList=['initiated','ongoing','review','rework','completed']` | html:208 / ts:152 |
| Column title / count | `.column-title` → `{{status}}`; `.column-count` → `getStatusCount(status)` **[stream `big participants assignments`]** | html:214-216 |
| Per-column search | `.column-search input` `(keyup)=onSearchParticipant($event, status)` | html:222-225 |
| Select-all (col) | `button.select-all-btn` `(click)=toggleSelectAll(status)` | html:230-236 |
| **Bulk move menu** | `button.move-all-btn[matMenuTriggerFor=bulkMoveMenu]`; items `button[mat-menu-item]` text=target status `(click)=moveParticipant(status, s)` | html:237-251 |
| Participant card | `.participant-card`; checkbox `mat-checkbox.participant-checkbox (change)=onSelectParticipantAssignment(status,p.docid,$event)`; name `.participant-name` | html:256-272 |
| **Review** (accept/reject opens dialog) | `button.action-btn-sm.review (click)=review(p)` (only `status==='review'`) | html:280-285 |
| **Single move** (the per-card move) | `button.action-btn-sm.move[matMenuTriggerFor=singleMoveMenu]`; items `(click)=moveSingleParticipant(p.docid, status, s)` | html:289-301 |
| Mark assignment completed | `mat-checkbox.completion-checkbox (change)=markAssignmentCompletion($event)` (right panel) | html:376-381 |
| Summary save | `textarea.summary-input[ngModel=summary]` + `button.save-btn (click)=onUpdateSummary()` | html:400-408 |
| Total participants (detail) | `.detail-value.large` → `getTotalParticipants()` | html:346 |
> **accept/reject/rework semantics:** there is no literal accept/reject button. "Accept" = move to `completed`; "Reject/Rework" = move to `rework`; both happen either via the **single/bulk move menus** (writes `status` directly, §3) or via the **Review dialog** (`FormTemplatePreviewComponent`) whose result `{confirmed, status, reviewnotes}` is applied in `review()` (ts:896-915 / 939-957). For Manual/ATC/Triple, `review()` instead opens the manual/ATC screens (ts:987-997, 961-986).

### BIG-05 — AEL upload / aggregate event level (`big-aggregate-event-level.component.html`)
| What | Selector | Cite |
|---|---|---|
| Form | `form[formGroup=aggregateForm] (ngSubmit)=submit()` | html:3 |
| Participant select | `mat-select[formControlName=participant]` (+ `ngx-mat-select-search`) | html:6-8 |
| ATC model select | `mat-select[formControlName=atcmodel] (change)=onatcselect()` | html:19 |
| Level select | `mat-select[formControlName=level] (change)=onlevelselect()` | html:32 |
| **Submit** | `button.submitbtn[type=submit]` text "update participant level" | html:43 |
| Filter clear | `button (click)=onClearFilter()` text "clear" | html:76 |
| **Analytics count** | text "Total ATC Model Count" : `{{dataSource.filteredData.length}}` **[stream `big aggregate event level`]** | html:83 |
| Row delete | `button[mat-mini-fab] mat-icon "delete" (click)=openDeleteDialog(row.id)` | html:167 |
| Table columns | `matColumnDef`: participant, atcmodel, queueid, currentlevel, levelupcount, regular, fasttrack, warmup,… | html:89-138 |

### BIG-06 — Aggregate level / B!G level upload (`big-aggregate.component.html`)
| What | Selector | Cite |
|---|---|---|
| Submit (update level) | `button.submitbtn[type=submit]` text "Update participant level" `[disabled]=loading||aggregateForm.invalid||crossmatch||configurationcheck` | html:50 |
| Filter clear | `button (click)=onClearFilter()` | html:71 |
| Analytics count | "Total ATC Model Count" : `{{dataSource.filteredData.length}}` | html:78 |
| Table columns | participant, atcmodel, currentlevel, regular, fasttrack, warmup, specialactivity, boosteractivity | html:84-147 |

### BIG-07 — Cohorts (`big-cohort-clone-2.component.html`)
| What | Selector | Cite |
|---|---|---|
| Cohort search | `input[placeholder="Search cohorts…"][ngModel=cohortSearchQuery] (input)=onCohortSearch()` | html:20 |
| Participant search | `input[placeholder="Search participants…"][ngModel=participantSearchQuery]` | html:25 |
| Multi-select mode | `button.btn-ghost (click)=toggleSelectMode()` (title "Multi-select") | html:30 |
| Export all | `button.btn-ghost (click)=exportCohortsData()` (title "Export all") | html:33 |
| Unassigned participants | `button.btn-warn (click)=showUnassignedParticipants()` | html:36 |
| Progression report | `button.btn-success (click)=openProgressionReport()` | html:39 |
| **Create cohort** | `button.btn-primary (click)=onCreateCohort()` | html:42 |
| Marathon / event / queue / zone filter | `button.fi (click)=…DropdownOpen=true` | html:80-104 |
| Status filter (active/nonactive/all) | `button.fi (click)=statusDropdownOpen=true`; `setStatusFilter('all'|'active'|'nonactive')` | html:117 / ts:1694 |
| View toggles (participants/activities, horiz/vert, levels/daterange) | `button.vbtn` `(click)=changeOverAllView / setViewMode / setGroupBy` | html:173-192 |
| **Cohort size** | `getCohortParticipantCount(cohort)` → `cohort.participantidlist?.length` (ts:1929) / filtered length (ts:1931) **[stream `big cohorts`]** | ts:1929-1931 |
| **Cohort move (single participant)** | `moveParticipantToCohort(participantId, sourceCohort, targetCohort)` — drag/menu | ts:1194 |
| **Bulk move** | `moveSelectedParticipants...` → `updateDoc(targetRef,{participantidlist:arrayUnion(...)})` | ts:975-980 |
| **Audit history** | read from `big cohorts log` ordered by `createddate desc` (ts:2370); written by `createMoveLog` (ts:1233) | ts:1233,2370 |
| Delete cohort | `deleteDoc(doc('big cohorts',cohort.docid))` | ts:2464 |
> No in-component role gate here — constructor only calls `authguard.username()` (ts:332), not `getRoles()`. Access is purely the data-driven `authGuard` (§4).

### BIG-08 — ATC-Model level config (`atcmodel-level-config.component.html`)
| What | Selector | Cite |
|---|---|---|
| Heading | `h5.heading` text "ATC Model - Level Config" | html:2 |
| Filter | `input[matInput][#input] (keyup)=filterTable($event)` | html:8 |
| **Add New Config** | `button.addbtn (click)=updateList(null)` text "Add New Config" | html:12 |
| Table | `table[mat-table]`; cols atcmodel, level, primaryactivity, metrics, validation, stabilization, action | html:15-59 |
| Row edit | `button.deletebtn[mat-icon-button] (click)=updateList(row)` | html:62 |
| Paginator | `mat-paginator[pageSizeOptions=[25,50,100]]` | html:76 |
| Empty | `td.emptytext` text `No data matching the filter "{{input.value}}"` | html:73 |
Source list **[stream `atcmodel level config`]** (ts:53). Update writes happen inside the `UpdateAtcmodelLevelConfigComponent` dialog (ts:95).

### BIG-09 — B!G level config (`big-level.component.html`)
| What | Selector | Cite |
|---|---|---|
| Heading | `h5.heading` text "B!G Level" | html:2 |
| **Add New Level** | `button.addbtn (click)=updateList(null)` | html:12 |
| Table | cols position, level, category, action | html:16-29 |
| Row edit | `button.deletebtn[mat-icon-button] (click)=updateList(row)` | html:32 |
Source **[stream `biglevel`]**.

### BIG-10 — Activity monitor (`monitor-activity-log.component.html`) + Activity log (`big-activity-log.component.html`)
Monitor (`bigactivitymonitor`):
| What | Selector | Cite |
|---|---|---|
| Heading | `h4` text "Big Activity Monitor Dashboard" | html:3 |
| Queue select | `mat-select[ngModel=selectedQueueDoc] (selectionChange)=onSelectQueue($event.value)` | html:10 |
| Big-activity-logged filter | `mat-select[multiple][ngModel=bigActivityLogged] (selectionChange)=onFilterTokenData()` | html:16 |
| Big-activity-review filter | `mat-select[multiple][ngModel=bigActivityReview]` | html:28 |
| Participant filter | `mat-select[ngModel=filterText]` + `ngx-mat-select-search[ngModel=participantSearchText]` | html:41-43 |
| **Export** | `button (click)=exportLog()` text "Export" | html:54 |
| Pagination | `button (click)=goToPage(...)` First/Previous/Next/Last | html:71-75, 184-188 |
| Expand row | `button.expand-button (click)=toggleRow(token.profile_id)` | html:92 |
| Manage activity-log on stage | `button (click)=onManageQueueActivityLog('add'|'remove', stage)` | html:133,138 |
Activity log (`bigactivitylog`):
| What | Selector | Cite |
|---|---|---|
| Heading | `h5.heading` text "Activity Log" | html:6 |
| **Export CSV** | `button (click)=exportCSV()` text "Export CSV" | html:14 |
| Queue multi-select + get | `mat-select[multiple][ngModel=forQuerySelectedQueue]` then `button (click)=onSelectQueue()` "Get Data From Selected Queue" | html:22-26 |
| Profile / activity / queue filters | three `mat-select` (`selectedProfile`/`selectedBigActivity`/`selectedQueue`) | html:40-59 |
| atcmodel / participant filters | `mat-select[multiple][ngModel=filter.atcmodel]` etc `(selectionChange)=onFilter()` | html:68-87 |

### BIG-11 — Zoom meeting (`zoom-meeting.component.html`) + WatchVideos dialog
Zoom (`zoommeeting_bigparticipants`): SDK-driven (`ZoomMtg.join`, ts:90/120). On load it writes status `ongoing` to both `big assignment` (ts:149) and `big participants assignments` (ts:154). Reads query params `assignmentid`, `profileid`, `participantAssignmentId`, `type`.
WatchVideos dialog (`watch-videos.component.html`):
| What | Selector | Cite |
|---|---|---|
| Close | `button.vd-close (click)=closeDialog()` | html:11 |
| Play video | `button.vd-play-btn (click)=playVideo(video,i)` | html:87-93 |
| Watched flag | text "Completed" when `isVideoWatched(i)` | html:70 |
| **Complete assignment** | `button.vd-btn-primary (click)=completeAssignment()` text "Complete assignment", `[disabled]=!allCompleted` | html:119-121 |
> `completeAssignment()` closes the dialog returning `{completed:true}`; PAB's `OpenVideos` handler then calls `updateAssignmentStatus(...,'completed')` (`participant-assignment-board.component.ts:627`), writing `big participants assignments.status='completed'` (ts:640). Video progress itself is localStorage, not Firestore (ts:119).

---

## 2. NEEDS-TESTID (file → line → proposed `data-testid`)
> The whole tree has none. These are the minimum hooks to make BIG specs non-brittle without depending on Material internals / free text. File paths are under `starlabs-angular/src/app/big/`.

| File | Line | Element | Proposed `data-testid` |
|---|---|---|---|
| big-dashboard/...html | 235 | Total Participants `<span>` | `big-dash-total-count` |
| big-dashboard/...html | 236 | Filtered Participants `<span>` | `big-dash-filtered-count` |
| big-dashboard/...html | 147 | `.cohort-card` (add `[attr.data-testid]="'big-dash-cohort-'+item.docid"`) | `big-dash-cohort-{docid}` |
| big-dashboard/...html | 156 | `.cohort-count` | `big-dash-cohort-count` |
| big-dashboard/...html | 268 | Cohorts button | `big-dash-cohorts-btn` |
| participant-assignment-board/...html | 33 | `button.marathon` (`[attr.data-testid]="'pab-marathon-'+marathon.docid"`) | `pab-marathon-{docid}` |
| participant-assignment-board/...html | 35 | `span.pending` | `pab-marathon-pending` |
| participant-assignment-board/...html | 45 | `button.filter-btn` (`[attr.data-testid]="'pab-status-'+status"`) | `pab-status-{status}` |
| participant-assignment-board/...html | 50 | `span.status-count` | `pab-status-count-{status}` |
| participant-assignment-board/...html | 85 | `.activity-card` (`[attr.data-testid]="'pab-card-'+activity.docid"`) | `pab-card-{assignmentId}` |
| participant-assignment-board/...html | 87 | `.type-badge` | `pab-type-badge` |
| participant-assignment-board/...html | 97 | `.status-indicator` | `pab-status-badge` |
| participant-assignment-board/...html | 235 | `button.action-btn` (perform-action) | `pab-perform-action` |
| manual-assignments/...html | 191 | Submit button | `manual-submit` |
| manual-assignments/...html | 190 | Mark As Rework | `manual-rework` |
| manual-assignments/...html | 192 | Mark As Completed | `manual-complete` |
| manual-assignments/...html | 27 | hidden file input `#fileInput` | `manual-file-input` |
| form-based-submission/...html | (submit btn) | `onSubmit` button | `form-submit` |
| form-based-submission/...html | (rework btn) | `reworkNotes` button | `form-rework` |
| form-based-submission/...html | (complete btn) | `completeNotes` button | `form-complete` |
| validate-participants-assignment/...html | 22 | marathon `select` | `validate-marathon-select` |
| validate-participants-assignment/...html | 90 | `.assignment-item` (`[attr.data-testid]="'validate-assignment-'+assignment.id"`) | `validate-assignment-{id}` |
| validate-participants-assignment/...html | 208 | `.kanban-column` (`[attr.data-testid]="'validate-col-'+status"`) | `validate-col-{status}` |
| validate-participants-assignment/...html | 216 | `.column-count` | `validate-col-count-{status}` |
| validate-participants-assignment/...html | 237 | bulk move trigger | `validate-bulk-move` |
| validate-participants-assignment/...html | 280 | review button | `validate-review` |
| validate-participants-assignment/...html | 289 | single move trigger | `validate-single-move` |
| validate-participants-assignment/...html | 247,297 | move-menu items (`[attr.data-testid]="'validate-move-to-'+s"`) | `validate-move-to-{status}` |
| big-aggregate-event-level/...html | 43 | submit | `ael-submit` |
| big-aggregate-event-level/...html | 83 | count label value | `ael-total-count` |
| big-aggregate/...html | 50 | submit | `aggregate-submit` |
| big-aggregate/...html | 78 | count label value | `aggregate-total-count` |
| big-cohort-clone-2/...html | 42 | Create cohort | `cohorts-create` |
| big-cohort-clone-2/...html | (cohort card) | per-cohort card (add attr by docid) | `cohort-{docid}` |
| atcmodel-level-config/...html | 12 | Add New Config | `modelconfig-add` |
| big-level/...html | 12 | Add New Level | `biglevel-add` |
| monitor-activity-log/...html | 54 | Export | `monitor-export` |
| big-activity-log/...html | 14 | Export CSV | `activitylog-export` |
| watch-videos/...html | 119 | Complete assignment | `watchvideos-complete` |
| zoom-meeting/...html | (join/leave) | join container | `zoom-join` |

---

## 3. WRITE SHAPES (the exact docs the app commits)
> Use these for write-shape specs (assert the doc the APP wrote, against a KNOWN-SEEDED precondition). NEVER assert read==X right after writing X yourself.

### 3a. PAB perform-action
PAB does NOT itself write the activity result — it **navigates** to the relevant screen, EXCEPT:
- **Video → complete:** `big participants assignments/{participantAssignmentId}` ← `{ status: "completed" }` (`participant-assignment-board.component.ts:640`).
- **`sent` status accept:** only a `confirm()`, no write (ts:410-414).
- All other types: `window.open` to the per-type screen (see BIG-01 routing list). The status transition is written by THAT screen (3b/3c/3e) — so a closed-loop spec should: drive PAB button → land on screen → submit there → poll PAB/Validate for the recomputed status.

### 3b. Manual assignment submit (`manual-assignments.component.ts`)
Participant submit (`onSubmit('submit')`, ts:289-308) writes TWO docs:
1. `big assignment manual/{autoId}` ←
```
{ profileid, assigmentid (sic), participantassignmentid, cohortref, marathonref,
  type: assignmentDoc.assignmenttype, file: [{url,name,type,size}], date: Date }
```
2. `big participants assignments/{participantAssignmentId}` ←
```
{ status: "review", activityref: <ref to big assignment manual/{autoId}>, updateddate: Date }
```
Reviewer rework (`onSubmit('rework')`, ts:255): `big participants assignments/{id}` ← `{ status:"rework", activityref:"", activitylog:[{activityref,notes[],reviewdate,reviewer},…(unshift)], updateddate }`.
Reviewer completed (`onSubmit('completed')`, ts:272): ← `{ status:"completed", updateddate, summary: notesarray }`.
On first file pick (`onFileInputChange`, ts:445): ← `{ status:"ongoing" }`.

### 3c. Form submit (`form-based-submission.component.ts onSubmit`, ts:380-391)
1. `formsByClient/{draftDocid}` ← full `submittedClientForm` (incl. `formid`, `profileid`, `participantassignmentid`, `marathonref`, `cohortsref`, `assignmentid`, `submittedin:"starlabs"`, `date`, `docid`).
2. `big participants assignments/{participantAssignmentId}` ← `{ status:"review", activityref:<formsByClient ref>, formtemplate:<formid> }`.
Autosave draft (`big_temporary_forms/{draftDocid}`, ts:555) + may flip status `ongoing` (ts:561). Rework (`reworkNotes`, ts:697) ← `{ activitylog:[…], status:"rework", activityref:null }`. Complete (`completeNotes`, ts:725) ← `{ status:"completed", summary:notes }`.
> Live PAB Form path uses `FormtemplateComponent` (route `formtemplate`), not this component — confirm its write shape separately if testing the live board path.

### 3d. Validate move (`validate-participants-assignment.component.ts`)
- Bulk (`moveParticipant`, ts:658-674): `writeBatch`; for each selected docid → `big participants assignments/{docid}` ← `{ status: toStatus }`. commit.
- Single (`moveSingleParticipant`, ts:683-687): `updateDoc('big participants assignments/{docid}', { status: toStatus })`.
- Review-dialog apply (`review`, ts:910 / 953): ← `{ status: result.status, activitylog: [...existing, {notes[],date,reviewedby,status}] }` (activitylog only when reviewnotes present).
- Mark assignment complete (`markAssignmentCompletion`, ts:827): `big assignment/{docid}` ← `{ status: checked?'completed':'ongoing' }`.
- Summary (`onUpdateSummary`, ts:835): `big assignment/{docid}` ← `{ summary }`.

### 3e. Cohort move (`big-cohort-clone-2.component.ts moveParticipantToCohort`, ts:1194-1255)
1. `big cohorts/{sourceCohort.docid}` ← `{ participantidlist: arrayRemove(participantId) }`.
2. `big cohorts/{targetCohort.docid}` ← `{ participantidlist: arrayUnion(participantId) }`.
3. `big cohorts log/{autoId}` ← (`createMoveLog`, ts:1236)
```
{ docid, createddate, participantid, cohortid:targetCohort.docid, fromcohortid, fromcohortname,
  tocohortname, eventref, addedby:<loggedInProfile.profileid|uid>, addeddate, status:"moved",
  level, marathonref, cohortType, cohortCategory }
```
Bulk add (`moveSelected…`, ts:977): `updateDoc(targetRef,{participantidlist:arrayUnion(...participantIds)})`.
> Good silent-data-gap invariant: seed source cohort with N participants, move 1 via UI, then **poll `big cohorts log`** for a row with `status:'moved'` AND poll the target cohort card count rendered by the app = seededTargetN+1 (app-computed, not test-written).

### 3f. AEL upload (`big-aggregate-event-level.component.ts submit`, ts:299-309)
`big aggregate event level/{autoId}` ← `{ atcmodel, profileid:<participant>, id, level, regular:<config metrics with completed reset>, lastupdated:Date }`.

---

## 4. ROLE GATES per route (for negative role-gate specs)

### 4a. THE BIG FACT — gates are DATA-DRIVEN, not in the route table
Every BIG route uses the SAME generic `authGuard` (`app.routes.ts` `canActivate:[authGuard]`). `authGuard` (`auth.guard.ts:10`) does:
1. require a logged-in Firebase user (`authState`); else → `/login` (auth.guard.ts:21-26).
2. `EISDashboard` is always allowed (auth.guard.ts:28).
3. `cleanUrl = '/' + state.url.split('?')[0].split('/')[1]` (auth.guard.ts:35) — i.e. the FIRST path segment, query-stripped (so `particiant_assignment_board?profileid=x` → `/particiant_assignment_board`).
4. `authService.routeConfig(cleanUrl)` (authguard.service.ts:320) reads the **`dashboard` Firestore collection**, searching each doc + its `children[]` for `route === cleanUrl`, returning that node's `roles:string[]`, `label`, `profileid:string[]`.
5. user's roles = keys of their `role_ref` doc that are `=== true` (auth.guard.ts:38; role doc fetched in `getRoles`, authguard.service.ts:307-318 via `profile_data.role_ref`).
6. **`hasAccess = rolesArray.some(r => routeConfigRoles.includes(r)) || routeConfigProfiles.includes(loggedProfileId)`** (auth.guard.ts:44).
7. deny → opens a `ConfirmComponent` dialog ("Access denied" or "Contact Admin" if BOTH lists empty), returns `false` — **stays on current page, does NOT redirect** (auth.guard.ts:47-78).

**Implication for negative role-gate specs:** the allowed-roles set for each BIG route is NOT in source — it lives in the seeded `dashboard` collection (`{route, roles[], profileid[], children[]}`). To test the route gate you MUST seed a `dashboard` doc for that `route` with a known `roles[]`, then log in as a user whose `role_ref` flags do/don't intersect. Asserting the gate = expect the `ConfirmComponent` dialog ("Access denied: … {label}") to appear and the route component NOT to mount (URL stays). There is no hardcoded role→route mapping to assert against.

The route key used for lookup per BIG screen (the `cleanUrl`, = first segment): `/big-dashboard`, `/particiant_assignment_board`, `/manualassignment`, `/formbasedsubmission`, `/formtemplate`, `/validateParticipantAssignments`, `/bigaggregateeventlevel`, `/big_aggregate`, `/bigcohorts`, `/modellevelconfig`, `/biglevel`, `/bigactivitymonitor`, `/bigactivitylog`, `/zoommeeting_bigparticipants`. Seed `dashboard` docs under these exact strings.

### 4b. SECOND, in-component role gates (the real per-screen access logic)
Independent of `authGuard`, several screens self-check `authguard.getRoles()` and redirect/deny on their own. These are the asserts that actually matter for "wrong role" specs because they fire even if `authGuard` passes:

| Screen | In-component gate | On fail | Cite |
|---|---|---|---|
| **Manual (BIG-02)** | `type=='review'` → requires `roles.admin \|\| roles.ah \|\| roles.developer`. `type∈create/rework` → requires `roles.profile_ref.id == profileid` (the participant themself). | `alert("You have no access to the screen")` + `navigateByUrl('/')` | manual-assignments.component.ts:100-118 |
| **Validate (BIG-04)** | requires `roles['mentor']` (sets `bigAdminAccess`). | `alert('You have no access to the screen')` + `navigateByUrl('/')` (in `ngOnInit`) | validate-…ts:185-192 |
| **PAB (BIG-01)** | requires `roles['developer']` to enable the participant PICKER (`developerAccess`). Non-developers still see the board but only for their OWN profile (no picker). | no redirect; picker hidden | participant-assignment-board.component.ts:105-114 ; html:14 |
| **Form (BIG-03)** | `roles.ah\|\|admin\|\|developer` → `reviewAccess=true`; `roles.profile_ref.id===profileid` → `submissionAccess=true`. | NO redirect (alert commented out, ts:113) — both flags just gate buttons | form-based-submission.component.ts:101-114 |
| **Big chat** (PAB/validate open it) | requires `roles['mentor']` for admin send; else participant-only | `navigateByUrl('/')` in some paths | big-chat-screen.component.ts:108-140 |
| **Monitor (BIG-10)** | `editrole` = **HARDCODED UID allowlist** `['uJz8VjvijQR4tVMkJ4Y8ZQ9nBQ62','XRaBam1TiHdqls35AVTMgA16hva2','edKuVejA2vPcvYuvPyi2rXKgWBN2','dnwezEjM1KWBdqr14fM1k45nRvL2','2OgWzhcPlCfi8JfLQ8B9CySZM6i2']` enables edit actions; content-load gate is COMMENTED OUT (no deny). | none (edit buttons gated) | monitor-activity-log.component.ts:101 |
| **modellevelconfig (BIG-08)** | `getRoles()` called but role check is **COMMENTED OUT** (`// if(roles["developer"]…`). | none — open to any authGuard-passing user | atcmodel-level-config.component.ts:51-61 |
| **bigaggregateeventlevel (BIG-05)** | role check **COMMENTED OUT** | none | big-aggregate-event-level.component.ts:90-92 |
| **biglevel (BIG-09)** | role check **COMMENTED OUT** | none | big-level.component.ts:47-48 |
| **bigactivity / bigactivitylog (BIG-10)** | role checks **COMMENTED OUT** | none | big-activity.component.ts:40-41 ; big-activity-log.component.ts:105-106 |
| **bigcohorts (BIG-07)** | NO `getRoles()` at all (only `username()`) | none | big-cohort-clone-2.component.ts:332 |
| **big-dashboard (BIG-00)** | `getRoles()` only to grab `profile_ref.id`; no gate | none | big-dashboard.component.ts:263 |
| **big_aggregate (BIG-06)** | NO `getRoles()` call at all in constructor (no in-component gate) | none | big-aggregate.component.ts (constructor) |

**Net:** for negative role-gate specs, the screens with ENFORCED, assertable role logic are **Manual (admin/ah/developer or self), Validate (mentor), Big-chat (mentor), and PAB picker (developer)**. The config/analytics/monitor/cohort/dashboard screens have their per-component checks disabled and are governed ONLY by the data-driven `authGuard` (seed the `dashboard` collection to test those). The Monitor edit gate is a UID allowlist — to exercise it you must log in as one of those 5 exact UIDs (test-project only).

---

## RECON_SCHEMA
```yaml
RECON_SCHEMA:
  surface: BIG
  source_repo_relative: src/app/big
  testids_present_in_source: false      # zero data-testid in entire src/app
  selector_priority_used: [class, id, formcontrolname, role+text, icon-text]
  guard:
    type: single_generic_guard
    fn: authGuard
    fn_cite: src/app/auth.guard.ts:10
    role_resolution: profile_data.role_ref -> truthy keys      # authguard.service.ts:307
    route_role_source: firestore_collection:dashboard          # authguard.service.ts:320 ; data-driven, NOT in route table
    clean_url_rule: "'/' + url.split('?')[0].split('/')[1]"    # auth.guard.ts:35
    access_rule: "roles ∩ routeConfig.roles  OR  profileid ∈ routeConfig.profileid"  # auth.guard.ts:44
    deny_behavior: ConfirmComponent dialog, no redirect, returns false   # auth.guard.ts:47
  screens:
    - id: BIG-00
      route: big-dashboard
      component: BigDashboardComponent
      html: src/app/big/big-dashboard/big-dashboard.component.html
      counts: {total: html:235, filtered: html:236}
      streams: [big cohorts, participant metadata, big aggregate level, biglevel]
      in_component_gate: none
    - id: BIG-01
      route: particiant_assignment_board   # typo is the real path
      component: ParticipantAssignmentBoardComponent
      perform_action: {selector: button.action-btn, cite: html:235, handler_cite: ts:408}
      status_badges: {type: html:87, status: html:97}
      streams: [big assignment, big participants assignments, big marathon]
      in_component_gate: {role: developer, effect: enables participant picker only, cite: ts:105}
      route_bug: "Manual Assignment opens /manual_assignment (underscore) which is NOT registered -> wildcard"  # ts:497
    - id: BIG-02
      route: manualassignment
      component: ManualAssignmentsComponent
      writes: [big assignment manual/{autoId}, big participants assignments/{paid}]
      write_cite: ts:294-308
      submit_selectors: {submit: html:191, rework: html:190, complete: html:192}
      in_component_gate: {review: [admin, ah, developer], create_rework: self_profile, deny: redirect_root, cite: ts:100-118}
    - id: BIG-03
      route: formbasedsubmission           # legacy; live board uses formtemplate
      component: FormBasedSubmissionComponent
      writes: [formsByClient/{draftDocid}, big participants assignments/{paid}]
      write_cite: ts:380-391
      in_component_gate: {review: [ah, admin, developer], submit: self_profile, deny: none_alert_commented, cite: ts:101-114}
    - id: BIG-04
      route: validateParticipantAssignments
      component: ValidateParticipantsAssignmentComponent
      writes_move: {bulk: ts:665-674, single: ts:683-687, review_dialog: ts:910}
      kanban_statuses: [initiated, ongoing, review, rework, completed]   # ts:152
      move_selectors: {bulk: html:237, single: html:289, review: html:280}
      streams: [big participants assignments]
      in_component_gate: {role: mentor, deny: redirect_root, cite: ts:185-192}
    - id: BIG-05
      route: bigaggregateeventlevel
      component: BigAggregateEventLevelComponent
      writes: [big aggregate event level/{autoId}]
      write_cite: ts:299-309
      submit: html:43
      analytics_count: html:83
      in_component_gate: commented_out   # ts:90-92
    - id: BIG-06
      route: big_aggregate
      component: BigAggregateComponent
      submit: html:50
      analytics_count: html:78
      in_component_gate: commented_out
    - id: BIG-07
      route: bigcohorts
      component: BigCohortClone2Component
      writes_move: [big cohorts/{src}.participantidlist arrayRemove, big cohorts/{tgt}.participantidlist arrayUnion, big cohorts log/{autoId}]
      write_cite: ts:1194-1255
      size_fn: {cite: ts:1929}
      audit_collection: big cohorts log     # read ts:2370 ; write ts:1233
      create: html:42
      streams: [big cohorts]
      in_component_gate: none   # ts:332 username only
    - id: BIG-08
      route: modellevelconfig
      component: AtcmodelLevelConfigComponent
      add: html:12
      streams: [atcmodel level config, biglevel, bigactivity, products]
      in_component_gate: commented_out   # ts:51-61
    - id: BIG-09
      route: biglevel
      component: BigLevelComponent
      add: html:12
      streams: [biglevel]
      in_component_gate: commented_out
    - id: BIG-10
      routes: [bigactivitymonitor, bigactivitylog]
      components: [MonitorActivityLogComponent, BigActivityLogComponent]
      export: {monitor: html:54, log: html:14}
      in_component_gate: {monitor_edit: hardcoded_uid_allowlist, content: commented_out, cite: ts:101}
      uid_allowlist: [uJz8VjvijQR4tVMkJ4Y8ZQ9nBQ62, XRaBam1TiHdqls35AVTMgA16hva2, edKuVejA2vPcvYuvPyi2rXKgWBN2, dnwezEjM1KWBdqr14fM1k45nRvL2, 2OgWzhcPlCfi8JfLQ8B9CySZM6i2]
    - id: BIG-11
      route: zoommeeting_bigparticipants
      component: ZoomMeetingComponent
      writes_on_load: [big assignment/{id}.status=ongoing, big participants assignments/{paid}.status=ongoing]
      write_cite: ts:149-155
      embedded_dialog: WatchVideosComponent   # complete -> big participants assignments.status=completed via PAB ts:640
      watch_complete: src/app/big/watch-videos/watch-videos.component.html:119
  collections_written: [big participants assignments, big assignment, big assignment manual, formsByClient, big_temporary_forms, big aggregate event level, big cohorts, big cohorts log]
  collections_read_streamed: [big assignment, big participants assignments, big cohorts, big marathon, big aggregate level, big aggregate event level, atcmodel level config, biglevel, bigactivity, queue generation, profile_data, dashboard]
  good_silent_gap_invariants:
    - "cohort move: poll 'big cohorts log' for status:moved AND target cohort card count == seededN+1 (app-rendered)"   # ts:1233 / ts:1929
    - "validate single move: drive single-move menu, poll target column .column-count (app getStatusCount stream) == seededN+1"  # html:289 / ts:538
    - "manual submit: drive Submit, poll big participants assignments.status the PAB/validate board re-renders == 'review'"   # ts:305
  hazards:
    - "Manual Assignment route token mismatch manual_assignment vs manualassignment -> /manual_assignment hits wildcard"   # ts:497 vs app.routes.ts:236
    - "PAB hides action button for Manual Assignment (shouldShowButton false) -> not reachable from board"   # ts:693
    - "config/analytics/monitor/cohort/dashboard in-component role checks are commented out -> only dashboard-collection authGuard gates them"
    - "arena-space (ArenaSpaceComponent) is NOT routed; arena_space route loads CreateArenaSpaceComponent"   # app.routes.ts:244
    - "live board Form flow uses formtemplate (FormtemplateComponent), not formbasedsubmission"
```
