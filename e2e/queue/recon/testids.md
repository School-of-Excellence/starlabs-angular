# TESTID MAP — `data-testid` hooks for page objects

This file is the authoritative map of every `data-testid` attribute added to the REAL Angular
component templates (test-hooks step). Page-object agents: **prefer these `data-testid` selectors first**
(per the selector priority in SHARED CONVENTIONS), then fall back to the `Best stable selector` column
in `operator.md` / `studio.md` / `big.md` for anything not listed here.

Conventions used when adding the hooks:
- Each testid is added to the EXACT element flagged in the recon NEEDS-TESTID lists. No logic, style,
  binding, or text was changed — attributes only. Two value interpolations were wrapped in a new
  `<span data-testid=…>` (noted below) — behaviour-neutral.
- For elements rendered in an `*ngFor` (repeated rows/cards/options), the testid VALUE is **static**
  (the same for every instance) and an extra `[attr.data-*]` carries the per-instance id. So a page
  object locates one instance with `[data-testid="X"][data-…-id="<id>"]`, or counts
  `[data-testid="X"]` for "how many".
- Two testid values are intentionally reused because the elements are mutually exclusive in the DOM
  (only one renders at a time): `studio-move-next-btn` (variation vs non-variation button) and
  `validate-move-to` (bulk-move menu vs single-move menu — only the open mat-menu has items in the DOM).
- `collectionData` streams are async — assert counts/values behind these hooks with `expect.poll`.

> PRE-EXISTING stable attributes on the operator board (NOT added here, already in source — PREFER them
> for stage/token scoping): `data-stage-key` on each stage-column header
> (`dynamic-queue-manager-clone` — key form `<stage>_<i>` / `<stage>_queued_<i>` / `_waiting_ / _activity_`),
> and `data-token-id` on each token card (= `token.profile_id || token.docid`). Use these to scope
> `qm-move-btn` / `qm-stage-count` to a specific stage or token.

---

## OPERATOR surface

### `dynamic-queue-manager-clone.component.html` — Live board (route `/dynamicqueuemanager`)
| testid | element | purpose / what to assert | companion attr |
|---|---|---|---|
| `qm-queue-select` | "Select Queue" `mat-select` | open the queue picker (`onQueueSelect`) | — |
| `qm-total-participants` | `<span>` wrapping `{{totalParticipants}}` (added wrapper) | board's computed Total Participants; poll after stream re-render | — |
| `qm-livequeue-btn` | a "Live Queue" quick-select button (`*ngFor`) | pick a live queue; count = live queues | `data-queue-id` = `live.docid` |
| `qm-export-csv` | "Export CSV" button | triggers client-side CSV (no Firestore write) | — |
| `qm-filters-open` | `tune` icon button | opens the Filters sidenav | — |
| `qm-filter-badge` | `span.filter-btn-badge` (only when count>0) | active-filter-dimension count (`getActiveFilterCount`) | — |
| `qm-tag-option` | a tag row in the Filters sidenav tag dropdown (`*ngFor`) | click to toggle a tag filter (live) | `data-tag-id` = `tag.docid` |
| `qm-tag-chip` | active-tag `mat-chip` in the top chips row (`*ngFor`) | shows an applied tag; `matChipRemove` removes it | `data-tag-id` = `tagId` |
| `qm-filters-clearall` | "Clear all" button in Filters header | `clearAllFilters()` | — |
| `qm-stage-count` | `<span>` of the per-stage displayed count in the column header | stage token count (`allTokens?.length ?? tokenlist.length`); scope via header `data-stage-key` | — |
| `qm-move-btn` | per-card Move button (glyph ⇄) | opens that token's move dropdown; scope via card `data-token-id` | — |
| `qm-move-target` | a target-stage button inside the open `.move-dropdown` (`*ngFor`) | commits a single-token move (then PeopleInvolved / AssignQueueStudio opens) | `data-stage-name` = `targetColumn.stagename` |
| `qm-comms-recipient-count` | `<span>` wrapping `{{getSelectedTokens().length}}` on the Whatsapp comm button (added wrapper) | recipient count in comms panel | — |
| `qm-comms-selectall` | `.select-all-wrapper` in comms panel | toggles Select-All; checked state via `.custom-checkbox.checked` | — |
| `qm-comms-send` | `.send-btn` (only when a comm type selected) | `sendCommunication()` | — |
| `qm-bulk-target` | "Move to Stage" `mat-select` in the Bulk Move panel | choose bulk target (`bulkMoveTargetStageKey`) | — |
| `qm-bulk-commit` | "Move N Participant(s)" button in Bulk Move panel | `executeBulkMove()`; disabled until a target chosen | — |

### `people-involved.component.html` — Update-Specialist confirm dialog (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `pi-person-select` | `mat-select[formControlName="person"]` | choose specialist(s) before a move commits | — |
| `pi-submit` | submit button ("submit") | commits the move (`submit(person.value)`) | — |

### `assign-queue-studio.component.html` — Assign-Studio dialog (modal; OPERATOR **and** SPECIALIST use this file)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `aqs-studio-select` | `mat-select[formControlName="selectedstudio"]` | choose the studio when opening / moving into an Activity stage | — |
| `aqs-submit` | "Assign Specialist" submit button | commits the open-studio write (disabled until form valid). NOTE: studio.md called this `aqs-submit-btn`; the attribute value shipped is **`aqs-submit`** | — |

### `big-planner.component.html` — B!G Planner (route `/queuebigplanner?queueid=<docid>`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `bp-viewonly-toggle` | "View Only" `mat-slide-toggle` | toggles read-only; gates the studio action pills | — |
| `bp-event-select` | "Select Event" `mat-select` | selects event; main content `*ngIf="selectedEvent != null"` | — |
| `bp-participant-row` | a participant `mat-list-item` (`*ngFor`; sidenav, `!viewOnly`) | per-cohort participant; scope stats below by this row | `data-profile-id` = `invitation` |
| `bp-stat-studios` | `.stat-value` in the chip-studio chip | `profileStudioCount[id]?.length` for that participant | (scope via row) |
| `bp-stat-pair` | `.stat-value` in the chip-pair chip | `profilePairCount[id]?.length` for that participant | (scope via row) |
| `bp-studio-row` | studio-pairing table `tr[mat-row]` (`*matRowDef`) | one row per `queue studio pairing`; count = pairings | `data-studio-id` = `row.docid` |
| `bp-studio-toggle` | "Studio" open/close `button.action-pill` (`!viewOnly`) | `toggleStudio(studio)` → pairing `studioin` flip | `data-studio-id` = `studio.docid` |

---

## STUDIO / SPECIALIST surface

### `dynamic-studio.component.html` — Specialist "My Arena" (route `/dynamicstudio`; `?profileid=` override hook)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `studio-arena-title` | `h5.title` "My Arena (queuename)" | confirms queue resolved (`ongoingQueue.queuename`) | — |
| `studio-no-studio-alert` | `.no-studio-alert` (only if `noStudioInAnyQueue`) | empty-state banner | — |
| `studio-queue-card` | a queue card (`*ngFor`; only when >1 queue) | multi-queue picker; count = `queuesWithStudios.length` | `data-queueid` = `queue.docid` |
| `studio-queue-card-count` | `.queue-card__meta` "<n> studio(s)" | `queueStudioCounts[queue.docid]` | (scope via card) |
| `studio-select-btn` | a "My Studio" select button (`*ngFor`) | `onStudioSelect`; count = `studioList.length` | `data-studioid` = `studio.docid` |
| `studio-live-tv-icon` | `live_tv` `mat-icon` inside a studio button | present iff `mapStudioLiveAssignment[studioid]` truthy | (scope via button) |
| `studio-checkin-toggle` | "Studio Checkin" `mat-slide-toggle` | `checkinStudio($event.checked)`; `[checked]=selectedStudio.checkin` | — |
| `studio-stage-col` | a waiting-list stage column (`*ngFor`; only when `liveAssignment==null && checkin`) | column count = `stageTokenList.length` | `data-stage` = `stage.stagename` |
| `studio-token-card` | `.token` card (`*ngFor`) | an eligible waiting-list token | `data-token` = `token.docid` |
| `studio-bring-btn` | "Bring To Studio" button | `sendStudioInvitation(token)` → creates `studioinvitation` | (scope via token card) |
| `studio-live-participant-name` | `h3.profile-card__name` | the live participant's name (`mapProfile[...]`) | — |
| `studio-zoom-start-btn` | Zoom "Start Meeting" button | `navigateMeeting(liveAssignment)` (Zoom path) | — |
| `studio-zoom-regen-btn` | "Generate New Link?" button | `regenerateZoomLink()` (gated) | — |
| `studio-openvidu-start-btn` | OpenVidu "Start Meeting" button | `joinOpenViduRoom()` (OpenVidu path) | — |
| `studio-invite-more-btn` | "Invite More Participant in this Studio" button | `inviteMore(false)` | — |
| `studio-ael-validate-btn` | AEL validate button | `updateCurrentAEL()`; class `aelValidated`/`aelNotValidated` | — |
| `studio-mark-procedure-btn` | per-procedure "Mark as Completed"/"Completed" button (`*ngFor`) | `markProcedure(a,i,j)` | (scope via procedure text) |
| `studio-move-next-btn` | next-stage move button (`*ngFor`; TWO mutually-exclusive `*ngIf` branches share this value) | `moveStage(config.stage, config.markascompleted)`; only the visible branch renders | `data-stage` = `config.stage` |

### `preassign-studio.component.html` — Pre-assign studio dialog (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `preassign-studio-radio` | a studio `mat-radio-button` (`*ngFor`) | pick the studio to pre-assign | `data-studio-id` = `option.docid` |
| `preassign-submit-btn` | "Assign Studio and Move" button | `submit()`; disabled until a studio chosen | — |

### `create-bulk-invitation.component.html` — Operator Bulk-Invitation dialog (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `bulkinv-stage-select` | "Invite To" stage `mat-select` | pick the stage to invite into | — |
| `bulkinv-submit-btn` | "Send Invitation" submit | `sendInvitation()` → writes `bulk invitation` (CF fans out to `studioinvitation`) | — |

### `accept-other-studio.component.html` — Specialist↔specialist accept/deny dialog (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `aos-deny-btn` | "Deny Invitation" button | `cancel()` → returns `denied` | — |
| `aos-accept-btn` | "Accept Participant" button | `submit()` → returns `success` (`acceptedstudio` arrayUnion) | — |

### `invite-other-studio.component.html` — Specialist↔specialist invite dialog (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `ios-cancel-btn` | "Cancel Invitation" button | `cancel()` | — |
| `ios-invite-btn` | "Invite Participant" button | `submit()`; disabled until `callReady` (all mandatory studios accepted) | — |

### `queue-invitation-approval.component.html` — Specialist-side waiting/countdown overlay (modal)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `qia-countdown` | `.time` `<span>` | countdown seconds from `data.expirydate` | — |
| `qia-cancel-btn` | "Cancel Invitation" button | `cancel()` → returns `invitation cancelled` | — |

### `web-studio-invitation.component.html` — PARTICIPANT web accept/deny overlay (route `/queue-web`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `web-inv-overlay` | `.inv-overlay` (shown when `studioInvitation && !invitationAccepted`) | invite arrived (listener on `studioinvitation`) | — |
| `web-inv-accept-btn` | "Accept Invitation & Join" / "Join Now" button | `acceptInvitation()` → `clientresponse:'approved'` | — |
| `web-inv-later-btn` | "I'll join later" / "Confirm Join Later" button | `onJoinLater()` then `confirmJoinLater()` → `clientresponse:'denied'` | — |
| `web-inv-success-btn` | success "Got it, Thanks!" button | closes the post-accept modal | — |

### `arenastudioactivity.component.html` — Arena monitor (route `/arenastudioactivity`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `arena-queue-select` | queue `mat-select` | `onQueueSelect($event.value)` | — |
| `arena-zoom-available-count` | `.count-badge` "<n> Available" | `zoomNotInUseEmails.length` | — |
| `arena-participant-card` | `mat-card.participant-card` (`*ngFor`) | one per live assignment in `['live','recording']`; count = live count | `data-participant-id` = `item.participantid` |
| `arena-close-studio-btn` | "Close Studio" button (only if `developer`) | `closeStudio(item)`; live-assignment→`completed`, pairing→`null` | (scope via card) |
| `arena-empty-state` | `.empty-state` | "No participants in arena" when none | — |

### `join-openvidu-call.component.html` — LiveKit room (route `/joinroom/:roomid`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `joinroom-prejoin` | `.prejoin-container` (`!room() && meetingRoomStatus==null`) | pre-join screen mounted | — |
| `joinroom-enable-btn` | "Enable Access" `.btn-enable` | `prepareParticipant()` (request devices) | — |
| `joinroom-join-btn` | "Join Call" `.btn-join` | `joinCall()`; disabled until camera+mic granted | — |
| `joinroom-connected` | `.zoom-container` (`room() && status=='connected'`) | connected room shell (do NOT assert deep LiveKit grid) | — |

---

## BIG surface

### `big-dashboard.component.html` — Dashboard (route `big-dashboard`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `big-dash-total-count` | `<span>` wrapping `{{dataSource.data.length}}` (added wrapper) | Total Participants | — |
| `big-dash-filtered-count` | `<span>` wrapping `{{dataSource.filteredData.length}}` (added wrapper) | Filtered Participants | — |
| `big-dash-cohort-card` | a `.cohort-card` (`*ngFor`) | a dashboard cohort card | `data-cohort-id` = `item.docid` |
| `big-dash-cohort-count` | `.cohort-count` | `item.participantidlist?.length` for that card | (scope via card) |
| `big-dash-cohorts-btn` | "Coherts" button | `onManageCoherts()`; disabled when selection empty | — |

### `participant-assignment-board.component.html` — PAB (route `particiant_assignment_board`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `pab-marathon-btn` | `button.marathon` (`*ngFor`) | select a marathon (`fetchMarathonData`) | `data-marathon-id` = `marathon.docid` |
| `pab-marathon-pending` | `span.pending` | `marathonMap[docid].pending` badge | (scope via marathon btn) |
| `pab-status-btn` | `button.filter-btn` (`*ngFor` over the 5 statuses) | `applyStatusFilter(status)` | `data-status` = `status` |
| `pab-status-count` | `span.status-count` | length of that status bucket | (scope via status btn `data-status`) |
| `pab-card` | `.activity-card` (`*ngFor`) | an activity card | `data-assignment-id` = `activity.docid` |
| `pab-type-badge` | `.type-badge` | `activity.assignmenttype` | (scope via card) |
| `pab-status-badge` | `.status-indicator` | Ongoing/Upcoming/status | (scope via card) |
| `pab-perform-action` | `button.action-btn` (the LIVE one, inside `*ngIf="shouldShowButton"`) | `performAction(...)`; label from `getButtonText` | (scope via card) |

### `manual-assignments.component.html` — Manual assignment (route `manualassignment`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `manual-file-input` | hidden `input[type=file] #fileInput` | upload file(s); first pick flips status `ongoing` | — |
| `manual-submit` | "Submit" button (participant; `viewType!='review' && files`) | `onSubmit('submit')` → status `review` + `big assignment manual` write | — |
| `manual-rework` | "Mark As Rework" button (reviewer; `viewType=='review'`) | `onSubmit('rework')` | — |
| `manual-complete` | "Mark As Completed" button (reviewer) | `onSubmit('completed')` | — |

### `form-based-submission.component.html` — Form submission (route `formbasedsubmission`, legacy)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `form-submit` | "Submit" button (`!formpatch`) | `onSubmit(deliveryForm.value)` → status `review` + `formsByClient` write | — |
| `form-rework` | "Re-Work" button (reviewer) | `reworkNotes()` | — |
| `form-complete` | "Complete" button (reviewer) | `completeNotes()` | — |

> NOTE (from big.md): the LIVE PAB Form flow opens `formtemplate` (FormtemplateComponent), not this
> legacy component. This file is still a valid write-shape target.

### `validate-participants-assignment.component.html` — Validate kanban (route `validateParticipantAssignments`)
| testid | element | purpose | companion attr |
|---|---|---|---|
| `validate-marathon-select` | marathon `<select>` | `onMarathonChange` | — |
| `validate-assignment-item` | `.assignment-item` (`*ngFor`) | pick an assignment | `data-assignment-id` = `assignment.id` |
| `validate-col` | `.kanban-column` (`*ngFor` over 5 statuses) | a status column | `data-status` = `status` |
| `validate-col-count` | `.column-count` | `getStatusCount(status)` (stream) | (scope via column `data-status`) |
| `validate-bulk-move` | `.move-all-btn` (opens bulk menu) | bulk-move trigger; disabled when 0 selected | (scope via column) |
| `validate-single-move` | `.action-btn-sm.move` (opens single menu) | per-card move trigger | (scope via participant card) |
| `validate-move-to` | a move-target `button[mat-menu-item]` (`*ngFor`; SHARED by bulk + single menus) | clicking writes `status`. Bulk menu calls `moveParticipant`; single calls `moveSingleParticipant`. Only the OPEN mat-menu has items in DOM — open the desired trigger first, then select | `data-status` = `s` (target status) |
| `validate-review` | `.action-btn-sm.review` (only `status==='review'`) | `review(p)` (opens review dialog / ATC/manual screen) | (scope via card) |

### Config / analytics / monitor screens
| testid | file (route) | element | purpose |
|---|---|---|---|
| `modelconfig-add` | `atcmodel-level-config.component.html` (`modellevelconfig`) | "Add New Config" button | `updateList(null)` opens the edit dialog |
| `biglevel-add` | `big-level.component.html` (`biglevel`) | "Add New Level" button | `updateList(null)` |
| `ael-submit` | `big-aggregate-event-level.component.html` (`bigaggregateeventlevel`) | "update participant level" submit | `submit()` → `big aggregate event level` write |
| `ael-total-count` | `big-aggregate-event-level.component.html` | "Total ATC Model Count" value `<label>` | `dataSource.filteredData.length` |
| `aggregate-submit` | `big-aggregate.component.html` (`big_aggregate`) | "Update participant level" submit | submit |
| `aggregate-total-count` | `big-aggregate.component.html` | "Total ATC Model Count" value `<label>` | `dataSource.filteredData.length` |
| `monitor-export` | `monitor-activity-log.component.html` (`bigactivitymonitor`) | "Export" button | `exportLog()` |
| `activitylog-export` | `big-activity-log.component.html` (`bigactivitylog`) | "Export CSV" button | `exportCSV()` |
| `watchvideos-complete` | `watch-videos.component.html` (dialog from PAB Video) | "Complete assignment" button | `completeAssignment()`; disabled until all watched → PAB writes status `completed` |
| `zoom-join` | `zoom-meeting.component.html` (`zoommeeting_bigparticipants`) | `#zmmtg-root` div (Zoom Web SDK mount point) | the only stable anchor; the screen is SDK-driven (`ZoomMtg.join`). On load it writes status `ongoing` to `big assignment` + `big participants assignments` |

---

## CROSS-REFERENCE — recon NEEDS-TESTID → shipped value (where names differ)
- studio.md #19/#20 named the assign dialog hooks `aqs-studio-select` / `aqs-submit-btn`; operator.md #20/#21
  named them `aqs-studio-select` / `aqs-submit`. **Shipped values: `aqs-studio-select`, `aqs-submit`.**
- For all `*ngFor` rows where the recon suggested a templated value like `'pab-marathon-'+docid` or
  `'validate-col-'+status`, the **shipped** value is the static base (`pab-marathon-btn`, `validate-col`, …)
  plus a `[attr.data-*]` id/status — see the companion-attr column above. Locate one with
  `[data-testid="<base>"][data-<key>="<id>"]`.

## NOT HOOKED (assert via app/CF output or the recon's existing selectors, not the planner DOM)
- B!G Planner `completedToken` / `stageTokenMap` — computed, NO template binding (operator.md §1.I, §4).
  Assert via the operator board stage counts or the underlying Firestore the app aggregates.
- Comms Email/Notification/BulkInvite buttons, stage-chat, filter sub-rows (segment/preassigned/stageSlot/
  CS/ATC), and the per-stage message/activity icons were NOT flagged for testids — use the
  role+name / unique-class / `getText` selectors in `operator.md` §1.B/§1.F/§1.G.
