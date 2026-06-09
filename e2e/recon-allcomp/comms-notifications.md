# Communication Center & Notifications & Chat — e2e recon

> Key: `comms-notifications` | Written: 2026-06-10 | Analyst: Claude Code (recon subagent)
> Target project: `slabs-queue-e2e-exdcz` (read-only admin for assertions; writes only via test-project allowlist).
> Gold standard: `e2e/queue/` suite conventions (anti-circular assertions, stubs barrel, authGuard login, page objects).

---

## Routes (path → component file:line, role/guard, ATC? note)

| Route | Component file | Guard | Role model | ATC? |
|---|---|---|---|---|
| `/communication` | `src/app/Communication Center/communication/communication.component.ts:1` | `authGuard` (dashboard collection lookup) | Reads `users_roles` via `authguard.getRoles()`; no in-component role check — access gated entirely by `dashboard` collection config | No ATC references |
| `/email-templates` | `src/app/Communication Center/create-email-template/create-email-template.component.ts:1` | `authGuard` | Same authguard pattern; uses `this.authguard.uid` for `createdby` | No ATC references |
| `/zoom-recording-dashboard` | `src/app/Communication Center/zoom-recording-dashboard/zoom-recording-dashboard.component.ts:1` | `authGuard` | No explicit role check in component — pure read-only view | No ATC references |
| `/notificationlog` | `src/app/AppEngagement/notifications-log/notifications-log.component.ts:1` | `authGuard` | No role check in component — uses collectionGroup read on `notifications/{uid}/logs` | No ATC references |
| `/notificationrecord` | `src/app/AppEngagement/notification-record/notification-record.component.ts:1` | `authGuard` | Uses `authguard.getProfileMap()`; no role gating in component | No ATC references |
| `/group-chat` | `src/app/Events/Chat/chat-screen/chat-screen.component.ts:155` | `authGuard` | `roles['chatxadmin']` and `roles['admin']` checked at line 157–158; chatxadmin enables extra moderation actions | No ATC references |
| `/bigchatscreen` | `src/app/big/big-chat-screen/big-chat-screen.component.ts:105` | `authGuard` | `roles['mentor']` at line 108 → `mentorRole`; `bigAdminAccess` determined via adminsCheck. Route params: `assignemtnId`, `profileId`, `assignmentprofileId`, `admins` | No ATC references |
| `/onewaytemplates` | `src/app/OneWayAppCommunication/onewaytemplates/oneway-templates.component.ts:1` | `authGuard` | No in-component role check | No ATC references |

**Route config source:** All routes declared in `src/app/app.routes.ts:230,248,249,252,255–257,307` with `canActivate:[authGuard]`. The `authGuard` resolves allowed roles from the `dashboard` Firestore collection (`authguard.service.ts:325`).

**Note on `/onewaychannel`:** `onewaychannel` is a dialog/wizard launched from within the `/onewaytemplates` screen (component `src/app/OneWayAppCommunication/onewaychannel/oneway-channel/oneway-channel.component.ts`) — it has no standalone route entry in `app.routes.ts`. It is treated as a sub-flow of onewaytemplates.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

| Collection | R/W | Purpose |
|---|---|---|
| `email templates` | both | Email template CRUD; `postmarkstatus` lifecycle (`pending`→`approved`); validated flag. Written by `/communication` (line 1143) and `/email-templates` (line 699, 1129). Read-filtered by `postmarkstatus=='approved'` for send eligibility. |
| `email archive` | both | One record per broadcast send operation (profileid[], status, templateid, date). Written by `/communication` `sendEmailToSelectedParicipant()` (line 1570) and `send-individual-email` (line 170). Triggers `sendBatchEmailTest` CF. |
| `email logs` | read | Per-recipient send result written by `sendBatchEmailArchive` CF (line 1479). Read back in communication dashboard for sent/delivered/open counts. |
| `email validators` | both | Config: `profilelist` — who can validate templates (line 1194, 1464). `templateCategories` doc. |
| `notification templates` | both | Notification/in-app template CRUD. `type` field: `notification` or `inappmessage`. Written at `communication.component.ts:1073`. |
| `notificationrecord` | both | One record per notification broadcast; triggers `notifyMobileApp` CF on create. Written by `authguard.service.ts:saveNotificationRecord()` (line 1257) and by `ChatxNotification` CF (via commonService). CF writes back `profilesuccess[]`, `profilefailed[]`, `success: true` (CF line 519–529). |
| `notifications/{uid}/logs` | read (web), write (CF) | Per-user notification delivery log. Written by `notifyMobileApp` CF (line 673). Read by `/notificationlog` via collectionGroup query on `logs` (line 159). |
| `notifications` | read | Top-level per-user read-status doc (`read: bool`). Read by `/notificationlog` (line 70). |
| `inapp templates` | both | In-app message template CRUD. Written at `communication.component.ts:996`. |
| `wati templates` | read | WhatsApp template metadata read at `/communication` line 1300. |
| `wati archive` | read | WhatsApp send history read by date range (`communication.component.ts:830`). |
| `myoperator calls` | read | Call log records read by date range (`communication.component.ts:808`). |
| `supportchat` | both | Group/channel/chat room root docs. Created by `/group-chat` `buildGroup()` (line 1016) and `/onewaychannel` `createChannel()` (line 304). Updated by `ChatxNotification` CF (line 3373). |
| `supportchat/{chatid}/messages` | both | Per-message subcollection. Written by `chat-screen.sendMessage()` (line 972); triggers `ChatxNotification` CF on create. |
| `onewaytemplates` | both | One-way broadcast template CRUD. Written by `/onewaytemplates` (line 620, 731). Read by `/onewaychannel` step-2. |
| `channelarchive` | write | One-way broadcast dispatch record written by `/onewaychannel` `onSend()` (line 404). No CF trigger found in main repo — CF may be planned but not yet deployed. |
| `zoom recordings backup` | read | Zoom recording metadata read by `/zoom-recording-dashboard` (line 50). |
| `profile_data` | read | Profile metadata loaded by `/communication` (line 1360), `/group-chat` (line 160), `/bigchatscreen` etc. |
| `users_roles` | read | Role docs read by `/group-chat` (line 182). |
| `bigchat/{assignmentDocId}/bigchatmessages` | both | BIG-session direct/group chat messages. Written by `big-chat-screen.sendMessage()` (line 827). |
| `bigchat` | read | BIG chat room root doc read by `bigchatscreen` (line 219). |
| `big marathon` | read | Marathon list read by `bigchatscreen` (line 199). |
| `big assignment` | read | Assignment docs loaded for broadcast in `bigchatscreen` (line 333). |
| `classify` | read | Config docs: `postmarkserver` (server name for Postmark API), `onewaycategories` (template categories). |
| `chat config` | read | Sender email IDs config read by `send-individual-email` (line 130). |
| `participant metadata` | read | Participant contact info (email) used by email send batches (`sendBatchEmailArchive` line 1339). |
| `dashboard` | read | Route config — `authGuard` reads it to resolve allowed roles per route (`authguard.service.ts:325`). |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Read at | Effect |
|---|---|---|
| `dashboard` collection | `authguard.service.ts:325` | Roles allowed per route — gates entire UI |
| `classify / postmarkserver` | `create-email-template.component.ts:574` | Which Postmark secret/server to use for email sends |
| `classify / onewaycategories` | `oneway-templates.component.ts:401` | Category list for one-way template filtering |
| `email validators / validators` | `communication.component.ts:1379` | `profilelist` — who can approve/validate email broadcasts |
| `email validators / templateCategories` | `communication.component.ts:1194,1207` | Category/subcategory list for template forms |
| `chat config / 0jqtiq3sxtbLVcEGMDhW` | `send-individual-email.component.ts:130` | Sender email IDs available in the from-selector |
| `users_roles` (all docs) | `chat-screen.component.ts:182` | Drives user list display and @mention lookup |

---

## Cloud Functions involved (name → trigger → side-effect a test can assert)

| CF Name | Trigger | Side-effect assertable in tests |
|---|---|---|
| `notifyMobileApp` | `onCreate` on `notificationrecord/{id}` (CF:59) | Writes `profilesuccess[]`, `profilefailed[]`, `success:true` back onto the `notificationrecord` doc (CF:519–529). Also writes `notifications/{uid}/logs/{logid}` per targeted user. **ACTIVE in index.js:80.** |
| `sendBatchEmailTest` | `onCreate` on `email archive/{docid}` (CF:1186) | Writes `email logs` rows (one per recipient, `msgstatus: 'sent'`/'not-sent') and updates `email archive` doc with `postmark_msgid[]`, `mailstatus`. **ACTIVE in index.js:86.** |
| `sendBatchEmail` | `onRequest` HTTP (CF:1216) | Same side-effect as `sendBatchEmailTest` — `email logs` rows. **ACTIVE in index.js:87.** |
| `createPostMarkEmailTemplate` | `onUpdate` on `email templates/{docid}` (CF:1905) | When `templatevalidated` flips `false→true` AND `templatestatus=='created'`, creates the template in Postmark and writes back `postmarktemplateid`, `active`, `postmarkstatus:'approved'`. **ACTIVE in index.js:85.** |
| `postmarkResponseCapture` | `onRequest` HTTP (CF:1247) | Inbound webhook from Postmark; writes `email logs` rows for delivery/bounce/open/click events. **ACTIVE in index.js:88.** |
| `ChatxNotification` | `onCreate` on `supportchat/{chatid}/messages/{msgid}` (CF:3313) | Updates `supportchat/{chatid}` with `last_message`, `last_pending`, `last_sender_uid`, `last_modification` (CF:3373). For group chats also calls `saveNotificationRecord` → creates a `notificationrecord` doc (CF:3392), which in turn triggers `notifyMobileApp`. **ACTIVE in index.js:196.** |
| `emailArchiveTriggerOnWrite` | **COMMENTED OUT** in index.js:82 — not deployed. | N/A |
| `createTwilioWhatsAppTemplate` | **COMMENTED OUT** in index.js:93 — not deployed. | N/A |
| `likeNotification` | **COMMENTED OUT** in index.js:35 — not deployed. | N/A |
| `commentNotification` | **COMMENTED OUT** in index.js:36 — not deployed. | N/A |
| `comment_likes_Notification` | **COMMENTED OUT** in index.js:37 — not deployed. | N/A |
| `sendAHupdates` | Defined in `depreciated.js:120` but **not exported** in `index.js`. | N/A |

---

## External services to stub (call sites file:line)

| Service | Call site | Stub needed |
|---|---|---|
| **Postmark (email)** | `communication.component.ts:1138` sets `postmarkstatus:'pending'` on template creation, triggering `createPostMarkEmailTemplate` CF which calls the Postmark API externally. `send-individual-email.component.ts:169` stores `postmarktemplateid`. `sendBatchEmailTest` CF calls Postmark. | Stub `sendBatchEmail` HTTP endpoint + prevent real Postmark calls. Use `installEmailStub(page)` from existing stub barrel. The test should assert `email archive` doc was written, not that Postmark delivered. |
| **Wati/WhatsApp** | `communication.component.ts:1604–1611` — `sendWatiMessage` is **commented out**; no live Wati call in the web app. `wati archive` is read-only. | Stub defensively via `installWatiStub(page)` even though the code path is dead, in case it gets uncommented. |
| **FCM (push notifications)** | `authguard.service.ts:setupNotification()` requests FCM token on login. `notifyMobileApp` CF sends via FCM (not the web app directly). | `installFcmStub(page)` from existing stub barrel — suppress FCM permission prompts. |
| **Firebase Storage** | `communication.component.ts:1044–1047` uploads notification images. `chat-screen.component.ts` uploads chat attachments. `big-chat-screen.component.ts:661,715` uploads bigchat attachments. | Not a separate external stub — but test cases that don't test file upload must not include file inputs. Reuse existing Firebase Storage (it's the test project's own storage, not an external). |
| **Zoom** | `zoom-recording-dashboard` reads `zoom recordings backup` collection — Zoom recordings are pre-ingested, no live Zoom SDK call. | No Zoom stub needed for this screen. `installZoomStub(page)` defensively for `/communication` which is a broad dashboard. |
| **OpenVidu/LiveKit** | Not referenced in any comms/notifications component. | N/A — but `installOpenViduStub(page)` for any page that loads the shared app shell. |
| **MyOperator** | `myoperator-service.ts` exists; `communication.component.ts:354` reads `myoperator calls` collection. No live HTTP call visible in web app (service may wrap an HTTP call). | Check `myoperator-service.ts` for HTTP; stub if needed. |

**Note on `sendBatchEmail` HTTP URL pattern:** components call `https://us-central1-<projectId>.cloudfunctions.net/sendBatchEmail` directly (queue-manager, big-dashboard, etc.) using `this.http.post(url, ...)`. The `/communication` component does NOT call this URL directly — it writes to `email archive` and relies on `sendBatchEmailTest` trigger. The HTTP URL pattern must be routed through `installEmailStub` or blocked with `page.route()`.

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role keys needed | What they can do | Notes |
|---|---|---|---|
| **Comms Admin** | `admin` or any role configured in `dashboard` for `/communication`, `/email-templates` | Full template CRUD, email/notification broadcast, view all logs | No in-component role check — gate is `dashboard` collection config only |
| **Chat Admin** | `chatxadmin` or `admin` | `/group-chat`: create groups, pin, edit, delete messages, restore inactive groups. `chatAdmin = roles['chatxadmin']` at `chat-screen.ts:157` | Without `chatxadmin`, edit/delete actions may be disabled |
| **BIG Mentor** | `mentor` | `/bigchatscreen`: `mentorRole = roles['mentor']` (ts:108); determines `bigAdminAccess` which enables admin-specific send controls | Route params required: `assignemtnId`, `profileId` |
| **Notification Viewer** | any authenticated role with route access | `/notificationrecord`, `/notificationlog` — read-only views | No in-component role filtering |
| **Zoom Dashboard Viewer** | any authenticated role with route access | `/zoom-recording-dashboard` — read-only, no writes | |
| **Template Author** | any authenticated user with `/onewaytemplates` route access | CRUD on `onewaytemplates` collection | |

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

**Flow 1 — Notification Template Creation (Communication Center)**
1. Actor navigates to `/communication`, selects "Notifications" tab.
2. Fills form (templateName, message, type: "notification").
3. Clicks "Save Template".
4. **Write:** `notification templates/{docid}` — `{templatename, message, type:"notification", templatevalidated:false, templatestatus:"created", createdby}` (`communication.component.ts:1073`).

**Flow 2 — Email Broadcast Send (Communication Center)**
1. Actor selects a validated email template (`postmarkstatus=='approved'`, `templatevalidated==true`).
2. Selects participant profiles (adds to `selectedRows`).
3. Clicks "Send Email".
4. **Write 1:** `email archive/{docid}` — `{profileid[], status:'created', templateid, date, body, subject}` (`communication.component.ts:1570`).
5. **CF trigger:** `sendBatchEmailTest` fires on the new `email archive` doc.
6. **Write 2 (CF):** `email logs/{logid}` rows — one per recipient with `msgstatus:'sent'` or `'not-sent'` (`communication.js:1496–1504`).
7. **Write 3 (CF):** `email archive/{docid}` updated with `postmark_msgid[]`, `mailstatus`.

**Flow 3 — Email Template Validation → Postmark Sync (email-templates)**
1. Actor navigates to `/email-templates`, creates a template (fills HTML body, subject, alias, category).
2. **Write 1:** `email templates/{docid}` — `{postmarkstatus:'pending', templatevalidated:false, templatestatus:'created'}` (`create-email-template.component.ts:699`).
3. Template validator opens template, clicks approve.
4. **Write 2:** `email templates/{docid}` updated: `{templatevalidated:true, templatestatus:'created'}` (`communication.component.ts:1421`).
5. **CF trigger:** `createPostMarkEmailTemplate` fires on update; external Postmark call creates template.
6. **Write 3 (CF):** `email templates/{docid}` updated with `{postmarktemplateid:<id>, active:true, postmarkstatus:'approved'}` (`communication.js:1949–1952`).

**Flow 4 — Group Chat Message Send (group-chat)**
1. Actor navigates to `/group-chat`, selects or creates a group.
2. Types a message in the textarea (`class="message-input"` with `#messageInput`).
3. Clicks send button (`class="send-button"`, `(click)="sendMessage()"`).
4. **Write 1:** `supportchat/{chatid}/messages/{msgid}` — `{message, sender_uid, time, type:'text', read_by:[], pending:[...members]}` (`chat-screen.component.ts:972`).
5. **Write 2:** `supportchat/{chatid}` updated: `{last_message, last_sender_uid, last_modification, last_pending}` (`chat-screen.component.ts:975`).
6. **CF trigger:** `ChatxNotification` fires on new message doc.
7. **Write 3 (CF):** `supportchat/{chatid}` updated again with `last_message`, `last_modification` etc. (`communication.js:3373`). For groups: `notificationrecord/{id}` created with `notificationtype:'groupchat'`.

**Flow 5 — Group Creation (group-chat)**
1. Actor clicks "Create New Group" button (`class="create-group-btn"`).
2. Fills group name, selects members in dialog.
3. Confirms.
4. **Write:** `supportchat/{docid}` — `{type:'group', group_name, members:[], created_on, creator_uid}` (`chat-screen.component.ts:1016`).

**Flow 6 — One-Way Template Creation (onewaytemplates)**
1. Actor navigates to `/onewaytemplates`, clicks "Create Template".
2. Fills template name, HTML body, model parameters.
3. Saves.
4. **Write:** `onewaytemplates/{docid}` — `{templatename, htmlbody, category, createddate}` (`oneway-templates.component.ts:620`).

**Flow 7 — One-Way Channel Broadcast (onewaychannel wizard, sub-flow of onewaytemplates)**
1. Actor selects a channel (from `supportchat` where `type=='channel'`).
2. Selects a one-way template.
3. Configures participant variables.
4. Clicks "Send Broadcast".
5. **Write 1:** `channelarchive/{docid}` — `{channelid, templateid, profileid[], status:'created', parameterConfig}` (`oneway-channel.component.ts:404`).
6. **Write 2:** `supportchat/{channelid}` updated: `{members: arrayUnion(...participantIds)}` (`oneway-channel.component.ts:424`).
7. **Note:** No deployed CF on `channelarchive` found — the broadcast delivery may be in-progress or handled by a CF not yet visible in the main branch.

**Flow 8 — Notification Broadcast via Communication Center**
1. Actor selects notification/in-app template, selects participants.
2. Clicks "Send Notification" (this path goes through `authguard.saveNotificationRecord`).
3. **Write:** `notificationrecord/{docid}` — `{title, message, profileid[], success:false, notificationtype, date}` (`authguard.service.ts:1257`).
4. **CF trigger:** `notifyMobileApp` fires on new `notificationrecord` doc.
5. **Write (CF):** `notificationrecord/{docid}` updated: `{profilesuccess:[], profilefailed:[], success:true}` (`communication.js:519–529`).
6. **Write (CF):** `notifications/{uid}` set: `{read:false}` and `notifications/{uid}/logs/{logid}` created per targeted user (`communication.js:672–689`).

**Flow 9 — Zoom Recording Dashboard (zoom-recording-dashboard)**
1. Actor navigates to `/zoom-recording-dashboard`.
2. App queries `zoom recordings backup` ordered by `timestamp desc`.
3. Table renders with meeting rows. No writes.

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

```js
// Seed needed for the comms-notifications suite
// All in test project slabs-queue-e2e-exdcz

// 1. A comms-admin user (roles: ['admin'] or a role listed in dashboard config for /communication)
//    Reuse the existing seed: actors.operatorAdmin (admin+<TESTRUNID>@example.com, roles: ['admin'])

// 2. A chatxadmin user (roles: ['chatxadmin', 'admin'])
//    New seed needed: chatAdmin+<TESTRUNID>@example.com with users_roles doc {chatxadmin:true, admin:true}

// 3. A non-admin regular user for chat participant (to appear in @mention list)
//    Reuse participant seeding from seed-test-project.js

// 4. Two profile_data docs with user_ref pointing to the above Firebase Auth UIDs

// 5. ONE pre-seeded supportchat group doc (type:'group', members:[chatAdminUid, participantUid])
//    → this lets group-chat tests open an existing chat without creating it first.
//    seed doc: supportchat/{COMMS_CHATID}

// 6. ONE pre-seeded email template doc (email templates collection):
//    {templatename: 'test-email-template-<TESTRUNID>',
//     postmarkstatus: 'approved',   ← so it appears in the "approved" template list
//     templatevalidated: true,
//     templatestatus: 'created',
//     type: 'email',
//     subject: 'Test Subject',
//     htmlbody: '<p>Hello</p>',
//     templatealias: 'test-alias-<TESTRUNID>',
//     category: 'Test', subcategory: 'Unit'}

// 7. ONE pre-seeded notification template doc (notification templates collection):
//    {templatename: 'test-notif-template-<TESTRUNID>',
//     type: 'notification',
//     message: 'Test notification body',
//     templatevalidated: true,
//     templatestatus: 'created'}

// 8. ONE pre-seeded onewaytemplates doc (for broadcast flow):
//    {templatename: 'test-oneway-<TESTRUNID>',
//     htmlbody: '<p>Broadcast body</p>',
//     category: 'Test', createddate: serverTimestamp()}

// 9. ONE pre-seeded supportchat channel doc (type:'channel') for oneway broadcast:
//    {id: COMMS_CHANNELID, type:'channel', group_name:'Test Channel <TESTRUNID>',
//     admins:[commsAdminProfileId], members:[commsAdminProfileId]}

// 10. classify/postmarkserver doc: {serverName: 'POSTMARK_STARLABS_TEST'}
//     classify/onewaycategories doc: {categories: ['Test']}

// 11. chat config/0jqtiq3sxtbLVcEGMDhW: {sendermailid: ['test@soexcellence.com']}

// 12. ONE pre-seeded zoom recordings backup doc (for zoom dashboard test):
//    {meetingId: '12345', meetingTopic: 'Test Meeting <TESTRUNID>', 
//     hostEmail: 'host@test.com', duration: 60, status: 'completed',
//     successCount: 5, failedCount: 0, timestamp: serverTimestamp()}

// 13. ONE pre-seeded notificationrecord doc (already CF-processed, success:true)
//    for the ORACLE test that reads the notification record table.
//    {title:'Seeded Notification', profileid:['<profileId1>','<profileId2>'],
//     profilesuccess:['<profileId1>'], profilefailed:['<profileId2>'],
//     success:true, date:new Date(Date.now()-3600000)}
```

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| CN-01 | Communication dashboard loads and shows template type tabs | REAL-UI | App renders tabs "Email", "WhatsApp", "Notifications", "In-App" from its own `separateTemplates()` logic — not values we seeded to a tab counter | P0 |
| CN-02 | Email template list shows only approved+validated templates in the send selector | REAL-UI | `/email-templates` list filtered by `postmarkstatus=='approved' AND templatevalidated==true` — app builds this query; assert the seeded approved template appears and a seeded `postmarkstatus:'pending'` template does not | P0 |
| CN-03 | Creating a notification template writes to `notification templates` with `templatevalidated:false` | REAL-UI | Actor fills form and saves; admin reads back the doc via firestore-admin and asserts `templatevalidated===false` — the app decided that value, not the test | P0 |
| CN-04 | Sending a broadcast email creates `email archive` doc with correct `profileid[]` count | REAL-UI | Actor selects N participants, clicks send; admin reads `email archive` and asserts `profileid.length === N` (the app built that array from its checkboxes) | P0 |
| CN-05 | `sendBatchEmailTest` CF side-effect: `email logs` row count matches recipient count | CF-SIDEEFFECT | Seed: `email archive` doc with `profileid:[p1, p2]` and `status:'created'` (not 'queued' so CF fires). CF runs. Assert `countWhere('email logs', [['emailarchiveid','==',archiveId]])` === 2. CF computed that, test seeded the 2 targets. | P0 |
| CN-06 | `notifyMobileApp` CF: `notificationrecord` doc updated with `success:true` after CF processes it | CF-SIDEEFFECT | Seed: `notificationrecord` doc with `profileid:[p1]`. CF fires. `pollUntil` checks `getDoc('notificationrecord', docid).success === true`. CF wrote that field. | P0 |
| CN-07 | `ChatxNotification` CF: sending a group chat message updates `supportchat` last_message | CF-SIDEEFFECT | Seed: `supportchat/{chatid}` group with `members:[uid1,uid2]`. Write a message doc to `supportchat/{chatid}/messages/{msgid}` via admin (simulates what the UI write does). CF updates `supportchat/{chatid}.last_message` to the message text. Assert `getDoc('supportchat', chatid).last_message === seededMessage`. CF computed that. | P1 |
| CN-08 | Group chat: send a message and verify it appears in the message list | REAL-UI | Actor logs into `/group-chat`, selects the pre-seeded group, types a message, clicks send. Assert the message text appears in the rendered message list (`.message-content` text). App rendered it from the Firestore stream it established. | P0 |
| CN-09 | Group creation: new group appears in active chats list after creation | REAL-UI | Actor creates group with unique name `group-<TESTRUNID>`. Assert the group name appears in the active chat sidebar. App built the sidebar from its Firestore collectionSnapshots query. | P1 |
| CN-10 | Zoom recording dashboard renders meeting rows with correct columns | REAL-UI | Navigate to `/zoom-recording-dashboard`. Assert the seeded meeting row (meetingId '12345', topic 'Test Meeting') appears in the mat-table. App rendered it from `getDocs(zoom recordings backup)`. | P1 |
| CN-11 | Zoom recording dashboard: apply status filter "completed" shows only matching rows | REAL-UI | Seed one row with `status:'completed'`, one with `status:'failed'`. Apply filter. Assert only the completed row is in the rendered table. The app's `filterPredicate` computed that. | P1 |
| CN-12 | Notification record table renders seeded records with correct `receivedRate` computation | ORACLE | Seed `notificationrecord` doc: `profileid:[p1,p2,p3]`, `profilesuccess:[p1,p2]`, `success:true`. Navigate to `/notificationrecord`. Assert the row's `receivedRate` column shows `"66.67"`. App computed `(2/3*100).toFixed(2)` from the seeded numbers — test provides the known-seeded inputs and asserts the app's computed output. | P0 |
| CN-13 | `createPostMarkEmailTemplate` CF: validating an email template writes `postmarkstatus:'approved'` to the doc | CF-SIDEEFFECT | Seed: `email templates` doc with `postmarkstatus:'pending'`, `templatevalidated:false`, `templatestatus:'created'`, `type:'email'`. Update doc to set `templatevalidated:true` via admin (simulating the approve step). CF fires. `pollUntil` checks `getDoc('email templates', docid).postmarkstatus === 'approved'`. CF called Postmark externally (stubbed in test env) and wrote back that field. | P1 |
| CN-14 | One-way template creation writes to `onewaytemplates` with correct fields | REAL-UI | Actor navigates to `/onewaytemplates`, creates a template with unique name. Admin reads `onewaytemplates` and asserts doc exists with matching `templatename` and `htmlbody`. App decided the doc structure. | P1 |
| CN-15 | One-way broadcast: sending creates `channelarchive` doc and updates `supportchat` members | REAL-UI | Actor opens the send-broadcast wizard from `/onewaytemplates`, selects the seeded channel, selects the seeded template, selects one participant, confirms. Admin asserts: (a) `channelarchive` doc created with `channelid==seededChannelId` and `profileid` contains participant; (b) `supportchat/{channelid}.members` arrayUnion includes participant. App computed both writes. | P1 |
| CN-16 | Notification log: collectionGroup on `notifications/{uid}/logs` populates table after date selection | REAL-UI | Seed `notifications/{uid}/logs/{logid}` doc with known `date` within today's range. Navigate to `/notificationlog`, set date range to today. Assert table has at least one row. App executed the collectionGroup query and rendered the result. | P2 |
| CN-17 | Chat-admin access: chatxadmin role enables group editing button visibility | REAL-UI | Login as chatxadmin actor. Navigate to `/group-chat`, select the seeded group. Assert the edit-group button is visible (it is gated on `chatAdmin` being true). Login as non-chatxadmin actor and assert the same button is absent. App checks `this.chatAdmin` at render time. | P2 |

---

## ATC exclusions within this group

**None of the 8 routes or their associated source components contain ATC reads/writes.** The grep for `atc` / `ATC` across all target files returns only false-positive matches (`.catch`, `.contacts`, etc.) — no ATC collection names, no `src/app/ATC/**` imports.

The `ChatxNotification` CF triggers on `supportchat/{chatid}/messages` — not an ATC collection.
The `notifyMobileApp` CF triggers on `notificationrecord` — not an ATC collection.

No exclusions within this group are required beyond the global ATC constraint.

---

## Risks / unknowns

1. **`dashboard` collection config is not seeded.** The `authGuard` reads `dashboard` to resolve roles per route (`authguard.service.ts:325`). In the test project `slabs-queue-e2e-exdcz`, this collection must contain the correct role-to-route mappings for `/communication`, `/notificationlog`, etc. If it's empty, every authenticated user gets a "no roles configured" dialog and the route returns `false`. **Mitigation:** Seed the `dashboard` collection for these routes in seed-test-project.js before writing any UI spec, OR use `page.goto()` directly and stub the guard (harder). This is the highest-priority risk — block on it.

2. **`sendBatchEmailTest` CF requires `status != 'queued'`.** Seeding `email archive` docs for CF-SIDEEFFECT tests must NOT set `status:'queued'` (CF line 1201 short-circuits). Use `status:'created'` or no `status` field.

3. **`createPostMarkEmailTemplate` CF calls the real Postmark API.** In the test project, the Postmark secret may not be configured. CF test CN-13 may fail with `Invalid server name` if `servername` field is absent or if the secret is not provisioned. Mitigation: confirm `classify/postmarkserver` config and whether the test project has the secret, OR downgrade CN-13 to P2 / skip until CF is stubbed.

4. **`ChatxNotification` CF trigger on `supportchat/{chatid}/messages/{msgid}` requires the collection path to be correct.** The CF trigger is at `onDocumentCreated("supportchat/{chatid}/messages/{msgid}")` — NOT a subcollection group pattern. The admin write for CN-07 must use the exact path `supportchat/<chatid>/messages/<msgid>`.

5. **`bigchatscreen` requires query params.** The route `/bigchatscreen?assignemtnId=<id>&profileId=<pid>&assignmentprofileId=<apid>&admins=<admins>` needs all params to load. Seeding requires a `bigchat/{assignmentDocId}` root doc. No tests are designed for this in this spec because the route is deeply tied to BIG assignment data (outside this group's scope and better covered by a BIG suite). Flag as out-of-scope for CN-* cases.

6. **`notifyMobileApp` CF sends real FCM/APNs push notifications.** In the test project this will fail for every profile that lacks a real device token. The CF still writes `profilesuccess[]`/`profilefailed[]` and `success:true` regardless of delivery failures (CF:519 runs even if no FCM token found). So CF-SIDEEFFECT test CN-06 asserts `success:true` which is always written — not the actual FCM delivery. This is safe.

7. **No `data-testid` attributes exist in any of these components.** All selectors must use: `formControlName`, semantic roles (`role='button'`), `class=` attributes, or stable text. The selector policy fallback chain (id/formControlName → role+name → stable class/text) applies throughout. The chat send button is `class="send-button"` with `mat-icon="send"`. The message textarea is `class="message-input"` with `#messageInput`. Communication tabs are `.tab-item` with `.active` class. None of these are brittle provided the classes do not change.

8. **`onewaychannel` has no standalone route** — it is a dialog launched from within `/onewaytemplates`. Test CN-15 must drive the UI through the main screen to open the dialog, which may involve a button click on the template list. The exact trigger button selector needs verification against the `oneway-templates.component.html` (not read in this recon; implementer must read it).

9. **`wati archive` and `myoperator calls` data** will be empty in the test project — the counts shown in the Communication dashboard sidebar will be 0 for those channels. Tests should not rely on those counts being non-zero unless the seed explicitly adds docs.

10. **`channelarchive` has no CF trigger in the deployed code.** The `onSend()` function in `/onewaychannel` writes to `channelarchive` (line 404), but no CF in the main `starlabs-cloud-function` responds to it. This means the broadcast delivery to participants is either (a) a planned but undeployed CF, or (b) handled by a separate mechanism. Test CN-15 can only assert the Firestore writes the app made — it cannot assert delivery side-effects for this flow.
