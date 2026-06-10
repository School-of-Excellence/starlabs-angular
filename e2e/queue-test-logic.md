# Queue suite — test logic (for review)

One card per test: objective + assertions and why they hold.

## How the queue tests work
- **The model (oracle)** — a flow-model defines, per variation, which stages exist and which transitions are legal. Tests are checked against it — a move that isn’t a legal edge fails.
- **Participant self-moves** — DESKTOP queue tests perform participant moves via the Admin-SDK participant-sim (`sim.advance`) — the stand-in for a real form submit; the MOBILE suite performs them through the real app. Both write the same `queue_token` + `queue stage log`.
- **Operator / auto moves** — driven on the REAL Angular board (`board.moveToken` etc.) — the app performs the write; the test only clicks.
- **The guards** — no-orphan · no-stage-skipped · every-move-logged{minNonSelf} · loop-bound · terminal-reached · count-conserved · no-fatal. Bundles (`assertTrailInvariants` / `assertUniversalAfterHop`) run several at once after each hop.
- **Anti-circularity** — every assertion reads a value the APP produced (the token, the log rows, the board’s recomputed counts) — never a value the test wrote. `minNonSelf` proves the operator moves on the trail genuinely happened.

_115 tests across 23 specs._

## All actors — primary screens are usable (render without fatal error)
_queue/actors-health.spec.ts · 5 test(s)_

#### OPERATOR — Queue Manager board
- **Smoke render** — opens the screen as the given actor and FAILS on any fatal console error (render-health check)

`queue/actors-health.spec.ts:30`

#### SPECIALIST — Dynamic Studio
- **Smoke render** — opens the screen as the given actor and FAILS on any fatal console error (render-health check)

`queue/actors-health.spec.ts:37`

#### SPECIALIST — Arena Studio Activity
- **Smoke render** — opens the screen as the given actor and FAILS on any fatal console error (render-health check)

`queue/actors-health.spec.ts:44`

#### BIG — BIG Dashboard
- **Smoke render** — opens the screen as the given actor and FAILS on any fatal console error (render-health check)

`queue/actors-health.spec.ts:50`

#### BIG — Participant Assignment Board
- **Smoke render** — opens the screen as the given actor and FAILS on any fatal console error (render-health check)

`queue/actors-health.spec.ts:57`


## Authoring — queue-creation-v3 stepper
_queue/authoring.spec.ts · 1 test(s)_

#### AUTH-01 queue-creation-v3 smoke: create a queue → doc round-trips (queueadmin ARRAY + docid self-id)
_(render / smoke check — no transition assertions; read the spec)_

`queue/authoring.spec.ts:79`


## BIG-07 — Validate Participant Assignments
_queue/big-analytics.spec.ts · 10 test(s)_

#### BIG-07a accept moves a card initiated → completed; counts re-render & doc persists (conservation)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:83`

#### BIG-07c reject/rework moves a card initiated → rework; count re-renders & doc persists
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:153`

#### BIG-07b empty-selection bulk move is a no-op (no write, counts stable)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:190`

#### BIG-08 moving a participant updates both cohort sizes + writes one audit row (net-zero, no dup)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:227`

#### BIG-09a biglevel renders the seeded rows with no fatal error
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:334`

#### BIG-09b modellevelconfig renders the seeded rows with no fatal error
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:347`

#### BIG-09c big_aggregate analytics screen mounts and renders a finite count (no fatal)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:357`

#### BIG-10a AEL analytics count equals the Firestore collection size (no silent drop) and ≥ seeded floor
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:373`

#### BIG-10b monitor "Participants" count equals the app-filtered live token count (no silent drop)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:405`

#### BIG-11 zoom screen mounts gracefully for an assignment with no zoomdata (no fatal, no real window)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-analytics.spec.ts:454`


## BIG-00 — login & role gate
_queue/big-core.spec.ts · 11 test(s)_

#### BIG-00 the seeded BIG admin logs in and the guard admits them to the dashboard
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:167`

#### BIG-00 a signed-out visitor is redirected to /login from a BIG route
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:183`

#### BIG-00b a non-BIG participant is BLOCKED from ${route.path}
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:207`

#### BIG-00b the PAB exposes ONLY the logged-in profile (no cross-participant picker / leak)
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:233`

#### BIG-01 Total/Filtered are app-computed, internally consistent, and free of NaN
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:267`

#### BIG-02 zero-states render with no NaN/undefined and no fatal console error
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:301`

#### BIG-03 Σ status badges is conserved and the active bucket badge == rendered cards
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:327`

#### BIG-04 a real perform-action drives the app and the board re-renders the recomputed status
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:377`

#### BIG-05 the manual screen role-gates correctly and renders its review controls for an admin
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:486`

#### BIG-05 a non-self participant is DENIED the create/rework manual screen
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:529`

#### BIG-06 the legacy form screen mounts for an admin and renders its dynamic form/submit
*Objective:* FIXME (product gap + missing precondition — see productFindings BIG-06 + seedRequests): This legacy screen CANNOT be exercised cleanly in the emulator today, for TWO independent reasons, one of which is a genuine product gap (not a test-wiring issue), so per the governing rule we fixme + report rather than massage it green: 1) PRODUCT GAP — unconditional crash on a missing `big participants assignments` doc. `ngAfterViewInit` runs `getDoc(doc(afs,'big participants assignments', participantAssignmentId)) .then(res => this.currentstatus = res.data()['status'])` (form-based-submission.component.ts:164-166) with NO existence guard. When the id does not resolve to a doc, `res.data()` is `undefined` and `res.data()['status']` throws `TypeError: Cannot read properties of undefined (reading 'status')` — the exact pageerror the console-guard caught. The live PAB/Validate nav always passes a REAL participantAssignmentId, so the gap is latent in production, but it makes a no-precondition smoke impossible to keep clean. 2) MISSING PRECONDITION — the whole body is `*ngIf="showcontent"` (html:1) and `showcontent` only flips true AFTER a real `delivery forms` template (with a non-empty `formarray`) resolves (ts:170-198). With no template the host renders zero-size, so `toBeVisible()` on the host fails (the component DID mount — `toBeAttached()` holds — but it is correctly empty). CRUCIALLY this legacy component reads `delivery forms` from the **DEFAULT** db (`this.afs`, ts:170), whereas the emulator seeds `delivery forms` only into the **firestore-forms** named DB (seed-emulator.js → seedReferenceData). So there is NO default-DB template to resolve, and `snap.data().formarray` (ts:177) would itself throw on the missing template. TO UN-FIXME (returned as a seedRequest): seed, in the DEFAULT db, one `delivery forms` template with a non-empty `formarray` (e.g. a single text field) AND one `big participants assignments` row, then drive `/formbasedsubmission?type=form&id=<templateId>&participantAssignmentId=<paId>&profileid=<pf>`. With real ids: ts:164 reads an existing doc (no crash), ts:170-198 builds controls and sets `showcontent=true` (host visible), and `[data-testid="form-submit"]` renders — at which point the block below (already written for that path) asserts the real, app-rendered submittable form.
_(render / smoke check — no transition assertions; read the spec)_

`queue/big-core.spec.ts:585`


## CF side-effects after a stage move (deployed triggers)
_queue/cf-sideeffects.spec.ts · 2 test(s)_

#### CF-01 a real board move fires onQueueStageChange → "Queue Stage Moved" touchpoint + a logged operator move
*Objective:* CF-01 (P2 #11) — onQueueStageChange touchpoint + the board's stage-log row, via a REAL UI move. CLOUD UPDATE (the emulator FieldValue-crash artifact no longer applies): on real cloud Firestore + deployed CFs, onQueueStageChange's touchpoint write SUCCEEDS — the move fires a "Queue Stage Moved" `participant touchpoint` with `label == "Moved to '<currentstage>' in <queuename>"` (queuesystem.js:339, service.js:942). The emulator-only `FieldValue undefined` crash described in earlier runs is gone, so this test asserts the CF's real output and stays a `test` (not fixme). The ONLY wiring subtlety the cloud surfaced: `participant touchpoint` carries no `testrunid` and is NOT in the seeder teardown set, and the token ids are deterministic (TESTRUNID='run1'), so "Queue Stage Moved" touchpoints from PRIOR runs persist with this same parentreference. The read-back therefore fences off the pre-move docset (touchpointsBefore) and accepts ONLY a NEW doc — the one the CF wrote for THIS move — so a stale earlier-run touchpoint (e.g. a previous "Moved to 'Diagnostics'") cannot masquerade as this move's.
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/cf-sideeffects.spec.ts:113`

#### CF-02 a stage-log create at an Activity stage fires queueParticipantPositionUpdate → ready tokens recompute to 1..M
*Objective:* CF-02 (P2 #12) — queueParticipantPositionUpdate recomputes queue_token.queueposition at an Activity stage. Asserts a CF-COMPUTED value (positions 1..M) vs a KNOWN SEEDED ready-count (anti-circular). FIXME (PRODUCT/CF-RUNTIME bug, not a test defect): `queueParticipantPositionUpdate` is REGISTERED in the emulator (its eventarc trigger for `queue stage log/{queueStageLogId}` is created at startup) but it NEVER EXECUTES on a `queue stage log` document CREATE — the functions log has zero "Beginning execution of us-central1-queueParticipantPositionUpdate" entries for the whole run, while sibling create-triggers on other collections (e.g. CreateQueueActivityLogV2, inviteToStudio) do fire. The ready tokens therefore keep their seeded scrambled positions (observed [900,901,902]) and never recompute to 1..M. Root cause is the Firestore-emulator NOT delivering onDocumentCreated events for a collection whose id contains SPACES ("queue stage log") to the registered path-pattern trigger — a deployed-CF/emulator-runtime gap, NOT this spec's wiring. The trigger doc IS created with a random id (participant-sim.advance → .doc().id), so a re-run is not the cause. See productFindings; tracked for a CF/emulator-side fix outside this category's owned files.
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Lists seeded tokens** — reads the seeded participants for the variation

`queue/cf-sideeffects.spec.ts:204`


## Cross-DB lower bound — SS-07 live-panel widget shows the EXACT seeded non-zero count (P2 #7)
_queue/cross-db-lowerbound.spec.ts · 1 test(s)_

#### Forms widget renders the EXACT seeded non-zero count from firestore-forms (catches secondary-DB silent zero)
*Objective:* P2 #7 — POSITIVE lower bound on the FORMS widget (the in-scope secondary DB, firestore-forms). The "Forms submitted by the Participant" widget renders one button per `participantForm` entry, which the component builds by querying the firestore-forms named DB for this participant's submitted forms and KEEPING only those whose formid is in the stage's `participantform` list (ts:758-791). With SEEDED_FORM_COUNT known forms seeded for the in-studio participant, the widget MUST render >= SEEDED_FORM_COUNT buttons. If the secondary DB failed to initialise (or the ref is mis-pathed) the count stays 0 and the poll TIMES OUT → the test FAILS, catching the silent zero. FIXME (TEST-INFRA gap, verified live 2026-06-07 — NOT a product defect, NOT weakened to pass): This positive lower bound legitimately CANNOT pass on the emulator today because the app never connects the `firestore-forms` NAMED database to the emulator. `src/main.ts` (the "HERMETIC EMULATOR WIRING" block) calls `connectFirestoreEmulator` ONLY on the `(default)` Firestore instance (main.ts:13/23); the component reaches the forms DB via `getFirestore(app, "firestore-forms")` (dynamic-studio.ts:758) which returns a SEPARATE instance that is NEVER emulator-connected, so in the demo project it resolves to no backend and the forms query returns EMPTY → the widget renders 0. PROVEN: with the live panel fully mounted (participant name hydrated), `mappedForm` correctly containing the seeded `run1_form_0`, and 2 matching `formsByClient` docs present in the emulator's firestore-forms DB (queueref + profileid both matching the app's query), the rendered widget count is still 0 — the query never reaches the seeded data because the named-DB handle escapes the emulator. This is exactly the "secondary DB not initialised" failure mode this spec was BUILT to catch — it caught a real harness gap. FIX (test-infra, out of THIS agent's owned files — returned as a seedRequest/finding): in `src/main.ts`, when `useEmulators`, also `connectFirestoreEmulator(getFirestore(app, "firestore-forms"), host, port)` (and declare the named DB in environment.emulator.ts) so the forms named DB is emulator-reachable; then flip this back to `test()` — the assertion is correct AS WRITTEN and must NOT be loosened. The ATC-zero contract below is unaffected (ATC is off-limits and reads 0 by design regardless).
- **Studio link (setup)** — links the token into a live studio session

`queue/cross-db-lowerbound.spec.ts:213`


## Invariants self-test — harness guards FIRE on a defect (test-the-test)
_queue/invariants-selftest.spec.ts · 4 test(s)_

#### INV2 passes at exact count; throws on dropped row, duplicate row, and unmet minNonSelf
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Participant self-move (sim)** — the participant stand-in writes the self-move log row — desktop analogue of a real form submit

`queue/invariants-selftest.spec.ts:102`

#### INV3 passes on a legal trail; throws on an illegal skip
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Participant self-move (sim)** — the participant stand-in writes the self-move log row — desktop analogue of a real form submit

`queue/invariants-selftest.spec.ts:138`

#### INV-selfmv: flipping an operator gate to selfmovable:true is DETECTABLE by parity check 1b
*Objective:* flow-model — SELFMOVABLE parity DETECTOR (edge-vs-flag check 1b)
_(render / smoke check — no transition assertions; read the spec)_

`queue/invariants-selftest.spec.ts:162`

#### INV-scope: an edge scoped to one variation is EXCLUDED for another (outEdgesForVariation isolation)
*Objective:* flow-model — outEdgesForVariation SCOPING (variation isolation)
_(render / smoke check — no transition assertions; read the spec)_

`queue/invariants-selftest.spec.ts:187`


## LOOP-BOUND self-test — the loop guard catches a stuck token (P3 #14)
_queue/loop-bound-selftest.spec.ts · 2 test(s)_

#### LB-01 a 3rd traversal of a back-edge fails assertLoopBound (and 2 traversals pass)
*Objective:* LB-01 — drive a deliberately-UNBOUNDED back-edge path (a 3rd traversal of ONE edge) and prove assertLoopBound THROWS on the product-written audit trail. Also prove the SAME guard does NOT throw at exactly the bound (2 traversals), so it is not vacuously always-red.
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/loop-bound-selftest.spec.ts:97`

#### LB-02 a 3rd traversal of the Scope Enhancement self-loop also fails assertLoopBound
*Objective:* LB-02 — the guard fires on a SELF-LOOP too (the other LOOP-BOUND failure shape: to == from). flow-config.md §2 V1: `Scope Enhancement` carries a "Send Back" self-loop scoped to V1, bound ≤2. This is the second documented loop class (a self-edge, not a back-and-forth) — proving the guard catches BOTH shapes. Built entirely on the product's `queue stage log` rows; verdict asserted.
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)

`queue/loop-bound-selftest.spec.ts:189`


## Operator — Queue Manager board (OP-01…OP-13, OP-02b, OP-09b)
_queue/operator.spec.ts · 15 test(s)_

#### OP-01 operator logs in and lands on the role-gated board (no bounce, no console error)
*Objective:* OP-01 — Login & role-gated route
- **No-fatal** — no fatal console error / app crash during the flow (console guard)

`queue/operator.spec.ts:154`

#### OP-02 queue list renders the seeded queue, filters live, and links to the B!G Planner
*Objective:* OP-02 — Queue List (admin CRUD list + B!G Planner entry)
_(render / smoke check — no transition assertions; read the spec)_

`queue/operator.spec.ts:171`

#### OP-02b a non-admin operator sees ONLY queues where their profileid is in queueadmin (queue 2 ABSENT)
*Objective:* OP-02b — NEGATIVE queue visibility (a non-admin operator sees ONLY queues they administer)
_(render / smoke check — no transition assertions; read the spec)_

`queue/operator.spec.ts:227`

#### OP-03 board shows the right numbers: Total Participants == Σ per-stage column counts
*Objective:* OP-03 — Board load & counts (Total == Σ columns; per-column parity)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reads Total Participants** — the board’s app-computed total
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/operator.spec.ts:263`

#### OP-04 operator moves a token to a NON-Activity stage: one new stage-log row, counts conserved, studio fields cleared
*Objective:* OP-04 — Move token → non-Activity target (writes the audit log) [+CF]
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Stage-moved touchpoint** — the move wrote its expected touchpoint/side-effect
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/operator.spec.ts:299`

#### OP-05 operator moves a token INTO an Activity stage: one live-assignment, pairing live, one stage-log
*Objective:* OP-05 — Move token → Activity stage (opens a studio) [+CF]
- **Zoom-link** — a studio zoom link, if present, is well-formed
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Studio/activity move** — opens a studio via the real AssignQueueStudio dialog (app writes the live assignment)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/operator.spec.ts:365`

#### OP-06 operator moves a token OUT of an Activity stage: live-assignment completed, pairing released, one stage-log
*Objective:* OP-06 — Drag a token OUT of an Activity stage (closes the studio) [+CF]
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/operator.spec.ts:417`

#### OP-07 moving a token to the final stage calls updateDeliveryStatus("queue_token/{T}","completed",{eventRequestRef})
*Objective:* OP-07 — Final-stage move completes delivery (updateDeliveryStatus ARG CORRECTNESS) [+CF]
- **Final completion** — operator moves the token into the terminal stage
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)

`queue/operator.spec.ts:463`

#### OP-08 Complete-Queue fires updateDeliveryStatus once per token in the column, each with the correct path/status/ref
*Objective:* OP-08 — Complete Queue (bulk): one updateDeliveryStatus call PER token, all with correct args
- **Bulk complete** — developer "complete column" action over the real board
- **Reads a board count** — an app-computed, stream-rendered column count the test asserts against (never a test-written value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)

`queue/operator.spec.ts:515`

#### OP-09 comms sidebar: Send is disabled with no selection; recipient count matches the board column
*Objective:* OP-09 — Comms sidebar & counts (recipient parity, disabled-on-empty-selection)
- **Reads a board count** — an app-computed, stream-rendered column count the test asserts against (never a test-written value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- also calls: `board.openComms`, `board.commsSendEnabled`, `board.selectCommsStages`, `board.commsSelectAll`, `board.commsRecipientCount`

`queue/operator.spec.ts:573`

#### OP-09b bulk-invite fan-out conserves (N invitations == N selected, all tokens→invited) and totalaccepted ++1 per accept only
*Objective:* OP-09b — Bulk-invite fan-out conservation + totalaccepted counter [+CF] FIXME (CF-RUNTIME/emulator-infra gap, not a test defect): this case depends on the `bulkReadyInvitation` Cloud Function (onDocumentCreated "bulk invitation/{docid}") fanning out N `studioinvitation` docs. In this emulator runtime that trigger NEVER receives an event: the functions log shows ZERO RunCloudEvent deliveries for the `bulk invitation` collection and ZERO "Beginning execution of us-central1-bulkReadyInvitation" — even though the trigger is registered at startup and the spec creates a real `bulk invitation` doc (now with a unique id, ruling out the deterministic-id re-run case). The seeded cohort tokens stay `status:'queued'` and no `studioinvitation` is written, so the fan-out read-back cannot pass. The SAME non-delivery affects CF-02's queueParticipantPositionUpdate ("queue stage log" creates). This is an emulator/CF event-delivery gap (collections whose onCreate triggers got no events this run), NOT this spec's wiring — forcing it green would assert output the product never produced. See productFindings; tracked for a CF/emulator-side fix.
_(render / smoke check — no transition assertions; read the spec)_

`queue/operator.spec.ts:614`

#### OP-10 applying a tag filter updates the active-filter badge and clearing restores the exact Total
*Objective:* OP-10 — Filters & search (badge == distinct active groups; clear restores exact Total)
- **Filter by tag** — the board re-filters live; assert the recomputed counts
- **Reads Total Participants** — the board’s app-computed total
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- also calls: `board.filterBadgeCount`, `board.openFilters`, `board.clearFilters`

`queue/operator.spec.ts:698`

#### OP-11 Export CSV produces a header and at least one data row per board token (no truncation)
*Objective:* OP-11 — Export CSV (header + one row per token; no truncation)
- **Export CSV** — the app’s exported CSV is asserted against live board state
- **Reads Total Participants** — the board’s app-computed total
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/operator.spec.ts:770`

#### OP-12 B!G Planner: completedToken and stageTokenMap reconcile with the seeded Firestore population
*Objective:* OP-12 — B!G Planner (completedToken / stageTokenMap reconcile with Firestore)
_(render / smoke check — no transition assertions; read the spec)_

`queue/operator.spec.ts:793`

#### OP-13 health-negative: an empty queue renders 0 (not NaN) and a token with a missing profile is still counted
*Objective:* OP-13 — Empty / health-negative (0 not NaN; missing-profile token still counted)
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Stage-moved touchpoint** — the move wrote its expected touchpoint/side-effect
- **Zoom-link** — a studio zoom link, if present, is well-formed
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reads Total Participants** — the board’s app-computed total
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/operator.spec.ts:856`


## Oracle self-test (the suite can detect breakage)
_queue/oracle-selftest.spec.ts · 4 test(s)_

#### healthy config: oracle returns the known real issues only (2 documented orphans)
_(render / smoke check — no transition assertions; read the spec)_

`queue/oracle-selftest.spec.ts:10`

#### detects a DANGLING nextstage edge (broken routing) → not ok
_(render / smoke check — no transition assertions; read the spec)_

`queue/oracle-selftest.spec.ts:17`

#### detects a NEW orphan stage (added but unrouted) → flagged
_(render / smoke check — no transition assertions; read the spec)_

`queue/oracle-selftest.spec.ts:28`

#### detects a variation that cannot reach a terminal (cycle with no exit)
_(render / smoke check — no transition assertions; read the spec)_

`queue/oracle-selftest.spec.ts:36`


## SELFMOVABLE-GATE (P1 #6) — self-movable flag parity + operator-gate cannot be skipped, all 9 variations
_queue/selfmovable-gate.spec.ts · 3 test(s)_

#### V:${v.variationname} — every stage's selfmovable flag matches the flow-model oracle (config parity)
_(render / smoke check — no transition assertions; read the spec)_

`queue/selfmovable-gate.spec.ts:151`

#### V:${v.variationname} — a participant cannot skip the "${gate.stage}" operator gate (REAL board: operator-only forward, no self-advance)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Lists seeded tokens** — reads the seeded participants for the variation

`queue/selfmovable-gate.spec.ts:201`

#### V:${v.variationname} — single-stage parking terminal has no participant self-advance (no gate, no CTA)
*Objective:* V9 (uP! - Prep Hold): single-stage parking terminal — NO operator gate. Assert there is no participant CTA at all (non-self-movable, no self-move edge, ZERO scoped out-edges), and the seeded token sits on its sole stage with no self-move in its product log.
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **Lists seeded tokens** — reads the seeded participants for the variation

`queue/selfmovable-gate.spec.ts:327`


## Studio core — SS-00 … SS-08 (real /dynamicstudio UI + CF/app side-effects)
_queue/studio-core.spec.ts · 9 test(s)_

#### SS-00 My Arena loads for a seeded studio member; no false empty-state
*Objective:* SS-00 — Login + My Arena load (REAL-UI). queue-card count == app's queuesWithStudios; no false "No studios in any queue" banner when a checked-in pairing exists for the acting specialist.
_(render / smoke check — no transition assertions; read the spec)_

`queue/studio-core.spec.ts:241`

#### SS-01 studio buttons render for the acting member; select + live_tv are app-computed
*Objective:* SS-01 — Studio select / counts / live_tv (REAL-UI). button count == app's studioList filter (participants.includes(actingProfileId)); selecting flips the primary style; live_tv count is the app-computed mapStudioLiveAssignment population (read, not hardcoded — keying is data-dependent).
_(render / smoke check — no transition assertions; read the spec)_

`queue/studio-core.spec.ts:269`

#### SS-02 check-in toggle flip writes exactly one studio checkin log row
*Objective:* SS-02 — Check-in toggle + log (REAL-UI). Driving the toggle writes EXACTLY ONE new `studio checkin log` row per flip (ts:854-864). Anti-circularity: we count the log population BEFORE the real toggle, drive the UI, then assert the APP wrote exactly +1 (a delta against the pre-action count — never a read-back of a value the test wrote). On-hold is NOT in play (the seeded pairing has no passed schedule), so the flip is honoured.
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:304`

#### SS-03 waiting list renders only the app-eligible token
*Objective:* SS-03 — Waiting-list (SIM seed precondition + REAL-UI). The app's eligibility filter (ts:804-811) shows a token ONLY if status=='ready' AND currentstage==<studio stage> AND liveassignmentid==null (+ atcmodel/preassign). We SEED one token to be eligible and one to be ineligible (PRECONDITIONS), then assert the APP's rendered waiting list contains the eligible token and EXCLUDES the ineligible one — the value the app COMPUTED from its filter, against the KNOWN seeded eligibility.
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:349`

#### SS-04 Bring To Studio creates exactly one studioinvitation (~+2min expiry, clientresponse null)
*Objective:* SS-04 — Bring To Studio → invite (REAL-UI). The real "Bring To Studio" click creates EXACTLY ONE `studioinvitation` with clientresponse:null and expirydate ≈ now+2min (ts:973-999). Anti-circularity: count the invitation population for the target token BEFORE the click, drive the real button, then assert the APP wrote exactly +1 with the expected shape — a delta against the pre-action count.
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:419`

#### SS-05 participant accept yields a live assignment (app/CF); deny yields none
*Objective:* SS-05 — Participant accept (overlay) + app/CF reaction. Driving the REAL specialist Bring-To-Studio (a 2nd browser context as the participant) then the REAL /queue-web Accept overlay must produce a NEW `live assignment` for that participant (the listener calls assignStudio(), studio.md §3e/§5). Deny must produce NONE. Anti-circularity: assert the live-assignment DELTA the APP/CF wrote against the pre-action population — never a value the test wrote.
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:475`

#### SS-06 assign opens a session: token↔live-assignment↔pairing triangle + one studio stage-log
*Objective:* SS-06 — Assign studio → open session (REAL-UI + CF). Completing the Assign-Specialist dialog writes the §3a coupled cross-ref: token.liveassignmentid==live.docid, token.studioid==pairing.docid== live.studioid, pairing.status=='live', and EXACTLY ONE new `queue stage log` movedthrough 'studio'. Anti-circularity: the stage-log count is a DELTA the APP wrote (assertEveryMoveLogged reads the rows the product produced), and the cross-ref fields are read AFTER the real submit, never written by us.
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:584`

#### SS-07 live-panel Forms widget shows the seeded non-zero count (cross-DB lower bound); ATC reads 0 by design
*Objective:* SS-07 — Live-panel widgets / numbers (REAL-UI cross-DB POSITIVE lower-bound). With a participant in studio, the "Forms submitted by the Participant" widget must render the KNOWN seeded non-zero count (>= SEEDED_FORM_COUNT) — the silent-empty catch (PLAN P1 #7): if the firestore-forms handle failed to init, the widget reads 0 and a parity-with-also-empty-read would still pass. ATC widgets read the OFF-LIMITS firestore-atc (not provisioned) ⇒ 0 by design; we assert that contract, not ATC content. CLOUD NOTE (was emulator-fixme'd; runs as test() on cloud — verified against the baseline 2026-06-07): On the emulator this lower bound could not pass because `src/main.ts` connects ONLY the `(default)` Firestore to the emulator, so the `firestore-forms` named DB the widget queries via `getFirestore(app,"firestore-forms")` (dynamic-studio.ts:758) escaped the emulator and returned EMPTY. On the CLOUD test project firebase.test.json provisions BOTH `(default)` and `firestore-forms`, so the named-DB read works — the emulator artifact no longer applies. The remaining cloud cause of forms==0 was a SEED/CONFIG precondition, not a product defect: the seeded `formsByClient` carry formid==`${run}_form_0`, but the static stage config's `participantform` lists production form ids, so the app's own filter (ts:783) dropped them all. ensureStageAcceptsSeededForm() (below) adds the seeded id to the stage's participantform so the app's filter ADMITS the seeded forms — the assertion is the APP-computed count, never loosened. (The full P2 #7 invariant lives in cross-db-lowerbound.spec.ts.) NOTE: this case also tripped a BENIGN cross-DB SDK error-level log (the seeded `formsByClient.workshopref` points at the `(default)` DB while the doc lives in `firestore-forms`; the SDK logs "…contains a document reference within a different database … It will be treated as a reference in the current database" and the app never derefs `workshopref`). That noise is allowlisted via a shared console-guard change (see the sharedChangeRequests) so it stops failing afterEach in SS-05/06/07 + studio-session + cross-db-lowerbound.
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:692`

#### SS-08 validate AEL writes an interim crossover doc and flips the flag to validated
*Objective:* SS-08 — Validate AEL writes (REAL-UI). Driving the AEL Validate button writes an `interim crossover` doc and flips `participant AEL.flag='validated'` (batch ts:2253-2264). Anti-circularity: the interim-crossover count is a DELTA the APP wrote (vs the pre-action population), and the flag is read AFTER the real click (it was seeded NOT validated). The AEL widget is gated by stageproperty .validateael — if the seeded studio stage does not expose it, the validate button is absent and the case skips with a clear reason (no false green). FIXME (KNOWN PRODUCT FINDING — the brief's keep-as-fixme list; verified live 2026-06-07, do NOT patch src): Opening the AEL/live-panel for the in-studio participant trips the documented dynamic-studio null-guard CRASH — a real `CONSOLE.ERROR: TypeError: Cannot read properties of null (reading 'token')` (the live panel dereferences `this.liveAssignment["token"]` while `liveAssignment` is transiently null, dynamic-studio.ts ~698/761 + the html:50/190+ live-card block). The console-guard rightly fails the case on that uncaught product error, and the panel never settles, so SS-08 times out. This is one of the two null-guard crashes the operator chose NOT to fix (kept as a productFinding); the AEL validate write cannot be exercised through the UI until the product null-guards that access. Marked test.fixme (not faked green) and returned in productFindings; flip back to test() once the product guards `liveAssignment?.["token"]`.
- **Studio pairing (setup)** — ensures the specialist↔participant pairing is checked in

`queue/studio-core.spec.ts:776`


## SS-09…SS-16 — Specialist / Studio session
_queue/studio-session.spec.ts · 11 test(s)_

#### SS-09 mark-procedures widget renders from cross-DB without fatal (ATC off-limits ⇒ 0 procedures, documented)
*Objective:* SS-09 — Mark procedures complete Core (PLAN): status persists on reload. Gap: optimistic-only; row count; cross-DB hydrate errors. The "Mark Completed Procedures" widget renders one button per `cwATClist` entry, sourced from the `firestore-atc` secondary DB — which is OFF-LIMITS and is NOT provisioned for the test project (CLAUDE.md; studio.md SS-07/§ATC EXCLUSIONS). So `markProcedureButtons` is EMPTY by design. The honest, anti-circular assertion here is the APP-COMPUTED render: the live panel mounts for the in-studio participant with ZERO procedure buttons AND no fatal cross-DB hydrate error (the primary silent-gap this case guards: a firestore-atc read that throws would surface as a fatal). The "persists on reload" / row-count assertion is recorded as a FINDING requiring an ATC fixture (out of scope: firestore-atc off-limits) — not faked green.
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:271`

#### SS-10 invite-more opens the dialog without tearing the session down; cancel commits nothing
*Objective:* SS-10 — Invite More Participant Core: session NOT torn down. Gap: cancel = no commit. Drive the REAL "Invite More Participant in this Studio" button → opens the AssignQueueStudio dialog WITHOUT closing the session, then CANCEL (Escape). Anti-circular assertions: • app-computed: the live panel survives (liveParticipantName still visible) → session intact; • APP/CF OUTPUT (known seeded number): cancelling commits NOTHING — the live-assignment is still the SAME single live row and its bonusactivity was NOT written. We read the live-assignment the APP holds (status still 'live', no bonusactivity), a value the PRODUCT owns, after a real cancel.
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:301`

#### SS-11a Zoom Start-Meeting broken-link guard alerts and opens no window
*Objective:* SS-11 — Zoom / OpenVidu join Core: broken-link guard; /joinroom routes. Gap: regen feedback; joinroom resolves openviduroom. Split into the two product paths (recon studio.md SS-11): (a) Zoom path (selectedStudio.openvidu != true, which the seeded pairing satisfies): the Start-Meeting guard. We seed the broken-link sentinel as a PRECONDITION stand-in for the studioZoomLink CF (zoom.stub EMULATOR NOTE (b)) and install the Zoom stub in 'broken' mode, then assert the app's broken-link ALERT fires and NO real window opens (installNoRealWindowGuard). (b) /joinroom routing boundary: navigate directly to /joinroom/<liveassignmentid> with the openviduroom doc seeded (PRECONDITION stand-in) + the OpenVidu stub installed, and assert the APP's state machine RESOLVED the pre-join container and rendered its local-preview controls (values the app computed). Deep LiveKit grid/track state is explicitly NOT asserted (no media server) — routing/pre-join only.
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:353`

#### SS-11b /joinroom resolves the pre-join container + local-preview controls (routing only)
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:391`

#### SS-12 move-next completes the stage: ONE studio stage-log, live-assignment completed, token detached
*Objective:* SS-12 — Move to next stage (complete) Core: token→next, close studio, stage-log, final delivery. Gap: missing stage-log; stale live/pairing; status drift; dangling refs. Drive the REAL move-next button for the legal Diagnostics→DRC edge. Anti-circular: we assert the APP/CF OUTPUT against the KNOWN pre-move log baseline — the PRODUCT wrote EXACTLY ONE new `queue stage log` row tagged movedthrough:"studio" for this transition (NOT a value we wrote; the sim baseline rows, if any, carry movedby 'self'/'operator', never the app's "studio" provenance), the live-assignment flipped to status:'completed', the pairing status cleared, and the token detached (liveassignmentid/studioid null) and advanced to the next stage.
- **Studio link (setup)** — links the token into a live studio session
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/studio-session.spec.ts:430`

#### SS-13 cancelling the move-next confirmation performs NO partial move
*Objective:* SS-13 — Move next (review path) — cancel = no partial move Core: hold-confirm before close. Gap: cancel = no partial move; stale-studio after close. The review/markascompleted path opens a StageIncompleteConfirmation/HoldAlert dialog before closing (ts:1275-1283/1353-1406); CANCELLING it must leave NO partial move. Drive the move-next button, then DISMISS the confirmation, and assert the APP/CF OUTPUT is UNCHANGED from the seeded in-studio precondition: no new stage-log row, token still in studio, live-assignment still live. (We read product state AFTER a real cancel — not a value the test wrote.)
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:523`

#### SS-14 other-studio block renders only the studios the member is invited to (no visibility leak)
*Objective:* SS-14 — Other Studio join (specialist↔specialist) Core: bonus-activity buttons render; join routes. Gap: visibility leak; dead-click alert. The "Other Studio that you are invited to Join" block renders one button per `outsideLiveAssignment` — live-assignments where `bonusactivityparticipant array-contains profileid` (ts:412). We seed (PRECONDITION) one of the OTHER seeded live-assignments with the acting member in its bonusactivityparticipant, then assert the APP-COMPUTED render: the other-studio block shows exactly that one button (visibility, no leak), and a dead-click (no join target) raises the documented "Unable to join" alert (ts:447). Routing to /joinroom is covered by SS-11b.
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:583`

#### SS-15 monitor renders a faithful, bijective card per seeded cohort live-assignment
*Objective:* SS-15 — Arena Studio Activity monitor Core: card count == live-assignment count. Gap: close propagation; dup-pairing flag; raw-id. The monitor renders one card per `live assignment` whose status ∈ ['live','recording'] for the selected queue (the APP's OWN filter, aa.ts:91-99). The seed places EXACTLY 3 such rows for this queue. Anti-circular assertions (all APP OUTPUT vs KNOWN seeded numbers): • cardCount == 3 (the app's filtered render == the seeded live count); • participant↔token map is BIJECTIVE — the 3 cards carry 3 DISTINCT participant ids (PLAN P2 #9: a duplicate/missing mapping shows the wrong person); • REAL CF/app side-effect: closeStudio(0) (developer) flips one live-assignment → 'completed', so the board re-renders with ONE FEWER card (close propagation) — a value the app/CF produced.
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:653`

#### SS-15b a plain eis-only specialist is DENIED the arenastudioactivity monitor (negative role gate)
*Objective:* SS-15b — NEGATIVE role gate (plain eis-only specialist DENIED the monitor) — GAP CLOSED. PLAN P0 #4 wants a plain eis-only specialist to be DENIED `/arenastudioactivity`. The gap is now closed: the route carries `roleGuard(['developer','admin','ah'])` (app.routes.ts) and the component re-gates its data subscriptions behind the same privileged set (arenastudioactivity.component.ts). See specs/validated/04-dynamic-studio.md §3a and the journal 2026-06-10-dynamic-studio-doc-vs-e2e-gaps.md (§Direction-1 #1). Two complementary assertions: • NEGATIVE (the eis-only DENY this gate adds): a seeded EIS-ONLY actor (role `changeagent`, NONE of developer/admin/ah) is ADMITTED past authGuard (its role + profileid are granted in the dashboard route-config) but BOUNCED by roleGuard — so the NEW guard is provably what denies it. • POSITIVE (the gate still admits privileged staff): an admin specialist reaches the monitor and its cards render — confirming the guard tightens access without breaking the privileged path. The seeded ordinary specialists carry `admin`, so they (correctly) keep access; only the eis-only actor demonstrates the denial.
_(render / smoke check — no transition assertions; read the spec)_

`queue/studio-session.spec.ts:755`

#### SS-15b (positive) a privileged role (admin) is admitted and the monitor cards render
- **Studio link (setup)** — links the token into a live studio session

`queue/studio-session.spec.ts:767`

#### SS-16 no-studio member sees the empty-state banner with zero ghost renders
*Objective:* SS-16 — No-studio empty state Core: banner shows; no crash. Gap: empty-state detection; ghost render; empty subscriptions. Act as a profileid that is in NO `queue studio pairing.participants` — the studio resolves zero studios across the member's ongoing queues, so the app sets noStudioInAnyQueue==true and renders the "No studios available…" banner (ts:204/349). Anti-circular assertions (APP OUTPUT): • the no-studio banner is shown (the app's computed empty-state flag); • ZERO studio buttons rendered (no ghost render of a studio the member isn't in); • ZERO waiting-list token cards (empty subscriptions, no ghost tokens); • no fatal console/pageerror (afterEach) — the empty path did not crash.
_(render / smoke check — no transition assertions; read the spec)_

`queue/studio-session.spec.ts:846`


## V3 · ${VARIATION_NAME} — closed-loop walk (BIGNC-00 … 06)
_queue/variations/big-next-cycle.spec.ts · 7 test(s)_

#### BIGNC-00 seed + board load: BIGNC token renders, board column count is app-computed
*Objective:* BIGNC-00 — Seed + board load. The seeded BIGNC cohort token renders on the board, and the board's APP-COMPUTED per-column count reflects the seeded population (read from the live board UI).
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **Reads a board count** — an app-computed, stream-rendered column count the test asserts against (never a test-written value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/big-next-cycle.spec.ts:319`

#### BIGNC-01 [SIM] form self-move AEL → uP! Life Report is a legal scoped self-move, logged once
*Objective:* BIGNC-01 — [SIM] participant form self-move (Accelerated Evolution Level Form → uP! Life Report). The AEL form is `selfmovable:true` (flow-config.md §2 V3 row 2): the Flutter participant advances itself. We use the SIM self-move stand-in (allowed), then assert the PRODUCT's recorded transition is a LEGAL scoped self-move edge and produced exactly one log row — NEVER `read==X after writing X`.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/big-next-cycle.spec.ts:352`

#### BIGNC-02 [REAL-UI] operator Diagnostics → ATC Briefing: scoped target offered, board counts drift, logged
*Objective:* BIGNC-02 — [REAL-UI] operator board move Diagnostics → ATC Briefing. • The board move-dropdown for the BIGNC `Diagnostics` token OFFERS the scoped operator targets (incl. `ATC Briefing` and `Consultation`, the LYL/B!G-family edges) — APP-COMPUTED. • Driving the REAL move to `ATC Briefing` makes the PRODUCT write the queue_token + a `queue stage log` row; we assert the board re-rendered src−1/dst+1 (COUNT-CONSERVED), the new log row records Diagnostics→ATC Briefing as a non-`self` move, and the move is a legal edge.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Studio link (setup)** — links the token into a live studio session
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/big-next-cycle.spec.ts:389`

#### BIGNC-03 [REAL-UI] operator-into-Activity: a live studio session couples the token (live-assignment exists)
*Objective:* BIGNC-03 — [REAL-UI] operator into Activity (a live-assignment is created). The "open a studio" path couples a token to a live studio session (operator.md §3.2: a `live assignment` set live + pairing status:'live' + token status:'instudio'). We wire the seeded studio session as a PRECONDITION (the documented §3a link — studio-session.spec.ts linkTokenIntoLiveSession; allowed: preconditions only), then assert the APP/CF OUTPUT that the live session exists and the token is coupled to it (status:'instudio' + liveassignmentid + studioid) — values the PRODUCT owns. The REAL specialist close of this session is BIGNC-04.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Studio link (setup)** — links the token into a live studio session

`queue/variations/big-next-cycle.spec.ts:451`

#### BIGNC-04 [REAL-UI] specialist close: one studio stage-log, live-assignment completed, token detached
*Objective:* BIGNC-04 — [REAL-UI] specialist close (move the in-studio participant out of the studio). Drive the REAL studio move-next (StudioPage.moveNext → moveStage). The PRODUCT performs the §3f close writes: ONE `queue stage log` row with movedthrough:'studio', the live-assignment flips to 'completed', the pairing status clears, and the token detaches (liveassignmentid/studioid null) and advances to a legal next stage. We assert each against the PRODUCT's output (never a write).
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Studio link (setup)** — links the token into a live studio session
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/big-next-cycle.spec.ts:494`

#### BIGNC-05 [REAL-UI] operator terminal + delivery completion: lands Completed, updateDeliveryStatus("completed")
*Objective:* BIGNC-05 — [REAL-UI] operator terminal + delivery completion. Drive the REAL operator final move to the terminal `Completed`. On the final stage the board additionally calls `guard.updateDeliveryStatus(<token path>, "completed", { eventRequestRef })` (operator.md §3.1.c). We capture that call's ARGUMENTS via the delivery-status spy (the value the APP derived) and assert TERMINAL-REACHED + the board count drift into Completed. The penultimate `Self Evolution Report → Completed` is itself a SELF form; the operator's final move is the board move INTO the terminal that fires the delivery-status completion.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Final completion** — operator moves the token into the terminal stage
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)

`queue/variations/big-next-cycle.spec.ts:583`

#### BIGNC-06 bounded loop ≤2: Diagnostics ↔ DRC round-trip twice via REAL board, 3rd would be rejected (D1)
*Objective:* BIGNC-06 — bounded back-edge / self-loop ≤2 (NOT a SKIP — V3 defines loops/back-edges). V3 has the `Scope Enhancement` self-`[LOOP]` and the DRC→Diagnostics / Consultation→DRC / uP!RCW→Consultation / Review→uP!RCW back-edges (flow-config.md §2 V3). We drive the `Diagnostics ↔ Diagnostics Readiness Changework` round-trip through the REAL operator board TWICE (the max), asserting each hop is a legal scoped edge and the board counts drift, then assert LOOP-BOUND ≤2 holds and a 3rd traversal would be rejected (D1: DRC's ONLY forward edge is the BACK edge to Diagnostics — a DRC→ATC Preparation skip is illegal). (Documented SKIP branch, intentionally unused: if V3 had NO loop/back-edge, this case would be an explicit `test.skip` — but the oracle above proves it does, so we exercise the bounded loop.)
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **Universal-after-hop (journey)** — per-hop trail invariants, journey-indexed
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reads a board count** — an app-computed, stream-rendered column count the test asserts against (never a test-written value)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Lists seeded tokens** — reads the seeded participants for the variation
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/big-next-cycle.spec.ts:654`


## V1 · ${VARIATION_NAME} (${VID}) — closed-loop walk (LYL-FC-WF-01/02/03)
_queue/variations/lyl-first-cycle.spec.ts · 3 test(s)_

#### LYL-FC-WF-01 — walk entry→Completed mixing actors; every transition legal, logged, count-conserved
*Objective:* LYL-FC-WF-01 — the 16-transition happy path (oracle-walked, mixing actors), terminal Completed.
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move

`queue/variations/lyl-first-cycle.spec.ts:377`

#### LYL-FC-WF-02 — Scope Enhancement self-loop is bound ≤ 2 (real board "Send Back"); 3rd would fail loop-bound
*Objective:* LYL-FC-WF-02 — Scope Enhancement self-loop ("Send Back") bound ≤ 2 (a 3rd traversal FAILS).
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/lyl-first-cycle.spec.ts:435`

#### LYL-FC-WF-03 — Diagnostics↔DRC round-trip ≤ 2; DRC→ATC Preparation is illegal (D1 dead-forward)
*Objective:* LYL-FC-WF-03 — Diagnostics ↔ DRC round-trip bound ≤ 2 + the backbone-divergence flag (D1): DRC is DEAD-FORWARD — its ONLY legal exit is the BACK-edge DRC→Diagnostics; the backbone-adjacent DRC→ATC Preparation is ILLEGAL and the board must NOT offer it.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- also calls: `board.assertMoveTargets`

`queue/variations/lyl-first-cycle.spec.ts:525`


## V2 · LYL - Next Cycle — closed-loop walk to terminal (LYL-NC-WF-01)
_queue/variations/lyl-next-cycle.spec.ts · 3 test(s)_

#### walks first→terminal mixing actors; every transition holds the silent-data-gap invariants
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Trail invariants (bundle)** — no-orphan + no-skip + every-move-logged + loop-bound over the full trail
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)
- **Polls board counts** — waits for the board’s recomputed column counts to settle

`queue/variations/lyl-next-cycle.spec.ts:419`

#### form-write integrity: each of the 4 self-movable stages self-moves to exactly its oracle edge, one log row
*Objective:* FORM-WRITE INTEGRITY (flow-config.md §5 V2) — the 4 self-movable FORM stages each write exactly ONE `queue stage log` row on the participant self-move, and that row's prev→curr equals the oracle's selfmove+selfmv:true edge. Reads the rows the PRODUCT/self-move wrote — never a value the test computed. (Driven via the participant-sim self-move stand-in, the allowed Flutter-self-move substitute; the integrity is proven against the PRODUCT log + the oracle, not against the write.)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/lyl-next-cycle.spec.ts:726`

#### journey ${ji}/${FORWARD_JOURNEYS.length - 1} (→ ${terminal}, ${journey.length} stages) walks entry→terminal; invariants hold after every transition
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Trail invariants (bundle)** — no-orphan + no-skip + every-move-logged + loop-bound over the full trail
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)
- **Polls board counts** — waits for the board’s recomputed column counts to settle

`queue/variations/lyl-next-cycle.spec.ts:837`


## V5 · ${VARIATION_NAME} (${VID}) — forward-journey walk + Move-Back ≤2 + scoping
_queue/variations/prodigies-first-cycle.spec.ts · 4 test(s)_

#### PFC-WF-01 · ${label} — walk entry→${journey[journey.length - 1]}; invariants hold after every transition
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **Card-name** — the board card shows the participant name (not blank)
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/prodigies-first-cycle.spec.ts:413`

#### PFC-WF-01 · Scope Enhancement self-loop is bound ≤ 2 (real board "Send Back"); a 3rd fails loop-bound
*Objective:* BOUNDED LOOP ≤2 — the Scope Enhancement self-loop ("Send Back", to==from) is bound ≤ 2 on the REAL board; a 3rd traversal FAILS loop-bound (TEST-THE-TEST). flow-config §2 V5 row "Scope Enhancement".
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/prodigies-first-cycle.spec.ts:503`

#### PFC-WF-01 · Diagnostics move-dropdown is V5-scoped — offers V5 stages, omits a non-V5 queue stage
*Objective:* VARIATION SCOPING (flow-config §5 / §3 D2) — with the token's variationid resolving to the V5 variation doc, the board move-dropdown is scoped to V5's 13 backbone stages: it OFFERS V5 stages and does NOT offer a stage that is in the 30-stage queue but NOT in V5 (the namespace-fix proof). We use a SECOND cohort member positioned at Diagnostics (the walked token's run is untouched).
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- also calls: `board.assertMoveTargets`

`queue/variations/prodigies-first-cycle.spec.ts:579`

#### PFC-WF-01 · specialist studio move-next drives Diagnostics → ATC Preparation on the REAL studio surface
*Objective:* SPECIALIST STUDIO HOP — a Diagnostics → ATC Preparation forward decision driven through the REAL Dynamic Studio move-next button (the specialist surface), so the suite MIXES the operator board AND the specialist studio for V5's central studio-engine stage. Wires the in-studio link as a PRECONDITION (token instudio + a live-assignment + a live pairing the acting member belongs to), then drives the REAL moveNext and asserts the PRODUCT's stage-log row + token advance + the universal invariants. If the live panel / move-next button cannot render in this environment, the test records a FINDING and SKIPs — the sim is NEVER substituted for the real specialist move. WHY ATC Preparation (not ATC Briefing): the studio move-next handler `moveStage(stage, markascompleted)` (dynamic-studio.component.ts:1274) routes a `markascompleted:true` forward hop (ATC Briefing, "Send for ATC Briefing" — sample-queue-config Diagnostics.nextstage) through the `inviteMore(true)` + `HoldAlertDialogComponent` REVIEW branch (ts:1353-1406, recon studio.md SS-12 §181), which requires an Assign-Specialist submission the shared `StudioPage.moveNext` page object does not drive. A `markascompleted:false` forward hop instead routes through the `StageIncompleteConfirmationComponent` (ts:1274/1284) that `moveNext` DOES drive (fills the required reason + Submit). ATC Preparation is the V5 `markascompleted:false` forward operator edge from Diagnostics (flow-config.md §2 V5 row Diagnostics: `OP→ATC Preparation {¬done}`), so it exercises a REAL specialist studio forward move end-to-end without a page-object change. (On the emulator this case skipped via the finding hatch because the live panel never mounted; on real cloud Firestore it mounts, surfacing that the chosen ATC-Briefing target needs the un-drivable review branch — the retarget is the wiring fix, never a sim substitution.)
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)

`queue/variations/prodigies-first-cycle.spec.ts:660`


## V4 · Prodigies - Next Cycle — closed-loop walk + every forward journey (PNC-WF-01/02/03 + PNC-FWD)
_queue/variations/prodigies-next-cycle.spec.ts · 4 test(s)_

#### PNC-WF-01 walks Evolution Prep Orientation → Completed mixing actors; invariants hold after every transition; the Review→Self-Evolution-Report operator move is driven on the REAL board with board-rendered count-drift
*Objective:* PNC-WF-01 — full mixed-actor walk entry→terminal (forward journey J4), invariants after EVERY transition, with the load-bearing operator move driven through the REAL board (count-drift).
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **All-invariants-after-hop** — trail invariants + count-conservation after the hop
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/prodigies-next-cycle.spec.ts:242`

#### PNC-FWD ${label} — walk entry→terminal mixing actors; every transition legal, logged, oracle-scoped, count-conserved; >=1 REAL operator/board move
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **All-invariants-after-hop** — trail invariants + count-conservation after the hop
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/prodigies-next-cycle.spec.ts:313`

#### PNC-WF-02 the Scope Enhancement and Diagnostics self-loops are bounded ≤2 (a 3rd traversal fails the loop guard)
*Objective:* PNC-WF-02 — bounded loops: the Scope Enhancement studio self-LOOP and the Diagnostics self-LOOP may be traversed ≤2 times; a 3rd traversal MUST fail assertLoopBound (flow-config.md §2 / risk 13).
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)

`queue/variations/prodigies-next-cycle.spec.ts:397`

#### PNC-WF-03 the no-skip invariant rejects the V4 drift skips: DRC→ATC-Preparation (D1) and Diagnostics/ATC-Briefing→Consultation (D2) are illegal oracle edges
*Objective:* PNC-WF-03 — backbone↔oracle DRIFT negatives for V4 (flow-config.md §3): the no-skip invariant must reject backbone-adjacent-but-oracle-illegal moves (proves assertNoStageSkipped reads the ORACLE). D1: DRC is DEAD-FORWARD — only scoped out-edge is BACK→Diagnostics; DRC → ATC Preparation is ILLEGAL. D2: Consultation is OFF the forward happy path — Diagnostics → Consultation / ATC Briefing → Consultation are ILLEGAL for V4 (Consultation is reached only via self-LOOP or uP!RCW BACK-edge).
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **All-invariants-after-hop** — trail invariants + count-conservation after the hop
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input

`queue/variations/prodigies-next-cycle.spec.ts:438`


## V8 · ${VARIATION_NAME} (${VID}) — closed-loop walk (UP3-WF-01: happy + Diagnostics self-loop & Diagnostics↔DRC ≤2 + scoping)
_queue/variations/up-3rd-cycle.spec.ts · 4 test(s)_

#### UP3-WF-01-HAPPY — walk entry→Completed mixing actors (SIM + REAL board + REAL studio); every transition legal, logged, count-conserved
*Objective:* UP3-WF-01-HAPPY — the canonical forward walk (oracle-walked, MIXING ALL THREE drivers), terminal Completed. 12 product-logged transitions = the V8 backbone MINUS DRC (D1) and Consultation (D2), on the short ATC Briefing→Self Evolution Report branch. Driver mix: sim self/auto hops + REAL operator board hops + ONE REAL specialist studio hop (Scope Enhancement→Evolution Mapping Activity).
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted

`queue/variations/up-3rd-cycle.spec.ts:612`

#### UP3-WF-01-LOOP — Diagnostics self-loop ≤ 2 AND Diagnostics↔DRC round-trip ≤ 2 (D1 dead-forward); a 3rd of either fails
*Objective:* UP3-WF-01-LOOP — the Diagnostics SELF-LOOP ≤ 2 AND the Diagnostics↔DRC round-trip ≤ 2 (the brief's "Diagnostics self-loop plus Diagnostics and DRC at most 2"). A 3rd traversal of EITHER edge FAILS. All driven on the REAL board.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- **Reads stage counts** — reads the board’s app-computed counts by stage name
- also calls: `board.assertMoveTargets`

`queue/variations/up-3rd-cycle.spec.ts:702`

#### UP3-WF-01-SCOPE — oracle parity + variation-scoped Diagnostics dropdown (EXACTLY 5 edges, no Consultation, no Self Evolution Report) + formref presence
*Objective:* UP3-WF-01-SCOPE — the oracle-parity sweep: the static build()/oracle() baseline + the variation-scoped Diagnostics move-dropdown on the REAL board (EXACTLY 4 distinct non-loop targets; →Consultation absent (D2) AND →Self Evolution Report absent (the V6/V7↔V8 discriminator — PLAN P1 #12)), plus the FORMREF PRESENCE fact (the V8 Diagnostics stage references participant forms).
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- also calls: `board.assertMoveTargets`

`queue/variations/up-3rd-cycle.spec.ts:825`

#### journey ${ji}/${FORWARD_JOURNEYS.length - 1} (→ ${terminal}, ${journey.length} stages) walks entry→terminal; invariants hold after every transition
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Trail invariants (bundle)** — no-orphan + no-skip + every-move-logged + loop-bound over the full trail
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)
- **Reads stage counts** — reads the board’s app-computed counts by stage name
- **Polls board counts** — waits for the board’s recomputed column counts to settle

`queue/variations/up-3rd-cycle.spec.ts:983`


## V6 · ${VARIATION_NAME} (${VID}) — closed-loop walk (UPFC-HAPPY/LOOP/GAP)
_queue/variations/up-first-cycle.spec.ts · 3 test(s)_

#### UPFC-HAPPY — walk entry→Completed mixing actors; every transition legal, logged, count-conserved
*Objective:* UPFC-HAPPY — the canonical forward walk (oracle-walked, mixing actors), terminal Completed. 15 stages / 14 product-logged transitions = the V6 backbone MINUS DRC (D1) and Consultation (D2).
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)

`queue/variations/up-first-cycle.spec.ts:454`

#### UPFC-LOOP — Diagnostics↔DRC round-trip ≤ 2 (D1 dead-forward) AND Consultation back-loop ≤ 2; a 3rd of either fails
*Objective:* UPFC-LOOP — the two V6 back-loops are each bound ≤ 2 (a 3rd traversal FAILS). "DRC and Consultation back-loops twice" (the brief): the Diagnostics↔DRC round-trip AND the Consultation back-loop.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- also calls: `board.assertMoveTargets`

`queue/variations/up-first-cycle.spec.ts:492`

#### UPFC-GAP — oracle parity: known-orphan/dangling baseline, and the variation-scoped Diagnostics dropdown (6 targets, no Consultation, keeps Self Evolution Report)
*Objective:* UPFC-GAP — the oracle-parity sweep: the static build()/oracle() baseline + the variation-scoped Diagnostics move-dropdown on the REAL board (the V6↔V8 discriminator + the D2 no-Consultation fact).
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Universal-after-hop (bundle)** — after each hop, the trail invariants hold for the moves so far
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Operator move (real board)** — drives one operator hop on the real board (move-dropdown + PeopleInvolved confirm); the APP writes the move
- also calls: `board.assertMoveTargets`

`queue/variations/up-first-cycle.spec.ts:657`


## V7 · uP! - Next Cycle — closed-loop walk to terminal (WF-uPNextCycle-001)
_queue/variations/up-next-cycle.spec.ts · 4 test(s)_

#### walks first→terminal mixing actors; every transition holds the silent-data-gap invariants; ATC Briefing never offers Consultation
*Objective:* WF-uPNextCycle-001 — the full mixed-actor walk entry→terminal, invariants after EVERY transition, with the next-cycle studio move and the terminal board spine driven through the REAL UI.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Trail invariants (bundle)** — no-orphan + no-skip + every-move-logged + loop-bound over the full trail
- **Move-targets offered/absent** — the board’s move-dropdown offers exactly the oracle-legal operator targets and NOT illegal/backbone-only skips — read-only, commits nothing
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)
- **Reads the log** — reads the app-written `queue stage log` rows
- **Reads stage counts** — reads the board’s app-computed counts by stage name
- **Polls board counts** — waits for the board’s recomputed column counts to settle
- also calls: `board.assertMoveTargets`

`queue/variations/up-next-cycle.spec.ts:415`

#### form-write integrity: each of the 4 self-movable stages self-moves to exactly its oracle edge, one log row
*Objective:* FORM-WRITE INTEGRITY (flow-config.md §5 V2/V7) — the 4 self-movable FORM stages each write exactly ONE `queue stage log` row on the participant self-move, and that row's prev→curr equals the oracle's selfmove+selfmv:true edge. Reads the rows the PRODUCT/self-move wrote — never a value the test computed. (Driven via the participant-sim self-move stand-in, the allowed Flutter-self-move substitute; the integrity is proven against the PRODUCT log + the oracle, not against the write.)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/up-next-cycle.spec.ts:830`

#### no-skip invariant rejects the V7 drift skips: DRC→ATC-Preparation (D1) and Diagnostics/ATC-Briefing→Consultation (D2)
*Objective:* DRIFT NEGATIVES (flow-config.md §3 D1/D2) — assertNoStageSkipped must REJECT the V7 backbone-adjacent-but-oracle-illegal moves, proving it reads the ORACLE, not the stages[] array. D1: DRC → ATC Preparation (DRC is dead-forward; only legal exit is BACK→Diagnostics). D2: Diagnostics → Consultation AND ATC Briefing → Consultation (Consultation off the V7 happy path). We write the ILLEGAL hop via the stand-in (a real product `queue stage log` row the guard will read), then assert the guard's VERDICT (it throws) — the asserted value is the verdict, never a read-back.
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **No-fatal** — no fatal console error / app crash during the flow (console guard)
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)

`queue/variations/up-next-cycle.spec.ts:866`

#### journey ${ji}/${FORWARD_JOURNEYS.length - 1} (→ ${terminal}, ${journey.length} stages) walks entry→terminal; invariants hold after every transition
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **No-stage-skipped** — each transition is an oracle-legal edge for this variation (checked vs the flow-model, not test input)
- **Every-move-logged {minNonSelf}** — every transition wrote a log row AND ≥minNonSelf have movedby≠self → operator moves really happened, not sim-only — the anti-circular core
- **Loop-bound** — no stage re-entered beyond the bound — catches runaway loops
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Count-conserved** — a board move shifts source −1 / dest +1 with Σ of all columns unchanged (the board’s own recomputed counts)
- **Trail invariants (bundle)** — no-orphan + no-skip + every-move-logged + loop-bound over the full trail
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Operator move (real board)** — drives the real move-dropdown + PeopleInvolved confirm; the APP performs the queue_token + log write
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads all board counts** — snapshots every column’s app-computed count (the before/after for count-conservation)
- **Reveals card** — pages the participant’s card into the board (read-only, no state change)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **CF side-effect spy** — spies the delivery-status Cloud Function so its real calls can be asserted
- **CF side-effect assert** — asserts the delivery-status Cloud Function fired as expected (real CF, not mocked)
- **Reads the log** — reads the app-written `queue stage log` rows
- **Reads stage counts** — reads the board’s app-computed counts by stage name
- **Polls board counts** — waits for the board’s recomputed column counts to settle

`queue/variations/up-next-cycle.spec.ts:991`


## V9 · ${VARIATION_NAME} (${VID}) — single-stage parking (UPH-00/01/02 + journey walk)
_queue/variations/up-prep-hold.spec.ts · 4 test(s)_

#### UPH-00 — oracle: single stage IS the terminal (0 out-edges), selfmovable false, backbone len 1; orphan/dangling baseline; 1 forward journey
*Objective:* UPH-00 — STATIC ORACLE parity (no UI): entry==terminal, ZERO out-edges, selfmovable false, backbone length 1, the documented global-orphan / no-dangling baseline, AND the forward-journey enumerator yields exactly the singleton journey.
_(render / smoke check — no transition assertions; read the spec)_

`queue/variations/up-prep-hold.spec.ts:246`

#### UPH-01 — board renders the parking column with the lone token, move-dropdown offers ZERO enabled targets, count stable
*Objective:* UPH-01 — THE REAL BOARD: one simple column holds the lone token; the move-dropdown is EMPTY (zero enabled targets); the board's column count is STABLE (no drift). APP-computed, no move written.
- **No-orphan** — every logged move points at a real prior stage (reads the app-written `queue stage log`)
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **No-enabled-targets** — a terminal/parking token exposes zero pickable destinations
- **Reads the trail** — reads the app-written transition log — the value every guard asserts on (never a test-set value)
- **Reads a board count** — an app-computed, stream-rendered column count the test asserts against (never a test-written value)
- **Selects the queue** — loads the live queue_token stream onto the board (the suite’s setup)
- also calls: `board.assertNoEnabledMoveTargets`

`queue/variations/up-prep-hold.spec.ts:291`

#### UPH-02 — no-move/no-log: participant self-move never fires (selfmovable false), 0 stage-log rows, vacuous invariants hold
*Objective:* UPH-02 — THE NO-MOVE / NO-LOG INVARIANT: the participant-sim emits NO self-move (selfmovable:false negative gate); ZERO stage-log rows; the six invariants hold at zero transitions. PRODUCT-read.
- **Zero-transition** — a parked/terminal token logged no spurious transitions
- **Participant self-move (sim)** — the Admin-SDK participant stand-in performs the self-move write — desktop analogue of a real form submit (the MOBILE suite does this through the real app)
- **Reads token stage** — reads the token’s current stage — an app value, not a test input
- **Reads the log** — reads the app-written `queue stage log` rows

`queue/variations/up-prep-hold.spec.ts:360`

#### UPH-WALK[${j}] — forward journey {${label}} holds at entry==terminal with zero transitions; six invariants hold
- **Terminal-reached** — the token rests on the terminal stage, which exposes zero scoped out-edges
- **Zero-transition** — a parked/terminal token logged no spurious transitions
- **Reads token stage** — reads the token’s current stage — an app value, not a test input

`queue/variations/up-prep-hold.spec.ts:406`


## P3 #13 — WatchVideos BIG assignment crash-detectable smoke
_queue/watch-videos.spec.ts · 1 test(s)_

#### the WatchVideos dialog opens from the PAB Video action and renders without a fatal error / console error
_(render / smoke check — no transition assertions; read the spec)_

`queue/watch-videos.spec.ts:84`
