# Participant Profiles & Analytics — e2e recon

> Group key: `profiles-analytics`
> Routes: `userprofile/:id`, `profilesummary/:profileid`, `participant-form-tracker`, `participants-analytics`, `participant-evolution-summary`, `view-participants-form`, `ProfileScreen`, `app-flow-breaks`
> Source folder: `src/app/Participants Profile Management/`

---

## Routes (path → component file:line, role/guard, ATC? note)

| Path | Component file | Auth guard | Role gate (in-component) | ATC touchpoint? |
|---|---|---|---|---|
| `userprofile/:id` | `userprofile/userprofile.component.ts:60` | `authGuard` (app.routes.ts:27) | `getRoles()` → `fullAccess` if `developer\|admin\|ah` (ts:287-295). No hard redirect for non-admin; `fullAccess` flag hides certain actions only. | Minor: `atccount` / `atcmodel` **display only** from `participant metadata` (seeded by CF, no ATC collection read). No ATC collection read. |
| `profilesummary/:profileid` | `profile-summary/profile-summary.component.ts:54` | `authGuard` (app.routes.ts:26) | `getRoles()` → no hard redirect (guard commented out, ts:126-135). All authenticated users can view. | None in this component. Has link to `participant report/:id/:name` which may be ATC (see exclusions). |
| `participant-form-tracker` | `participant-form-tracker/participant-form-tracker.component.ts:40` | `authGuard` (app.routes.ts:226) | No in-component role check. All authenticated users. | None. Reads `ask AH`, `love letter`, `formsByClient` (forms DB). |
| `participants-analytics` | `participants-analytics/participants-analytics.component.ts:139` | `authGuard` (app.routes.ts:224) | `getRoles()` → `loggedInProfileId` captured (ts:293). No hard redirect. Watson DB init (ts:302). `atcmodel` / `atccount` appear as optional display columns. | `atcmodel` / `atccount` displayed as columns from `participant metadata` (safe — metadata is not an ATC collection). ATC **filter UI fields** present (ts:191, 316). See exclusions. |
| `participant-evolution-summary` | `participants-analytics/participants-evolution-summary/participants-evolution-summary.component.ts:24` | `authGuard` (app.routes.ts:225) | No role check. Reads from `localStorage` key passed via query param (ts:40). | Columns `atcmodel`, `ongoingaelcount`, AEL fields (ts:29-31) — these come from in-memory data the parent passed. AEL data is not an ATC collection. |
| `view-participants-form` | `view-participants-form/view-participants-form.component.ts:58` | `authGuard` (app.routes.ts:103) | `getRoles()` → `loggedInProfileId` captured. No hard redirect. | None. Reads `formsByClient` (forms DB), `delivery forms`, `queue generation`, workshops. |
| `ProfileScreen` | `new-profile/new-profile.component.ts` | `authGuard` (app.routes.ts:22) | `getRoles()` called. | Check below. |
| `app-flow-breaks` | `app-flow-breaks/app-flow-breaks.component.ts:34` | `authGuard` (app.routes.ts:20) | No role check. All authenticated users. | None. Reads `appflowbreaks`. |

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

### Default Firestore DB

| Collection | Access | Purpose |
|---|---|---|
| `profile_data` | read | Profile identity, name, email, phone, address, notes. Loaded on userprofile Journey tab (ts:437), profilesummary (ts:178), participants-analytics full load (ts:442 — via `participant metadata`), view-participants-form (via authguard.getProfileMap). |
| `participant metadata` | read+write | Denormalized dashboard data: `name`, `email`, `customerstatus`, `participantmode`, `activejourney`, `activeproduct`, `consumedproducts`, `atccount`(display only), `atcmodel`(display only), AEL summary fields. **Written by CFs** (see below). userprofile updates `customerstatus` directly (ts:1542). participants-analytics updates `customerstatus`/`remarks` (ts:1382, 1409). |
| `participantjourneyproduct` | read | Journey subscriptions per participant. userprofile Journey tab (ts:439), participants-analytics full load, profilesummary (ts:207). |
| `participantsproduct` | read | Product subscriptions. userprofile Journey tab (ts:440), participants-analytics. |
| `event participation request` | read | Participant event attendance. userprofile Events tab (ts:540). |
| `event collection` | read | Event reference data. userprofile Events tab (ts:578). |
| `queue generation` | read | Queue config for forms/events mapping. userprofile Forms tab (ts:637), view-participants-form (ts:204). |
| `formsByClient` | read | Submitted forms (named DB `firestore-forms`). userprofile Forms tab (ts:646), participant-form-tracker (ts:126), view-participants-form (ts:349). |
| `interim crossover` | read | AEL crossover metric data. userprofile AEL tab (ts:476-501). |
| `clientissue` | read | Customer support tickets. userprofile Customer Tickets tab (ts:624-631), profilesummary (ts:252). |
| `interimreport log` | read | Interim/progress reports. userprofile Interim Reports tab (ts:659). |
| `Achievements/posts/postcollection` | read | Breakthroughs posts. userprofile Breakthroughs tab (ts:686). |
| `evolutionmappingvideo` | read | Recorded evolution videos. userprofile Evolution Mapping tab (ts:718). |
| `liveevolutionmapping` | read | Live evolution mapping. userprofile Evolution Mapping tab (ts:719). |
| `appointments` | read | Appointment history. userprofile Appointments tab (ts:736), profilesummary (ts:216). |
| `participant touchpoint` | read | Engagement touchpoints. userprofile Touch Point tab (ts:773). |
| `participant mode checklist` | read | Mode tracker. userprofile Mode Tracker tab (ts:815). |
| `notifications/{uid}/logs` | read | Push notification log per user. userprofile Notifications tab (ts:824). |
| `post_categories` | read | Post category reference. userprofile (ts:843). |
| `fullfillmentchallenges` | read | Fulfillment issues. profilesummary (ts:238). |
| `appointmenttype` | read | Appointment type names. profilesummary (ts:225). |
| `users_roles` | read | A&H member roles for profilesummary. (ts:309). |
| `delivery forms` | read | Form template names. view-participants-form (ts:216). |
| `eiflix workshop` | read | Workshop list. view-participants-form (ts:225). |
| `workshopconfiguration` | read | Workshop config. view-participants-form (ts:237). |
| `ask AH` | read | Ask A&H form submissions. participant-form-tracker (ts:58, tab 0). |
| `love letter` | read | Love Letter form submissions. participant-form-tracker (ts:58, tab 1). |
| `appflowbreaks` | read | App flow break/error logs. app-flow-breaks (ts:77). |
| `searchquery` | read+write | Saved filter queries (participants-analytics, ts:433, 1291). |
| `email archive` | read+write | Outbound email queue (participants-analytics, ts:387, 1471). |
| `wati archive` | read+write | WhatsApp message queue (participants-analytics, ts:399, 1548). |
| `email validators` | read+write | Email validator list (participants-analytics, ts:1509, 1519). |
| `subscription extend log` | write | Subscription extension audit (participants-analytics, ts:1621). |
| `buffermix archive` | write | Recommended playlist batch buffer (participants-analytics, ts:1446). |
| `filteredtimeline profile` | write | Timeline navigation snapshot (userprofile, ts:970). |
| `deliverables` | read | Deliverable records for queue tab (userprofile, ts:1109). |
| `participantdeliverysequence` | read | Delivery sequence (inferred from imports). |
| `broadcast_analytics` | write | Broadcast audit (participants-analytics, ts:1727). |
| `salesleads` | read | Sales leads for checklist (participants-analytics, ts:2506). |
| `journey` | read | Journey reference data (participants-analytics, ts:438). |
| `modes` | read | Participant modes list (participants-analytics, ts:439). |
| `products` | read | Product reference (participants-analytics, ts:440). |
| `participant tags` | read | Tag definitions (participants-analytics, ts:441). |
| `tier` | read | Tier config reference (participants-analytics, ts:437). |
| `participant tag logs` | read | Tag version history (participants-analytics, ts:2674). |
| `content analytics` | read | Video watch analytics (participants-analytics, ts:2289). |

### Named DB: `firestore-forms`
| Collection | Access | Purpose |
|---|---|---|
| `formsByClient` | read | Submitted participant forms. userprofile forms tab (ts:273), view-participants-form (ts:349), participant-form-tracker (ts:126, tab 2: `uP! Life Report` filtered by `formid == QundpMXgXlXiCJYZ7WU4`). |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Where read | Effect |
|---|---|---|
| `users_roles[uid].admin` / `.ah` / `.developer` | userprofile.ts:287-295 | `fullAccess=true` → additional UI (e.g. customer status editor, certain action buttons visible). |
| `users_roles[uid].participant` | authguard (inherited) | Standard access gate. |
| `users_roles[uid].ahmember` | profilesummary.ts:309 | Populates `ahMember` list for staff indicator display. |
| `environment.firebase.projectId` | participants-analytics.ts:1481,1542 | Selects correct Cloud Function URL for `sendBatchEmail` / `sendWhatsAppBroadcast`. |
| `participant-form-tracker.collectionMap[activeTab]` | participant-form-tracker.ts:58 | Switches between `ask AH`, `love letter`, `formsByClient` based on active tab (0/1/2). |
| `participant-evolution-summary` localStorage key | participants-evolution-summary.ts:40 | Data passed from analytics via `localStorage`; if missing, redirects to `/`. |
| Watson DB app named `"watson"` | participants-analytics.ts:303 | `initializeWatson()` → secondary Firestore for CRM data. Failing silently is acceptable per architecture. |

---

## Cloud Functions involved (name → trigger → side-effect a test can assert)

| CF name | Trigger | Assertion target |
|---|---|---|
| `profiledata_to_participantmetadata` (participantmetadata.js:12) | `onDocumentWritten("profile_data/{id}")` — fires when `name`/`email`/`number`/`participantmode`/`dateofbirth` changes | **Asserts:** `participant metadata/{profileid}.name` == seeded `profile_data.name` within poll window. Also `participant metadata/{profileid}.email`, `.phonenumber`. |
| `createProfile_registeredUser` (user_registration.js:13) | `onDocumentCreated("user_data/{docid}")` — new self-registration | **Asserts:** `profile_data` doc created (query by email), `users_roles` doc created with `participant:true`. |
| `journey_to_pmd` (participantmetadata.js:245) | `onDocumentWritten("participantjourneyproduct/{docid}")` | **Asserts:** `participant metadata/{profileid}.customerstatus` and `.activejourney` reflect the seeded journey status (e.g. seeding `journeystatus:"ongoing"` → metadata `customerstatus:"active"`). |
| `productsdata_to_pmd` (participantmetadata.js:471) | `onDocumentWritten("participantsproduct/{docid}")` | **Asserts:** `participant metadata/{profileid}.activeproduct[]` / `.consumedproducts[]` include the seeded product id when seeded status is `"ongoing"` / `"completed"`. |
| `eventparticipationdata_to_pmd` (participantmetadata.js:669) | `onDocumentWritten("event participation request/{docid}")` | **Asserts:** `participant metadata/{profileid}.productevent[productId][]` includes eventref id when `status` changes to `"attended"`. |

**ATC-related CFs excluded from test scope** (see ATC exclusions):
- `atcdata_to_pmd` (participantmetadata.js:753) — writes to `atc_apha` (ATC collection, off-limits).
- `participantsely_to_pmd` — touches `participants ely` + `atc_alpha` (ATC).
- `participantAELData_to_pmd` — writes from `participant AEL` (borderline; AEL data is not an ATC collection per policy but the CF reads from AEL which contains ATC model references).

---

## External services to stub (call sites file:line)

| Service | Call site | What to stub |
|---|---|---|
| **Postmark/email (CF HTTP)** | participants-analytics.ts:1482-1489 — `http.post(sendBatchEmail URL)` when `result.status=='validated'` | Intercept `https://us-central1-*.cloudfunctions.net/sendBatchEmail` POST. Use `installEmailStub` (already in `e2e/queue/stubs/email.stub.ts`). |
| **Wati/WhatsApp (CF HTTP)** | participants-analytics.ts:1543-1558 — `http.post(sendWhatsAppBroadcast URL)` | Intercept `https://us-central1-*.cloudfunctions.net/sendWhatsAppBroadcast` POST. Use `installWatiStub`. |
| **Firebase Storage** | participants-analytics.ts:1670-1673 — `uploadBytes` for notification images | Stub or omit: the storage upload is only on the notification-image branch; bypass by not setting a notification image in test. |
| **Watson Firestore (secondary app)** | participants-analytics.ts:302-303 — `initializeWatson()` + `getFirestore(getApp("watson"))` | Watson reads are in optional checklists (ts:2516). No stub needed for core test cases — just avoid navigating to Watson checklist. |
| **SalesCRM webhook (inside CF)** | participantmetadata.js:398 — `axios.post(CrmWebhookUrl)` inside `journey_to_pmd` | This runs server-side. The CF swallows webhook errors (catch block ts:403). No browser stub needed; test asserts the Firestore write, not the webhook. |
| **FCM** | `authguard.saveNotificationRecord()` called from participants-analytics.ts:1678. The authguard calls the FCM dispatch function. | Use `installFcmStub(page)` if navigating to notification-send flow. |

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role flags | What they can access |
|---|---|---|
| Admin / A&H staff | `admin:true` or `ah:true` | All profile routes. `fullAccess=true` in userprofile (ts:289) — sees customer-status editor, full action menu in participants-analytics. |
| Developer | `developer:true` | Same as admin for `fullAccess` (ts:289). |
| Participant | `participant:true` | Can access `userprofile/:id` if logged in (no hard redirect — only `fullAccess` flag differs). In practice participants land at their own profile. |
| Any authenticated | n/a | `participants-analytics`, `participant-form-tracker`, `view-participants-form`, `app-flow-breaks`, `ProfileScreen` — no in-component role redirect for these; `authGuard` only checks authentication. |

**Auth guard:** `authGuard` (app.routes.ts) is a function guard that checks Firebase Auth. All routes in this group require authentication. Redirect for unauthenticated → `/login`.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1 — View participant profile (userprofile/:id)
1. Admin logs in → navigates to `/userprofile/<profileId>`.
2. Component reads `profile_data/<profileId>` + `participant metadata/<profileId>` + `participantjourneyproduct` (where profileid==) + `participantsproduct` (where profileid==).
3. Journey tab renders: journey list, product table.
4. **No Firestore write on read-only view** — assertion target: UI renders `profile_data.name` in `.profile-name` and `participant metadata.customerstatus` in `.detail-value` span.

### Flow 2 — Update customer status (userprofile/:id)
1. Admin opens customer-status editor (click `.fas.fa-edit.detail-icon` → edit icon next to Financial Status).
2. Selects status from `#statusSelect` dropdown.
3. Clicks `.btn-save` button "Update Status".
4. **Firestore write:** `updateDoc('participant metadata', profileId, { customerstatus: <value> })` (ts:1542).
5. Anti-circular assertion: read `participant metadata/<profileId>.customerstatus` via admin SDK and verify it matches the selected value — NOT "what the test just set", because the APP computed the field path and wrote it.

### Flow 3 — Profile summary view (profilesummary/:profileid)
1. Admin navigates to `/profilesummary/<profileId>`.
2. Component subscribes to `profile_data/<profileId>` (docData), loads appointments (attended), fulfillment issues, client issues.
3. **No write on initial load**. Assertion: name from `profile_data` appears in the title (`.profile-name` or `<h2>` near the top).

### Flow 4 — Participant Form Tracker (participant-form-tracker)
1. Any authenticated user navigates to `/participant-form-tracker`.
2. Tab 0 = "ask AH" → queries `ask AH` collection (orderBy created desc, limit 100).
3. Tab 2 = "uP! Life Report" → queries `formsByClient` (forms DB) where `formid == QundpMXgXlXiCJYZ7WU4`.
4. Participant search: dropdown populated from `profile_data` (orderBy name).
5. **No write**. Assertion: table row count > 0 when seeded `ask AH` docs exist; filtering by a known participant shows only their rows.

### Flow 5 — Participants Analytics dashboard load (participants-analytics)
1. Admin navigates to `/participants-analytics`.
2. `fetchData()` fires parallel reads: `searchquery`, `event collection`, `queue generation`, `queue_token` (active/approved), `tier`, `journey`, `modes`, `products`, `participant tags`, `participant metadata` (orderBy name).
3. Table populated with participant metadata rows.
4. **No write on load**. Assertion: table rows count == total `participant metadata` docs (server-count via admin SDK, anti-circular).

### Flow 6 — Participants Analytics filter by customerstatus
1. Admin opens Filters panel, selects `customerstatus = "active"`.
2. Angular client-side filter applied to already-loaded `dashboardEntireData`.
3. **No Firestore write**. Anti-circular assertion: visible row count == countWhere('participant metadata', [['customerstatus','==','active']]).

### Flow 7 — View Participants Form (view-participants-form)
1. Admin navigates to `/view-participants-form` (default date range: last 30 days).
2. Component reads `formsByClient` (forms DB, date range query), `queue generation`, `delivery forms`, workshops.
3. Table populated with form submissions.
4. **Write flow — like/flag/opportunity toggle:**
   - Click like icon on a row → `updateDoc(firestoreForms, 'formsByClient', docid, { liked: true, likedetails: {...} })` (ts:792).
   - Anti-circular: read `formsByClient/<docid>.liked` via admin SDK forms DB — verify `true`.
5. **Write flow — add note:**
   - Notes overlay → submit → `updateDoc(firestoreForms, 'formsByClient', docid, { notes: arrayUnion({...}) })` (ts:863).
   - Anti-circular: read `formsByClient/<docid>.notes` array length vs seeded baseline.

### Flow 8 — CF: profile_data write triggers participant metadata sync (profiledata_to_participantmetadata)
1. Test seeds `profile_data/<profileId>` with `name='Test User'`, `email='test@example.com'`.
2. CF `profiledata_to_participantmetadata` fires.
3. Anti-circular assertion: poll `participant metadata/<profileId>.name` until == `'Test User'`.

### Flow 9 — CF: journey status change updates participant metadata (journey_to_pmd)
1. Test seeds `participantjourneyproduct/<docid>` with `profileid=<P>`, `journeystatus='ongoing'`, `subscriptionend` in future.
2. CF `journey_to_pmd` fires.
3. Anti-circular assertion: poll `participant metadata/<P>.customerstatus` until == `'active'`.

### Flow 10 — App Flow Breaks viewer (app-flow-breaks)
1. Admin navigates to `/app-flow-breaks`.
2. Component reads all `appflowbreaks` (orderBy date desc).
3. Displays type chips for filtering, paginated list.
4. **No write**. Assertion: if seeded `appflowbreaks` doc exists, table shows at least one row; type filter chips rendered.

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

1. **Admin actor:** A user with `users_roles.admin:true` (or `ah:true`). Reuse the `admin+<run>@example.com` pattern from `seed-test-project.js` or seed a new `admin+profiles@example.com`.

2. **Participant profile doc:** `profile_data/<P>` with `{ profileid:<P>, name:'Profile Test User', email:'profiles+<run>@example.com', number:'9999000001', participantmode:'Discovery Mode', customerstatus:'active' }`. Corresponding `participant metadata/<P>` seeded (or let CF create it).

3. **Journey product doc:** `participantjourneyproduct/<J>` with `{ profileid:<P>, journeystatus:'ongoing', subscriptionend: <future date>, journeyref: <ref to a journey doc> }`.

4. **Product doc:** `participantsproduct/<PP>` with `{ profileid:<P>, status:'ongoing', productref: <ref>, packageref: <ref>, sequenceorder:1 }`.

5. **Event participation request:** `event participation request/<E>` with `{ profileid:<P>, status:'attended', eventref: <ref to event collection>, productref: <ref> }`.

6. **ask AH doc:** `ask AH/<AH>` with `{ profileid:<P>, created: <timestamp>, askah:'Test question', name:'Profile Test User' }`.

7. **formsByClient doc (forms DB):** `formsByClient/<FBC>` with `{ profileid:<P>, date: <timestamp within last 30d>, formname:'Test Form', queueref: <ref or null>, workshopref: null }`.

8. **appflowbreaks doc:** `appflowbreaks/<AFB>` with `{ profileid:<P>, date: <timestamp>, log:['step1'], note:'test break', type:'navigation' }`.

9. All docs tagged with `testrunid` for teardown.

10. **Reference data** (journey, product, package, event collection docs) can be the stubs already defined in `seed-test-project.js` REF_IDS.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| PA-01 | Profile page renders name and email from Firestore (journey tab default load) | REAL-UI | Navigate to `/userprofile/<P>`; assert `.profile-name` text == seeded `profile_data.name`; assert `.detail-value` for email == seeded email. App read the collection and rendered. | P0 |
| PA-02 | Profile page journey tab lists seeded journey with correct status badge | REAL-UI | Seed 1 `participantjourneyproduct` with `journeystatus:'ongoing'`; navigate to profile; assert `.badge.ongoing` text == "ongoing". App queried collection and rendered badge. | P0 |
| PA-03 | Profile page customer-status editor: admin updates status → Firestore write confirmed | REAL-UI | Click edit icon, select "banned", click "Update Status"; poll `participant metadata/<P>.customerstatus` until == 'banned'. App wrote to Firestore. | P0 |
| PA-04 | CF profiledata_to_participantmetadata: name change in profile_data propagates to participant metadata | CF-SIDEEFFECT | Seed `profile_data/<P>` with name 'OrigName'; update to 'NewName' via admin SDK; poll `participant metadata/<P>.name` until == 'NewName'. CF computed and wrote. | P0 |
| PA-05 | CF journey_to_pmd: seeding ongoing journey sets customerstatus:'active' in participant metadata | CF-SIDEEFFECT | Seed `participantjourneyproduct/<J>` with journeystatus='ongoing', subscriptionend in future; poll `participant metadata/<P>.customerstatus` until == 'active'. CF computed status logic. | P0 |
| PA-06 | CF productsdata_to_pmd: seeding ongoing product adds product to activeproduct[] in participant metadata | CF-SIDEEFFECT | Seed `participantsproduct/<PP>` status='ongoing'; poll `participant metadata/<P>.activeproduct` until includes seeded productref.id. CF computed array. | P1 |
| PA-07 | Participants analytics dashboard loads and table row count matches seeded participant metadata count | REAL-UI | Navigate to `/participants-analytics`; wait for table to render; assert visible row count == countWhere('participant metadata') from admin SDK (both scoped to test run). App queried and built table. | P0 |
| PA-08 | Participants analytics filter by customerstatus 'active' narrows visible rows correctly | REAL-UI | Seed 2 participants with customerstatus='active', 1 with 'non active'; apply filter; assert visible rows == 2. App's client-side filter against loaded data computed the count. | P1 |
| PA-09 | Participants analytics name column links to profilesummary | REAL-UI | Navigate analytics; click name cell link for seeded participant; assert URL changes to `/profilesummary/<P>` and profile name heading visible. App rendered routerLink correctly. | P1 |
| PA-10 | Profile summary page renders profile name and active journey from seeded participant metadata | REAL-UI | Navigate to `/profilesummary/<P>`; assert heading contains seeded name; assert journey/product fields from `participant metadata` visible. App read both collections. | P0 |
| PA-11 | Participant form tracker — ask AH tab shows seeded ask AH submission | REAL-UI | Navigate to `/participant-form-tracker`; assert table shows row with seeded `ask AH.name`; row count > 0. App queried the collection and rendered. | P1 |
| PA-12 | Participant form tracker — uP! Life Report tab (tab index 2) queries formsByClient with formid filter | REAL-UI | Seed 1 `formsByClient` doc with `formid=='QundpMXgXlXiCJYZ7WU4'` and 1 without; click tab "uP! Life Report"; assert only 1 row visible. App applied the where clause (ts:144). | P1 |
| PA-13 | View participants form — seeded formsByClient row appears in table (within last-30d date range) | REAL-UI | Navigate to `/view-participants-form`; wait for table; assert seeded row's formname visible in table. App queried `formsByClient` (forms DB) with date filter. | P1 |
| PA-14 | View participants form — like toggle writes liked:true to formsByClient (forms DB) | REAL-UI | Click like button on seeded row; poll `formsByClient/<FBC>.liked` (forms DB admin SDK handle) until == true. App called updateDoc on forms DB. | P1 |
| PA-15 | App flow breaks — seeded appflowbreaks doc appears in viewer | REAL-UI | Navigate to `/app-flow-breaks`; assert at least 1 row rendered and type chip for 'navigation' present. App queried the collection. | P2 |
| PA-16 | CF createProfile_registeredUser — new user_data doc triggers profile_data + users_roles creation | CF-SIDEEFFECT | Seed `user_data/<UID>` with {name, email, number}; poll `profile_data` (query by email) until count==1; assert `users_roles` doc has `participant:true`. CF wrote both. | P1 |
| PA-17 | ORACLE: participant metadata count for test run == seeded profile count | ORACLE | countWhere('participant metadata', [['testrunid','==',TESTRUNID]]) == number of seeded profiles. Validates CF propagation integrity. | P1 |
| PA-18 | Participants analytics selected count badge updates when row checkbox toggled | REAL-UI | Click checkbox on 2 rows; assert "Selected Participants - 2" visible (HTML:644 `{{selection.selected.length}}`). App computed selection.selected.length. | P2 |

---

## ATC exclusions within this group

1. **`atccount` and `atcmodel` columns in participants-analytics** — these are display-only fields from `participant metadata` (not from any ATC collection). Tests asserting row count or participant name are safe. Tests MUST NOT filter by `atccount` / `atcmodel` or seed ATC data. Excluded from test scope: the filter panel `atccount` input (HTML:316) and `atcmodel` select (HTML:286).

2. **`participant report/:id/:name` link in profilesummary** — `onNavigateATC()` (profilesummary.ts:167-170) navigates to `participant report/<id>/<name>`. This route is ATC-focused. EXCLUDED from all test cases; never click this link.

3. **`atcdata_to_pmd` CF** — triggers on `atc_apha/{docid}` (ATC collection). Off-limits. Do not seed or assert.

4. **`participantsely_to_pmd` CF** — reads `participants ely` + `atc_alpha`. Off-limits.

5. **AEL (`interim crossover`, `participant AEL`) in userprofile** — the AEL tab reads `interim crossover` which contains `aelid`/`atcmodel` references but `interim crossover` is NOT itself an ATC collection. However, the `participants-evolution-summary` displays `atcmodel`, `ongoingaelcount`, etc. derived from AEL. These columns ARE from AEL (not ATC). However AEL data tightly depends on ATC model structure — treat as borderline. **Policy:** design no test cases that assert AEL-specific column values; the evolution summary page (PA route `participant-evolution-summary`) is excluded from the test suite because it exclusively displays AEL/ATC model rollup data (see columns: `atcmodel`, `ongoingaellist`, `totaladjustmentaware`, etc. — ts:30-31).

6. **`bigAggregateLevelUpdate_to_pmd` CF** — triggers on `/big aggregate level/{docid}` and contains `atcmodel` key references. Off-limits as it reads BIG ATC model data.

---

## Risks / unknowns

1. **No data-testid on any element in this group.** All selectors must use class names (`.profile-name`, `.nav-tab`, `.btn-save`, `#statusSelect`) or Material component roles. Any CSS refactor will break tests. Flag to app team to add data-testid attributes.

2. **`participant metadata` doc keyed by `profileid` string (not Auth UID).** The seed must store `profileid` as the Firestore doc id AND as the `profileid` field. Double-check with `seed-test-project.js` pattern.

3. **Lazy tab loading in userprofile** — each tab only loads when first clicked (ts:346). Tests clicking the Appointments, Events, etc. tabs must wait for data to appear, not just the tab to render.

4. **Forms DB (`firestore-forms`) requires a separate Admin SDK handle** in the test helper. The existing `firestore-admin.ts` helper uses `sim.db()` which points to the default DB. A separate handle is needed for `formsByClient` assertions: `admin.app().firestore({databaseId:'firestore-forms'})`. Confirm the cloud test project (`slabs-queue-e2e-exdcz`) has `firestore-forms` provisioned.

5. **Watson DB (`getApp("watson")`)** — participants-analytics initialises Watson in `ngOnInit()` (ts:302). If the test project lacks Watson credentials, `initializeWatson()` will throw silently (or surface a console error). Install `console-guard` and tolerate `"watson"` init failures; do not assert Watson-backed checklists.

6. **`participant-evolution-summary` receives data via localStorage** (ts:40). The route is only reachable by navigating from the Analytics "Participant Evolution Summary" menu button. Direct navigation without the localStorage key redirects to `/`. No standalone test case planned; if tested, seed localStorage before navigation.

7. **`view-participants-form` defaults to last-30-days date range** (ts:165-167). Seeded `formsByClient` docs must have `date` within this window. Use `Timestamp.now()` for the seed.

8. **`profiledata_to_participantmetadata` CF is idempotent only on field changes** (ts:24-35: change guard checks each relevant field). Seeding the same value twice will NOT retrigger. Ensure seed values are unique per test run (incorporate `TESTRUNID` in name).

9. **`journey_to_pmd` CF calls external webhooks** (SalesCRM, Watson) which may fail in test environment. CF catches and logs errors but does not abort. The `participant metadata` write still proceeds. Tests asserting metadata updates will pass; webhook failures are acceptable.

10. **`createProfile_registeredUser` CF has a 540-second timeout.** The test must poll with a generous `timeoutMs` (30s+). This CF also checks for existing `profile_data` by email (ts:21) — ensure unique test emails per run.

11. **`app-flow-breaks` has no role gate.** Any authenticated user sees all breaks — including from other test runs. Add `testrunid` tag to seeded `appflowbreaks` docs and assert filtered rows, not total count.

12. **`participants-analytics` full load is expensive** — it reads all `participant metadata` (ordered by name), all `queue_token` (active), all products, etc. In the cloud test project with real data, this will time out unless the test-run specific participant metadata count is low. Design assertions around test-run-tagged rows only, not global counts.
