# Business Dashboard & Misc — e2e recon

Concept group: expense-planner, ads-entry, eventzonemanagement, hpc, quiz/viewquiz, participanttouchpoint.

---

## Routes (path -> component file:line, role/guard, ATC? note)

| Path | Component | Guard | ATC? |
|------|-----------|-------|------|
| `/expense-planner/:tab` | `src/app/Business Dashboard/expense-planner/expense-planner.component.ts:53` | `authGuard` (app.routes.ts:289) — role resolved from `dashboard` Firestore collection at runtime | No |
| `/ads-entry` | `src/app/Business Dashboard/AdsEntry/entry-management.component.ts:29` | `authGuard` (app.routes.ts:290) | No |
| `/eventzonemanagement` | `src/app/Zone Management/event-zone-management/event-zone-management.component.ts:39` | `authGuard` (app.routes.ts:305) | No |
| `/hpc` | `src/app/hpc/hpc.component.ts:62` | `authGuard` (app.routes.ts:283) | No |
| `/quiz` | `src/app/quiz/quizscreen.component.ts:32` | `authGuard` (app.routes.ts:169) | No |
| `/viewquiz` | `src/app/quiz/viewquizcohort/viewquizcohort.component.ts:97` | `authGuard` (app.routes.ts:170) | No |
| `/participanttouchpoint` | `src/app/participant-touchpoint/participant-touchpoint.component.ts:34` | `authGuard` (app.routes.ts:277) | No — reads `participant touchpoint` collection (CF-written), does NOT write ATC |

**Route guard mechanism** (`src/app/auth.guard.ts:10`): every route calls `authService.routeConfig(cleanUrl)` which reads `dashboard` Firestore collection docs to find `roles[]` and `profileid[]` for the requested path. A user passes if their role array intersects `roles[]` OR their profileid is in `profileid[]`. The `dashboard` collection is not seeded on the cloud test project by the existing seed; route config returns `{roles:[], profileid:[]}` → hasAccess=false unless a `dashboard` seed is added. **This is a seed requirement for every route here.**

**Tab param (expense-planner):** `ngOnInit` reads `activeroute.paramMap` and redirects to `/expense-planner/home` if tab is unknown; valid values are `home` (expense tab), `current` (inflow current month), `next` (inflow next month) — expense-planner.component.ts:143.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

| Collection | RW | Purpose | Named DB |
|---|---|---|---|
| `expenseplanning` | both | Expense entries (daily cost records). Write: `setDoc`/`updateDoc`/`deleteDoc` — expense-planner.component.ts:279,629,657,582. Read: `collectionData` stream filtered by date range + `delete==false`. | default |
| `participant metadata` | read | Finance inflow data sourced from participant metadata (`financedata` field) — expense-planner.component.ts:255. | default |
| `adsinvestment` | both | Ads investment daily entries. Write: `writeBatch` (parent + subcollection `logs`) — entry-management.component.ts:254,300. Read: `collectionData` stream filtered by date range. | default |
| `adsinvestment/{id}/logs` | both | Audit log of every add/edit of an adsinvestment entry. Written in same batch as parent. | default |
| `event collection` | read | Events list for zone management dropdown. `collectionData` ordered by `end_date desc` — event-zone-management.component.ts:126. Also read by `viewquizcohort` to resolve event names. | default |
| `event zones` | both | Zone docs for a selected event (filtered by `eventref`). Written via `setDoc(merge:true)` (create/edit zone) and `updateDoc` (cohort assignment, status toggle) — event-zone-management.component.ts:513,597,606. | default |
| `event participant zones` | both | Participant→zone assignment docs (one per participant per event, docid=`{profileid} - {eventid}`). Written in `writeBatch` on `submitConfiguration()` — event-zone-management.component.ts:860. | default |
| `event participant zones logs` | write | Log of every assignment submission (one per participant per submit) — event-zone-management.component.ts:863. | default |
| `big cohorts` | read | Cohort list for zone management (filtered by `eventref`). Also read by `viewquizcohort` to resolve cohort names. | default |
| `3minuteshpc` | both | HPC session docs. `getDocs` ordered by `createdAt desc` — hpc.component.ts:143. Delete: `deleteDoc` — hpc.component.ts:656. | default |
| `classify` | both | Config documents: `classify/touchpoint` (touchpointlist for participanttouchpoint), `classify/3minuteshpc` (HPC admin list + contrast frame prompt). Read by both hpc.component.ts:186 and participant-touchpoint.component.ts:62. Written by hpc `saveContrastPrompt()` (updateDoc) — hpc.component.ts:226. | default |
| `static meta data` | both | HPC Config doc (`static meta data/HPC Config`) for accelerators, multipleprofiles, accessfor, notification templates — hpc.component.ts:195,250. Also `static meta data/Accelerator` for accelerator list — hpc.component.ts:194,281. | default |
| `quiz` | both | Quiz question definitions. Read by `quizscreen` (collectionData), `viewquizcohort` (getDocs where `type==withoutResponse`). Written by `quiz.component.ts` (addDoc/updateDoc/deleteDoc) opened as dialog. | default |
| `quizbyclients` | read | Quiz responses submitted by participants. Read by `viewquizcohort` (getDocs where `type==withoutResponse`) — viewquizcohort.component.ts:232. Written by `workshop-dashboard` component (not in this group) and potentially a participant-facing quiz dialog. | default |
| `participant touchpoint` | read | Participant journey touchpoints (CF-written by multiple CFs: queue stage moves, appointments, sales, product mode changes). Read by `participanttouchpoint` via `collectionData` filtered by date range — participant-touchpoint.component.ts:88. | default |
| `users_roles` | read | Used by zone management to load coordinator/mentor team list (filtered by role flags) — event-zone-management.component.ts:136. | default |
| `dashboard` | read | Route access config (roles per route). Read by `authGuard`/`routeConfig` — authguard.service.ts:325. **Must be seeded for all routes in this group.** | default |

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Collection/Path | Effect | Code ref |
|---|---|---|---|
| Route access (roles + profileid) | `dashboard` collection (each doc's `children[].route`, `children[].roles`, `children[].profileid`) | Who can access each route — gate for every test | auth.guard.ts:36, authguard.service.ts:320 |
| Watson webhook URLs | Hard-coded in component, gated by `environment.firebase.projectId` | On the test project (`slabs-queue-e2e-exdcz`) neither URL is set → `loadWebhookData` returns early (no HTTP call). Safe by construction. | expense-planner.component.ts:211-219 |
| Touchpoint list | `classify/touchpoint` (`touchpointlist` array) | Which touchpoint types appear in the participant touchpoint filter multi-select | participant-touchpoint.component.ts:62 |
| HPC admin list | `classify/3minuteshpc` (`admins` array) | Who counts as HPC admin for the `allowtoview` gate — hpc.component.ts:190 | hpc.component.ts:186 |
| HPC Config | `static meta data/HPC Config` (`multipleprofiles`, `accessfor`, `admins`, `notificationindividual`, `notificationgroup`) | Controls group HPC participant list, notification templates | hpc.component.ts:195 |
| Accelerators | `static meta data/Accelerator` (`accelerators` array) | Accelerator chips in HPC admin tab | hpc.component.ts:194 |

---

## Cloud Functions involved (name -> trigger -> side-effect a test can assert)

No Cloud Functions in `starlabs-cloud-function/functions/components/` touch `expenseplanning`, `adsinvestment`, `3minuteshpc`, `quiz`, `quizbyclients`, `event zones`, or `event participant zones`. Confirmed by grepping all `*.js` files in that directory — zero hits for these collection names.

The `participant touchpoint` collection is written by CFs in other groups (appointment.js:898, salescrm-updates.js:518, achievements.js:337, participantmode.js:58, service.js:941) but **none in this group trigger those writes**. The touchpoint viewer is read-only with respect to CF interactions.

**Summary: no CF side-effects to assert in this group.** All Firestore writes are direct client writes from the Angular app.

---

## External services to stub (call sites file:line)

| Service | Call site | How called | Stub needed? |
|---|---|---|---|
| Watson growth/upcoming CFs (external HTTP) | expense-planner.component.ts:222-235 | `HttpClient.get()` at `us-central1-watson-test-19.cloudfunctions.net/...` (test env URL) / `us-central1-watsonproduction-becde.cloudfunctions.net/...` (prod). **On the test project (`slabs-queue-e2e-exdcz`) the projectId matches neither `starlabs-test` nor `fir-sample-aae4a` → `watsonurl1` stays empty → `if (!watsonurl1) return;` fires — no HTTP call is made.** No stub needed on the test project. | No (dead code path on test project) |
| FCM | Not called in any component in this group | — | No |
| Zoom/OpenVidu/LiveKit | Not called in any component in this group | — | No |
| Wati/Twilio/WhatsApp | Not called in any component in this group | — | No |
| Postmark/email | Not called in any component in this group | — | No |
| Razorpay | Not called in any component in this group | — | No |
| XLSX export (SheetJS) | event-zone-management.component.ts:989 | `XLSX.utils.json_to_sheet`, `XLSX.writeFile` — purely client-side, no network call | No |

**Note on HPC notifications:** The HPC component stores `notificationTitle`/`notificationDescription` in `static meta data/HPC Config` but the component itself does NOT call FCM. The actual FCM dispatch (if any) happens outside the browser — likely a Cloud Function. No stub needed for this screen's e2e tests.

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

All routes use `authGuard` which consults `dashboard` collection for `roles[]` per route (authguard.service.ts:320). The `dashboard` collection docs in the cloud test project have no entries for this group's routes → access currently depends on seeding the `dashboard` config, OR using a user whose profileid is in `profileid[]` of the route doc.

**Practical actor strategy for tests:**
- Seed a `dashboard` document granting a specific role (e.g. `admin`) access to each of these routes.
- Log in as an `admin` actor (the existing seeded operator has `roles:{admin:true}`) — this covers all routes where `admin` is an allowed role.
- Alternatively, seed a `profileid`-gated entry for a specific test profile.

The existing seed's `admin+<run>@example.com` (role `admin`) is the natural actor for all business/admin screens. No separate dedicated role is required given the `dashboard` config pattern.

**Actors needed:**
- `admin` role user (existing seeded operator) — primary actor for all routes
- The `authGuard` gate opens a Material Dialog (not a redirect) when access is denied (auth.guard.ts:50) — tests should verify the actor CAN land, not that it bounces.

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1: Expense Planner — Add new expense entry

1. Admin navigates to `/expense-planner/home` → component loads, sets `activeTab=expense`, calls `loadExpenses()` via `collectionData` stream on `expenseplanning` (filtered by current month, `delete==false`).
2. Clicks "Add Entry" button (`.add-entry-btn`) → `isDialogOpen=true`, form dialog appears.
3. Picks a date not already existing → `dateExist()` finds no match → `showCompleteForm=true`.
4. Fills item name, amount, toggles paid → submits form.
5. **Firestore write**: `setDoc(expenseplanning/{newId}, {docid, date, totalpaid:0, delete:false, lastupdatedtime, lastupdatedby, entryby, description:[...]})` — expense-planner.component.ts:629.
6. Dialog closes; live `collectionData` stream updates the expense list.
7. **Anti-circular assert target**: query `expenseplanning` by `lastupdatedby == profile_id` + date range → count or read the APP-WRITTEN doc's `description` to verify it matches what was submitted.

### Flow 2: Expense Planner — Edit and soft-delete expense

1. Existing expense row → "Edit" button → `editEntry(expense)` → form pre-fills.
2. Changes description items → saves.
3. **Firestore write**: `updateDoc(expenseplanning/{id}, {description, lastupdatedby, lastupdatedtime})` — expense-planner.component.ts:659.
4. Soft-delete: "Delete" button → `confirm()` → `updateDoc(expenseplanning/{id}, {delete:true})` — expense-planner.component.ts:575.
5. The live stream re-queries with `delete==false` → deleted entry vanishes from list.
6. **Assert**: after soft-delete, the doc's `delete` field equals `true` (app-written) vs seeded known doc.

### Flow 3: Expense Planner — Month navigation and filter type switch

1. Start on `/expense-planner/home` with current month expenses visible.
2. Click backward month arrow → `backwardMonth()` updates `startDate`/`endDate`/`monthyear` → `loadData()` resubscribes stream.
3. **Assert**: expense list count shown by UI matches what admin SDK counts in `expenseplanning` for that month + `delete==false` (app renders what Firestore returned, reconciled).
4. Switch to range filter → `setFilterType('range')` → resets to current month + reloads.

### Flow 4: Ads Entry — Add new ads entry (with audit log)

1. Admin navigates to `/ads-entry` → `loadData()` streams `adsinvestment` for current month.
2. Opens add form → fills date (new date, not existing) → fills campaigns/amount → submits.
3. **Firestore write (writeBatch)**: `adsinvestment/{newId}` (parent doc) + `adsinvestment/{newId}/logs/{logId}` (subcollection audit doc) — entry-management.component.ts:254-279.
4. Stream updates list; `totalCampaigns` and `totalAmount` aggregate getters recompute.
5. **Assert**: query `adsinvestment/{newId}/logs` → count == 1 (the batch wrote exactly one log row).

### Flow 5: Ads Entry — Edit entry (appends a new log row)

1. Existing entry → edit button → update campaigns/amount → submit.
2. **Firestore write (writeBatch)**: `updateDoc(adsinvestment/{id})` + `set(adsinvestment/{id}/logs/{newLogId})` — entry-management.component.ts:300.
3. **Assert**: `adsinvestment/{id}/logs` count increases by exactly 1 per edit (audit trail conservation).

### Flow 6: Zone Management — Select event and view statistics

1. Admin navigates to `/eventzonemanagement` → `loadInitialData()` streams `event collection` + `users_roles`.
2. Selects seeded event from dropdown → `onEventSelect()` fires → streams `event zones` (filtered by eventref) + `big cohorts` (filtered by eventref).
3. `calculateAllStats()` derives `_assignedCohorts`, `_participantlist` per zone.
4. **Assert (REAL-UI)**: `zonesCreated` count rendered == admin SDK count of `event zones` docs with matching `eventref`. (No write, pure read reconciliation.)
5. `participantsMapped` (computed from `_participantlist` union) == count of unique participants in `event participant zones` for this event.

### Flow 7: Zone Management — Assign cohort to zone (writes event zones)

1. Select event → cohort panel shows unassigned cohorts.
2. Toggle-select a cohort → `selectedCount` increments.
3. From bulk-assign dropdown select a zone → `assignSelectedCohortsToZone(zoneId)` fires.
4. **Firestore write**: `updateDoc(event zones/{zoneId}, {cohorts: [...]})` — event-zone-management.component.ts:517.
5. `calculateAllStats()` re-runs → `cohortsAssigned` increments.
6. **Assert**: read `event zones/{zoneId}` from admin SDK → `cohorts` array contains the assigned cohort id (app-computed write vs known seeded cohort id).

### Flow 8: Zone Management — Submit configuration (writes event participant zones)

1. All cohorts assigned, no unassigned or conflicted participants → `submitConfiguration()`.
2. `fetchExistingParticipantZones()` reads `event participant zones` for this event.
3. `analyzeParticipantAssignments()` classifies participants.
4. `performSubmit()` calls `writeBatch`: for each participant writes `event participant zones/{pid} - {eventid}` + `event participant zones logs/{logId}`.
5. **Assert**: after submit, `event participant zones` count for this event == count of unique participants across all assigned cohorts (conservation: every participant got exactly one zone assignment).

### Flow 9: HPC — Load sessions and filter

1. Admin navigates to `/hpc` → `loadData()` reads `classify/3minuteshpc` + `static meta data/HPC Config` + `static meta data/Accelerator` → `loadAllHpc()` `getDocs` `3minuteshpc` ordered by `createdAt desc`.
2. `filteredHpcData` = all sessions. `completedCount` + `inProgressCount` = total.
3. Set `selectedHpcView='completed'` → `updateFilteredHpcData()` filters client-side.
4. **Assert**: `completedCount` rendered == admin SDK count of `3minuteshpc` docs with `status=='completed'` (app-computed from its own getDocs vs the same data counted independently).

### Flow 10: Quiz — Admin creates/edits quiz question (writes quiz collection)

1. Admin navigates to `/quiz` → `loadQuizzes()` streams `quiz` collection (sorted by `active desc`).
2. Clicks "Create Quiz" → opens `QuizComponent` dialog → fills question text, type, options → saves.
3. **Firestore write**: `addDoc(quiz, {...})` + `updateDoc(docRef, {docId})` — New-Workshop/quiz/quiz.component.ts:284-288.
4. Dialog closes → `afterClosed()` triggers `loadQuizzes()` refresh.
5. **Assert**: `quiz` collection count increases by 1 (app-created doc vs seeded baseline count).

### Flow 11: View Quiz — Filter responses by quiz and option

1. Admin navigates to `/viewquiz` → loads `quiz` (type==withoutResponse) + `quizbyclients` (type==withoutResponse) + `big cohorts` + `event collection`.
2. Auto-selects latest active quiz. `optionBreakdown` computed from filtered responses.
3. Apply option filter → `applyFilters()` narrows `dataSource.data`.
4. **Assert (REAL-UI)**: rendered response count == `dataSource.data.length` (app-computed) vs Firestore count of `quizbyclients` docs where `type==withoutResponse` AND `question==selectedQuiz.question` (seeded baseline).

### Flow 12: Participant Touchpoint — Date range filter and row count

1. Admin navigates to `/participanttouchpoint` → reads `classify/touchpoint` for `touchpointlist` → `fetchData()` streams `participant touchpoint` filtered by default date range (last 7 days to today).
2. `calculateTimeDelay()` updates `dataSource.data` filtered by `filterTouchPoint`.
3. Change date range → `fetchData()` re-subscribes with new date boundaries.
4. **Assert (REAL-UI)**: `dataSource.data.length` rendered in table == admin SDK count of `participant touchpoint` docs in that date range with touchpoint type in `filterTouchPoint` (two independent queries of the same seeded data agree).

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

1. **`dashboard` collection entries** for all six routes: `/expense-planner`, `/ads-entry`, `/eventzonemanagement`, `/hpc`, `/quiz`, `/viewquiz`, `/participanttouchpoint` — each with `roles: ['admin']` (or a known test role). This is the gate that must open before any test can even reach these screens. Without this, `authGuard` returns `false` and shows an "Access denied" dialog. **This is the most critical seed item.**

2. **Admin user** with `users_roles.admin==true` — reuse the existing seeded `admin+<run>@example.com` actor from `seed-test-project.js`. Their `users_roles` doc already has `admin:true`.

3. **`expenseplanning` seed docs** (2–3 docs with `delete:false` in the current month, and 1 doc with `delete:true`) for Flow 1/2/3 tests. Include `docid`, `date` (Timestamp), `description[{name,amount,paid}]`, `totalpaid`, `delete:false`.

4. **`adsinvestment` seed doc** (1 doc for the current month with known `campaigns` and `amount`) for Flow 4/5 tests. Each doc needs a subcollection `logs` with 1 initial log entry to verify conservation.

5. **`event collection` seed doc** — already present (`run1_bigevt_0`). Reuse it (docid = `run1_bigevt_0`).

6. **`big cohorts` seed docs** — already present (2 cohorts with `eventref` pointing to `run1_bigevt_0`). Verify `participantidlist` is populated with test profile ids.

7. **`event zones` seed docs** (2 zones with `eventref` == `run1_bigevt_0` event ref, zero or one cohort assigned each) for Flow 6/7 tests.

8. **`3minuteshpc` seed docs** (3–5 docs: mix of `status:completed` and not-completed, mix of `multiple:true`/`false`) for Flow 9. At least 2 completed and 2 in-progress.

9. **`quiz` seed doc** (1 question with `type:'withoutResponse'`, `active:true`, with 2–3 options) for Flow 10/11.

10. **`quizbyclients` seed docs** (3–5 responses with `type:'withoutResponse'`, referencing the seeded quiz question, with different `selectedcohort` and `quizData[].isSelected`) for Flow 11.

11. **`participant touchpoint` seed docs** — already present (17,634 docs including `Queue Stage Moved` and `Queue Token Created` types from existing queue e2e runs). The default 7-day window will naturally capture recent test run touchpoints. For deterministic counts, seed a small known set tagged with `testrunid`.

12. **`classify/touchpoint` doc** — already present with `touchpointlist:["Queue Token Created","Queue Stage Moved","Form Submitted","Product Mode Update"]`. No additional seed needed.

13. **`static meta data/HPC Config`** — already present (`_testdata:true` with `testrunid:run1`). Update to include `admins:[<test_profile_id>]`, `multipleprofiles:[]`, `accessfor:[<test_profile_id>]` for the HPC admin gate test.

14. **`classify/3minuteshpc`** — seed with `admins:[<test_profile_id>]`, `prompt:'test prompt'`.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| BM-01 | Admin logs in and lands on expense-planner (route guard admits, tab=home renders expense list) | REAL-UI | authGuard must emit true → URL contains `/expense-planner`, no /login bounce; initial expense rows rendered == admin SDK count of `expenseplanning` docs for current month with `delete==false` | P0 |
| BM-02 | Expense planner: adding a new entry writes the correct `expenseplanning` doc shape and live-updates the list | REAL-UI | After form submit, admin SDK reads `expenseplanning` by `lastupdatedby` + date — `description` array matches what was filled in the form (app-written value vs known seeded test input) | P0 |
| BM-03 | Expense planner: soft-delete flips `delete:true` on the doc and removes it from the live list | REAL-UI | After confirm-delete, admin SDK reads doc → `delete==true` (app-written). List count drops by 1 (rendered by app). | P1 |
| BM-04 | Expense planner: month navigation — row count matches Firestore count for that month | REAL-UI | Navigate back one month → app renders expenses; count matches admin SDK `countWhere(expenseplanning, [date-in-prev-month, delete==false])` | P1 |
| BM-05 | Ads entry: adding an entry (writeBatch) creates the parent doc AND exactly one initial log row | REAL-UI | After submit, admin SDK counts `adsinvestment/{newId}/logs` → 1 (batch wrote one log, app-computed vs known seeded count of 0 before submission) | P0 |
| BM-06 | Ads entry: editing an entry appends exactly one new log row (audit conservation) | REAL-UI | Before edit: log count = N. After edit submit: admin SDK counts logs → N+1. `totalCampaigns` aggregate displayed == sum of all entries' `campaigns` (app-computed) | P1 |
| BM-07 | Zone mgmt: selecting an event renders zone and cohort counts that reconcile with Firestore | REAL-UI | `zonesCreated` rendered == admin SDK count of `event zones` where `eventref==seeded event`. `allCohorts.length` rendered == admin SDK count of `big cohorts` where `eventref==seeded event` | P0 |
| BM-08 | Zone mgmt: assigning a cohort to a zone writes the cohort id into the zone's `cohorts` array | REAL-UI | After `assignSelectedCohortsToZone`, admin SDK reads `event zones/{zoneId}` → `cohorts` includes the assigned cohort id (app-written). `cohortsAssigned` header stat increments by 1 (app-computed) | P0 |
| BM-09 | Zone mgmt: submitConfiguration writes one `event participant zones` doc per unique participant and one log per participant | REAL-UI | After submit, admin SDK count of `event participant zones` where `eventref==seeded event` == total unique participants in assigned cohorts (KNOWN seeded number). Count of `event participant zones logs` == same count (one log per assignment). | P0 |
| BM-10 | HPC: session list completedCount + inProgressCount == total session count from Firestore | REAL-UI | App renders `completedCount` and `inProgressCount` after loading `3minuteshpc`. `completedCount` == admin SDK count where `status=='completed'`. `inProgressCount` == count where `status!='completed'`. Sum == total — two app-computed values vs two independent Firestore queries | P1 |
| BM-11 | HPC: filter by status='completed' narrows rendered list to only completed sessions | REAL-UI | App's `filteredHpcData` count after filter == admin SDK count of `3minuteshpc` with `status=='completed'` (seeded known N). Verified via rendered card count vs expected count. | P1 |
| BM-12 | Quiz: admin creates a new quiz question → quiz collection count increments by 1 | REAL-UI | Before: admin SDK count of `quiz` == N. After create-dialog submit: count == N+1 (app-created doc, never the test itself). | P1 |
| BM-13 | Quiz list: quiz table renders seeded quiz and `active` flag sorts active rows first | REAL-UI | `dataSource.data[0].active === true` (app's sort computed value vs seeded doc's `active:true` flag). Table row count == admin SDK `countWhere(quiz)` (no rows silently dropped). | P2 |
| BM-14 | View quiz (cohort): response breakdown percentages sum to 100% and total count matches Firestore | REAL-UI | `optionBreakdown` percentages sum ≈ 100 (app-computed from `filteredResponses`). `filteredResponses.length` for selected quiz == admin SDK count of `quizbyclients` where `question==selectedQuiz.question` AND `type==withoutResponse` (KNOWN seeded N). | P1 |
| BM-15 | Participant touchpoint: rendered row count matches Firestore count for the date window | REAL-UI | App renders rows for default 7-day window. `dataSource.data.length` == admin SDK count of `participant touchpoint` where `touchpointdate` in window AND `touchpoint` in `filterTouchPoint` (KNOWN seeded count for that profile set). | P0 |
| BM-16 | Participant touchpoint: changing the filter touchpoint type changes the displayed row count | REAL-UI | De-select one touchpoint type from multi-select → `dataSource.data.length` drops. New count == admin SDK count with that type excluded (app re-filters its own loaded data; both sides derived independently from the same Firestore snapshot). | P1 |

---

## ATC exclusions within this group

The following ATC boundaries were checked and found absent from all components in this group:

- `expenseplanning`, `adsinvestment`, `3minuteshpc`, `quiz`, `quizbyclients`, `participant touchpoint`, `event zones`, `event participant zones`, `big cohorts`, `event collection`, `classify`, `static meta data` — **none of these collections are ATC collections** per the denylist.
- None of the source folders (`src/app/Business Dashboard/`, `src/app/Zone Management/`, `src/app/hpc/`, `src/app/quiz/`, `src/app/participant-touchpoint/`) contain ATC references or import from `src/app/ATC/**`.
- The `participant touchpoint` collection is written by CFs for queue stage moves but that is NOT an ATC collection.

**No ATC exclusions needed for this group's test cases.**

---

## Risks / unknowns

1. **`dashboard` route config not seeded**: The cloud test project's `dashboard` collection has zero docs for these routes. Every single route in this group will receive "Access denied" dialog and block all tests unless the seed adds a `dashboard` doc with `roles:['admin']` for each of the seven paths. This is the highest risk blocker — address first.

2. **Watson webhook is dead on the test project**: `environment.firebase.projectId == 'slabs-queue-e2e-exdcz'` → neither Watson URL branch matches → `watsonurl1` stays empty string → `if (!watsonurl1) return` fires. The inflow tab's `thisMonthDue` will always be 0 and `nextMonthPDD` will be `[]`. The test must account for this: the inflow tab renders 0-value data, which is correct behavior. No stub needed but the console.log calls will run — guard with `assertNoFatal`.

3. **`confirm()` dialogs block tests**: The expense-planner's "delete" flow uses `window.confirm()` (expense-planner.component.ts:574); ads-entry's edit flow does not. Zone management uses `alert()` on submit success (event-zone-management.component.ts:872). Tests must handle these with `page.once('dialog', d => d.accept())`.

4. **HPC `allowtoview` gate**: If `static meta data/HPC Config` → `admins[]` does not contain the test profile id, `allowtoview=false` and the admin UI tabs may be hidden. Must seed the test profile id into `admins[]`.

5. **Zone management `mapProfileData[pid]['email']` crash**: The `analyzeParticipantAssignments()` method reads `this.mapProfileData[participantId]['email']` directly without a null guard (event-zone-management.component.ts:708). If any participant in the cohort's `participantidlist` is not in `mapProfileData`, this throws a TypeError. The seeded cohort's `participantidlist` must only contain profile ids present in the `profile_data` collection.

6. **HPC filter is client-side only**: The `getDocs` call in `loadAllHpc()` fetches ALL `3minuteshpc` docs ordered by `createdAt desc` with no limit or testrunid filter. On a project with many HPC docs this could be slow. The seeded docs must be identifiable by a `testrunid` field for count reconciliation; the test must compare a `testrunid`-filtered Firestore count to the subset the app computed. Use `searchText` to filter by a unique test string present in the seeded HPC docs.

7. **`quizbyclients` is written by `workshop-dashboard`, not by any screen in this group**: For BM-14 (viewquiz), responses must be pre-seeded as test data. The viewquizcohort component reads `quizbyclients` with `type=='withoutResponse'` — seeded responses must carry this type field.

8. **Touchpoint date range test determinism**: The 17,634 existing `participant touchpoint` docs from previous e2e runs make count reconciliation over large windows unreliable. For BM-15/BM-16, seed a small known cohort with unique `profileid` values and filter by those profile ids for an exact count.

9. **Zone management `submitConfiguration()` double-reads on conflict resolution**: If the analysis finds conflicts and the user resolves them, `analyzeParticipantAssignments()` is called again (event-zone-management.component.ts:815) with no existing-assignments parameter — potentially re-classifying a participant. Test should use a clean no-conflict seeded state (every participant in exactly one zone's cohort).

10. **No data-testid attributes anywhere in this group**: None of the six components ship `data-testid` attributes. All selectors will use the fallback strategy: `mat-select[ngModel]`, `.title-tab`, `.add-entry-btn`, `button[aria-label]`, stable CSS classes, or `role+name`. Document the exact fallbacks in the page object — this is a higher-maintenance risk than the queue suite's testid-rich components.
