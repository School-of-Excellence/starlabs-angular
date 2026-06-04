# Operator Screen → Collection Map (100% code-evidence)

> ⚠️ **STALE-BRANCH RISK (2026-06-04):** extracted from `main` (2026-04-17); repo now on `production` (308 commits ahead). **Screen list + `file:line` evidence may be stale** (~8 new component dirs on `production`). The screen→collection *mapping* is largely intact, but **re-verify specific `file:line` refs against `production` before relying.** (Stream B; `ORIENTATION.md` Open-threads #4.)
> Generated 2026-06-02 by 11 parallel extraction agents over the **194 routed operator screens** (ATC screens excluded). Evidence = Firestore calls in each route's component (file:line). Used to validate Tier-A reliability: *a collection is operator-used only if a real screen reads/writes it.* Raw: `~/Downloads/svstats/chunks/agent_*.result.json`.

**Coverage:** 194 screens · 219 distinct collections referenced · 130 screens write.

## A. Tier-A validation — is there an operator screen that uses this data?

| Collection | screens (R/W) | verdict | example screens |
|---|---|---|---|
| `profile_data` | 44/5 | ✅ read+write | contentupload, approveofftime, interimreportlog, evolutionwishlistlog, bigwall |
| `products` | 39/0 | ✅ read-only | viewparticipantstieraccess, tieraccessconfig, mode-dashboard-new, productmodeconfig, big-dashboard |
| `event collection` | 34/0 | ✅ read-only | createarenavideoasktemplate, communitymanager, mode-dashboard-new, participantAEL/:id, participantAEL |
| `participant metadata` | 28/7 | ✅ read+write | viewparticipantstieraccess, content-analytics-dashboard, interimreportlog, mode-dashboard-new, recommendedplaylist |
| `journey` | 30/1 | ✅ read+write | viewparticipantstieraccess, contentanalytics, tieraccessconfig, big-dashboard, bigcohorts |
| `participantsproduct` | 22/12 | ✅ read+write | modedashboard, mode-dashboard-new, bookappointment, dynamicstudio, queuetransfer |
| `queue_token` | 20/10 | ✅ read+write | participantAEL/:id, participantAEL, bigactivitymonitor, eventopportunitydashboard, queuevenue |
| `appointments` | 17/5 | ✅ read+write | appointmentcalendar, mycalendar, roster, appointmentstatuspending, appointmentstudio |
| `series` | 16/3 | ✅ read+write | category-dashboard, assigncategory, seriesdashboard, viewparticipantstieraccess, contentanalytics |
| `event participation request` | 15/6 | ✅ read+write | participantAEL/:id, participantAEL, bigcohorts, initiateeventproduct, dynamicqueuemanager |
| `delivery forms` | 14/0 | ✅ read-only | appactionpending, modedashboard, mode-dashboard-new, productmodeconfig, formbasedsubmission |
| `solar voice playlist` | 13/3 | ✅ read+write | audiodashboard, playlistdashboard, edit-playlist, add-playlist, contentanalytics |
| `bigactivity` | 13/0 | ✅ read-only | big-dashboard, bigProfile, bigcohorts, modellevelconfig, bigaggregateeventlevel |
| `big cohorts` | 11/1 | ✅ read+write | big-dashboard, bigcohorts, validateParticipantAssignments, arena_space, eventopportunitydashboard |
| `participantjourneyproduct` | 10/3 | ✅ read+write | participantpurchase/:pid, userprofile/:id, userprofile_old, participants-analytics, salesleads |
| `deliverables` | 9/2 | ✅ read+write | bookappointment, dynamicstudio, dynamicqueuemanager, queue-web, participantdeliverysequence/:pid |
| `queue stage log` | 4/6 | ✅ read+write | bigactivitymonitor, queuetransfer, dynamicqueuemanager, engagementdashboard, formbasedsubmission |
| `arena events` | 8/1 | ✅ read+write | queuetransfer, initiateeventproduct, queue-planner-review, queuebigplanner, dynamicqueuemanager |
| `classify` | 9/4 | ✅ read+write | participanttouchpoint, communitymanager, journeyonboardingdetail, hpc, dynamicqueuemanager |
| `biglevel` | 9/1 | ✅ read+write | viewparticipantstieraccess, tieraccessconfig, big-dashboard, biglevel, modellevelconfig |
| `big assignment` | 8/2 | ✅ read+write | big-dashboard, bigchatscreen, particiant_assignment_board, zoommeeting_bigparticipants, bigcohorts |
| `tier` | 8/0 | ✅ read-only | viewparticipantstieraccess, contentanalytics, accessscreen, addseries, tieraccessconfig |
| `appointmenttype` | 7/0 | ✅ read-only | participantdeliverysequence/:pid, profilesummary/:profileid, productdelivery, deliverysequence, deliveryactivities |
| `productToDeliverySequence` | 7/1 | ✅ read+write | queuetransfer, initiateeventproduct, participantpurchase/:pid, productdelivery, deliverysequence |
| `availability` | 6/2 | ✅ read+write | appointmentavailability, bookappointment, capacityutilization, profilelist, appointment-dashboard |
| `big participants assignments` | 5/5 | ✅ read+write | formbasedsubmission, particiant_assignment_board, bigcohorts, manualassignment, validateParticipantAssignments |
| `episodes` | 6/2 | ✅ read+write | videodashboard, addseries, editseries, recommendedplaylist, workshopconfig/:id |
| `solar voice audios` | 6/0 | ✅ read-only | audiodashboard, edit-playlist, add-playlist, recommendedplaylist, workshopconfig/:id |
| `evolutionmappingvideo` | 6/2 | ✅ read+write | queue-web, userprofile/:id, userprofile_old, evolutionmapping, participantevolution |
| `liveevolutionmapping` | 6/0 | ✅ read-only | queue-web, userprofile/:id, userprofile_old, evolutionmapping, participantevolution |
| `package` | 6/0 | ✅ read-only | participantpurchase/:pid, userprofile_old, addpackage, journeysupport/:pid, salesleads |
| `accelerated evolution level` | 6/1 | ✅ read+write | participantAEL/:id, participantAEL, dynamicstudio, createaelnames, JourneycoachDashboard-new |
| `salesleads` | 5/2 | ✅ read+write | salesleads, onboardingremarks, JourneycoachDashboard-new, overall-dashboard, sales-report |
| `Roles-To-EIS` | 5/0 | ✅ read-only | bookappointment, eisappointmentrole, profilelist, appointment-dashboard, delivery-dashboard |
| `content analytics` | 4/1 | ✅ read+write | contentanalytics, content-analytics-dashboard, participants-analytics, engagementdashboard |
| `delivery events` | 4/0 | ✅ read-only | participantdeliverysequence/:pid, productdelivery, deliverysequence, deliveryactivities |
| `modes` | 4/0 | ✅ read-only | modedashboard, mode-dashboard-new, participants-analytics, JourneycoachDashboard-new |
| `AppointmentType-To-Roles` | 4/0 | ✅ read-only | bookappointment, mapappointmentrole, appointment-dashboard, delivery-dashboard |
| `user_data` | 2/1 | ✅ read+write | contentupload, notificationlog, login |
| `new_user_data` | 3/0 | ✅ read-only | customersupportdashboard/ticket/:ticketid/:ticketno, live_event_dashboard, workshop_dashboard/:id |
| `participantdeliverysequence` | 3/3 | ✅ read+write | bookappointment, participantdeliverysequence/:pid, journeysupport/:pid |
| `queue activity log` | 3/1 | ✅ read+write | bigProfile, bigactivitymonitor, bigactivitylog |
| `recommended mix playlist` | 3/1 | ✅ read+write | content-analytics-dashboard, recommendedplaylist, participants-analytics |
| `notificationrecord` | 3/0 | ✅ read-only | notificationrecord, dynamicqueuemanager, communication |
| `dashboard` | 3/2 | ✅ read+write | profile-role-access, EISDashboard, routeconfiguration |
| `FCM_token` | 2/0 | ✅ read-only | dynamicqueuemanager, overall-dashboard |
| `offtime` | 2/2 | ✅ read+write | offtime, approveofftime |
| `biginvitation` | 2/0 | ✅ read-only | bigcohorts, queuebigplanner |
| `participant touchpoint` | 2/0 | ✅ read-only | participanttouchpoint, userprofile/:id |
| `event zones` | 2/1 | ✅ read+write | bigcohorts, eventzonemanagement |
| `journey-to-product` | 2/0 | ✅ read-only | participantpurchase/:pid, journeyproductmap |
| `procedures` | 2/0 | ✅ read-only | overall_event_dashboard, first_timers_dashboard |
| `eisroles` | 1/0 | ✅ read-only | appointmentrole |
| `big cohorts log` | 1/1 | ✅ read+write | bigcohorts |
| `loginlog` | 0/0 | ❌ ORPHAN (no operator screen) | — |

## B. Tier-A ORPHANS — written by background/Cloud Function, NOT surfaced by any operator screen

- `loginlog` — no operator screen reads/writes it. Re-evaluate: reference-only, background-written, or stale.

## C. ATC-integrating operator screens — EXCLUDE from CI/CD (touch sensitive ATC data)

| Screen (route) | component | R/W | ATC collections (file:line) |
|---|---|---|---|
| `participantAEL/:id` | app/AppEngagement/participant-ael/participant-ael.component.ts | read | atc_alpha@116(read) |
| `participantAEL` | app/AppEngagement/participant-ael/participant-ael.component.ts | read | atc_alpha@116(read) |
| `updateprofiletaxonomy` | app/AppEngagement/taxonomy/update-adjustment-taxonomy/update-adjustment-taxonomy.component.ts | **WRITE** | atc_alpha@109(read); atc_alpha@118(read); atc_alpha@143(WRITE) |
| `big-dashboard` | app/big/big-dashboard/big-dashboard.component.ts | read | atc_alpha@543(read) |
| `dynamicstudio` | app/queue system/dynamic-studio/dynamic-studio.component.ts | read | atc_to_validate@1660(read); atc_alpha@1669(read); atc_alpha@1674(read); atc_notes@1703(read); pick_for_mentoring@1720(read); atc_notes@1862(read); atc_alpha@1792(read); atc_alpha@1939(read); triple atc@2027(read) |
| `dynamicqueuemanager` | app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts | read | atc_alpha@5205(read); atc_to_validate@5215(read) |
| `profilelist` | app/Participants Profile Management/profilelist/profilelist.component.ts | read | atc_alpha@290(read) |
| `JourneycoachDashboard-new` | app/Journey Onboarding/journeycoach-duplicate/journeycoach-duplicate.component.ts | read | atc_alpha@3970(read); atc_to_validate@3975(read); atc_alpha@3999(read); atc_to_validate@4005(read) |
| `ecosystem` | app/Journey Onboarding/eco-system-new/eco-system-new.component.ts | read | atc_alpha@851(read); atc_alpha@851(read) |
| `overall_event_dashboard` | app/Events/live-event-dashboard/live-event-dashboard.component.ts | **WRITE** | atc_to_validate@537(read); atc_alpha@676(read); atc_alpha@1567(WRITE) |
| `live_event_dashboard` | app/Events/live-event-dashboard-v2/live-event-dashboard-v2.component.ts | read | atc_alpha@2250(read); atc_to_validate@2282(read); temporary_ATC@4484(read) |
| `first_timers_dashboard` | app/Events/first-timers-dashboard/first-timers-dashboard.component.ts | read | atc_alpha@400(read) |
| `queueeventhealth` | app/Diagnostics Tool/queue-event-health/queue-event-health.component.ts | read | atc_alpha@811(read); atc_to_validate@831(read) |
| `arenadesigninsights` | app/arena-design-insights/arena-design-insights.component.ts | read | atc_alpha@361(read) |

## D. Collections used by screens but NOT yet classified (audit next)

- `queue generation` — 35 screen(s)
- `queue variation` — 13 screen(s)
- `users_roles` — 12 screen(s)
- `content_urls` — 11 screen(s)
- `wati archive` — 11 screen(s)
- `email archive` — 10 screen(s)
- `formsByClient` — 9 screen(s)
- `participant tags` — 8 screen(s)
- `live assignment` — 8 screen(s)
- `clientissue` — 8 screen(s)
- `workshopconfiguration` — 8 screen(s)
- `interim crossover` — 7 screen(s)
- `arenavideoask` — 6 screen(s)
- `big marathon` — 6 screen(s)
- `queue studio pairing` — 6 screen(s)
- `openviduroom` — 6 screen(s)
- `arena e-ticket` — 5 screen(s)
- `eiflix workshop` — 5 screen(s)
- `category` — 4 screen(s)
- `adsplaylist` — 4 screen(s)
- `quiz` — 4 screen(s)
- `interimreport log` — 4 screen(s)
- `participantdashboard` — 4 screen(s)
- `participant AEL` — 4 screen(s)
- `big aggregate level` — 4 screen(s)
- `participantvideoask` — 4 screen(s)
- `delivery report` — 4 screen(s)
- `delivery queue` — 4 screen(s)
- `delivery fieldwork` — 4 screen(s)
- `chat config` — 4 screen(s)
- `arena e-ticket log` — 4 screen(s)
- `ask AH` — 3 screen(s)
- `love letter` — 3 screen(s)
- `product mode config` — 3 screen(s)
- `buffermix archive` — 3 screen(s)
- `post_categories` — 3 screen(s)
- `arena highlights` — 3 screen(s)
- `notifications` — 3 screen(s)
- `dynamic` — 3 screen(s)
- `studio activity log` — 3 screen(s)
- `zoomaccount` — 3 screen(s)
- `static meta data` — 3 screen(s)
- `segments` — 3 screen(s)
- `participant list` — 3 screen(s)
- `queue planning` — 3 screen(s)
- `events_profiles` — 3 screen(s)
- `Achievements` — 3 screen(s)
- `email validators` — 3 screen(s)
- `participant tag logs` — 3 screen(s)
- `workshop participant enrolled` — 3 screen(s)
- `livechangework` — 3 screen(s)
- `ads` — 2 screen(s)
- `health stories` — 2 screen(s)
- `tier access config` — 2 screen(s)
- `user` — 2 screen(s)
- `evolutionwishlistlog` — 2 screen(s)
- `evolutionwishlistquestions` — 2 screen(s)
- `logs` — 2 screen(s)
- `A&H_Space_Name` — 2 screen(s)
- `A&H_Space_Type` — 2 screen(s)

## E. Full screen inventory (route → reads / writes)

| Route | Component | Reads | Writes |
|---|---|---|---|
| `appactionpending` | app/AppEngagement/app-action-pending/app-action-pending.component.ts | delivery forms, quiz, arenavideoask, appactionpending | — |
| `bigwall` | app/AppEngagement/bigwall-data-adding/bigwall-data-adding.component.ts | event collection, post_categories, profile_data, arena highlights | arena highlights |
| `communitymanager` | app/AppEngagement/community-manager/community-manager.component.ts | community category, community post tags, activesnippet, queue generation, event collection, community post, classify | activesnippet, community category, community post tags, community post |
| `communitymanager` | app/AppEngagement/community-manager/community-manager.component.ts | community category, community post tags, activesnippet, queue generation, event collection, community post, classify | activesnippet, community category, community post tags, community post |
| `evolutionwishlist` | app/AppEngagement/evolution-wishlist-form/evolution-wishlist-form.component.ts | evolutionwishlistlog, evolutionwishlistquestions | evolutionwishlistlog |
| `evolutionwishlistlog` | app/AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component.ts | profile_data, evolutionwishlistlog, evolutionwishlistquestions | evolutionwishlistlog |
| `interimreportlog` | app/AppEngagement/interim-report-log/interim-report-log.component.ts | profile_data, participant metadata, interimreport log, ask AH, love letter | ask AH, love letter, email archive, wati archive |
| `recommendedplaylist` | app/AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component.ts | participant metadata, buffermix archive, recommended mix playlist, series, episodes, solar voice playlist, solar voice audios, content_urls | buffermix archive, recommended mix playlist |
| `mode-dashboard-new` | app/AppEngagement/mode-dashboard-new/mode-dashboard-new.component.ts | event collection, queue generation, modes, adsplaylist, solar voice playlist, series, content_urls, delivery forms, participant metadata, participantsproduct, product mode config, products | — |
| `modedashboard` | app/AppEngagement/mode-dashboard/mode-dashboard.component.ts | modes, adsplaylist, solar voice playlist, series, conetent_urls, delivery forms, product mode config, participantdashboard, participantsproduct | participantsproduct |
| `notificationrecord` | app/AppEngagement/notification-record/notification-record.component.ts | notifications, notificationrecord | — |
| `notificationlog` | app/AppEngagement/notifications-log/notifications-log.component.ts | user_data, notifications, logs | — |
| `participantAEL/:id` | app/AppEngagement/participant-ael/participant-ael.component.ts | atc_alpha, accelerated evolution level, event collection, queue generation, participant AEL, event participation request, queue_token, interim crossover | participant AEL, interim crossover |
| `participantAEL` | app/AppEngagement/participant-ael/participant-ael.component.ts | atc_alpha, accelerated evolution level, event collection, queue generation, participant AEL, event participation request, queue_token, interim crossover | participant AEL, interim crossover |
| `productmodeconfig` | app/AppEngagement/product-mode-config/product-mode-config.component.ts | product mode config, products, adsplaylist, solar voice playlist, series, content_urls, delivery forms | — |
| `updateprofiletaxonomy` | app/AppEngagement/taxonomy/update-adjustment-taxonomy/update-adjustment-taxonomy.component.ts | profile_data, atc taxonomy, atc_alpha | atc_alpha |
| `atctaxonomy` | app/AppEngagement/taxonomy/view-tags/view-tags.component.ts | atc taxonomy | atc taxonomy |
| `appointment-dashboard` | app/appointment-dashboard/appointment-dashboard.component.ts | products, productToDeliverySequence, AppointmentType-To-Roles, Roles-To-EIS, availability | — |
| `arenadesigninsights` | app/arena-design-insights/arena-design-insights.component.ts | event collection, atc_alpha, livechangework, arena highlights | — |
| `modellevelconfig` | app/big/atcmodel-level-config/atcmodel-level-config.component.ts | atcmodel level config, bigactivity, biglevel, products | — |
| `bigactivitylog` | app/big/big-activity-log/big-activity-log.component.ts | bigactivity, profile_data, queue generation, products, activitylog, studio activity log, queue activity log | studio activity log |
| `bigactivity` | app/big/big-activity/big-activity.component.ts | bigactivity | — |
| `bigaggregateeventlevel` | app/big/big-aggregate-event-level/big-aggregate-event-level.component.ts | profile_data, queue generation, big aggregate event level, atcmodel level config, biglevel, bigactivity | big aggregate event level |
| `big_aggregate` | app/big/big-aggregate/big-aggregate.component.ts | profile_data, big aggregate level, atcmodel level config, biglevel, bigactivity | big aggregate level |
| `bigchatscreen` | app/big/big-chat-screen/big-chat-screen.component.ts | bigchat, big marathon, big assignment | bigchat |
| `bigcohorts` | app/big/big-cohort-clone-2/big-cohort-clone-2.component.ts | big cohorts, big marathon, event collection, event zones, journey, participant metadata, queue generation, bigactivity, participant tags, biginvitation, event participation request, live assignment, queue studio pairing, big assignment, big participants assignments, big cohorts log | big cohorts, email archive, wati archive, buffermix archive, big cohorts log |
| `big-dashboard` | app/big/big-dashboard/big-dashboard.component.ts | journey, participant metadata, big participants tags, big cohorts, event collection, big tags, profile_data, big participants notes, biglevel, big aggregate level, queue generation, products, bigactivity, atc_alpha, big marathon, big assignment | big marathon, big tags, big participants notes, email archive, wati archive |
| `biglevel` | app/big/big-level/big-level.component.ts | biglevel | biglevel |
| `bigProfile` | app/big/big-profile/big-profile.component.ts | profile_data, big aggregate level, dynamic, participantdashboard, queue activity log, bigactivity, participantvideoask, A&H-Space, queue generation, A&H_Space_Name, A&H_Space_Type | — |
| `arena_space` | app/big/create-arena-space/create-arena-space.component.ts | profile_data, A&H_Space_Name, A&H_Space_Type, arenaspace, big cohorts, event collection, big assignment | arenaspace |
| `formbasedsubmission` | app/big/form-based-submission/form-based-submission.component.ts | big participants assignments, delivery forms, dynamic, big_temporary_forms | bigformassignment, big participants assignments, dynamic, queue_token, queue stage log, big_temporary_forms |
| `manualassignment` | app/big/manual-assignments/manual-assignments.component.ts | big assignment, big participants assignments, big assignment manual | big participants assignments, big assignment manual |
| `bigactivitymonitor` | app/big/monitor-activity-log/monitor-activity-log.component.ts | queue generation, bigactivity, products, queue_token, queue stage log, live assignment, studio activity log, queue activity log, queue variation | queue activity log, queue_token |
| `particiant_assignment_board` | app/big/participant-assignment-board/participant-assignment-board.component.ts | big assignment, big marathon, big participants assignments | big participants assignments |
| `validateParticipantAssignments` | app/big/validate-participants-assignment/validate-participants-assignment.component.ts | profile_data, big marathon, big cohorts, big assignment, big participants assignments | big participants assignments, big assignment |
| `zoommeeting_bigparticipants` | app/big/zoom-meeting/zoom-meeting.component.ts | big assignment, profile_data | big assignment, big participants assignments |
| `ads-entry` | app/Business Dashboard/AdsEntry/entry-management.component.ts | adsinvestment | adsinvestment |
| `expense-planner/:tab` | app/Business Dashboard/expense-planner/expense-planner.component.ts | participant metadata, expenseplanning | expenseplanning |
| `profile-role-access` | app/Business Dashboard/profile-based-access/profile-based-access.component.ts | dashboard, dashboarduseraccess, classify | dashboarduseraccess, classify, dashboard |
| `communication` | app/Communication Center/communication/communication.component.ts | email archive, myoperator calls, wati archive, notificationrecord, email log, inapp templates, notification templates, email templates, wati templates, profile_data, email validators, email logs | inapp templates, notification templates, email templates, email validators, dynamic (email, email archive |
| `email-templates` | app/Communication Center/create-email-template/create-email-template.component.ts | email templates, email validators, classify | email templates, email validators |
| `zoom-recording-dashboard` | app/Communication Center/zoom-recording-dashboard/zoom-recording-dashboard.component.ts | zoom recordings backup | — |
| `content-upload-v2` | app/content-upload-version2/content-upload-version2.component.ts | solar voice audios, episodes, ads, health stories, content_urls | — |
| `accessscreen` | app/content/access-screen/access-screen.component.ts | tier, series, user | — |
| `createarenavideoasktemplate` | app/content/arena-video-ask-input/arena-video-ask-input.component.ts | event collection, arenavideoask | arenavideoask |
| `audiodashboard` | app/content/audio-dashboard/audio-dashboard.component.ts | solar voice audios, atc taxonomy, solar voice playlist | — |
| `audiodashboard` | app/content/audio-dashboard/audio-dashboard.component.ts | solar voice audios, atc taxonomy, solar voice playlist | — |
| `category-dashboard` | app/content/category-dashboard/category-dashboard.component.ts | category, series | series |
| `category-dashboard` | app/content/category-dashboard/category-dashboard.component.ts | category, series | series |
| `ads` | app/content/click-ads/click-ads.component.ts | ads | — |
| `ads` | app/content/click-ads/click-ads.component.ts | ads | — |
| `content-analytics-dashboard` | app/content/content-analytics-dashboard/content-analytics-dashboard.component.ts | content analytics, participant metadata, recommended mix playlist | — |
| `contentanalytics` | app/content/content-analytics/content-analytics.component.ts | journey, series, tier, participant content analytics, content analytics, solar voice playlist | content analytics |
| `contentupload` | app/content/content-upload/content-upload.component.ts | user_data, profile_data, content_urls, atc taxonomy | content_urls |
| `contentupload` | app/content/content-upload/content-upload.component.ts | user_data, profile_data, content_urls, atc taxonomy | content_urls |
| `viewparticipantstieraccess` | app/content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component.ts | tier, participant metadata, series, tier access config, journey, products, biglevel | tier access config |
| `viewparticipantstieraccess` | app/content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component.ts | tier, participant metadata, series, tier access config, journey, products, biglevel | tier access config |
| `videodashboard` | app/content/episodes-dashboard/episodes-dashboard.component.ts | episodes, atc taxonomy | episodes |
| `videodashboard` | app/content/episodes-dashboard/episodes-dashboard.component.ts | episodes, atc taxonomy | episodes |
| `healthstories` | app/content/health-stories/health-stories.component.ts | health stories | — |
| `healthstories` | app/content/health-stories/health-stories.component.ts | health stories | — |
| `learningmaterial` | app/content/learning-material/learning-material.component.ts | learning-materials | learning-materials |
| `playlistads` | app/content/playlist-ads/playlist-ads.component.ts | content_urls, adsplaylist | — |
| `edit-playlist` | app/content/playlist-dashboard/edit/edit.component.ts | solar voice audios, solar voice playlist, atc taxonomy | solar voice playlist |
| `edit-playlist` | app/content/playlist-dashboard/edit/edit.component.ts | solar voice audios, solar voice playlist, atc taxonomy | solar voice playlist |
| `edit-playlist` | app/content/playlist-dashboard/playlist-configuration/playlist-configuration.component.ts | solar voice audios, solar voice playlist, atc taxonomy | solar voice playlist |
| `add-playlist` | app/content/playlist-dashboard/playlist-configuration/playlist-configuration.component.ts | solar voice audios, solar voice playlist, atc taxonomy | solar voice playlist |
| `playlistdashboard` | app/content/playlist-dashboard/playlist-dashboard.component.ts | solar voice playlist, atc taxonomy | solar voice playlist |
| `playlistdashboard` | app/content/playlist-dashboard/playlist-dashboard.component.ts | solar voice playlist, atc taxonomy | solar voice playlist |
| `add-playlist` | app/content/playlist-dashboard/solar-playlist/solar-playlist.component.ts | solar voice audios, solar voice playlist, atc taxonomy | solar voice playlist |
| `addseries` | app/content/series-dashboard/add-series/add-series.component.ts | episodes, category, series, tier | series, episodes |
| `assigncategory` | app/content/series-dashboard/categoryassign/categoryassign.component.ts | category, series | — |
| `editseries` | app/content/series-dashboard/edit-series/edit-series.component.ts | episodes, series, category | series |
| `seriesdashboard` | app/content/series-dashboard/series-dashboard.component.ts | series | — |
| `seriesdashboard` | app/content/series-dashboard/series-dashboard.component.ts | series | — |
| `tieraccessconfig` | app/content/tier-access-config/view-tier-access/view-tier-access.component.ts | tier access config, tier, journey, products, biglevel | tier access config |
| `customersupportdashboard/ticket/:ticketid/:ticketno` | app/Customer Support/customer-chat-screen/customer-chat-screen.component.ts | users_roles, chat config, participantjourneyproduct, clientissue, profile_data, new_user_data | clientissue, profile_data |
| `customersupportdashboard` | app/Customer Support/customer-support-dashboard/customer-support-dashboard.component.ts | chat config, users_roles, clientissue | clientissue |
| `customer-support-tickets` | app/Customer Support/customer-ticket-new/customer-ticket-new.component.ts | clientissue, chat config | clientissue |
| `customertickets` | app/Customer Support/customertickets/customertickets.component.ts | — | — |
| `liveeventhealth` | app/Diagnostics Tool/live-event-health/live-event-health.component.ts | event collection, event participation request, participant metadata, products, participantsproduct | participantsproduct, event participation request |
| `queueeventhealth` | app/Diagnostics Tool/queue-event-health/queue-event-health.component.ts | participantsproduct, queue generation, profile_data, products, event participation request, arena events, atc_alpha, atc_to_validate, queue_token | event participation request, participantsproduct, queue_token |
| `arena_e_ticket_approve` | app/Events/arena-e-ticket-approve/arena-e-ticket-approve.component.ts | event collection, profile_data, products, event participation request, arena e-ticket | arena e-ticket |
| `group-chat` | app/Events/Chat/chat-screen/chat-screen.component.ts | profile_data, users_roles, supportchat | supportchat |
| `event_attendance_log` | app/Events/event-attendance-log/event-attendance-log.component.ts | profile_data, products, event collection, arena e-ticket log | — |
| `create_event` | app/Events/event-list/event-list.component.ts | event collection | — |
| `event_participation_approve` | app/Events/event-participation-approve/event-participation-approve.component.ts | event collection, event participation request, deliverables, events_profiles | event participation request, events_profiles, deliverables, participantsproduct |
| `first_timers_dashboard` | app/Events/first-timers-dashboard/first-timers-dashboard.component.ts | journey, participant tags, procedures, event collection, participant metadata, arena e-ticket, queue generation, queue variation, atc_alpha, livechangework | — |
| `layers-screen` | app/Events/layers-screen/layers-screen.component.ts | event collection, arenalayers | arenalayers |
| `live_event_dashboard` | app/Events/live-event-dashboard-v2/live-event-dashboard-v2.component.ts | journey, participant tags, event collection, big cohorts, new_user_data, queue generation, event participation request, participant metadata, chat config, clientissue, arena e-ticket log, arena e-ticket, queue variation, atc_alpha, atc_to_validate, arenavideoask, participantvideoask, livechangework, arena events, classify, event participant zones, temporary_ATC | wati archive, email archive |
| `overall_event_dashboard` | app/Events/live-event-dashboard/live-event-dashboard.component.ts | products, temporary function access, procedures, event collection, event participation request, arena events, participant metadata, atc_to_validate, arena e-ticket log, arenavideoask, Achievements, participant AEL, atc_alpha | atc_alpha |
| `qr-scanner` | app/Events/qr-scanner/qr-scanner.component.ts | products, event collection, profile_data, arena e-ticket log, arena e-ticket | arena e-ticket log |
| `videoask-display` | app/Events/videoask-display/videoask-display.component.ts | event collection, participant tags, eiflix workshop, queue generation, arenavideoask, participantvideoask | arena highlights, participantvideoask, participant metadata, participant tag logs |
| `evolutionmappingnew` | app/EvolutionMapping/evolution-mapping-new/evolution-mapping-new.component.ts | participant metadata, journey, event participation request, participant videos, profile_data, event collection | participant videos |
| `evolutionmappingv2` | app/EvolutionMapping/evolution-mapping-v2/evolution-mapping-v2.component.ts | evolutionmappingvideo, liveevolutionmapping | evolutionmappingvideo |
| `evolutionmapping` | app/EvolutionMapping/evolution-mapping/evolution-mapping.component.ts | evolutionmappingvideo, liveevolutionmapping | evolutionmappingvideo |
| `participantevolution` | app/EvolutionMapping/evolution-mapping/participant-evolution-mapping/participant-evolution-mapping.component.ts | queue_token, queue generation, evolutionmappingvideo, liveevolutionmapping, queue variation | queue_token, queue stage log |
| `hpc` | app/hpc/hpc.component.ts | 3minuteshpc, classify, static meta data | classify, static meta data, 3minuteshpc |
| `delivery-dashboard` | app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component.ts | users_roles, journey, products, package, appointmenttype, formsByClient, participantsproduct, productToDeliverySequence, AppointmentType-To-Roles, Roles-To-EIS, availability, participant metadata, appointments, participantjourneyproduct | — |
| `ecosystem` | app/Journey Onboarding/eco-system-new/eco-system-new.component.ts | participantdashboard, accelerated evolution level, interim crossover, aggregate_participant_timeline, atc_alpha, event collection, event participation request | — |
| `ecosystem` | app/Journey Onboarding/eco-system-new/eco-system-new.component.ts | participantdashboard, accelerated evolution level, interim crossover, aggregate_participant_timeline, atc_alpha, event collection, event participation request | — |
| `JourneycoachDashboard-new` | app/Journey Onboarding/journeycoach-duplicate/journeycoach-duplicate.component.ts | users_roles, appointments, journey, queue generation, salesleads, participant metadata, participantjourneyproduct, participantsproduct, modes, atc_alpha, atc_to_validate, ask AH, love letter, accelerated evolution level, interim crossover, participant tags | participantjourneyproduct, salesleads, appointments, participant metadata, participant tag logs |
| `opportunities` | app/Journey Onboarding/journeycoach-opportunities/journeycoach-opportunities.component.ts | users_roles, participantjourneyproduct | — |
| `journeysupport/:pid` | app/Journey Onboarding/journeyplan/journeyplan.component.ts | participant metadata, products, package, solar voice playlist, series, content_urls, workshopconfiguration, participantplanning, participantsproduct, profile_data, participantdeliverysequence | participantplanning, participantsproduct, participant metadata, participantdeliverysequence |
| `onboardingremarks` | app/Journey Onboarding/onboarding-remark/onboarding-remark.component.ts | users_roles, salesleads | — |
| `overall-dashboard` | app/Journey Onboarding/overall-dashboard/overall-dashboard.component.ts | participant metadata, salesleads, adsinvestment, journey, appointments, FCM_token, participantsproduct, workshopconfiguration, workshop participant enrolled, expenseplanning | — |
| `productinitiated-dashboard` | app/Journey Onboarding/product-initiation-dashboard/product-initiation-dashboard.component.ts | users_roles, journey, products, participantsproduct, participantjourneyproduct, participant metadata | participant metadata |
| `sales-report` | app/Journey Onboarding/sales-dashboard-clone/sales-dashboard-clone.component.ts | journey, salesleads | participant metadata |
| `salesleads` | app/Journey Onboarding/saleslead/saleslead.component.ts | salesleads, package, products, journey, participantjourneyproduct | salesleads |
| `journeyonboardingdetail` | app/journey-onboarding-detail/journey-onboarding-detail.component.ts | profile_data, journey, series, classify, content_urls, solar voice playlist, journeyonboardingdetail | classify, journeyonboardingdetail |
| `login` | app/login/login.component.ts | profile_data, dynamic (role_ref path) | user, user_data |
| `EISDashboard` | app/main-dashboard/main-dashboard.component.ts | profile_data, dashboard | — |
| `bigeventmentor` | app/New-Workshop/bigeventmentor/bigeventmentor.component.ts | event collection, journey, participant metadata, biglevel, bigeventmentor, bigeventparticipantsplan | bigeventmentor, bigeventparticipantsplan |
| `bigengagementdashboard` | app/New-Workshop/capacity-dashboard/capacity-dashboard.component.ts | big aggregate level, atcmodel level config, biglevel, bigactivity, journey, participant metadata | — |
| `create-workshop` | app/New-Workshop/create-workshop/create-workshop.component.ts | — | workshopconfiguration |
| `engagementdashboard` | app/New-Workshop/engagement-dashboard/engagement-dashboard.component.ts | journey, participant metadata, event collection, queue generation, workshopconfiguration, appointments, appointmenttype, content analytics, event participation request, workshop participant enrolled, queue_token, queue stage log, engagement_snapshots | engagement_snapshots |
| `formtemplateworkshop` | app/New-Workshop/form-assignment/form-assignment.component.ts | delivery forms, queue generation, queue_token, queue variation, formsByClient, temporary_forms | formsByClient, temporary_forms, queue_token, queue stage log, formsByClient log |
| `productpageworkshop` | app/New-Workshop/product-page/product-page.component.ts | static meta data | static meta data |
| `workshopconfig/:id` | app/New-Workshop/workshop-configuration/workshop-configuration.component.ts | atc taxonomy, arenavideoask, journey, tier, episodes, solar voice audios, participantvideoask, supportchat, workshopcategory, big cohorts, delivery forms, quiz, workshop images, wati archive | workshopconfiguration |
| `workshop_dashboard/:id` | app/New-Workshop/workshop-dashboard/workshop-dashboard.component.ts | participant metadata, new_user_data, journey, tier, workshopconfiguration, workshop participant enrolled, participant workshop, workshopcategory | workshopconfiguration |
| `workshops` | app/New-Workshop/workshops/workshops.component.ts | workshopconfiguration | workshopconfiguration |
| `approveofftime` | app/Offtime/approve-offtime/approve-offtime.component.ts | offtime, profile_data | offtime |
| `offtime` | app/Offtime/offtime-list/offtime-list.component.ts | offtime | offtime |
| `joinroom/:roomid` | app/OpenVidu/join-openvidu-call/join-openvidu-call.component.ts | openviduroom, openviduCallQuality | openviduCallQuality |
| `participantstudio` | app/OpenVidu/list-openvidu-room/list-openvidu-room.component.ts | live assignment, queue studio pairing, profile_data, openviduroom, appointments | openviduroom |
| `monitorliveassignment` | app/OpenVidu/monitor-liveassignment/monitor-liveassignment.component.ts | openviduroom | — |
| `openvidurecordings` | app/OpenVidu/openvidu-recording/openvidu-recording.component.ts | openviduroom, openvidu event | — |
| `participanttouchpoint` | app/participant-touchpoint/participant-touchpoint.component.ts | classify, participant touchpoint | — |
| `app-flow-breaks` | app/Participants Profile Management/app-flow-breaks/app-flow-breaks.component.ts | appflowbreaks, profile_data | — |
| `participantpurchase/:pid` | app/Participants Profile Management/journey-product-purchase/journey-product-purchase.component.ts | journey, products, package, journey-to-product, productToDeliverySequence, profile_data, Participants (watsonDatabase - separate Firestore app 'watson'), ParticipantPurchases (watsonDatabase - separate Firestore app 'watson'), participantsproduct, journeyproductpurchase, participantjourneyproduct, deliverables | participantsproduct, journeyproductpurchase, participantjourneyproduct, dynamic (path) |
| `ProfileScreen` | app/Participants Profile Management/new-profile/new-profile.component.ts | participant metadata | filteredtimeline profile |
| `participantdeliverysequence/:pid` | app/Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts | appointments, profile_data, journey, products, appointmenttype, delivery forms, delivery report, delivery events, delivery queue, delivery fieldwork, participantdeliverysequence, participantsproduct, deliverables | dynamic (key path), participantsproduct, dynamic (delivery['sequenceref'].path), participantdeliverysequence, profile_data |
| `participant-form-tracker` | app/Participants Profile Management/participant-form-tracker/participant-form-tracker.component.ts | profile_data, ask AH, love letter, formsByClient, delivery forms | — |
| `participantproduct` | app/Participants Profile Management/participant-product/participant-product.component.ts | products, journey, participantsproduct | Atestdate, participantsproduct |
| `participants-analytics` | app/Participants Profile Management/participants-analytics/participants-analytics.component.ts | static meta data, email archive, wati archive, searchquery, event collection, queue generation, queue_token, tier, journey, modes, products, participant tags, participantsproduct, participant metadata, series, recommended mix playlist, solar voice playlist, content_urls, profile_data, dynamic (defaultsearchref path), email validators, participantjourneyproduct, content analytics, participant tag logs | profile_data, searchquery, participant metadata, buffermix archive, email archive, email validators, wati archive, subscription extend log, participantjourneyproduct, broadcast_analytics, supportdesk, broadcast_participants |
| `participant-evolution-summary` | app/Participants Profile Management/participants-analytics/participants-evolution-summary/participants-evolution-summary.component.ts | — | — |
| `profilesummary/:profileid` | app/Participants Profile Management/profile-summary/profile-summary.component.ts | profile_data, participant metadata, appointments, appointmenttype, fullfillmentchallenges, clientissue, products, journey, users_roles | profile_data |
| `profilelist` | app/Participants Profile Management/profilelist/profilelist.component.ts | profile_data, users_roles, atc model, starlabs roles, atc_alpha, appointments, Roles-To-EIS, journeyproductpurchase, participantsproduct, EISzoomcontact, aggregate_EITParticipant, aggregate_ReviewParticipant, availability, events_profiles, formsByClient | profile_data, dynamic (role_ref path, e.g. Roles-To-EIS), dynamic (role_ref path) |
| `userprofile_old` | app/Participants Profile Management/userprofile_old/userprofile_old.component.ts | journey, package, products, eiflix workshop, queue generation, post_categories, evolutionmappingvideo, liveevolutionmapping, participantsproduct, deliverables, event collection, interim crossover, Achievements, interimreport log, formsByClient, events_profiles, clientissue, participantjourneyproduct | clientissue, queue generation |
| `userprofile/:id` | app/Participants Profile Management/userprofile/userprofile.component.ts | profile_data, participant metadata, participantjourneyproduct, participantsproduct, interim crossover, event collection, queue generation, event participation request, clientissue, formsByClient, interimreport log, Achievements, evolutionmappingvideo, liveevolutionmapping, appointments, classify, participant touchpoint, participant mode checklist, notifications, post_categories, deliverables | filteredtimeline profile, queue generation, participant metadata |
| `view-participants-form` | app/Participants Profile Management/view-participants-form/view-participants-form.component.ts | queue generation, delivery forms, eiflix workshop, workshopconfiguration, formsByClient | formsByClient |
| `addproduct` | app/Product Designer/add-product/add-product.component.ts | products | — |
| `addjourney` | app/Product Designer/addjourney/addjourney.component.ts | journey | journey |
| `addpackage` | app/Product Designer/addpackage/addpackage.component.ts | package | — |
| `createaelnames` | app/Product Designer/create-ael-names/create-ael-names.component.ts | accelerated evolution level | accelerated evolution level |
| `deliverysequence` | app/Product Designer/delivery-sequence/delivery-sequence.component.ts | productToDeliverySequence, products, appointmenttype, delivery forms, delivery report, delivery events, delivery queue, delivery fieldwork | productToDeliverySequence |
| `deliveryactivities` | app/Product Designer/delivery-set/delivery-set.component.ts | appointmenttype, delivery forms, delivery report, delivery events, delivery queue, delivery fieldwork | — |
| `formtemplate` | app/Product Designer/delivery-set/formtemplate/formtemplate.component.ts | delivery forms, queue generation, queue_token, queue variation, temporary_forms | formsByClient, temporary_forms, queue_token, queue stage log, formsByClient log |
| `journeyproductmap` | app/Product Designer/journey-product/journey-product/journey-product.component.ts | products, journey, journey-to-product | — |
| `packagedesign` | app/Product Designer/package-design/package-design.component.ts | journey, package design | — |
| `atcmodel` | app/Product Designer/product-atcmodel/view-atcmodel/view-atcmodel.component.ts | atc model, content_urls | — |
| `productdelivery` | app/Product Designer/product-delivery/product-delivery.component.ts | products, appointmenttype, delivery forms, delivery report, delivery events, delivery queue, delivery fieldwork, productToDeliverySequence | — |
| `viewproductmodeplaylist` | app/Product Designer/view-product-mode-playlist/view-product-mode-playlist.component.ts | product mode playlist, products, series, solar voice playlist, content_urls | product mode playlist |
| `arenastudioactivity` | app/queue system/arenastudioactivity/arenastudioactivity.component.ts | queue generation, zoomaccount, live assignment, queue_token | live assignment, queue studio pairing |
| `queuebigplanner` | app/queue system/big-planner/big-planner.component.ts | products, queue generation, big cohorts, profile_data, event collection, review participants, bigactivity, arena events, biginvitation, queue studio pairing, studio activity log, live assignment, queue_token | queue generation, queue studio pairing, queue_token |
| `dynamicqueuemanager` | app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts | stage opportunity count, classify, queue generation, users_roles, bigactivity, participant tags, products, participant metadata, queue studio pairing, studioinvitation, queue variation, queue_token, queue stage log, queue planning, participant list, segments, FCM_token, live assignment, event participation request, deliverables, queuereminder, clientissue, event collection, arena events, atc_alpha, atc_to_validate, notificationrecord, wati archive, email archive | classify, queue_token, live assignment, queue studio pairing, queue stage log, queue avtest, queue generation, queue opportunity, participantsproduct, event participation request, participant list, deliverables, studioinvitation, queuereminder, wati archive, email archive |
| `dynamicstudio` | app/queue system/dynamic-studio/dynamic-studio.component.ts | products, queue generation, profile_data, bigactivity, queue studio pairing, queue variation, live assignment, studioinvitation, studio conversation, queue_token, formsByClient, studio checkin log, atc_to_validate, atc_alpha, atc_notes, pick_for_mentoring, triple atc, accelerated evolution level, participant AEL, deliverables, participantsproduct, review participants, openviduroom | studioinvitation, queue studio pairing, studio checkin log, live assignment, queue_token, queue stage log, interim crossover, participant AEL, studio conversation, A&H updates, openviduroom |
| `eventopportunitydashboard` | app/queue system/event-opportunity-dashboard/event-opportunity-dashboard-v2/event-opportunity-dashboard-v2.component.ts | arena e-ticket, big marathon, big cohorts, queue generation, event collection, stage opportunity count, queue_token | stage opportunity count |
| `initiateeventproduct` | app/queue system/initiate-event-product/initiate-event-product.component.ts | participant metadata, event collection, queue generation, products, productToDeliverySequence, event participation request, participantsproduct, queue_token, queue variation, arena events | event participation request, participantsproduct, wati archive, email archive |
| `queuelist` | app/queue system/queue-list/queue-list.component.ts | queue generation | queue generation, arena events |
| `queue-planner-review` | app/queue system/queue-planning-review/queue-planning-review.component.ts | queue generation, segments, participant list, queue variation, queue_token, cohorts queue planner, queue planning, arena events, products, interimreport log, participantsproduct | wati archive, email archive, queue_token, participantsproduct, event participation request |
| `queue-planner` | app/queue system/queue-planning/queue-planning.component.ts | queue generation, segments, big cohorts, participant tags, participant list, queue variation, queue_token, cohorts queue planner, queue planning draft, queue planning | wati archive, email archive, queue planning draft, queue planning |
| `queuetransfer` | app/queue system/queue-transfer/queue-transfer.component.ts | queue generation, journey, products, participantdashboard, queue variation, queue_token, participantsproduct, queue stage log, productToDeliverySequence, arena events | queue participant transfer |
| `queuevenue` | app/queue system/queue-venue/queue-venue.component.ts | queue generation, queue_token | — |
| `queue-web` | app/queue system/QueueWebVerison1/queue-web-version1.component.ts | products, evolutionmappingvideo, liveevolutionmapping, participantsproduct, deliverables, queue variation, queue_token, queue generation | queue generation |
| `zoomaccount` | app/queue system/zoom-account/zoom-account.component.ts | zoomaccount | zoomaccount |
| `openmeeting/:id/:collectiontype` | app/queue system/zoom-clientview/zoom-clientview.component.ts | live assignment, appointments, profile_data | live assignment |
| `quiz` | app/quiz/quizscreen.component.ts | quiz | — |
| `viewquiz` | app/quiz/viewquizcohort/viewquizcohort.component.ts | quiz, quizbyclients, big cohorts, event collection | — |
| `routeconfiguration` | app/route-configuration-duplicate/route-configuration.component.ts | dashboard | dashboard |
| `appointmentavailability` | app/Scheduling/appointment-availability/appointment-availability.component.ts | availability, profile_data | availability |
| `appointmentcalendar` | app/Scheduling/appointment-calendar/appointment-calendar.component.ts | appointments, profile_data | — |
| `mycalendar` | app/Scheduling/appointment-calendar/appointment-calendar.component.ts | appointments, profile_data | — |
| `appointmentrole` | app/Scheduling/appointment-roles/appointment-roles.component.ts | eisroles | — |
| `appointmentstatuspending` | app/Scheduling/appointment-status-pending/appointment-status-pending.component.ts | appointments, profile_data | — |
| `appointmentstudio` | app/Scheduling/appointment-studio/appointment-studio.component.ts | appointments, products, openviduroom | openviduroom, appointments |
| `appointment-status-update` | app/Scheduling/appointment-zoom-view/appointment-status-update/appointment-status-update.component.ts | appointments, products, zoomaccount, logs | appointments, zoomaccount, logs |
| `openappointmentzoom/:id` | app/Scheduling/appointment-zoom-view/appointment-zoom-view.component.ts | appointments, profile_data | appointments |
| `bookappointment` | app/Scheduling/book-appointment/book-appointment.component.ts | participantsproduct, deliverables, participantdeliverysequence, AppointmentType-To-Roles, customer_eismapping, Roles-To-EIS, availability | availability, appointments, participantsproduct, participantdeliverysequence |
| `capacityutilization` | app/Scheduling/capacity-utilization/capacity-utilization.component.ts | availability, profile_data | — |
| `eisappointmentrole` | app/Scheduling/eis-appointment-role/eis-appointment-role.component.ts | Roles-To-EIS | — |
| `EISzoom` | app/Scheduling/eis-zoom-account/eis-zoom-account.component.ts | EISzoomcontact | — |
| `mapappointmentrole` | app/Scheduling/map-appointment-role/map-appointment-role.component.ts | AppointmentType-To-Roles | — |
| `mapclienteis` | app/Scheduling/map-client-eis/map-client-eis.component.ts | customer_eismapping | customer_eismapping |
| `roster` | app/Scheduling/roaster/roaster.component.ts | appointment session, appointments | — |
| `teamdeliveryhours` | app/Scheduling/team-delivery-hours/team-delivery-hours.component.ts | deliverytime | — |
| `devtestmic` | app/Test Component/dev-test-mic/dev-test-mic.component.ts | — | — |
| `tv-auth` | app/tv-auth.component.ts | — | — |
| `workshopchallengecreation` | app/Workshop/challenge-view/challenge-view.component.ts | eiflix workshop challenges | eiflix workshop challenges |
| `createworkshop` | app/Workshop/eiflix-workshop/view-workshop/view-workshop.component.ts | eiflix workshop | dynamic |
| `enrollment_config_view` | app/Workshop/enrollment-config-view/enrollment-config-view.component.ts | eiflix enrolment | eiflix enrolment |
| `workshopchallengeparticipantdashboard` | app/Workshop/participant-enrollment-dashboard/participant-enrollment-dashboard.component.ts | eiflix workshop, eiflix workshop challenges, eiflix participant workshop, eiflix participant enrolled | eiflix participant workshop, eiflix workshop challenges, eiflix participant enrolled |
| `workshop_image_upload` | app/Workshop/workshop-image-upload/workshop-image-upload.component.ts | workshop images, atc taxonomy | workshop images |
| `eventzonemanagement` | app/Zone Management/event-zone-management/event-zone-management.component.ts | event collection, users_roles, event zones, big cohorts, event participant zones | event zones, event participant zones, event participant zones logs |
