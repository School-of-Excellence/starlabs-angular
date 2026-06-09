# Workshops — e2e recon

> Concept group: New-Workshop (create-workshop, workshopconfig/:id, workshop_dashboard/:id,
> workshops, formtemplateworkshop, productpageworkshop, engagementdashboard,
> bigengagementdashboard, bigeventmentor) + legacy Workshop (createworkshop / eiflix-workshop,
> workshopchallengecreation, enrollment_config_view, workshopchallengeparticipantdashboard,
> workshop_image_upload)
>
> Date: 2026-06-10. Evidence base: source read + CF read; no cloud Firestore queries executed.

---

## Routes

| Route path | Component file (relative to src/app/) | Guard | ATC note |
|---|---|---|---|
| `/workshops` | New-Workshop/workshops/workshops.component.ts | `authGuard` (dashboard RBAC via `routeConfig`) | No ATC data; reads `workshopconfiguration` only |
| `/create-workshop` | New-Workshop/create-workshop/create-workshop.component.ts | **No guard** (app.routes.ts:260 — `canActivate` absent) | None |
| `/workshopconfig/:id` | New-Workshop/workshop-configuration/workshop-configuration.component.ts | **No guard** (app.routes.ts:261) | Reads `atc taxonomy` (reference/config-only list for taxonomy picker — SAFE, config-ref per CLAUDE.md). Also reads `arenavideoask`, `participantvideoask` which are content config. |
| `/workshop_dashboard/:id` | New-Workshop/workshop-dashboard/workshop-dashboard.component.ts | `authGuard` | No ATC. Uses named DB `firestore-forms` for form previews (ts:188) |
| `/formtemplateworkshop` | New-Workshop/form-assignment/form-assignment.component.ts | `authGuard` | No ATC. Uses `firestore-forms` named DB (ts:118) |
| `/productpageworkshop` | New-Workshop/product-page/product-page.component.ts | `authGuard` | None |
| `/engagementdashboard` | New-Workshop/engagement-dashboard/engagement-dashboard.component.ts | `authGuard` | No ATC. Cross-feature aggregator: reads `content analytics`, `event collection`, `queue generation`, `workshopconfiguration`, `appointments`, etc. |
| `/bigengagementdashboard` | New-Workshop/capacity-dashboard/capacity-dashboard.component.ts | `authGuard` | Reads `big aggregate level`, `atcmodel level config` (reference-only config, SAFE), `biglevel`, `bigactivity`, `journey`, `participant metadata` — all B!G program data, NOT ATC collections |
| `/bigeventmentor` | New-Workshop/bigeventmentor/bigeventmentor.component.ts | `authGuard` | None; reads `event collection where atcmodel=='B!G'`, `journey where atcmodel=='B!G'` — B!G-keyed but not ATC collections |
| `/createworkshop` (legacy) | Workshop/eiflix-workshop/view-workshop/view-workshop.component.ts | `authGuard` | None. Legacy eiflix workshop viewer |
| `/workshopchallengecreation` | Workshop/challenge-view/challenge-view.component.ts | `authGuard` | None. Reads `eiflix workshop challenges` |
| `/enrollment_config_view` | Workshop/enrollment-config-view/enrollment-config-view.component.ts | `authGuard` | None. Reads `eiflix enrolment` |
| `/workshopchallengeparticipantdashboard` | Workshop/participant-enrollment-dashboard/participant-enrollment-dashboard.component.ts | `authGuard` | None. Reads `eiflix workshop`, `eiflix workshop challenges`, `eiflix participant workshop`, `eiflix participant enrolled` |
| `/workshop_image_upload` | Workshop/workshop-image-upload/workshop-image-upload.component.ts | `authGuard` | Reads `atc taxonomy` (reference/config-only — SAFE); reads/writes `workshop images` |

**authGuard mechanics** (auth.guard.ts:10-91): checks Firebase auth, then reads the `dashboard` collection to find `roles[]` and `profileid[]` for the route. Access = any role in the user's `users_roles` matches `roles[]`, OR user's profileid is in `profileid[]`. Role is stored in Firestore `users_roles` collection (not a JWT claim). The guard bounces to `/EISDashboard` on denial (no hard redirect to `/login` for role failures).

**Unguarded routes** (notable): `/create-workshop` and `/workshopconfig/:id` lack `canActivate`. Any authenticated (or even unauthenticated) user can navigate directly — no role check. The workshop-configuration component calls `this.guard.getProfileMap()` and `getRoles()` in the constructor for profile-name resolution, but this is not a gate.

---

## Firestore collections

| Collection name | Read/Write | Purpose | Named DB |
|---|---|---|---|
| `workshopconfiguration` | Read + Write | Core workshop config doc (detailpage, challenges[], settings flags, triggerFunction gate) | default |
| `workshop participant enrolled` | Read + Write | Enrollment record per participant×workshop (profileid, workshopref, status, participantworkshopref) | default |
| `participant workshop` | Read + Write | Per-participant progress snapshot (challenges[], workshopref, profileid) | default |
| `workshopcategory` | Read + Write | Workshop-specific categories (scoped by workshopid) | default |
| `new_user_data` | Read | Workshop-only user profile data | default |
| `participant metadata` | Read | Participant profile lookup (name, email, phonenumber, customerstatus, journeyid) | default |
| `journey` | Read | Journey catalog for filter dropdowns | default |
| `tier` | Read | Tier catalog for filter dropdowns | default |
| `big cohorts` | Read | Cohort records (used in workshopconfig settings) | default |
| `supportchat` | Read | Chat groups (type='group') for workshop chat assignment | default |
| `delivery forms` | Read | Form templates (formfor='workshop') for challenge config | default |
| `arenavideoask` | Read | VideoAsk templates for challenge config | default |
| `participantvideoask` | Read | Participant VideoAsk testimonial responses | default |
| `quiz` | Read | Quiz templates for challenge config | default |
| `episodes` | Read | eiflix video episodes for challenge content refs | default |
| `solar voice audios` | Read | SolarVoice audio for challenge content refs | default |
| `workshop images` | Read + Write | Icons/thumbnails for workshop/challenge image picker; upload via workshop_image_upload | default |
| `static meta data` (doc: `Subscriber Code`) | Read + Write | Referral/subscriber codes managed from workshops list | default |
| `workshopQA` | Read + Write | Q&A entries for workshop (from questionandanswer dialog in workshop_dashboard) | default |
| `engagement_snapshots` | Read + Write | Monthly engagement snapshot archives written by engagement-dashboard | default |
| `content analytics` | Read | Content engagement backbone (read-only in web, see CONTENT-ENGAGEMENT.md §4) | default |
| `event collection` | Read | Events (engagement-dashboard cross-feature read) | default |
| `queue generation` | Read | Queue data (engagement-dashboard cross-feature read) | default |
| `appointments` | Read | Appointment log (engagement-dashboard) | default |
| `appointmenttype` | Read | Appointment type catalog | default |
| `event participation request` | Read | Event participation for engagement bucketing | default |
| `queue_token` | Read | Queue token for engagement bucketing | default |
| `queue stage log` | Read | Queue stage log for engagement bucketing | default |
| `wati archive` | Write | WATI message archive written by workshopconfig WATI send (workshop-configuration.component.ts:2538) | default |
| `bigeventmentor` | Read + Write | B!G event mentor data (bigeventmentor route) | default |
| `bigeventparticipantsplan` | Read | B!G event participant plan | default |
| `big aggregate level` | Read | B!G aggregate capacity data (bigengagementdashboard) | default |
| `biglevel` | Read | B!G level definitions | default |
| `bigactivity` | Read | B!G activity catalog | default |
| `profile_data` | Read | Legacy participant profile lookup | default |
| `eiflix workshop` | Read | Legacy eiflix workshop catalog | default |
| `eiflix workshop challenges` | Read + Write | Legacy eiflix challenge catalog | default |
| `eiflix enrolment` | Read + Write | Legacy eiflix enrollment config | default |
| `eiflix participant workshop` | Read | Legacy eiflix participant–workshop mapping | default |
| `eiflix participant enrolled` | Read | Legacy eiflix enrollment rows | default |
| `eiflixbanner` | Read + Write | eiflix banner management (eiflix-banner dialog from workshops list) | default |
| `series` | Read | eiflix series catalog | default |
| `atc taxonomy` | Read (config-ref only) | ATC taxonomy picker list in workshopconfig detailpage and workshop_image_upload — display/selection only, NOT an ATC write | default |
| `temporary_forms` | Read + Write | Draft form data for formtemplateworkshop | firestore-forms (named) |
| `delivery forms` | Read + Write | Delivery form definitions created by formtemplateworkshop | default |
| `formsByClient` | Read | Submitted form responses read back in workshop_dashboard form review | firestore-forms (named) |

---

## Config drivers

| Flag / field | Where read in code | Effect |
|---|---|---|
| `workshopconfiguration.active` | workshops.component.ts:95 (filter) | Controls `active` status filter on the workshops list |
| `workshopconfiguration.workshopcompleted` | workshops.component.ts:99 (filter) | Controls `completed` filter on list |
| `workshopconfiguration.triggerFunction` | workshop.js CF:274 | Gate: the `workshopconfiguration` CF only runs if `triggerFunction === true` on the updated doc |
| `workshopconfiguration.categorybased` | workshop-dashboard.component.ts:394,641 | Switches dashboard to "CP Workshop" mode with per-category enrollment tables |
| `workshopconfiguration.evergreenWorkshop` | workshop-configuration.component.ts:690 | Enables/disables evergreen (rolling) workshop mode; unlocks workshopDays + dailyCommunication fields |
| `workshopconfiguration.facilitator` | (settings form boolean) | Enables facilitator-role participant enrollment path |
| `workshopconfiguration.enrollwattimessage` | workshop.js CF:521 | WhatsApp template message text sent on enrollment via `workshopenrolledwatti` CF |
| `workshopconfiguration.mailTemplate` | workshop.js CF:523 | Email subject/description/liveCallText sent on enrollment via `workshopenrolledwatti` CF |
| `workshopconfiguration.categoriesforthisworkshop` | workshop-configuration.component.ts:790 (workshopcategory query), workshop-dashboard.component.ts:1082 (category names) | Links workshop categories for CP-workshop category-based enrollment |
| `dashboard` collection | auth.guard.ts:44 (routeConfig) | Per-route roles[] and profileid[] — the source of truth for all authGuard access decisions |
| `static meta data / Subscriber Code` | workshop-dashboard.component.ts:414 (loadSubscriberCodes) | Subscriber/referral codes shown in dashboard comms filters |

---

## Cloud Functions involved

| CF name | Trigger | Side-effect a test can assert |
|---|---|---|
| `workshopconfiguration` (workshop.js:262) | `onDocumentUpdated` `/workshopconfiguration/{docid}` where `triggerFunction === true` | Merges workshop `challenges[]` changes into all enrolled `participant workshop` docs (set-merge). Assert: after setting `triggerFunction=true` + updating `challenges`, query `participant workshop where workshopref==ref` — all docs have the new challenge structure. Also updates scalar fields (non-challenges keys). |
| `workshopenrolledwatti` (workshop.js:465) | `onDocumentCreated` `workshop participant enrolled/{docid}` | Sends Wati WhatsApp + Postmark email + Slack notification on new enrollment. No Firestore write to assert (it is a comms-only CF). Must stub Wati/Postmark in tests. |
| `workshopprogressmessage` (communication.js:4231) | HTTP `onRequest` POST (called by workshop-dashboard.component.ts:510,562) | Sends bulk email (Postmark) or bulk WhatsApp (Wati). Returns `{ successCount, failureCount }`. In tests: stub HTTP and assert the request shape / successCount response rendered in the UI snackbar. |
| `workshopautocommunicationschedule` (workshop.js:634) | Scheduled (daily `00 15 * * *` IST) | Auto-communication for evergreen workshops. Not directly exercisable in e2e (schedule-triggered); skip. |
| ~~`generalContentUpdate`~~ (content.js:313) | `onDocumentWritten /content_urls/{id}` | **Not relevant to this group** — this CF handles content URLs, not workshop data. The task prompt candidate appears to be a false positive; the Workshop group does not write `content_urls`. |

---

## External services to stub

| Service | Call site | Stub needed |
|---|---|---|
| **Wati / WhatsApp** | workshop-dashboard.component.ts:562 (`http.post workshopprogressmessage`), workshop.js CF:465 (`workshopenrolledwatti`), workshop-configuration.component.ts:2538 (writes `wati archive`) | Stub HTTP POSTs to `*.cloudfunctions.net/workshopprogressmessage`. The CF itself calls Wati API — stub only needed on the Angular HTTP boundary. |
| **Postmark / email** | workshop-dashboard.component.ts:513 (`http.post workshopprogressmessage` with `type:'mail'`), communication.js:4263 (Postmark `sendEmailWithTemplate`) | Same HTTP stub as above (Postmark is called inside the CF, not directly from Angular). |
| **FCM (push notifications)** | workshop-dashboard.component.ts:591-634 (`sendNotificationinBreakthrough` → `guard.saveNotificationRecord`) | `saveNotificationRecord` writes to Firestore (notification record) and triggers an FCM send. Stub FCM token resolution or skip this flow in core tests. |
| **Zoom** | workshop-dashboard.component.ts:1444 (`openZoomDialog` → ZoomCallComponent, `zoomlink` field), workshop-configuration challenges `zoomlinkchallenge` field | Zoom links are plain URL strings stored in Firestore; no SDK call in this Angular layer — no stub needed for workshop tests (no `window.open` to a Zoom SDK). However if `ZoomCallComponent` calls an external SDK, stub it. |
| **Firebase Storage** | workshop-configuration.component.ts:1423 (`uploadBytes`/`getDownloadURL` for thumbnail/video), workshop-image-upload.component.ts (`uploadBytes`) | Tests that drive image upload paths must stub `uploadBytes`/`getDownloadURL` or use small test blobs against the test project's Storage. |

---

## Actors / roles

The authGuard reads the `dashboard` collection for per-route `roles[]` via `routeConfig()`. The exact role lists are stored in Firestore, not in app source, so precise roles per route are not hard-coded here. Based on the CLAUDE.md and existing queue-suite conventions:

| Actor | Likely roles (from queue suite conventions / authguard service) | Relevant workshop routes |
|---|---|---|
| Admin / Operator | `admin` (passes most authGuard checks) | All guarded routes |
| Event Coordinator | `eventcoordinator` | `/workshops`, `/workshop_dashboard/:id`, `/bigengagementdashboard` likely |
| Coach / Change Agent | `changeagent` | `/engagementdashboard`, `/bigeventmentor` possibly |
| Participant | (usually no admin roles — cannot access guarded operator routes) | Cannot access any workshop admin routes |

**Unguarded routes** (`/create-workshop`, `/workshopconfig/:id`): accessible to any authenticated Firebase user without role check.

---

## Key user flows

**Flow 1 — Create a workshop (admin)**
1. Admin navigates to `/create-workshop`.
2. Fills form: type (workshop/challenge), title, registrationStart/End, workshopStart/End (date+time).
3. Submits → `createWorkshop()` → `setDoc(workshopconfiguration/<newId>, { detailpage:{...}, created:Timestamp.now(), docid })`.
4. Router navigates to `/workshopconfig/<docid>`.
- **Firestore write**: one new `workshopconfiguration` doc with `detailpage.title`, `detailpage.type`, `created`, `docid` set.

**Flow 2 — Workshop list renders and filters (admin)**
1. Admin navigates to `/workshops`.
2. Component reads `collectionData('workshopconfiguration')` stream (workshops.component.ts:58-59).
3. `applyAllFilters()` filters by `statusFilter` ('active'/'inactive'/'completed') and sorts.
4. The mat-table renders rows; slide-toggle shows `active` state.
- **No Firestore write** on list render; app computes the filtered table from its live stream.

**Flow 3 — Activate/deactivate a workshop (admin)**
1. Admin on `/workshops` toggles the `active` slide-toggle for a row.
2. `onWorkshopStatusChange()` shows a `window.confirm` dialog.
3. On confirm: `updateDoc(workshopconfiguration/<docid>, { active: isActive })`.
- **Firestore write**: `workshopconfiguration/<docid>.active` flips to boolean.

**Flow 4 — Workshop configuration (admin)**
1. Admin navigates to `/workshopconfig/:id`.
2. Component subscribes to `docSnapshots('workshopconfiguration/:id')` and patches three forms: detailPageForm, challengesPageForm, settingsForm.
3. Admin edits `detailpage` fields (title, dates, description, learnings, etc.) → `saveDetailPage()` → `updateDoc(workshopconfiguration/<id>, { detailpage: detailPageData })`.
4. Admin edits challenges → `saveChallenges()` → `updateDoc(workshopconfiguration/<id>, { challenges: challengesData })`.
5. Admin edits settings → `saveSettings()` → `updateDoc(workshopconfiguration/<id>, { ...settingsFields })`.
6. Admin sets `triggerFunction=true` in settings → CF `workshopconfiguration` fires and propagates challenge changes to all enrolled `participant workshop` docs.
- **Firestore writes**: `workshopconfiguration/<id>.detailpage`, `.challenges`, `.settingsFlags`, `.triggerFunction`.

**Flow 5 — Enroll participants in a workshop (admin from dashboard)**
1. Admin opens `/workshop_dashboard/:id` → `openEnrollDialog()` → EnrollComponent dialog.
2. Selects profiles from dropdown → `Enroll()`.
3. For each profileid: `setDoc(workshop participant enrolled/<newId>, { profileid, status:'enrollednotstarted', workshopref, enrollmentdate, participantworkshopref })` and `setDoc(participant workshop/<newId>, { profileid, workshopref, challenges:workshopData.challenges, created, ... })`.
4. `workshopenrolledwatti` CF fires on the new `workshop participant enrolled` doc → sends Wati WhatsApp + email (stubs needed).
- **Firestore writes**: one `workshop participant enrolled` doc + one `participant workshop` doc per enrolled profile.
- **CF side-effect**: `workshopenrolledwatti` fires for each new `workshop participant enrolled` doc.

**Flow 6 — Workshop dashboard: participant progress table (admin)**
1. Admin on `/workshop_dashboard/:id`.
2. Component subscribes to `onSnapshot(workshopconfiguration/:id)` and then `onSnapshot(workshop participant enrolled where workshopref==ref)`.
3. Loads all `participant workshop where workshopref==ref` via `getDocs`.
4. `calculateParticipantProgress()` computes `completedChallenges`, `totalChallenges`, `progressPercentage` from the `challenges[]` on each `participant workshop` doc.
5. Dashboard renders the mat-table with per-participant progress (progress bar, current challenge, status).
- **No write** on render; app computes progress from its live stream.
- **Anti-circular assertion**: `completedChallenges` count matches manually-countable completed sub-challenges in the `participant workshop` doc the app read; `progressPercentage` = completedChallenges / totalChallenges * 100.

**Flow 7 — Admin manually moves participant to next challenge (dashboard)**
1. Admin clicks "Move Next" for a participant on `/workshop_dashboard/:id` (restricted to specific profileids, ts:1688).
2. `moveParticipantToNext()` updates the in-memory challenges, marks sub-challenge `status:'completed'`, `manualcompletion:true`.
3. `updateDoc(participantworkshopref, { challenges })`.
- **Firestore write**: `participant workshop/<id>.challenges[i].challenges[j].status = 'completed'`, `.manualcompletion=true`, `.completed=Timestamp`.

**Flow 8 — Propagate workshop challenge changes via triggerFunction CF**
1. Admin saves updated `challenges` in workshopconfig and sets `triggerFunction=true`.
2. `workshopconfiguration` CF fires (only when `triggerFunction===true`).
3. CF reads all `participant workshop where workshopref==ref`, merges new challenge structure (new challengeid added → new sub-challenge appended), preserves participant progress on existing challengeids.
4. CF `set(merge:true)` updates each `participant workshop` doc.
- **Firestore write (CF)**: every enrolled `participant workshop` doc gets the merged challenge array.

**Flow 9 — Engagement dashboard snapshot (admin)**
1. Admin clicks "Save snapshot" on `/engagementdashboard`.
2. `addDoc(engagement_snapshots, { type: '<monthKey>_active', ... })` or `_inactive`.
- **Firestore write**: one new `engagement_snapshots` doc.

---

## Seed requirements

| What to seed | How | Notes |
|---|---|---|
| One `workshopconfiguration` doc (active=false, workshopcompleted=false) | `setDoc` direct — use a test-run-namespaced `docid` | All workshop tests pivot on this doc's docid |
| One `workshopconfiguration` doc (active=true) | Same approach | For active-filter tests |
| 2–3 `participant metadata` docs (with `name`, `email`, `phonenumber`) | Re-use or extend `seed-test-project.js` participant seed | Enrollment flow needs real profileids |
| One `workshop participant enrolled` doc (status='enrolled') + corresponding `participant workshop` doc with N challenges (2+ sub-challenges, 1 completed) | `setDoc` direct | Dashboard progress-table tests |
| One `workshop participant enrolled` doc (status='enrollednotstarted') | `setDoc` direct | Metrics: notStarted bucket |
| One `workshopcategory` doc (workshopid = seeded workshop id) | `setDoc` | CP-workshop category tests |
| `dashboard` collection entry for workshop routes with roles=['admin'] | Pre-existing in test project or seed a minimal route entry | authGuard route config |

Re-use the existing `seed-test-project.js` pattern: export deterministic IDs via `workshopGenDocId(TESTRUNID)`, clean up in `teardown()` scoped by `testrunid` field.

**Named-DB caution**: `workshop_dashboard` and `formtemplateworkshop` use `getFirestore('firestore-forms')` for form-related reads. The cloud test project must have this named database enabled, or form-preview paths must be skipped/stubbed.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| WS-01 | Authenticated admin lands on /workshops without bounce and the seeded workshop appears in the table | REAL-UI | App renders `workshopconfiguration` stream; assert table row count >= seeded count (Firestore countWhere) vs board-rendered row count; never assert the row the test just wrote | P0 |
| WS-02 | Create-workshop form submits and navigates to /workshopconfig/:id; Firestore has the new doc | REAL-UI | UI writes `workshopconfiguration`; assert app navigated (URL contains new docid); THEN read Firestore for the doc and assert `detailpage.title` matches what was typed. Anti-circular: the title asserted is from what Firestore received, compared to the KNOWN input — app output vs known seed input | P0 |
| WS-03 | Workshops list status-filter ('active') shows only active workshops; total visible rows <= Firestore count of active workshops | REAL-UI | App computes filtered rows from its stream; Firestore countWhere(workshopconfiguration, active==true) is the known reference; assert visibleRows <= firestoreActiveCount (the app may show stale data, only lower-bound matters) | P1 |
| WS-04 | Toggling a workshop from inactive to active writes active=true to Firestore (not just optimistic UI) | REAL-UI | App calls updateDoc; poll Firestore for doc.active===true after toggle; the polled value is what the APP wrote, not what the test wrote | P0 |
| WS-05 | Workshop-config detail-page save writes detailpage.title to Firestore (app output vs known input) | REAL-UI | Admin fills title field in workshopconfig, saves; poll getDoc(workshopconfiguration, id).detailpage.title === knownInput. Seeded doc provides the pre-existing state; typed title is the known input; Firestore read is the app-written output | P0 |
| WS-06 | Workshop-config challenge save writes challenges[] to Firestore; count(challenges) matches UI count | REAL-UI | Admin adds one challenge via UI; on save, count(getDoc.challenges) increases by 1 vs before-save count (app output vs before-state); UI challenge count must match the Firestore array length | P1 |
| WS-07 | Workshop dashboard renders enrolled participant count matching workshop participant enrolled collection | REAL-UI | App stream reads `workshop participant enrolled where workshopref==ref`; assert dashboard totalEnrolled metric (app-computed) == Firestore countWhere(workshop participant enrolled, workshopref==seededRef, status in ['enrolled','enrollednotstarted']). Both sides computed independently | P0 |
| WS-08 | Enrolling a participant creates one workshop-participant-enrolled doc and one participant-workshop doc (CF-SIDEEFFECT: workshopenrolledwatti fires) | REAL-UI + CF-SIDEEFFECT | Known precondition: N enrolled before. After Enroll dialog submit: Firestore count(workshop participant enrolled where workshopref==ref) == N+1; count(participant workshop where workshopref==ref) == N+1. Anti-circular: counts are post-state from Firestore, not asserted against the value the test wrote | P0 |
| WS-09 | workshopenrolledwatti CF fires on enrollment doc creation: no real Wati call escapes (stub + verify no stub violation) | CF-SIDEEFFECT | Stub Wati HTTP. Create `workshop participant enrolled` doc with a workshopref pointing to a seeded workshop. Assert no real HTTP to Wati domain escapes the test (stub call count stays 0 on the actual external endpoint). This is a negative-safety assertion | P1 |
| WS-10 | workshopconfiguration CF propagates challenge changes to enrolled participant-workshop docs when triggerFunction=true | CF-SIDEEFFECT | Precondition: K enrolled `participant workshop` docs. Admin saves challenges with new challengeid (adds one challenge), sets `triggerFunction=true`. Poll all `participant workshop where workshopref==ref`: every doc's challenges.length == seededN+1. Anti-circular: known seededN before CF; CF output == seededN+1 across all K docs | P0 |
| WS-11 | Workshop dashboard progress percentage matches sub-challenge completed ratio from participant-workshop doc | REAL-UI | Precondition: seed a `participant workshop` doc with 3 sub-challenges, 1 completed. App computes progressPercentage = 1/3*100 ≈ 33%. Assert the dashboard renders a progress bar value matching the app-computed percentage; Firestore provides the known input (1 completed of 3 total) | P1 |
| WS-12 | Manually move-to-next writes manualcompletion=true and status='completed' on the current sub-challenge in participant-workshop | REAL-UI | Known precondition: participant at challenge[0].challenges[0] with status not 'completed'. Admin clicks "Move Next". Poll getDoc(participant workshop, id): challenges[0].challenges[0].status === 'completed' AND .manualcompletion === true. App-written value vs known pre-state | P1 |
| WS-13 | Workshop list duplicate-workshop creates a new workshopconfiguration doc with active=false and same title (app output) | REAL-UI | Precondition: seeded workshop with known title. Admin clicks Duplicate. Poll Firestore countWhere(workshopconfiguration, active==false) == prevCount+1 AND the newest doc has detailpage.title == knownTitle. App output vs known title | P2 |
| WS-14 | workshopprogressmessage HTTP CF is called with correct type/recipients when admin sends email from dashboard (stub asserts call shape) | REAL-UI | Stub HTTP interceptor on the CF URL. Admin clicks "Send Mail" on workshop_dashboard, fills subject/message, submits. Assert stub intercepted exactly one POST with body.type==='mail' and body.recipients.length >= seededEnrolledCount. CF output (stub-captured) vs known seeded recipients | P1 |
| WS-15 | Engagement dashboard renders a non-zero participant count matching the live participant-metadata active-participant pool | REAL-UI + ORACLE | App loads all `participant metadata`, reads `workshopconfiguration` list, computes engagement panel. Assert the "All Participants" panel count (app-computed) >= 1 (the test project has participants). Anti-circular: the count is what the app rendered from its reads, not a value the test wrote; Firestore countWhere provides the floor | P2 |

---

## ATC exclusions within this group

1. `workshopconfig/:id` reads `atc taxonomy` collection (ts:405) — **this is a reference/config read** used only to populate the "Taxonomy" picker for workshop metadata. Per CLAUDE.md, `atc taxonomy` is "reference-only config (safe)". Tests MUST NOT write to `atc taxonomy`. Tests that load `/workshopconfig/:id` may seed the workshop doc without a `selectedTaxonomies` value; the taxonomy dropdown can be ignored (no test exercises ATC-taxonomy selection).

2. `workshop_image_upload` reads `atc taxonomy` (Workshop/workshop-image-upload/workshop-image-upload.component.ts:141) — same reference-only pattern. Tests for this route should not assert anything about the taxonomy list or write to it.

3. No other ATC-family collections (`atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `big *atc*`, `0 atcinvolved issue`) are read or written by any component in this group.

4. `bigengagementdashboard` / `capacity-dashboard` reads `atcmodel level config` (ts:109) and `big aggregate level` (ts:102) — both are explicitly listed as "reference-only config (safe)" in CLAUDE.md. These reads are safe; no writes to these collections occur in this component.

---

## Risks / unknowns

1. **No authGuard on `/create-workshop` and `/workshopconfig/:id`** (app.routes.ts:260-261): any Firebase-authenticated user can access these. Tests must handle the case where the guard does not bounce; login with any valid test user suffices.

2. **Named database `firestore-forms`** (workshop-dashboard.component.ts:188-189): the form-preview and form-assignment paths use `getFirestore('firestore-forms')`. The cloud test project `slabs-queue-e2e-exdcz` may not have this named DB provisioned. All tests that open `/formtemplateworkshop` or `viewForm()` dialogs should be skipped or stubbed until confirmed.

3. **`workshopconfiguration` CF gate `triggerFunction===true`** (workshop.js:274): the CF only fires when the incoming doc update has `triggerFunction===true`. Tests for WS-10 must explicitly set this field. On a missed trigger (field false), no CF runs and no `participant workshop` docs update — hard to distinguish from a CF deployment failure.

4. **`workshopenrolledwatti` CF — Wati/Postmark live credentials in test project**: the CF fires on every `workshop participant enrolled` create. Without stubs, it may try to send real Wati/email messages. On the cloud test project the CF may be deployed. Tests using the enrollment flow must either (a) not set a real `enrollwattimessage` / `mailTemplate` on the seeded workshop, or (b) accept the CF call silently failing (missing credentials in test project). The CF does not write any assertable Firestore side-effect, only external communications.

5. **`window.confirm` dialogs**: `onWorkshopStatusChange()`, `onWorkshopCompletedChange()`, `duplicateWorkshop()`, and `removeCurriculum()` all use `window.confirm()`. Tests must use `page.once('dialog', d => d.accept())` (or `.dismiss()`) before triggering these actions.

6. **`window.open` for navigation**: the workshops list uses `window.open('/create-workshop', '_blank')` and `window.open('/workshopconfig/<id>', '_blank')` (workshops.component.ts:122-126), and `window.open('/workshop_dashboard/<id>', '_blank')`. Tests must either intercept the new page or navigate directly to avoid popup-blocked failures.

7. **No `data-testid` attributes in workshop components**: none of the workshop components ship `data-testid`. Selectors must use `formControlName` (for form inputs), `mat-table` row selectors, role+name (Material buttons), or text-based locators. This increases selector fragility on UI refactors.

8. **Large document size**: `workshopconfiguration` docs can be large (the component displays `documentsize` in KB/MB, ts:1092). Cloud Firestore listener latency on large docs may delay test assertions; use `pollUntil` generously (30s+).

9. **`generalContentUpdate` CF**: listed in the task prompt as a candidate CF but is NOT relevant to this group. It triggers on `/content_urls/{id}` writes; workshop components do not write to `content_urls`. No test should rely on this CF for workshop assertions.

10. **Legacy eiflix-workshop routes (`createworkshop`, `workshopchallengecreation`, `enrollment_config_view`, `workshopchallengeparticipantdashboard`)**: these use a separate `eiflix workshop` / `eiflix enrolment` collection family. They are largely superseded by the New-Workshop flow. Tests for these routes should be P2 and limited to "route loads without error" smoke tests unless the legacy path is actively maintained.
