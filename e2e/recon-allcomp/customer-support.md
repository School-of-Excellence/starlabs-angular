# Customer Support — e2e recon

Generated: 2026-06-10. Source folder: `src/app/Customer Support/`.

---

## Routes (path -> component file:line, role/guard, ATC? note)

| Path | Component file | Guard | Role check | ATC? |
|------|---------------|-------|------------|------|
| `/customersupportdashboard` | `customer-support-dashboard/customer-support-dashboard.component.ts:55` | `authGuard` (app.routes.ts:206) | `chatxadmin` (ts:177) — role from `users_roles`; route access gated by `dashboard` Firestore collection (authguard.service.ts:325). No hard `chatxadmin` block in the guard itself — all chatxadmin users can enter; the commented-out `alert('You dont have access')` at ts:264–268 was never activated. | NO |
| `/customersupportdashboard/ticket/:ticketid/:ticketno` | `customer-chat-screen/customer-chat-screen.component.ts:52` | `authGuard` (app.routes.ts:207) | `chatxadmin` (ts:276). Send-message blocked at ts:1101 unless logged-in profile is in `assign` or `peopleinvolved` arrays of the ticket. | NO |
| `/customer-support-tickets` | `customer-ticket-new/customer-ticket-new.component.ts:39` | `authGuard` (app.routes.ts:208) | `chatxadmin` (ts:87 — ticketArray init uses chatAdmin check). | NO |
| `/customertickets` | `customertickets/customertickets.component.ts:109` (analytics/charts child component — receives `@Input() tickets`). Route guard: `authGuard` (app.routes.ts:209). NOTE: This is loaded standalone but normally used as an embedded tab inside `/customer-support-tickets`. | `authGuard` | No role check within; receives data via `@Input`. | NO |

Subsidiary dialogs (not direct routes):
- `AddIssueComponent` — opened from dashboard/ticket-new via `MatDialog.open()`. Writes to `clientissue`. No direct URL.
- `ChatConfigComponent` — opened via `openCategory()` at dashboard ts:1899 which navigates to `/chat-config` in a new window. The route is defined elsewhere.
- `CustomerChatScreenComponent` — also embedded as a tab in `/customer-support-tickets` (customer-ticket-new.component.ts imports it at line 19).
- `FlagReviewScreenComponent` — embedded in both dashboard (as component in imports:47) and `/customer-support-tickets`.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

| Collection | R/W | Purpose |
|-----------|-----|---------|
| `clientissue` | both | Primary ticket store. Each doc = one support ticket. Default DB. |
| `clientissue/{id}/messages` | both | Chat messages subcollection per ticket. |
| `chat config` | read | Category list, status list, validators, negligencecategories, auto-reply messages. Read at dashboard init (ts:215) and add-issue init (ts:174). Doc ID `0jqtiq3sxtbLVcEGMDhW` is hardcoded. |
| `users_roles` | read | Identify `chatxadmin == true` users (dashboard ts:234, chat-screen ts:223, add-issue ts:163). |
| `profile_data` | read | Profile map (name, email, number). |
| `new_user_data` | read | Used in `dashboardcustomersupport` CF as fallback profile lookup (clientissue.js:279). |
| `participantjourneyproduct` | read | Fetch active journey for a participant in add-issue (ts:720). |
| `dashboard` | read | Route-level role config (authguard.service.ts:325). |
| `counters` (doc `ticketCounter`) | both | Auto-incrementing issue number via transaction (add-issue ts:502, CF ticketCreatedV2:590). |
| `negligencemeter` | both | Negligence flag records. Written in flag-review-screen (ts:433, ts:364). Read via docData stream (ts:327). |
| `notifications/{profileid}/logs` | write | In-app notification records on ticket creation (add-issue ts:665). |
| `releaselog` | both | Release log entries (releaselogdialog.component.ts:145). |
| `journey` | read | Journey doc refs used in ticket records. |
| `profile_data` (Storage path `Chat/`) | write | Firebase Storage — file attachments for messages and tickets. |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Collection/doc | Read at | Effect |
|--------|---------------|---------|--------|
| `categories` array | `chat config/0jqtiq3sxtbLVcEGMDhW` | dashboard ts:222, add-issue ts:174–175 | Category list drives filter dropdowns, auto-assign (`assignto` per category), subcategory options. |
| `status` array | `chat config` | dashboard ts:223 | Status options for ticket status selector. |
| `validators` array | `chat config` | dashboard ts:224 | Profile IDs that are validators (affects review mandate logic). |
| `negligencecategories` | `chat config` | dashboard ts:225 | Negligence category list for flag-review-screen. |
| `messages[0].message` | `chat config` | `ticketCreated` CF:550, `ticketCreatedV2` CF:654 | Automated reply sent as second message on new ticket creation. |
| `warningmessages[0].message` | `chat config` | `autoCloseTickets` CF:722 | Warning message before auto-close. |
| `closingmessages[0].message` | `chat config` | `autoCloseTickets` CF:723 | Closing message on auto-close. |
| `eisroles` collection | `eisroles` | authguard.service.ts:795 | EIS-level roles (separate from main roles). |
| `dashboard` collection (route config) | `dashboard` | authguard.service.ts:325 | Allowed roles/profileids per route. |
| `commonService.production` | CF service.js | clientissue.js:849 | Switches Watson/SalesCRM URLs and Slack webhook between prod/test. |

---

## Cloud Functions involved (name -> trigger -> side-effect a test can assert)

All live in `starlabs-cloud-function/functions/components/clientissue.js`.

| CF name | Trigger | Assertable side-effect |
|---------|---------|----------------------|
| `ticketCreated` | `onDocumentCreated("clientissue/{id}")` | Sets `chatstatus = "New"` on the ticket doc (CF:438). Creates `clientissue/{id}/messages` subcollection with first message (type=`chat`) and second message (type=`automated`, from chat config). |
| `ticketCreatedV2` | `onDocumentCreated("clientissue/{id}")` (NOTE: BOTH `ticketCreated` and `ticketCreatedV2` fire on same trigger — potential double-fire. `ticketCreatedV2` also updates `counters/ticketCounter` via transaction and sets `issueno` on ticket and first message) | `clientissue/{id}.issueno` matches `counters/ticketCounter.currentNumber`. A second automated message exists in `messages` subcollection. |
| `ticketMsgNotification` | `onDocumentCreated('/clientissue/{docid}/messages/{messageid}')` | Writes notification record in `notifications/{profileid}/logs` if `sender_uid` is non-null. Asserted by checking notification log exists for assigned profile. |
| `slackCustomerSupport` | `onDocumentWritten("clientissue/{id}")` | Fires on every ticket create/write where status changes or category changes. Sends Slack webhook — **must stub in tests** (Slack is external). |
| `dashboardcustomersupport` | `onDocumentWritten("clientissue/{id}")` | Syncs ticket data to Watson external API (`https://us-central1-watsonproduction-becde.cloudfunctions.net/support_tickets`) and SalesCRM — **must stub both external calls**. |
| `autoCloseTickets` | `onSchedule("0 6 * * *")` — daily cron, IST 6 AM | For `chatstatus == "Responded" AND status.status == "Open"` tickets: after 4+ days sends warning msg (sets `warningMessage: true` on msg); after warning + 24h sends closing msg and sets `status.status = "Closed"`. Assertable: `clientissue/{id}.status.status == "Closed"` and `messages` subcollection has an automated `type:"automated"` message with `warningMessage` flag. |
| `SupportDeskToSlack` | `onDocumentCreated('/supportdesk/{docid}/messages/{messageid}')` | Posts to Slack. Fires on `supportdesk` collection (NOT `clientissue`). Not directly triggered by Customer Support UI flows — **NO ATC overlap, NO test target**. Stub Slack. |

CF candidates noted in the brief but NOT found as active for `clientissue`:
- `onTicketChanged` — fires on `tickets/{ticketId}` (different collection, used in a different product/bug tracking system based on code). Not applicable to `clientissue`.
- `TicketCreatedSlackNotification` — fires on `tickets/{ticketId}` (commented-out / different collection). Not applicable.

---

## External services to stub (call sites file:line)

| Service | Call site | When triggered | Stub required |
|---------|-----------|---------------|---------------|
| **Slack** | `clientissue.js:299` (`slackCustomerSupport` CF, `new IncomingWebhook(url).send(...)`) | Every ticket create/status-change/category-change | YES — intercept outbound Slack HTTP in CF tests OR stub the webhook URL |
| **Slack** | `communication.js:~793` (`SupportDeskToSlack`) | New `supportdesk` message | YES (not directly triggered by these flows) |
| **Watson external API** | `clientissue.js:850–851` (`dashboardcustomersupport` CF — `axios.post(url,...)`) | Every ticket write | YES — intercept `axios` outbound or stub at CF layer |
| **SalesCRM external API** | `clientissue.js:851` (`dashboardcustomersupport` CF — `axios.post(salescrmurl,...)`) | Every ticket write | YES |
| **Firebase Storage** | `add-issue.component.ts:634–639`, `customer-chat-screen.component.ts` file upload | File attachment uploads | YES for upload-path tests; skip by not attaching files |
| **FCM push notifications** | `clientissue.js:177–194` (commented out direct push; now goes via `saveNotificationRecord` → notification service) | New message + assigned profile has `user_ref` | Low risk for e2e (goes through internal Firestore write, no direct FCM call in component) |

No direct Zoom, OpenVidu/LiveKit, Wati/WhatsApp, Razorpay, or Postmark/email calls found in these components.

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role required | Can do | Landing page |
|-------|-------------|--------|-------------|
| **chatxadmin** (Customer Support Agent) | `chatxadmin == true` in `users_roles` | View all tickets / my tickets; open ticket chat; send messages; flag/unflag tickets; update status; update category/assign; mark review; create new tickets; export to Excel | `/customersupportdashboard` |
| **Any authenticated user** | Firebase Auth only (authGuard:44 — `if routeConfigRoles.length == 0 && routeConfigProfiles.length == 0` → shows "contact admin" dialog) | Access blocked by authGuard if route config has roles; route config for support routes lives in `dashboard` Firestore collection | Redirected to `/EISDashboard` on access denial |
| **chatxadmin (validator sub-role)** | Listed in `chat config.validators` array | Mark mandate-review on tickets | Same dashboard; `validators` controls which review field is shown |

Role gate: `auth.guard.ts:44` checks `rolesArray.some(role => routeConfigRoles.includes(role))` against `dashboard` Firestore collection. `chatxadmin` must be `true` on the `users_roles` doc AND must be in the `dashboard` route's `roles` array.

Functional guard for send-message: `customer-chat-screen.component.ts:1101` — `if (SelectedChat['assign'].includes(loggedinprofile_id) || peopleinvolved.includes(loggedinprofile_id))` else `alert('This ticket is not assigned to you')`.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

**Flow 1: Dashboard loads and counts tickets**
1. `chatxadmin` logs in, navigates to `/customersupportdashboard`.
2. Component loads `chat config` (categories, statuses), `users_roles` (chatxadmin users), `profile_data` (profile map).
3. `myCases()` fires: queries `clientissue` where `assign array-contains profile_id` + `peopleinvolved array-contains profile_id` (ts:483–486).
4. Component computes `totaltickets`, `opentickets`, `closetickets`, `newtickets`, `respondedtickets`, `pendingtickets`, `flagtickets`, `reviewpending`, `reviewmarked`, `grosstickets` etc. from the stream (ts:354–460).
5. **No Firestore write** — pure read/aggregate.
6. Anti-circular assertion target: component-computed `opentickets` == Firestore count of `clientissue` docs where `assign array-contains profile_id AND status.status == 'Open'`.

**Flow 2: Create new ticket**
1. Agent clicks "Raise Issue" button → `raiseIssue(null)` opens `AddIssueComponent` dialog (ts:816).
2. Agent fills form (clientid required, category required, issue required, assign required).
3. On submit: transaction reads/updates `counters/ticketCounter` to get `issueNumber` (add-issue ts:505–518).
4. `writeBatch.set('clientissue/{id}', record)` — writes ticket with `chatstatus:"New"`, `status.status:"Open"`, `issueno:N`, `mandatereview:{}`, `review:{}` (add-issue ts:566–608).
5. **CF trigger**: `ticketCreated` fires → sets `chatstatus = "New"` (CF:438) → creates first message (type=`chat`) + second automated message (type=`automated`) in subcollection `clientissue/{id}/messages`.
6. **CF trigger**: `slackCustomerSupport` fires → sends Slack webhook (stub required).
7. **CF trigger**: `dashboardcustomersupport` fires → sends to Watson/SalesCRM (stub required).
8. Assertion target: `clientissue/{id}` exists with correct `issueno`, `status.status == "Open"`, `chatstatus == "New"`. `messages` subcollection has >= 2 docs (first + automated).

**Flow 3: View ticket chat & send message**
1. Agent clicks on a ticket row → `messageIssue()` adds tab to `ticketArray` or navigates to `/customersupportdashboard/ticket/{ticketid}/{issueno}`.
2. `CustomerChatScreenComponent` init: queries `clientissue/{ticketid}` via `docSnapshots` (ts:~350).
3. Agent types message and sends → `sendMessage()` (ts:1100).
4. If agent is in `assign` or `peopleinvolved`: creates `clientissue/{ticketid}/messages/{msgId}` with `pending:['user'], read_by:['admin']`; updates `clientissue/{ticketid}` with `chatstatus:"Responded", last_pending:['user']` (ts:1134).
5. **CF trigger**: `ticketMsgNotification` fires → writes notification to `notifications/{clientid}/logs/{logId}`.
6. Assertion target: new message doc exists in subcollection, parent ticket `chatstatus == "Responded"`.

**Flow 4: Close a ticket**
1. Agent in chat view selects status "Closed" from dropdown → `updateStatus("Closed")` (ts:1040).
2. Writes `clientissue/{ticketid}.status = {status:"Closed", date:now, editedBy:profile_id}` (ts:1063).
3. **CF trigger**: `slackCustomerSupport` detects status change → sends Slack + sends notification to assigned profiles.
4. Assertion target: `clientissue/{ticketid}.status.status == "Closed"`.

**Flow 5: Flag a ticket**
1. Agent clicks flag icon → `updateFlag(ticket)` (dashboard ts:743) → if unflagged: opens flag-severity mat-menu.
2. Agent selects severity → `updateData()` (ts:768) → `updateDoc('clientissue/{id}', {flag:true, flagdata:{severity, flaggedby, time}})` (ts:779).
3. Assertion target: `clientissue/{id}.flag == true AND flagdata.severity == chosen severity`.

**Flow 6: Mark review**
1. In chat screen, agent reviews ticket quality and marks review → `updateDoc('clientissue/{id}', {review: {[profile_id]: timestamp}})` (implicit from review fields used in filter logic).
2. Assertion target: `review` object on ticket doc has profile_id as key.

**Flow 7: autoCloseTickets (scheduled CF)**
1. Ticket is `chatstatus:"Responded"` AND `status.status:"Open"` for 4+ days with no new message.
2. CF writes warning message to `messages` subcollection, sets `last_modification`.
3. After further 24h, CF writes closing message and sets `status.status:"Closed"`.
4. Assertion target: ticket status becomes `"Closed"` and `messages` subcollection has `type:"automated"` doc with `warningMessage:true`.

---

## Seed requirements (exact docs/users/refs to seed)

1. **`chatxadmin` test user** — a Firebase Auth user whose `users_roles` doc has `chatxadmin: true` and `profile_ref` pointing to a `profile_data` doc. Reuse pattern from `e2e/fixtures/seed-test-project.js` `initAdmin()` but with `chatxadmin` role instead of `admin`.

2. **`chat config` doc** — doc ID `0jqtiq3sxtbLVcEGMDhW` must exist in `chat config` collection with:
   - `categories: [{category: "TEST Category", assignto: [<chatxadmin_profileid>], subcategories:[]}]`
   - `status: [{status: "Open"}, {status: "Closed"}]`
   - `validators: []`
   - `negligencecategories: []`
   - `messages: [{message: "Thank you for reaching out"}]`
   - `warningmessages: [{message: "Please respond to avoid auto-close"}]`
   - `closingmessages: [{message: "Ticket auto-closed"}]`

3. **`counters/ticketCounter`** — doc with `currentNumber: 1000` (reset at seed time to get deterministic issue numbers per run).

4. **Seed `clientissue` tickets** — minimum 3 tickets, 2 Open and 1 Closed, all with `assign: [chatxadmin_profileid]`, covering:
   - One ticket in `chatstatus:"New"` state (no messages read yet).
   - One ticket in `chatstatus:"Responded"` state.
   - One ticket with `status.status:"Closed"`.
   - One ticket with `flag:true` and `flagdata`.
   - One ticket with `review:{[chatxadmin_profileid]: <timestamp>}` (reviewed).
   - One ticket with `review:{}` (pending review).

5. **`profile_data` doc** for the test participant (clientid on seeded tickets) with `name`, `email`, `number`, `profileid`.

6. **`dashboard` collection** — route config doc for `/customersupportdashboard` must have `roles: ["chatxadmin"]` (or whatever the live config holds — verify at test time against `authService.routeConfig()`).

7. **testrunid tagging** — all seeded `clientissue` docs should carry a `testrunid` field (pattern from seed-test-project.js) to allow teardown scoping. The `clientissue` collection has NO soft-delete field in the app, so use `testrunid` + delete at teardown.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|----|-------|------|---------------------|----------|
| CS-01 | chatxadmin logs in and lands on /customersupportdashboard (no bounce, no console error) | REAL-UI | App navigates away from /login. URL contains `customersupportdashboard` after valid login — value the AUTH GUARD computed (not the test). | P0 |
| CS-02 | Dashboard Total tickets == Σ(opentickets + closetickets); open count matches Firestore query | REAL-UI | `totaltickets` displayed by app-computed stream == seeded-ticket count the app streamed from Firestore. Oracle: countWhere(`clientissue`, `assign array-contains profile_id`) == `totaltickets` rendered. | P0 |
| CS-03 | Clicking "Open" filter card narrows table to only open-status rows (no closed row visible) | REAL-UI | App re-renders table after filter click. Each visible row has status "Open" as rendered by the app. Assert 0 rows with class `row-closed` after clicking open filter. | P0 |
| CS-04 | Create new ticket via AddIssue dialog: clientissue doc appears in Firestore with correct issueno and status:Open | CF-SIDEEFFECT | Seed `counters/ticketCounter.currentNumber = N`. After UI submit, `clientissue` doc exists with `issueno == N+1` (CF `ticketCreatedV2` wrote it) vs seeded N — app/CF computed value. | P0 |
| CS-05 | ticketCreated CF creates automated second message in subcollection after new ticket created | CF-SIDEEFFECT | Seed ticket doc (precondition write). CF fires → assert `clientissue/{id}/messages` subcollection has a doc with `type:"automated"` and `pending:["user"]` — CF-written value vs seeded ticket. | P0 |
| CS-06 | Open ticket chat screen: messages render in order, unread badge shows correct count | REAL-UI | Seed 2 messages with `pending array-contains "admin"`. App renders unread count. Assert rendered count (app-computed from stream) == 2 (seeded). | P1 |
| CS-07 | Send message as chatxadmin: new message doc appears in subcollection, ticket chatstatus becomes "Responded" | REAL-UI | After UI send, `clientissue/{ticketid}/messages` has new doc with `pending:["user"]`; parent ticket `chatstatus == "Responded"` — both written by the app, asserted against known pre-state. | P0 |
| CS-08 | Send message blocked for non-assigned agent: alert shown, no message written | REAL-UI | Seed ticket with different assign. Log in as chatxadmin not in assign/peopleinvolved. Attempt send. App shows alert (app-computed gate). Assert message count unchanged. | P1 |
| CS-09 | Close ticket: status.status becomes "Closed" in Firestore | REAL-UI | UI updateStatus("Closed") → Firestore write. Assert `clientissue/{id}.status.status == "Closed"` — app wrote it; we assert the app's own write shape (status sub-object) against the seeded prior state `"Open"`. Anti-circular: we don't assert a value we just set — we assert what the APP wrote in the format it chose. | P0 |
| CS-10 | Flag ticket: flag:true and flagdata.severity written correctly | REAL-UI | UI flag action → updateDoc with `flag:true`. Assert Firestore doc has `flag:true AND flagdata.severity == chosen_value` — app-written values vs seeded `flag:false`. | P1 |
| CS-11 | Unflag ticket: flag:false written | REAL-UI | Seed ticket with `flag:true`. UI unflag → updateDoc. Assert `clientissue/{id}.flag == false` — app wrote it. | P1 |
| CS-12 | "My Cases" vs "All Cases" — My Cases shows only tickets where profile is in assign or peopleinvolved | REAL-UI | Seed 2 tickets: one assigned to chatxadmin, one assigned to another profile. Switch to "My Cases". App renders only the assigned ticket (app-computed filter from stream). Assert the non-assigned ticket's issueno is ABSENT from the rendered table. | P1 |
| CS-13 | Export to Excel: downloaded file has header row and at least as many data rows as totaltickets | REAL-UI | After clicking Export button, assert downloaded file has headers + rowCount >= app's `totaltickets` (app-computed from stream). No circular — total was app-computed from stream, rows are the product's export of that stream. | P2 |
| CS-14 | autoCloseTickets CF closes a "Responded" ticket after warning period (oracle test) | ORACLE | Seed ticket with `chatstatus:"Responded", status.status:"Open"` and a last message with `warningMessage:true` timestamped 25h ago. Trigger CF logic (via time-manipulation or direct CF invocation in test project). Assert `clientissue/{id}.status.status == "Closed"` — CF-computed value vs seeded precondition. | P1 |
| CS-15 | ticketMsgNotification CF writes notification log when admin sends message with sender_uid | CF-SIDEEFFECT | Seed ticket + message doc with `sender_uid` non-null and `pending:["admin"]`. CF fires → assert `notifications/{clientid}/logs` has a new doc with `notificationtype:"supportticket"` — CF-written value vs seeded clientid. | P1 |
| CS-16 | Dashboard summary counts do not show NaN or "undefined" for any metric card | REAL-UI | Seed 0 tickets (empty set). Navigate to dashboard. All metric cards (Total, Open, Closed, New, Responded, Pending, Flagged, Review Pending, Reviewed, Gross, High, Moderate) render finite numbers. App-computed from empty stream. | P2 |
| CS-17 | Access denied: non-chatxadmin cannot reach /customersupportdashboard | REAL-UI | Seed user without chatxadmin role. Attempt navigation. Auth guard blocks → app shows "Access denied" dialog or redirects. URL does NOT contain `customersupportdashboard`. App/guard-computed outcome. | P1 |
| CS-18 | Ticket search filter: typing issue text narrows table to matching rows only | REAL-UI | Seed 2 tickets with distinct issue text. Type one in search. App's `formfilter()` narrows `clientIssues`. Assert only matching row is visible (app-computed filter output). | P2 |

---

## ATC exclusions within this group

The Customer Support group does NOT integrate ATC data in its core flows. All ticket data lives in `clientissue` (not ATC collections). No `src/app/ATC/**` components are imported.

No ATC exclusions are required for this group — none of the routes, components, or collections in scope touch `atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `atc assignment`, `big assignment atc_alpha`, `big assignment_*`, `big temporary_ATC`, or `0 atcinvolved issue`.

The `ATC.js` Cloud Function file exists in `starlabs-cloud-function` but is not called by any of these flows.

---

## Risks / unknowns

1. **Dual CF trigger race (`ticketCreated` + `ticketCreatedV2`)**: Both are `onDocumentCreated("clientissue/{id}")`. Both fire on every new ticket. `ticketCreated` sets `chatstatus:"New"` and creates first+second messages. `ticketCreatedV2` also creates a second message AND updates `issueno`. These may race / double-write. CS-05 must account for 2–3 messages in subcollection, not exactly 2. Verify actual message count in cloud test project.

2. **Hardcoded `chat config` doc ID**: `add-issue.component.ts:174` hardcodes doc ID `0jqtiq3sxtbLVcEGMDhW`. If the cloud test project doesn't have this exact doc, ticket creation will silently skip category/assign pre-population. Seed doc must use this exact ID.

3. **`counters/ticketCounter` contention**: The transaction in add-issue and ticketCreatedV2 both increment the same counter. Under parallel test runs this is fine (transactions are atomic), but the counter state persists across runs. Seed should reset the counter at test start.

4. **No `testrunid` on `clientissue`**: The live app never writes a `testrunid` field. Test infrastructure must add it to seeded docs for scoped teardown. The dashboard queries `clientissue` with NO testrunid filter (orderBy reporteddate desc), so seeded tickets appear alongside production-leftover tickets. Use testrunid to identify seed docs; don't assert exact total counts — use ≥ lower bounds.

5. **No `data-testid` attributes anywhere in Customer Support HTML**: Zero `data-testid` attributes found. Selectors must fall back to:
   - Stable CSS class names: `.ticket-button`, `.countFontSize`, `.section-title`, `.button-label`, `.row-open`, `.row-closed`.
   - Angular Material component text: `mat-tab-label`, `mat-option`.
   - Text content: `span.button-label:has-text("Open")`.
   - `formcontrolname` attributes (in filter forms: `search`, `status`, `category`, `journey`, `assign`, `flag`, `chatstatus`, `priority`).
   Do NOT propose editing app source to add testids.

6. **`chatxadmin` role vs route config**: The `authGuard` reads the `dashboard` Firestore collection to determine allowed roles for each route. If the test project's `dashboard` collection doesn't have entries for `/customersupportdashboard`, the guard returns empty roles → shows "contact admin" dialog. Verify route config exists in test project (or seed it).

7. **`slackCustomerSupport` and `dashboardcustomersupport` CFs fire on EVERY write**: Both CFs fire on `onDocumentWritten("clientissue/{id}")` which means EVERY test action that writes a ticket triggers Slack webhook + Watson API calls. These MUST be stubbed at the CF level (route config, HTTP mock, or accept failures in CF logs) or tests will pollute Slack/Watson with test data. The queue suite handles this by stubbing external calls in the Angular layer; here the calls are in CFs, not Angular, so CF-level HTTP mocking is needed.

8. **`SupportDeskToSlack` on `supportdesk` collection**: Not triggered by `clientissue` writes. Irrelevant for this suite.

9. **`autoCloseTickets` is a scheduled function**: Cannot be directly triggered from a Playwright test without either: (a) a test-only HTTPS callable wrapper, or (b) seeding the ticket and directly calling the CF logic via admin SDK. CS-14 is an ORACLE test and should be marked as needing special infra.

10. **`customertickets` route (analytics chart component)**: This component receives `@Input() tickets` — when navigated to directly via `/customertickets` it mounts with no data (no parent to supply tickets). Charts will be empty. The meaningful use case is as an embedded tab inside `/customer-support-tickets`. CS cases should target `/customer-support-tickets` which hosts `CustomerticketsComponent` as a tab.

11. **Review/mandate-review logic is commented out**: Multiple review-related code paths are commented out (dashboard ts:391–396, 540–547). The active review path uses `element['review']` as an object with profile_id keys. Test CS-12/review assertions should use the active path only.
