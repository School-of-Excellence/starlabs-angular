# RECON: SPECIALIST / STUDIO surface (SS-00 … SS-16)

Source-of-truth read on branch `docs/concept-groups-wip` (production repo `/Users/antano/solarcode/ah/starlabs-angular`). Every line citation below is `file:line`. Specs live under `e2e/queue/**` (testDir `queue`); page objects go in `e2e/queue/pages`.

Components mapped:
- `src/app/queue system/dynamic-studio/dynamic-studio.component.{ts,html}` — the Specialist "My Arena" screen (route `/dynamicstudio`).
- `src/app/queue system/arenastudioactivity/arenastudioactivity.component.{ts,html}` — Arena monitor (route `/arenastudioactivity`).
- `src/app/queue system/assign-queue-studio/assign-queue-studio.component.{ts,html}` — "Assign Specialist" dialog.
- `src/app/queue system/preassign-studio/preassign-studio.component.{ts,html}` — pre-assign-studio radio dialog (next-stage routing).
- `src/app/queue system/create-bulk-invitation/create-bulk-invitation.component.{ts,html}` — OPERATOR bulk-invite dialog (writes `bulk invitation`).
- `src/app/queue system/queue-invitation-approval/queue-invitation-approval.component.{ts,html}` — SPECIALIST-side "waiting for participant" countdown + mini-game overlay.
- `src/app/queue system/accept-other-studio/accept-other-studio.component.{ts,html}` — specialist-to-specialist accept/deny dialog.
- `src/app/queue system/invite-other-studio/invite-other-studio.component.{ts,html}` — specialist-to-specialist stage-grouping invite dialog.
- `src/app/web-studio-invitation/web-studio-invitation.component.{ts,html}` — PARTICIPANT web accept/deny overlay (mounted at route `/queue-web`).
- `src/app/OpenVidu/join-openvidu-call/join-openvidu-call.component.{ts,html}` — LiveKit room (route `/joinroom/:roomid`).

Route table — `src/app/app.routes.ts`:
- `/dynamicstudio` → `DynamicStudioComponent`, `canActivate:[authGuard]` (app.routes.ts:102).
- `/arenastudioactivity` → `ArenastudioactivityComponent`, `canActivate:[authGuard]` (app.routes.ts:114).
- `/joinroom/:roomid` → `JoinOpenviduCallComponent`, `canActivate:[authGuard]` (app.routes.ts:295).
- `/queue-web` → `QueueWebVersion1Component`, `canActivate:[authGuard]` (app.routes.ts:319) — hosts `<app-web-studio-invitation>`.

> CRITICAL TEST HOOK: `DynamicStudioComponent` reads `?profileid=` from the query string and uses it as the acting specialist (`dynamic-studio.component.ts:160`, `:171` `this.profileid = overrideProfileId || roles['profile_ref'].id`). A spec can drive `/dynamicstudio?profileid=<seededSpecialist>` to act as any seeded studio member WITHOUT a per-specialist Auth user — but the queue/studio data must already place that profileid into a `queue studio pairing.participants` array. This is the cheapest way to satisfy the anti-circularity rule for studio specs (drive the real UI as a real specialist, assert app-computed counts).

---

## (1) SELECTOR TABLE — SS-00 … SS-16

> Legend: **el** = element/role; **selector** = what the page object should target TODAY (none of these files have a single `data-testid` — see §2). All selectors are CSS unless noted. "computed" = a value the APP/CF produced (anti-circularity safe to assert). All `*.html` paths are under `src/app/queue system/` unless prefixed.

### SS-00 — Arena login + load (`/dynamicstudio`)
| el | selector (today) | source | asserts (computed) |
|---|---|---|---|
| Arena title (queue name) | `h5.title` text `My Arena (<queuename>)` | dynamic-studio.component.html:4 | `ongoingQueue.queuename` resolved |
| "No studios in any queue" alert | `.no-studio-alert` (only if `noStudioInAnyQueue`) | html:8-11 | computed `noStudioInAnyQueue` (ts:204, recompute ts:349) |
| Queue card list (multi-queue) | `.queue-card-list .queue-card` (only when `queuesWithStudios.length > 1`) | html:13-30 | card count == `queuesWithStudios.length` |
| Per-queue studio count chip | `.queue-card__meta` text `<n> studio(s)` | html:22-25 | `queueStudioCounts[queue.docid]` (computed ts:339-348) |
| "No Active Queue Found" | native `alert()` | ts:215-217 | fires only when `ongoingQueue.docid` null |

### SS-01 — Studio select / counts / live_tv
| el | selector | source | asserts |
|---|---|---|---|
| My-studio button (one per studio member) | `button[mat-stroked-button]` rendered by `*ngFor let studio of studioList` | html:46-55 | button count == `studioList.length` (filtered ts:464: `participants.includes(profileid) && !delete`) |
| Studio button label (activity names, not raw ids) | inner `{{mapActivity[studio.participantsactivity[participant]]}}` (+`(You)`/`(name)`) | html:48-53 | renders mapped activity/name, never raw id |
| Selected-studio style | `.primarystudio` (selected) / `.secondarystudio` (checkin) | html:46 | `selectedStudio.docid == studio.docid` |
| **live_tv** icon (studio has live assignment) | `mat-icon` text `live_tv` inside the studio button | html:54 | present iff `mapStudioLiveAssignment[studio.docid]` truthy (computed ts:516-526) |
| Select action | click the studio button → `onStudioSelect(studio)` | html:46 / ts:632 | — |

### SS-02 — Check-in toggle + log
| el | selector | source | asserts |
|---|---|---|---|
| Check-in toggle | `mat-slide-toggle` with text "Studio Checkin" (only when `selectedStudio.docid && liveAssignment==null`) | html:57-59 | `[checked]="selectedStudio.checkin"`, `[disabled]="onhold==true"` |
| toggle change handler | `(change)` → `checkinStudio($event.checked)` | html:58 / ts:825 | writes pairing.checkin + `studio checkin log` row (ts:850-864) |
| on-hold bypass | `HoldAlertDialogComponent` opens; toggle reverts; writes `onhold:true` | ts:866-873 | hold path does NOT write a checkin log; sets `onhold` |

### SS-03 — Waiting-list (eligible tokens per stage)
| el | selector | source | asserts |
|---|---|---|---|
| Stage column | `.stagename` (header) inside `*ngFor stageTokenList` (only when `liveAssignment==null && selectedStudio.checkin`) | html:138-142 | column count == `stageTokenList.length` |
| Token card | `.token` (per token) | html:144-163 | per-stage `tokenlist.length` == seeded eligible count |
| Token fields | `.label` "Token Number"/"Name"/"Status" | html:147-151 | `token.tokennumber`, `mapProfile[profile_id]`, `token.status` |
| "Preassigned to you" hint | `.font-italic` "* Preassigned to you" | html:152-154 | only when `token.preassigned[stage]` includes `selectedStudio.docid` |
| eligibility filter (the silent-gap rule) | computed in `onStudioSelect` | ts:804-811 | a token shows ONLY if `status=='ready'` AND `currentstage==stage` AND `liveassignmentid==null` AND atcmodel matches (`selectedStudio.atcmodel` ⊇ `mapProducts[productref.id]`) AND preassign filter passes |

### SS-04 — Bring To Studio → invite (participant)
| el | selector | source | asserts |
|---|---|---|---|
| "Bring To Studio" button | `button.stagebtn` text "Bring To Studio" → `sendStudioInvitation(token)` | html:158-160 / ts:878 | — |
| invite write | (see §3) creates `studioinvitation` w/ `clientresponse:null`, `expirydate = now+2min` | ts:973-999 (esp :987) | exactly ONE `studioinvitation` per non-dup invite |
| dup/race guard | `alert(...)` "about to respond invitation from other studio" | ts:976-977 | if an unexpired pending/approved invite already exists for the token, NO new doc written |
| stage-grouping branch | opens `InviteOtherStudioComponent` first when mandatory/optional stage grouping configured | ts:884-967 | (SS-14 covers other-studio) |

### SS-05 — Participant accept/deny  (**WEB route — see §5**)
Two distinct surfaces:
**A. Specialist-side countdown** (`QueueInvitationApprovalComponent`) — opens automatically in dynamic-studio while waiting:
| el | selector | source | asserts |
|---|---|---|---|
| overlay container | `.dialog-container` / `.timer-text .time` | queue-invitation-approval.component.html:1-43 | countdown from `data.expirydate` (ts:63-66) |
| auto-close on expiry | dialog closes returning `'invitation cancelled'` | queue-invitation-approval.component.ts:49-55 | on expiry dynamic-studio DELETES the invitation doc (dynamic-studio.ts:610-616) |
| Cancel button | `.cancel-btn` text "Cancel Invitation" | qia.html:40-42 / qia.ts:166 | returns `'invitation cancelled'` |

**B. Participant-side web overlay** (`WebStudioInvitationComponent`, route `/queue-web`):
| el | selector | source | asserts |
|---|---|---|---|
| invite overlay | `.inv-overlay` (shown when `studioInvitation && !invitationAccepted`) | web-studio-invitation.component.html:2 | listener fires on a matching `studioinvitation` (ts:49-103) |
| stage name | `.inv-stage-name` | web html:11/23 | `studioInvitation.stage` |
| Accept button | `.inv-btn--accept` → `acceptInvitation()` | web html:53 / ts:117-124 | writes `clientresponse:'approved'` (ts:122) |
| "I'll join later" → confirm | `.inv-btn--later` → `onJoinLater()` then `confirmJoinLater()` | web html:56-58 / ts:126-136 | deny writes `clientresponse:'denied'` (ts:133) |
| success modal | `.inv-success-dialog` / `.inv-success-btn` | web html:64-91 | shown after accept |
| CF reaction (drift catch) | back in dynamic-studio: `clientresponse=='approved'` → `assignStudio()` (only if `createdby==profileid`); `'denied'` → alert | dynamic-studio.ts:559-576 | accept must produce a `live assignment`+pairing flip; deny must produce NONE |

### SS-06 — Assign studio → open session
| el | selector | source | asserts |
|---|---|---|---|
| Assign dialog | `AssignQueueStudioComponent` (opened from `assignStudio`) | dynamic-studio.ts:1050-1065 | — |
| Studio specialist select | `mat-select[formControlName="selectedstudio"]` | assign-queue-studio.component.html:6-8 | pre-selected when single studio (aqs.ts:73-77) |
| Add other specialists | `button` text "Add Other Specialists" → `addBonusArray()` | aqs.html:41-43 / aqs.ts:139 | — |
| Activity/Participant rows | `mat-select[formControlName="activity"]` / `formControlName="participants"` | aqs.html:16/25 | — |
| Submit | `button[type="submit"]` text "Assign Specialist" `[disabled]="activityForm.invalid"` | aqs.html:46 / aqs.ts:148 | closes with studio+bonusactivity result |
| end-state (the SS-06 invariant) | see §3 "studio open/assign" | dynamic-studio.ts:1066-1139 | token `instudio`+`liveassignmentid`+`studioid`; ONE `live assignment` status `live`; pairing `status:'live'`; ONE `queue stage log` |

### SS-07 — Live-panel widgets / numbers (cross-DB)
All gated by `ongoingQueue.stageproperty[<stage>].studiowidgets` (array). Container `*ngIf="...studiowidgets"` at html:269.
| widget | selector (when present) | gate token | source | computed value |
|---|---|---|---|---|
| Forms submitted | `.widgetbox` "Forms submitted by the Participant", `button` per form | (always if `participantForm.length`) | html:259-266 | `participantForm` from secondary DB `firestore-forms`/`formsByClient` (ts:758-787) |
| Participant AEL | `.widgetbox` "Participant AEL" | `validateael` | html:272-289 | `participantAEL.crossovermetric` (ts:2168-2181) |
| Triple ATC | `.widgetbox` "Triple ATC Submitted..." | `viewtripleatc` | html:292-298 | `tripleATCList` from `firestore-atc/triple atc` (ts:2112-2128) |
| Previous ATC | `.previous-atc-card` toggle "Previous ATC History" | `previousatc` | html:301-315 | embeds `<app-view-participant-atc>` |
| Love Letters | `.love-letter-card` toggle | `loveletters` | html:318-349 | `loveLetterList` (ts:1840-1865) |
| Prescribed (validated) ATC | `.widgetbox` "ATC Prescribed to the Participant" + `mat-icon` refresh | `prescribedvalidatedatc` | html:352-406 | `alphaATCList` (ts:1670 `previewATC('alpha')`) |
| Prescribed (unvalidated) ATC | `.widgetbox` "...(Yet to Validate)" | `prescribedunvalidatedatc` | html:410-463 | `unvalidatedATCList` (ts:1670 `previewATC('validation')`) |
| Prescribe new ATC | `.widgetbox` "Prescribe New ATC..." buttons | `addvalidatedatc`/`addunvalidatedatc` | html:466-470 | opens `/prescribeATC` new tab (ts:1658-1663) |
| Assign Changeagent | `.widgetbox` "Assign Changeagent to Procedures" → "Open ATC" | `assignprocedure` | html:473-478 | `assignChangeagent(true)` (ts:1985) |
| Mark Completed Procedures | `.widgetbox` "Mark Completed Procedures" (see SS-09) | `assignedatc` | html:481-512 | `cwATClist` (ts:1874) |
| Move to next-month review | `.widgetbox` "Move Participants to next month Review" | `movetonextqueue` | html:515-518 | `movetoNextMonthReview()` (ts:2290) |

> **Anti-circularity for SS-07:** seed a KNOWN non-zero count in the secondary DB (e.g. 2 triple-ATC docs, 1 form) and assert the widget shows that exact number — not "== whatever the query returned" (the secondary-DB-empty failure mode reads 0 on both sides). The PLAN P1 #7 flags this.

### SS-08 — Validate AEL
| el | selector | source | asserts |
|---|---|---|---|
| Current Level select | `mat-select [(ngModel)]="crossover.value['value']"` (per metric) | html:278-283 | options from `aelLevelList` (ts:2148-2149) |
| edit marks status | `(selectionChange)` sets `participantAEL.aelStatus='edited'` | html:280 | — |
| Validate button | `button` (class `aelValidated`/`aelNotValidated`) → `updateCurrentAEL()` | html:285-287 / ts:2223 | writes `interim crossover` doc + sets `participant AEL.flag='validated'` (batch ts:2253-2264); `updated:true` if metric changed (ts:2260-2262) |
| gate (SS-12 link) | `moveStage(...,markascompleted=true)` blocks if AEL not validated | ts:1163-1172 | `alert("Participant AEL is not validated...")` and returns |

### SS-09 — Mark procedures complete
| el | selector | source | asserts |
|---|---|---|---|
| Procedure row | `.procedurelabel` "* {{mapProcedure[...]}}" | html:496-501 | one per mandatory procedure in `cwATClist` |
| Mark button | `button` class `marked`/`tomark` text "Completed"/"Mark as Completed" → `markProcedure(a,i,j)` | html:499 / ts:1970 | toggles `status` between `completed`/`yet to start`, writes to `firestore-atc` procedure path (ts:1977-1979) |
| persistence | re-`onStudioSelect` re-reads `getAssignedATC` | ts:1874 | status persists on reload |

### SS-10 — Invite more participants in studio
| el | selector | source | asserts |
|---|---|---|---|
| Button | `button` text "Invite More Participant in this Studio" → `inviteMore(false)` | html:254-256 / ts:1569 | opens `AssignQueueStudioComponent` (title "Update Additional Specialist...") |
| commit | updates `live assignment.bonusactivity`/`bonusactivityparticipant` + token `people_involved` | ts:1600-1612 | session NOT torn down; on cancel (null) NO write (ts:1592 guard) |

### SS-11 — Zoom / OpenVidu join (**externals; see §4 & STUB**)
Zoom path (when `selectedStudio.openvidu != true`):
| el | selector | source | asserts |
|---|---|---|---|
| Zoom status block | `.statusmessage` (gated `zoomlinkrequired!=false && enablezoommeetingsdk∈[false,undef] && openvidu!=true`) | html:232-239 | — |
| Zoom start link | `a.zoomlink [href]="liveAssignment.zoomdata?.start_url"` | html:235 | text shows "Generating Link..." until `start_url` set |
| Start Meeting (Zoom) | `button.button-36` "Start Meeting" → `navigateMeeting(liveAssignment)` `[disabled]="zoomdata===undefined"` | html:236 / ts:2274 | opens `/openmeeting/<docid>/queue`; broken-link guard: `start_url=='Link Broken'`→`alert("Link is broken...")` (ts:2278-2281) |
| Regenerate link | `button` "Generate New Link?" → `regenerateZoomLink()` (gated by `zoomlinkGenerator` 10s timer + `stageproperty[stage].enablezoom`) | html:238 / ts:1622 | GETs `studioZoomLinkRegenerate` CF (ts:1628/1632) |

OpenVidu path (when `selectedStudio.openvidu==true`):
| el | selector | source | asserts |
|---|---|---|---|
| OpenVidu status block | `.statusmessage` (gated `selectedStudio.openvidu`) | html:246-252 | — |
| Start Meeting (OpenVidu) | `button.button-36` "Start Meeting" → `joinOpenViduRoom()` | html:251 / ts:2572 | creates/activates `openviduroom/{liveassignmentid}` (ts:2581-2617); opens `/joinroom/<liveassignmentid>` (ts:2622) |

`/joinroom/:roomid` (LiveKit room) — `OpenVidu/join-openvidu-call/join-openvidu-call.component.html`:
| el | selector | source | asserts |
|---|---|---|---|
| Loading | `.text-center` `*ngIf="loading"` | joinroom html:1 | — |
| Server states | `meetingRoomStatus` == `servercheck`/`serverstarting`/`serverfailed` blocks | joinroom html:6-16 | (stub the server CFs) |
| Pre-join container | `.prejoin-container` (`!room() && meetingRoomStatus==null`) | joinroom html:19 | room resolves `openviduroom/{roomid}` (joinroom ts:137-159) |
| Title | `.title` text `roomDetail.title` | joinroom html:21 | computed from `openviduroom.title` |
| Enable devices | `button.btn-enable` → `prepareParticipant()` | joinroom html:68 | — |
| **Join Call** | `button.btn-join` text "Join Call" `[disabled]="cameraStatus!=='granted' || micStatus!=='granted'"` → `joinCall()` | joinroom html:71-73 | requests `createOpenViduToken` CF (ts:458), `room.connect()` (ts:408) |
| Connected room | `.zoom-container` (`room() && meetingRoomStatus=='connected'`) | joinroom html:89 | (LiveKit deep grid NOT asserted — stub) |
| Recording toggle (host) | `.stop-record-btn`/`.start-record-btn` → `toggleRecording()` | joinroom html:107-122 | — |
| Kick/Mute (host) | `.participant-options-btn` menu → `removePanticipant`/`toggleParticipantMute` | joinroom html:159-171 | `kickParticipant`/`muteParticipant` CFs |
| ended | `meetingRoomStatus=='ended'` when room doc `active==false` | joinroom ts:154-157 | — |

### SS-12 — Move to next stage (complete)
| el | selector | source | asserts |
|---|---|---|---|
| Next-stage section | `.widgetbox` "Completed <STAGE>?" | html:522-528 | — |
| Move buttons (variation-scoped) | `button.actionbtn` text `{{config.calltoaction}}` → `moveStage(config.stage, config.markascompleted)` | html:524-527 / ts:1157 | non-variation token shows config w/ no `variations`; variation token shows ONLY configs whose `variations` include its `variationid` (html:525-526) — negative assert: must NOT offer other-variation edges |
| confirm dialog | `StageIncompleteConfirmationComponent` (same-stage loop OR not-mark-completed) | ts:1275-1283 | cancel → no write |
| complete + close (the SS-12 invariant) | see §3 "move-next/complete" | ts:1284-1351 | token `currentstage=next`,`liveassignmentid:null`,`studioid:null`,`status` (queued/null); ONE stage-log (movedthrough `studio`); live-assignment `completed`+`updated`; pairing `status:null`; if final stage → `updateDeliveryStatus(path,'completed',{eventRequestRef})` (ts:1327-1340) |

### SS-13 — Move next (review path)
| el | selector | source | asserts |
|---|---|---|---|
| review branch | when `liveAssignment.stagename != nextstage && markascompleted==true` → `inviteMore(true)` then `HoldAlertDialogComponent` | ts:1353-1406 | cancel (`result==null`) → NO partial move (ts:1355,1361) |
| close | `closeStudio()` sets live-assignment `completed`+`isactivitydone:true`, pairing `status:null` | ts:1411-1434 | stale-studio cleared after close |

### SS-14 — Other Studio join (specialist↔specialist)
| el | selector | source | asserts |
|---|---|---|---|
| "Other Studio that you are invited to Join" | `.otherstudio` block (only when `outsideLiveAssignment.length`) | html:32-44 | count == `outsideLiveAssignment.length` (filter `bonusactivityparticipant array-contains profileid`, ts:412) |
| join button (per studio) | `button` "Studio {{i+1}}: ..." → `visitOtherStudio(studio)` | html:34-40 / ts:417 | opens `/joinroom/<docid>` (openvidu) or `zoomdata.join_url` (ts:434-439); dead-click → `alert("Unable to join in the moment.")` (ts:447) |
| stage-grouping accept overlay | `AcceptOtherStudioComponent` auto-opens when a `studioinvitation type=='stagegrouping'` targets one of my studios | ts:484-510 | accept → `arrayUnion(acceptedstudio)`; deny → `arrayUnion(deniedstudio)` (ts:498-505) |
| accept/deny buttons | `.successbtn` "Accept Participant" / `.cancelbtn` "Deny Invitation" | accept-other-studio.component.html:5-6 | returns `'success'`/`'denied'` (aos.ts:28-34) |
| invite-other (sender side) | `InviteOtherStudioComponent`: `.successbtn` "Invite Participant" `[disabled]="!callReady"` / `.cancelbtn` "Cancel Invitation" | invite-other-studio.component.html:35-37 | `callReady` true iff all `mandatorystudio ⊆ acceptedstudio`; if any mandatory denied → `alert("...specialist is not available")` (ios.ts:46-57) |

### SS-15 — Arena Studio Activity monitor (`/arenastudioactivity`)
| el | selector | source | asserts |
|---|---|---|---|
| Title | `h4.title` "Arena Live Studio" | arenastudioactivity.component.html:2 | — |
| Queue select | `mat-select (selectionChange)="onQueueSelect($event.value)"` + `ngx-mat-select-search` | aa.html:6-13 | options from `queuelist` (top-5 by `queueenddate`, aa.ts:63) |
| Available-zoom count | `.count-badge` "<n> Available" + `.email-chips mat-chip` | aa.html:27-36 | `zoomNotInUseEmails.length` (computed aa.ts:70) |
| Participant card (per live assignment) | `mat-card.participant-card` `*ngFor arenaparticipant` | aa.html:40-131 | card count == live-assignment count where `status in ['live','recording']` (aa.ts:91-99) |
| EIS / Client / Stage / Zoom | `.eis-chip` / `.value` / stage `.value` / `.zoom-value` | aa.html:54-107 | names via `mapProfile` (no raw ids) |
| stage-mismatch warning | `.warning-banner` / `.warning-icon` | aa.html:80-88,119-123 | shown iff `mapParticipantToToken[participantid].currentstage != item.stagename` (computed) |
| duplicate-pairing flag | `.duplicate-banner` / `.duplicate-icon` | aa.html:57-61,125-129 | `duplicateSpecialistPairing.includes(pairing.join(','))` (computed aa.ts:107-112) |
| Close Studio (developer only) | `button[color="warn"]` "Close Studio" → `closeStudio(item)` (only if `developer`) | aa.html:110-114 / aa.ts:134 | live-assignment `status:'completed'`; pairing `status:null` (aa.ts:137-145) |
| empty state | `.empty-state` "No participants in arena" | aa.html:134-137 | when `!arenaparticipant.length` |

> ROLE GATE (SS-15b negative): `ArenastudioactivityComponent` constructor only sets `this.developer = roles["developer"]` (aa.ts:59); the route guard is the generic `authGuard` (app.routes.ts:114), NOT a role gate — so the data subscriptions run for ANY authed user; only the "Close Studio" button is dev-gated. The PLAN P0 #4 negative test ("plain eis is denied the monitor") will FAIL against current code because there is no role denial — flag this as a finding, not a passing assertion.

### SS-16 — No-studio empty state
| el | selector | source | asserts |
|---|---|---|---|
| no-studio banner | `.no-studio-alert` "No studios available in any of your ongoing queues." | dynamic-studio.component.html:8-11 | `noStudioInAnyQueue==true` (ts:204/349) |
| no eligible stages | `alert("No eligible stages found for this Studio!")` | ts:818-822 | when a selected studio's activity matches no stage |
| ghost render | waiting-list `*ngIf="liveAssignment==null && selectedStudio.checkin"` | html:138 | empty stageTokenList → no `.token` nodes |

---

## (2) NEEDS-TESTID list

No target file contains any `data-testid`. The test-hooks step should add the following (file, line, proposed `data-testid`). Buttons in `*ngFor` should also carry an indexable hook (suggest `[attr.data-testid]="'...-' + i"`).

| # | file (under `src/app/`) | line | element | proposed data-testid |
|---|---|---|---|---|
| 1 | queue system/dynamic-studio/dynamic-studio.component.html | 4 | `h5.title` arena header | `studio-arena-title` |
| 2 | …dynamic-studio.component.html | 8 | `.no-studio-alert` | `studio-no-studio-alert` |
| 3 | …dynamic-studio.component.html | 16 | `.queue-card` (ngFor) | `studio-queue-card` (+ `[attr.data-queueid]="queue.docid"`) |
| 4 | …dynamic-studio.component.html | 22 | `.queue-card__meta` count | `studio-queue-card-count` |
| 5 | …dynamic-studio.component.html | 46 | studio button (ngFor) | `studio-select-btn` (+ `[attr.data-studioid]="studio.docid"`) |
| 6 | …dynamic-studio.component.html | 54 | `live_tv` mat-icon | `studio-live-tv-icon` |
| 7 | …dynamic-studio.component.html | 58 | check-in `mat-slide-toggle` | `studio-checkin-toggle` |
| 8 | …dynamic-studio.component.html | 140 | stage column wrapper (ngFor) | `studio-stage-col` (+ `[attr.data-stage]="stage.stagename"`) |
| 9 | …dynamic-studio.component.html | 145 | `.token` card | `studio-token-card` (+ `[attr.data-token]="token.docid"`) |
| 10 | …dynamic-studio.component.html | 158 | "Bring To Studio" button | `studio-bring-btn` |
| 11 | …dynamic-studio.component.html | 202 | live-assignment participant name | `studio-live-participant-name` |
| 12 | …dynamic-studio.component.html | 236 | Zoom "Start Meeting" | `studio-zoom-start-btn` |
| 13 | …dynamic-studio.component.html | 238 | "Generate New Link?" | `studio-zoom-regen-btn` |
| 14 | …dynamic-studio.component.html | 251 | OpenVidu "Start Meeting" | `studio-openvidu-start-btn` |
| 15 | …dynamic-studio.component.html | 255 | "Invite More Participant" | `studio-invite-more-btn` |
| 16 | …dynamic-studio.component.html | 285 | AEL validate button | `studio-ael-validate-btn` |
| 17 | …dynamic-studio.component.html | 499 | "Mark as Completed" procedure button | `studio-mark-procedure-btn` |
| 18 | …dynamic-studio.component.html | 524 | next-stage move button (ngFor) | `studio-move-next-btn` (+ `[attr.data-stage]="config.stage"`) |
| 19 | queue system/assign-queue-studio/assign-queue-studio.component.html | 6 | `selectedstudio` select | `aqs-studio-select` (has formControlName already) |
| 20 | …assign-queue-studio.component.html | 46 | "Assign Specialist" submit | `aqs-submit-btn` |
| 21 | queue system/preassign-studio/preassign-studio.component.html | 4 | radio per studio | `preassign-studio-radio` |
| 22 | …preassign-studio.component.html | 14 | "Assign Studio and Move" | `preassign-submit-btn` |
| 23 | queue system/create-bulk-invitation/create-bulk-invitation.component.html | 8 | "Invite To" stage select | `bulkinv-stage-select` |
| 24 | …create-bulk-invitation.component.html | 33 | "Send Invitation" submit | `bulkinv-submit-btn` |
| 25 | queue system/accept-other-studio/accept-other-studio.component.html | 5 | "Deny Invitation" | `aos-deny-btn` |
| 26 | …accept-other-studio.component.html | 6 | "Accept Participant" | `aos-accept-btn` |
| 27 | queue system/invite-other-studio/invite-other-studio.component.html | 36 | "Invite Participant" (disabled until callReady) | `ios-invite-btn` |
| 28 | …invite-other-studio.component.html | 35 | "Cancel Invitation" | `ios-cancel-btn` |
| 29 | queue system/queue-invitation-approval/queue-invitation-approval.component.html | 30 | `.time` countdown | `qia-countdown` |
| 30 | …queue-invitation-approval.component.html | 40 | "Cancel Invitation" | `qia-cancel-btn` |
| 31 | web-studio-invitation/web-studio-invitation.component.html | 2 | `.inv-overlay` | `web-inv-overlay` |
| 32 | …web-studio-invitation.component.html | 53 | "Accept Invitation & Join" | `web-inv-accept-btn` |
| 33 | …web-studio-invitation.component.html | 56 | "I'll join later" / "Confirm Join Later" | `web-inv-later-btn` |
| 34 | …web-studio-invitation.component.html | 89 | success "Got it, Thanks!" | `web-inv-success-btn` |
| 35 | queue system/arenastudioactivity/arenastudioactivity.component.html | 6 | queue `mat-select` | `arena-queue-select` |
| 36 | …arenastudioactivity.component.html | 28 | `.count-badge` available count | `arena-zoom-available-count` |
| 37 | …arenastudioactivity.component.html | 40 | `mat-card.participant-card` (ngFor) | `arena-participant-card` |
| 38 | …arenastudioactivity.component.html | 111 | "Close Studio" | `arena-close-studio-btn` |
| 39 | …arenastudioactivity.component.html | 134 | `.empty-state` | `arena-empty-state` |
| 40 | OpenVidu/join-openvidu-call/join-openvidu-call.component.html | 19 | `.prejoin-container` | `joinroom-prejoin` |
| 41 | …join-openvidu-call.component.html | 68 | "Enable" `.btn-enable` | `joinroom-enable-btn` |
| 42 | …join-openvidu-call.component.html | 71 | "Join Call" `.btn-join` | `joinroom-join-btn` |
| 43 | …join-openvidu-call.component.html | 89 | `.zoom-container` connected | `joinroom-connected` |

---

## (3) WRITE SHAPES

> Collections with spaces: `live assignment`, `queue studio pairing`, `queue stage log`, `queue generation`, `studio checkin log`, `bulk invitation`, `interim crossover`, `participant AEL`, `event participation request`. Anti-circularity: assert these AFTER an APP/CF action against a seeded precondition; never read-back a value the test itself wrote.

### 3a. Studio OPEN / ASSIGN — `assignStudio()` (dynamic-studio.ts:1066-1139); operator twin in dynamic-queue-manager.ts:~1042
Three coupled writes (guarded by `result != null && liveAssignment == null`):

**(i) `queue studio pairing/{studioid}` UPDATE** (ts:1091-1093):
```
{ status: "live" }
```

**(ii) `queue_token/{token.docid}` UPDATE via updateQueueStage(log)** (ts:1097-1116 → :1143-1156). The `data` merged onto token:
```
{ previousstage: <stage>, currentstage: <stage>, logdate: serverTimestamp(),
  stagestatus: "Approved", quicknotes:null, cwmentoring:null, cwshadowing:null, cwperson:null,
  diagnosticmentoring:null, diagnosticshadowing:null, diagnosticperson:null,
  people_involved: <unique(participants ∪ keys(bonusactivity))>,
  arenaid: null, liveassignmentid: <new id>, studioid: <pairing docid>, status: "instudio" }
```

**(iii) `queue stage log/{logdocid}` SET** — written by `updateQueueStage` for EVERY move (ts:1149-1155):
```
{ ...token, ...data, logdocid:<id>, movedby:<profileid>, movedthrough:"studio" }
```
> Invariant: a studio-driven move's stage-log row has `movedthrough == "studio"` (operator board uses `"queue manager"`). EVERY-MOVE-LOGGED = exactly one new `queue stage log` per token transition.

**(iv) `live assignment/{liveassignmentid}` SET (merge)** (ts:1119-1136):
```
{ docid:<id>, pairing:<participants[]>, participantid:<token.profile_id>, stagename:<stage>,
  atcmodel:<from queue variation.atcmodel | productref.atcmodel>, status:"live",
  queueid:<ongoingQueue.docid>, created:serverTimestamp(), studioid:<pairing docid>,
  participantsactivity:<from pairing>, bonusactivity:<map|null>,
  bonusactivityparticipant:<keys|null>, zoomlinkrequired:<queue.zoomlinkrequired ?? true> }
```
> SS-06 cross-ref invariant: `queue_token.liveassignmentid == live assignment.docid`, `queue_token.studioid == queue studio pairing.docid == live assignment.studioid`, and pairing.status=="live". Single-live: opening must not leave two `status:'live'` assignments for one studio.

### 3b. CHECK-IN — `checkinStudio(value)` (dynamic-studio.ts:825-874)
**`queue studio pairing/{studioid}` UPDATE** (ts:850-852): `{ checkin: <bool> }`
**`studio checkin log/{id}` SET** (ts:854-864):
```
{ logparticipant:<profileid>, queueref:<pairing.queueref>, logdate:new Date(),
  activity:("checkin"|"checkout"), participants:<pairing.participants[]>, studio:<pairing docid> }
```
On-hold path (schedule passed, ts:870-873): `{ checkin:false, onhold:true }` and NO checkin-log row.
> SS-02 invariant: checkin flip ↔ exactly one `studio checkin log` row (parity); on-hold writes `onhold` and produces NO log.

### 3c. STUDIO INVITATION (participant) — `inviteParticipant(token)` (dynamic-studio.ts:973-999)
**`studioinvitation/{docid}` SET (merge)** (ts:980-994):
```
{ docid:<id>, specialistpairing:<selectedStudio.participants[]>, profileid:<token.profile_id>,
  tokenref:doc("queue_token",token.docid), participantname:<mapProfile[...]>, stage:<token.currentstage>,
  expirydate:<now + 2*60000>, queueref:<token.queueref>, createddate:new Date(),
  clientresponse:null, studioid:<selectedStudio.docid>, createdby:<profileid> }
```
> SS-04 invariant: expiry ≈ now+2min; `clientresponse:null`; dup-guard skips if an unexpired pending/approved invite already exists for that token (ts:974-977).

### 3d. STUDIO INVITATION (stage grouping / other-studio) — `sendStudioInvitation` (dynamic-studio.ts:906-923)
**`studioinvitation/{invitationID}` SET**:
```
{ docid, createddate:new Date(), type:"stagegrouping", invitedstudio:[...], acceptedstudio:[],
  deniedstudio:[], mandatorystudio:[...], optionalstudio:[...], studioid:<selectedStudio.docid>,
  stage:<token.currentstage>, queueref:<token.queueref>, tokenref:doc("queue_token",token.docid),
  participantname:<mapProfile[...]>, status:"pending", createdby:<profileid> }
```
Lifecycle updates: `status:"success"` (ts:937) / `status:"cancelled"` (ts:962); accept → `acceptedstudio: arrayUnion(studio)` (ts:499); deny → `deniedstudio: arrayUnion(studio)` (ts:503).

### 3e. ACCEPT / DENY (participant, web) — `WebStudioInvitationComponent`
Accept (web-studio-invitation.ts:122): `updateDoc(studioinvitation/{...}, { clientresponse:'approved' })`
Deny  (web-studio-invitation.ts:133): `updateDoc(studioinvitation/{...}, { clientresponse:'denied' })`
Listener query (ts:51-58): `studioinvitation where profileid==P && queueref==Q && clientresponse==null && expirydate>now limit 1`.
> SS-05 invariant: accept → dynamic-studio's listener (`createdby==profileid`) calls `assignStudio()` (ts:566-571) producing the §3a writes; deny → alert + NO live-assignment (ts:573-576); expiry → invitation auto-deleted (ts:610-616), no live-assignment.

### 3f. MOVE-NEXT / COMPLETE + CLOSE — `moveStage()` (dynamic-studio.ts:1284-1351, review twin :1365-1405)
**`queue_token/{docid}` UPDATE (via updateQueueStage)** (ts:1293-1311):
```
{ previousstage:<currentStage>, currentstage:<nextstage>, logdate:serverTimestamp(),
  stagestatus:"Approved", quicknotes/cw*/diagnostic*:null, people_involved:[], arenaid:null,
  liveassignmentid:null, studioid:null,
  status: (stageproperty[next].compulsoryactivity empty ? null : "queued") }
```
optional: `preassigned.<stage>: arrayUnion(studioid)` (ts:1313) and `notes`/`notesList` (ts:1315-1322).
**`queue stage log/{logdocid}` SET** — one row, `movedthrough:"studio"` (ts:1149-1155).
**Final-stage delivery** (when `dropIndex+1 == stageList.length`, ts:1327-1340):
```
guard.updateDeliveryStatus("/queue_token/<docid>", "completed",
  { eventRequestRef: query("event participation request", profileid==P, eventref==queueref, status=="approved") })
```
`updateDeliveryStatus` (authguard.service.ts:889-918): batch-updates matching `deliverables.status='completed'` AND (status=="completed") `event participation request.status='attended'`.
**`live assignment/{docid}` UPDATE** (ts:1342-1346): `{ isactivitydone:false, status:"completed", updated:serverTimestamp() }`
**`queue studio pairing/{studioid}` UPDATE** (ts:1347-1349): `{ status: null }`
`closeStudio()` twin (ts:1425-1432): `{ isactivitydone:true, status:"completed", updated }` + pairing `{ status:null }`.
> SS-12 invariant: token detached (`liveassignmentid/studioid null`); live-assignment `completed`; pairing `status null`; ONE stage-log; final stage fires `updateDeliveryStatus` with the exact path + eventRequestRef (PLAN P2 #10 wants the argument asserted, not just "called").

### 3g. AEL validate — `updateCurrentAEL()` (dynamic-studio.ts:2223-2271)
batch: SET `interim crossover/{docid}` `{ docid, aelid, created, metric, profileid, validatedby }`; UPDATE `participant AEL/{aelid}` `{ crossovermetric, flag:"validated", validatedby, (updated:true if changed) }`.

### 3h. Procedure mark — `markProcedure()` (dynamic-studio.ts:1970-1983)
`updateDoc(<firestore-atc procedure path>, { status: "completed"|"yet to start" })` — toggles.

### 3i. Bulk invitation (OPERATOR) — `CreateBulkInvitationComponent.sendInvitation()` (create-bulk-invitation.ts:52-68)
SET `bulk invitation/{docid}` `{ ...formValue(stage,totalinvited,duration,expirydate), selectedparticipants:<from dialog>, created:serverTimestamp(), queueref:doc("queue generation",<queue>) }`. CF `bulkReadyInvitation` then fans out to `studioinvitation` (assert fan-out count == selected count — PLAN P0 #1).

### 3j. OpenVidu room — `createOpenViduRoom()` (authguard.service.ts:1793-1806) via `joinOpenViduRoom` (dynamic-studio.ts:2583-2595)
SET (merge) `openviduroom/{liveassignmentid}` `{ active:true, createddate, sessiontype:"live assignment", sessionid, roomid:<liveassignmentid>, hosts:<pairing>, participantid, title, metadata:{queueid} }`. If room exists & `active==false` → `updateDoc({active:true})` (ts:2614).

---

## (4) ZOOM & OPENVIDU INTEGRATION POINTS

### Zoom (HTTP GET to Cloud Functions; Web SDK via separate `/openmeeting` route)
- **Start meeting:** `navigateMeeting(doc)` opens `/openmeeting/<liveassignment.docid>/queue` in a new tab (dynamic-studio.ts:2283-2287). Pre-check: `zoomdata.start_url` must exist and not be `"Link Broken"` else `alert` (ts:2278-2281). The actual Zoom Web SDK lives in the `/openmeeting` component (out of this recon's file set).
- **Regenerate link:** `regenerateZoomLink()` HTTP GETs the CF `studioZoomLinkRegenerate?liveassignmentid=<id>&zoomdata=<json>` (dynamic-studio.ts:1628 test / :1632 prod) — host base `us-central1-<projectId>.cloudfunctions.net`.
- **Link source:** `liveAssignment.zoomdata` (`{start_url, join_url, host_email, id, password,...}`) is populated by CF `studioZoomLink` reacting to the new `live assignment` (see e2e PLAN §2.5). `zoomlinkrequired` is set on the live-assignment write (ts:1135).
- **Other-studio join:** `visitOtherStudio` uses `zoomdata.join_url` when not OpenVidu (ts:438).
- **STUB:** intercept `studioZoomLink`/`studioZoomLinkRegenerate` to return synthetic `zoomdata`; for broken-link test return `start_url:'Link Broken'`. Do NOT open real Zoom windows. (PLAN §5.)

### OpenVidu / LiveKit (`livekit-client` SDK + Cloud Functions)
- **SDK import:** `livekit-client` (`Room`, `RoomEvent`, `Track`, tracks, presets) at `join-openvidu-call.component.ts:5`; `@livekit/track-processors` `BackgroundProcessor` at :18.
- **Room doc:** `joinOpenViduRoom()` (dynamic-studio.ts:2572) creates `openviduroom/{liveassignmentid}` via `guard.createOpenViduRoom(...)` (authguard.service.ts:1793) then opens `/joinroom/<liveassignmentid>` (ts:2622). `roomid == sessionid == liveassignmentid`.
- **Token CF:** `getTokenWithRetry()` POSTs `https://us-central1-<projectId>.cloudfunctions.net/createOpenViduToken` `{roomName, participantName, participantId}` with 503/`SCALING_IN_PROGRESS` retry (join-openvidu-call.ts:448-477). Returns `{url, token}`; `room.connect(response.url, response.token)` (ts:408).
- **Other room-control CFs** (all `us-central1-<projectId>.cloudfunctions.net/...`): `openViduCloseRoom` (ts:515), `openViduStartRecording` (ts:721), `openViduStopRecording` (ts:739), `kickParticipant` (ts:912), `muteParticipant` (ts:958).
- **Room lifecycle:** `/joinroom` subscribes to `openviduroom/{id}` (docData, ts:137); when `active==false` → `leaveRoom()` + status `"ended"` (ts:154-157).
- **STUB:** stub `openviduroom` doc + `createOpenViduToken` (return fake token/url) and the room-control CFs; assert routing to `/joinroom/:id` + pre-join controls render. Do NOT assert deep LiveKit track/grid/active-speaker state (no media server in test). (PLAN §5, §2.2 SS-11 ⚠️.)

---

## (5) PARTICIPANT ACCEPT/DENY — WEB or Flutter? → **WEB (drive UI for the queue-stage invite)**

The participant's accept/deny of a **studio (queue-stage) invitation IS a web route** and is fully drivable by Playwright — it does NOT require the participant simulator:

- Component `WebStudioInvitationComponent` (`src/app/web-studio-invitation/web-studio-invitation.component.ts`) renders the full-screen `.inv-overlay` (html:2), with **Accept** (`acceptInvitation()`, ts:117 → writes `clientresponse:'approved'`, ts:122) and **deny** via "I'll join later → Confirm Join Later" (`confirmJoinLater()`, ts:131 → writes `clientresponse:'denied'`, ts:133).
- It is **mounted on the web** at route `/queue-web` → `QueueWebVersion1Component` (app.routes.ts:319), which embeds `<app-web-studio-invitation [profileid]="user.profileid" [queueref]="profileJourneyProduct['queuetoken']['queueref']" [useremail]="user.email">` (`src/app/queue system/QueueWebVerison1/queue-web-version1.component.html:2-6`). The only other reference to the component is its own spec.
- The component's own listener (web-studio-invitation.ts:49-103) drives the overlay purely from the `studioinvitation` Firestore stream — so a spec can: (a) seed/cause a `studioinvitation` (via SS-04 real "Bring To Studio", the product action), (b) navigate a participant browser context to `/queue-web`, (c) real-click Accept/Deny, (d) assert the CF/app reaction (token→ready, live-assignment created, or deny→no live-assignment).

**Recommendation for specs:** drive participant accept/deny through the REAL `/queue-web` UI (page object `e2e/queue/pages/web-studio-invitation.page.ts`). Use `e2e/lib/participant-sim.js` ONLY as a fallback to write `studioinvitation.clientresponse` directly when a second browser context is impractical, or to set up preconditions. This keeps SS-05 anti-circular (assert the value the APP computed after the real click).

> Caveats:
> - The **specialist↔specialist** accept/deny (`accept-other-studio`, `invite-other-studio`) is Angular-dialog-only inside `/dynamicstudio` (driven by the specialist), not a participant route.
> - The **specialist-side countdown** (`QueueInvitationApprovalComponent`) is also Angular-only inside `/dynamicstudio` — it is the waiting/game overlay, not a participant accept screen.
> - `web-studio-invitation` requires `profileJourneyProduct.queuetoken.queueref` to be present on `/queue-web` for the `@Input() queueref` to bind (QueueWebVerison1 supplies it). The Flutter native participant app is a SEPARATE accept surface (out of Playwright scope) but writes the same `studioinvitation.clientresponse` field, so the web and simulator paths are interchangeable at the data layer.

---

## Cross-cutting notes for spec authors
- **collectionData is async** → use `expect.poll` for every count that depends on a live stream (queue cards, studio buttons, waiting-list, live panel, arena cards).
- **Console guard:** attach in `beforeEach` (PLAN names `console-guard.ts`). Studio code logs heavily with `console.log` (benign) but real errors (e.g. `Error in previewATC`, ts:1808) should fail.
- **Anti-circularity reminders specific to this surface:** SS-01 assert button count == app's `studioList` filter result against a KNOWN seeded pairing set; SS-03 assert waiting-list length == seeded eligible tokens (the app applies the atcmodel+preassign+ready filter, ts:804-811); SS-06/SS-12 assert the cross-ref triangle (token↔live-assignment↔pairing) + ONE stage-log; SS-07 assert a seeded NON-ZERO secondary-DB count (lower bound), not parity-with-possibly-empty-read.
- **Known gaps to record (do not assert green):** `/arenastudioactivity` has NO role gate beyond `authGuard` (aa.ts:59 only toggles a button) — the PLAN P0 #4 negative-monitor test cannot pass against current code; report as a finding.

## RECON_SCHEMA
```
RECON_SCHEMA v1 (studio)
file: e2e/queue/recon/studio.md
covers: SS-00..SS-16 + /joinroom + /queue-web (participant) + /arenastudioactivity
sections:
  1 selector_table   : rows{case, el, selector, source(file:line), asserts(computed)}
  2 needs_testid      : rows{n, file, line, element, proposed_testid}
  3 write_shapes      : keys[ studio_open_assign, checkin, studioinvitation_participant,
                              studioinvitation_stagegrouping, accept_deny_web, move_next_complete_close,
                              ael_validate, mark_procedure, bulk_invitation, openvidu_room ]
  4 integration       : keys[ zoom, openvidu_livekit ]  (CF endpoints + SDK calls, file:line)
  5 participant_accept: verdict=WEB ; route=/queue-web ; component=web-studio-invitation ;
                        field=studioinvitation.clientresponse(approved|denied) ; sim=fallback-only
citation_style: file:line (production repo /Users/antano/solarcode/ah/starlabs-angular)
testid_count_found: 0 (across all 9 mapped HTML files)
override_hook: /dynamicstudio?profileid=<seeded specialist> (dynamic-studio.component.ts:160,171)
```
