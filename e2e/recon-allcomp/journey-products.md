# Journey & Products — e2e recon

> Written 2026-06-10. Covers the full cycle: catalog authoring (Product Designer routes), per-participant purchase management (participantpurchase/:pid, participantproduct, participantdeliverysequence/:pid, journeysupport/:pid), pipeline & CRM screens (salesleads, onboardingremarks, onboarding-pipeline), and summary dashboards (productinitiated-dashboard, delivery-dashboard, overall-dashboard, sales-report, opportunities).

---

## Routes (path -> component file:line, role/guard, ATC? note)

All routes: `canActivate:[authGuard]` (`src/app/app.routes.ts`, lines 9–32, 212–221).  
The `authGuard` (`AuthguardService.getRoles()`) authenticates the user; individual components check roles via `guard.getRoles()` but most checks are **commented-out** (see risk R-01 below).

| Path | Component file | Role/guard | ATC? |
|---|---|---|---|
| `addjourney` | `Product Designer/addjourney/addjourney.component.ts` | authGuard; role check commented out (ts:49–57) | No. Displays `atcmodel` column (config ref) — NOT ATC data collections |
| `addproduct` | `Product Designer/add-product/add-product.component.ts` | authGuard; role check commented out (ts:50–59) | No. Shows `atcmodel` field on product (config ref from `atc model` catalog, NOT `atc_alpha` etc.) |
| `addpackage` | `Product Designer/addpackage/addpackage.component.ts` | authGuard; role check commented out (ts:45–54) | No |
| `packagedesign` | `Product Designer/package-design/package-design.component.ts` | authGuard; role check commented out (ts:44–53) | No |
| `journeyproductmap` | `Product Designer/journey-product/journey-product/journey-product.component.ts` | authGuard | No |
| `productdelivery` | `Product Designer/product-delivery/product-delivery.component.ts` | authGuard | No |
| `deliverysequence` | `Product Designer/delivery-sequence/delivery-sequence.component.ts` | authGuard | No |
| `deliveryactivities` | `Product Designer/delivery-set/delivery-set.component.ts` | authGuard | No |
| `formtemplate` | `Product Designer/delivery-set/formtemplate/formtemplate.component.ts` | authGuard | No — but NOTE: reads/writes to a **named Firestore DB** `firestore-forms` (ts:92), separate from default DB |
| `participantpurchase/:pid` | `Participants Profile Management/journey-product-purchase/journey-product-purchase.component.ts` | authGuard | No |
| `participantproduct` | `Participants Profile Management/participant-product/participant-product.component.ts` | authGuard | No |
| `participantdeliverysequence/:pid` | `Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts` | authGuard | No |
| `journeysupport/:pid` | `Journey Onboarding/journeyplan/journeyplan.component.ts` | authGuard | No |
| `salesleads` | `Journey Onboarding/saleslead/saleslead.component.ts` | authGuard; role check commented out (ts:94) | No |
| `onboardingremarks` | `Journey Onboarding/onboarding-remark/onboarding-remark.component.ts` | authGuard | No |
| `opportunities` | `Journey Onboarding/journeycoach-opportunities/journeycoach-opportunities.component.ts` | authGuard | No |
| `productinitiated-dashboard` | `Journey Onboarding/product-initiation-dashboard/product-initiation-dashboard.component.ts` | authGuard | No |
| `delivery-dashboard` | `Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component.ts` | authGuard | No |
| `onboarding-pipeline` | `Journey Onboarding/onboarding-pipeline/onboarding-pipeline.component.ts` | authGuard | No; reads **external salescrm Firebase project** (ts:240 `getApp('salescrm')`) |
| `overall-dashboard` | `Journey Onboarding/overall-dashboard/overall-dashboard.component.ts` | authGuard | No; calls external Watson + salescrm CF HTTP endpoints (ts:241–250) |
| `sales-report` | `Journey Onboarding/sales-dashboard-clone/sales-dashboard-clone.component.ts` | authGuard | No |

**ATC NOTE on `product-atcmodel` sub-screens:** The `Product Designer/product-atcmodel/` directory holds view/create components for the `atc model` **config catalog** (ts:43 `collection(this.firestore, 'atc model')`). This is reference-only config — NOT the off-limits ATC data collections — but the sub-routes for it are not in the target route list above (they are accessed via the `addproduct` / `addjourney` dialogs). See §ATC Exclusions.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

### Default Firestore DB (fir-sample-aae4a / starlabs-test)

| Collection | R/W | Purpose |
|---|---|---|
| `journey` | read | Catalog of journey types (48 docs); used as source of truth for all journey pickers |
| `products` | read | Product catalog (104 docs); displayed in add-product table and product pickers |
| `package` | read | Package catalog (49 docs); pricing wrapper picker |
| `package design` | read/write | Package design entries — package-design.component.ts:79 writes via `AddPackageDesignComponent` dialog |
| `journey-to-product` | read/write | Journey-to-product mapping (41 docs); journeyproductmap writes via `map-journey-product` dialog, ts:166 `setDoc` |
| `productToDeliverySequence` | read/write | Product→delivery options mapping; product-delivery.component.ts:139 reads; delivery-sequence.component.ts writes |
| `participantjourneyproduct` | read/write | **Purchase record of truth** (5,144 docs); `journeystatus`, `onboarded`, `subscriptionstart`/`subscriptionend`; written by journey-product-purchase.component.ts:1039, journeyplan:656, onboarding-pipeline:769, salesleads (via CF payload) |
| `journeyproductpurchase` | read/write | Per-purchase record; `watsonpurchaseid`, `watsonpurchaselabel`; written by journey-product-purchase.component.ts:1060 |
| `participantsproduct` | read/write | Participant product enrollments (38,963 docs); written by journey-product-purchase.component.ts:997 (`setDoc`/`writeBatch`) and onboarding-remark/create-watson-profile dialogs |
| `salesleads` | read/write | Sales pipeline; saleslead.component.ts:95 (read stream), :627 (write `updateDoc status`), :627 + breakthroughapprovedleads CF call on approve |
| `participant metadata` | read/write | Participant profile data; journey-product-purchase reads at :250; participant-delivery-sequence.component.ts:566 writes `updateDoc` |
| `participant purchase logs` | read | Audit log of purchase changes; journey-product-purchase:395 reads |
| `participantdeliverysequence` | read/write | Delivery sequence per participant; participant-delivery-sequence:541 writes `setDoc`; journeyplan reads |
| `deliverables` | read/write | Delivery items; participant-delivery-sequence:365 creates (`setDoc`); :521 updates |
| `appointments` | read/write | Appointment bookings; participant-delivery-sequence:102 reads; journeyplan:662 updates `attended` |
| `email archive` | write | Queued outbound emails (Postmark trigger); onboarding-remark:740 `setDoc` when "send onboarding email" checked |
| `delivery forms` | read/write | Form type catalog; delivery-set, product-delivery, formtemplate read; formtemplate:236 writes |
| `delivery report` | read | Report type catalog |
| `delivery events` | read | Event type catalog |
| `delivery queue` | read | Queue type catalog |
| `delivery fieldwork` | read | Fieldwork type catalog |
| `appointmenttype` | read | Appointment type catalog |
| `email templates` | read | Email templates for onboarding remark (ts:272, :297) |
| `classify` | read | Postmark server config; onboarding-remark:167 reads `classify/postmarkserver` doc |
| `users_roles` | read | Role lookup; product-initiation-dashboard:194, journeycoach-opportunities:106, onboarding-pipeline:424 |
| `profile_data` | read | Profile lookup; onboarding-pipeline:400, participant-delivery-sequence:131, journeyplan:104 reads |
| `atc model` | read | ATC model **config catalog** (reference-only, NOT off-limits data) — product-atcmodel views this |
| `adsinvestment` | read | Ads investment data; overall-dashboard:846 |
| `FCM_token` | read | Push token registry; overall-dashboard:921 (READ ONLY — never writes) |
| `expenseplanning` | read | Expense planning; overall-dashboard:1139 |
| `workshopconfiguration` | read | Workshop config; overall-dashboard:935 |
| `workshop participant enrolled` | read | Workshop enrollment; overall-dashboard:939 |
| `queue_token` | read | Queue token data; formtemplate:363 reads for form pre-fill |
| `queue stage log` | write | Stage-log audit; formtemplate:737 writes when form submitted on a queue token |
| `solar voice playlist` | read | Content list; journeyplan:147 |

### Named Firestore DB: `firestore-forms`

| Collection | R/W | Purpose |
|---|---|---|
| `formsByClient` | read/write | Participant-submitted form data; formtemplate.component.ts:667 writes |
| `temporary_forms` | read/write | Draft form state; formtemplate:171 (draft id), :867/894 (write draft) |
| `formsByClient log` | write | Form submission audit; formtemplate:781 |

### External Firebase project: `watson` (watsonproduction-becde)

| Collection | R | Purpose |
|---|---|---|
| `Participants` | read | Watson participant lookup by email/name; journey-product-purchase:276, create-watson-profile:224 |
| `ParticipantPurchases` | read | Watson commercial purchase records; journey-product-purchase:290, create-watson-profile:196 |
| `Payment Schedule` | read | Watson payment schedule; journeyplan:602, create-watson-profile:186 |

### External Firebase project: `salescrm` (salesleadcrm / salescrm-test-19)

| Collection | R/W | Purpose |
|---|---|---|
| `userRegister` | read | SalesCRM user lookup; onboarding-pipeline:308, :339 |
| `pipelines` | read/write | SalesCRM deal pipelines; onboarding-pipeline:353 reads, writes new leads :1149 |
| `leads` | read/write | SalesCRM leads; onboarding-pipeline:853 reads, :1149 creates new lead |
| `userRoles` | read | SalesCRM roles; onboarding-pipeline:424 |
| `dealstage` | read | SalesCRM deal stages; add-pipeline-dialog:161 |
| `person` | read | SalesCRM person search; onboarding-pipeline:1135 |

---

## Config drivers (docs/flags that change behavior)

| Driver | Behavior | Code location |
|---|---|---|
| `environment.firebase.projectId` | Switches between test and prod URLs for salescrm CF, watson CF, salescrm Firebase app config; saleslead:642/644, overall-dashboard:241–245 | `src/environments/environment*.ts` |
| `journey-to-product` collection | Controls which products auto-populate for a journey in the purchase form; journey-product-purchase:233 `getDocs('journey-to-product')` | `journey-product-purchase.component.ts:233` |
| `package` catalog | Drives the package picker on product rows; journey-product-purchase:221 | `journey-product-purchase.component.ts:221` |
| `classify/postmarkserver` Firestore doc | Holds Postmark sender IDs/server tokens for email dispatch; onboarding-remark reads this before offering email templates | `onboarding-remark.component.ts:167` |
| `FIXED_JOURNEY_ID = 'SOORkBYIzPKbrFEcXzeQ'` | Hard-coded uP! journey ID used for onboarding email template filter | `onboarding-remark.component.ts:23` |
| `paymentplan != null` in `participantjourneyproduct` | Marks a participant as "onboarded" in the productinitiated-dashboard awaiting/onboarded split; product-initiation-dashboard:1215 | `product-initiation-dashboard.component.ts:1215` |
| `onboarded == true` in `participantjourneyproduct` | Drives all onboarded/to-be-onboarded splits across dashboards | `product-initiation-dashboard.component.ts:1270`, `overall-dashboard.component.ts:530` |
| `deliverymode == 'Priority Mode'` in `participantsproduct` | Drives the engagement-opportunity tab in productinitiated-dashboard | `product-initiation-dashboard.component.ts:1336` |

---

## Cloud Functions involved (name -> trigger -> side-effect a test can assert)

| CF name | Trigger | Assertable side-effect |
|---|---|---|
| `participantsproductinitiated` | **Candidate** (not confirmed as callable in app source — likely Firestore-triggered onWrite of `participantsproduct`). Not found via `httpsCallable` grep. | If triggered: may update `participantjourneyproduct.onboarded` or related fields. **UNCONFIRMED — treat as risk R-06.** |
| `salesCRMConvertedLeads` | **Candidate** (not found in app source as httpsCallable). Likely triggered from salesleads approve flow or via `breakthroughapprovedleads` HTTP CF (saleslead:642/644). | If present: writes a converted-lead record in salescrm. **UNCONFIRMED.** |
| `salesCRMProfilestatus` | **Candidate** — not found in app source. May be a background CF that syncs profile statuses. **UNCONFIRMED.** |  |
| `journey_to_pmd` | **Candidate** — named in task brief; not confirmed via grep. May write to `participantjourneyproduct` or a PMD (participant metadata) collection. **UNCONFIRMED.** |  |
| `productsdata_to_pmd` | **Candidate** — named in task brief; not confirmed. | May sync product data to participant metadata. |
| `purchaselabel_to_pmd` | **Candidate** — named in task brief; not confirmed. | May sync purchase labels to participant metadata. |
| `createWatsonProfile` | Invoked from `create-watson-profile.component.ts` (the dialog opened from `saleslead.component.ts:508`). NOT as `httpsCallable` — the dialog writes directly to Firestore (watson DB + starlabs DB via batch). The **Watson profile creation** is a multi-step writeBatch across watson DB and starlabs DB (create-watson-profile.component.ts:~400–700). | Side-effect: `salesleads` doc gets `participantjourneyproductid` / `journeyproductpurchaseid` written; `participantjourneyproduct` and `participantsproduct` docs created/updated. These are the ASSERTABLE outcomes. |
| `participantJourneyproductSocialcommitupdate` | **Candidate** — not found via httpsCallable grep. May update `participantjourneyproduct` social commitment fields. **UNCONFIRMED.** |  |
| `dashboardPaymentplanWatsonRequest` | **Candidate** — not found via httpsCallable grep. May fetch payment plan data from Watson. |  |
| `createRazorpayOrder` | **Candidate** — NOT found in the Angular app source at all (no Razorpay references found in the codebase). Likely a server-side / mobile-only CF. **OUT OF SCOPE** for this Angular suite. |  |
| `breakthroughapprovedleads` (external salescrm CF) | Called via `http.get(url)` at saleslead.component.ts:647, :1799 on sale approval. URL: `us-central1-salesleadcrm.cloudfunctions.net/breakthroughapprovedleads` | Assertable: `salesleads` doc `status` field is updated to `'approved'` (starlabs DB) BEFORE the CF call; CF writes to external salescrm project (not assertable from starlabs test project). |
| `sendGrowthDataToBusinessDashboard` (watson CF) | Called via `http.get()` in overall-dashboard:249 on init | Provides thisMonthDue / nextMonthDue numbers displayed in the dashboard. Stub this call — never assert its external data. |
| `sendIncentiveDataToBusinessDashboard` (salescrm CF) | Called via `http.get()` in overall-dashboard:250 on init | Provides incentive count/sum. Stub this call. |

---

## External services to stub (call sites file:line)

| Service | Call site | Stub approach |
|---|---|---|
| Watson Firebase project (`watsonproduction-becde`) | `journey-product-purchase.component.ts:191` (`getFirestore(getApp("watson"))`), `saleslead.component.ts:90` (`guard.initializeWatson()`), `journeyplan.component.ts:598+`, `create-watson-profile.component.ts:152` | Intercept `getApp("watson")` / configure a mock Firestore handle for the "watson" named app in the test environment. In the cloud test project, Watson reads will fail or return empty — acceptable for NON-Watson tests. Tests that exercise the Watson-join UI path (e.g. purchase form's Watson purchase dropdown) need the stub. |
| salescrm Firebase project | `onboarding-pipeline.component.ts:240` (`getApp('salescrm')`), add-pipeline-dialog:161 | Block or stub `getApp('salescrm')` — the pipeline screen gracefully shows an `accessError` message when salescrm config is missing (ts:234). Tests can assert the error message renders, not the salescrm data. |
| `breakthroughapprovedleads` HTTP CF (external) | `saleslead.component.ts:642/644` + `:1795/1797` (via `HttpClient.get()`) | Playwright `page.route()` — intercept the `*.cloudfunctions.net/breakthroughapprovedleads*` URL and return `{status: 'ok'}`. |
| `sendGrowthDataToBusinessDashboard` (Watson CF) | `overall-dashboard.component.ts:249` | `page.route()` stub for `us-central1-watsonproduction-becde.cloudfunctions.net/sendGrowthDataToBusinessDashboard` |
| `sendIncentiveDataToBusinessDashboard` (salescrm CF) | `overall-dashboard.component.ts:250` | `page.route()` stub |
| Postmark (email dispatch) | `onboarding-remark.component.ts:740` — writes to `email archive` collection which a Postmark-watching CF reads. No direct HTTP call in Angular. | No direct stub needed in Angular tests — the `email archive` write is a Firestore write. The watching CF (external) is never invoked by the Angular test. Assert the `email archive` doc was written. |
| FCM push notifications | `overall-dashboard.component.ts:921` (reads `FCM_token` collection only — no push send). No push send in this group. | No stub needed — FCM reads from Firestore only. |
| Razorpay | Not present in Angular app source. | N/A |
| XLSX file download (client-side) | `saleslead.component.ts:471` (`XLSX.write()`). Browser download. | `page.waitForEvent('download')` in the test — no HTTP stub needed. |

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Role in `users_roles` | Landing / screens used | Gate status |
|---|---|---|---|
| Admin / AH | `admin:true` or `ah:true` | All routes; all auth gates pass. Most commented-out role checks default to open. | `authGuard` only (all role checks commented out in Product Designer and Journey Onboarding components) |
| Integrator | `integrator:true` | Product Designer catalog routes (commented-out checks suggest this was the intended restriction). | Effectively open today — commented out |
| Journey Coach | `journeycoach:true` in `users_roles` | `opportunities` route — `journeycoach-opportunities` queries `users_roles where journeycoach==true` (ts:106) and filters `participantjourneyproduct` to their assigned participants | No component-level gate; `authGuard` only |
| Sales / Anyone with login | Auth only | `salesleads`, `onboarding-pipeline`, `onboardingremarks` | Only `authGuard`; role checks commented-out (ts:94 in saleslead) |
| Developer | `developer:true` | No explicit gate in this group (was used in queue manager for `cloud_done` button) | N/A here |

**Key finding (R-01):** Nearly every role check in this group is **commented out**. Any authenticated user can access all routes. The only real gate is `authGuard` (requires Firebase Auth session). This simplifies seeding — one test user with any role suffices for all route coverage.

---

## Key user flows (numbered, end-to-end, with the Firestore writes each step produces)

### Flow 1 — Catalog: Add a new journey (addjourney)
1. Admin navigates to `/addjourney` → `journey` collection loaded via `collectionData(orderBy('sequence'))` (ts:75)
2. Clicks "Add Journey" → `JourneyEntryComponent` dialog opens
3. Fills journey name, sequence, selects atcmodel (config ref) → dialog writes `setDoc` to `journey` collection
4. **Writes produced:** `journey/{new-id}` doc with `{journey, sequence, atcmodel}`. **Assertion target:** count(`journey`) increases by 1 OR the new doc appears in the table the component re-rendered from its stream.

### Flow 2 — Catalog: Add a new product (addproduct)
1. Admin navigates to `/addproduct` → `products` loaded via `collectionData(orderBy('product'))` (ts:67)
2. Clicks "Add Product" → `DialogAddProductComponent` opens
3. Fills fields → dialog writes to `products` collection
4. **Writes produced:** `products/{new-id}` with `{product, minimumrequiredamount, mode, ...}`. **Assertion target:** component re-renders the new row; count(`products`) increments.

### Flow 3 — Catalog: Map journey to product (journeyproductmap)
1. Admin navigates to `/journeyproductmap` → `journey-to-product`, `products`, `journey` loaded
2. Clicks map button → `map-journey-product` dialog opens
3. Selects journey + product → dialog calls `setDoc(doc('journey-to-product', id), ...)` (ts:166)
4. **Writes produced:** `journey-to-product/{id}` doc. **Assertion target:** the new mapping appears in the table; count(`journey-to-product`) increments.

### Flow 4 — Purchase: Admin records a new journey purchase for a participant (participantpurchase/:pid)
1. Admin opens `/participantpurchase/{profileid}` → component loads existing `participantsproduct`, `journeyproductpurchase`, `participantjourneyproduct` for that profile (ts:310, :319, :327)
2. Admin adds a new journey purchase row, fills `journeyref`, `subscriptionstart/end`, attaches products with `productref`, `packageref`, `minimumpayment`
3. Clicks Save/Submit → `writeBatch` commits:
   - `participantjourneyproduct/{new-pjp-id}`: `{profileid, journeyref, journeystatus:'initiated', subscriptionstart, subscriptionend, purchaseref}` (ts:1039)
   - `journeyproductpurchase/{new-purchase-id}`: `{profileid, watsonpurchaseid, watsonpurchaselabel, ...}` (ts:1060)
   - `participantsproduct/{product-id}`: per-product enrollment docs (ts:997)
   - `participant purchase logs/{new-id}`: audit log entry of changes (implied by :395 reads)
4. **Writes produced (assertable):** new `participantjourneyproduct` doc with `journeystatus:'initiated'`; new `journeyproductpurchase` doc with known `profileid`; ≥1 new `participantsproduct` docs. All have the seeded `profileid`.

### Flow 5 — Onboarding: Coach marks participant onboarded (journeysupport/:pid)
1. Coach opens `/journeysupport/{profileid}` → `participantjourneyproduct` with `journeystatus:'initiated'` loaded (ts:109)
2. Clicks "Mark Onboarded" → `OnboardingRemarkComponent` dialog opens
3. Coach sets `onboarded:true`, optionally selects `opportunities`, fills `onboardingreport` note → clicks Submit
4. Dialog closes and parent journeyplan.component.ts:656 calls `updateDoc(participantjourneyproduct/{pjp-id}, {onboarded:true, onboardingreport, opportunities, ...})`
5. If "send onboarding email" checked: `onboarding-remark.component.ts:740` writes to `email archive` collection (Postmark CF picks it up externally)
6. **Writes produced:** `participantjourneyproduct/{pjp-id}` updated with `onboarded:true`, `onboardedtime`, `opportunities[]`. **Assertion target:** the doc's `onboarded` field becomes `true`.

### Flow 6 — Sales lead approval (salesleads)
1. Admin navigates to `/salesleads` → `salesleads` stream loaded (ts:96)
2. Admin clicks "Approve" on a pending lead → `validateReview()` opens `CreateWatsonProfileComponent` dialog
3. Admin reviews Watson data, confirms → dialog performs a multi-step writeBatch:
   - Creates/updates `participantjourneyproduct` doc
   - Creates/updates `journeyproductpurchase` doc
   - Creates/updates `participantsproduct` docs (per journey-to-product mapping)
   - Optionally seeds Watson DB if Watson purchase selected
4. After dialog closes: `saleslead.component.ts:627` calls `updateDoc(salesleads/{id}, {status:'approved', ...})`
5. `http.get(breakthroughapprovedleads_url + data)` sends the lead to external salescrm (ts:647)
6. **Writes produced (assertable in starlabs):** `salesleads/{id}.status = 'approved'`; new `participantjourneyproduct` with known profileid + journeystatus; new `participantsproduct` docs.

### Flow 7 — Delivery sequence setup (participantdeliverysequence/:pid)
1. Admin opens `/participantdeliverysequence/{profileid}` → loads `participantsproduct`, `deliverables`, catalog data (ts:269, :313)
2. Admin drags/reorders delivery items, saves
3. Writes: `setDoc(participantdeliverysequence/{profileid}, ...)` (ts:541); per-deliverable `setDoc(deliverables/{id})` for each item (ts:521); `updateDoc(participantsproduct/{id}, {sequenceorder:...})` for ordering (ts:473)
4. **Writes produced:** `participantdeliverysequence/{profileid}` doc updated; `deliverables` docs updated with sequence. **Assertion target:** the doc exists with expected products array.

### Flow 8 — Product initiation dashboard count verification (productinitiated-dashboard)
1. Coach navigates to `/productinitiated-dashboard`
2. Component loads `participantjourneyproduct` (two streams: paymentplan==null, paymentplan!=null) + `participantsproduct` (Priority Mode filter)
3. Dashboard renders counts: "Awaiting Initiation" (paymentplan==null), "Onboarded" (paymentplan!=null), "Engagement Opportunity" (Priority Mode products)
4. **No writes** — this is a read-only dashboard. **Assertion target:** counts rendered by the dashboard match Firestore counts of same filtered queries.

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

> These seeds are per-testrunid and should be created in the cloud test project `slabs-queue-e2e-exdcz` using the pattern established in `e2e/fixtures/seed-test-project.js`.

1. **Test admin user** with `admin:true` in `users_roles` (can reuse the existing `operatorAdmin` from the queue suite seed if roles are the same). Email: `admin+<TESTRUNID>@example.com`.

2. **Seed participant profile** — a `profile_data` doc + `participant metadata` doc for a known `profileid` (e.g. `<TESTRUNID>_profile_journey_test`) with `{name: 'Journey Test User', email: 'journey-participant+<TESTRUNID>@example.com', pp_totalpaid: '0'}`. This is the `:pid` param for participantpurchase, journeysupport, participantdeliverysequence.

3. **Seed catalog docs:**
   - One `journey` doc: `{journey: 'Test Journey <TESTRUNID>', sequence: 999, id: '<TESTRUNID>_journey'}` — used as the `journeyref` in purchase assertions.
   - One `products` doc: `{product: 'Test Product <TESTRUNID>', minimumrequiredamount: 100, mode: 'online'}` — used as the `productref`.
   - One `package` doc: `{package: 'Test Package <TESTRUNID>'}`.
   - One `journey-to-product` doc: `{journey: ref(journey/<TESTRUNID>_journey), product: ref(products/<TESTRUNID>_product)}` — confirms the mapping lookup works.

4. **Seed one `salesleads` doc** in `pending` status (`status: null`) with known `profileid`, `journeytype: 'new'`, `participantjourneyproductid`, `journeyproductpurchaseid` — used for the salesleads approval flow test (SL-02). It must have `participantjourneyproduct` and `journeyproductpurchase` pre-created (or the dialog creates them — use the latter path so the assertion is on the CF/dialog output).

5. **Seed one `participantjourneyproduct` doc** with `{profileid: seeded_profileid, journeystatus: 'initiated', onboarded: false, journeyref: ref(journey/<TESTRUNID>_journey), paymentplan: null}` — for journeysupport/onboarding flow and productinitiated-dashboard count tests.

6. **Seed N `participantsproduct` docs** with `{profileid: seeded_profileid, productref: ref(products/<TESTRUNID>_product), status: 'Initiated', deliverymode: 'Priority Mode'}` — for participantproduct view and dashboard count assertions.

7. **Seed one `participantdeliverysequence` doc** (`participantdeliverysequence/{profileid}`) with at least one product in `products[]` array — baseline for the delivery sequence view.

8. **No Watson / salescrm seeding** — stub those external calls entirely. Tests that require Watson data should stub `getApp("watson")` to return an empty/mock Firestore, or skip the Watson-join sub-test with `test.skip(process.env.CI)`.

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| JP-01 | Authenticated user lands on `/addjourney` without bounce, journey catalog table renders all seeded journeys | REAL-UI | App renders stream-driven table; assert seeded journey name appears in the DOM the app built from its `collectionData(journey)` stream — vs known seeded count | P0 |
| JP-02 | Adding a new journey via the dialog increments the journey catalog: table shows one more row than before | REAL-UI | Count of rows in the table the app re-rendered after dialog close; also assert `countWhere('journey', [...])` incremented by 1 (app/Firestore-written value vs known seed count) | P0 |
| JP-03 | Adding a new product (addproduct) via the dialog: the products table renders the new product row (name + mode columns) | REAL-UI | App re-renders its `collectionData(products)` stream; assert the new product name appears — count seeded vs count after | P1 |
| JP-04 | Journey-to-product map (journeyproductmap): saving a new journey↔product mapping writes a doc; the table re-renders the new row | REAL-UI | `countWhere('journey-to-product', [...])` before vs after the UI save; value the product wrote, asserted against the known-seeded seed | P1 |
| JP-05 | Purchase form (participantpurchase/:pid) loads existing purchases: row count in the purchases table equals the Firestore count of `participantjourneyproduct` docs for that profileid | REAL-UI | App fetches `participantjourneyproduct where profileid == pid` and renders N rows; assert the rendered count equals `countWhere('participantjourneyproduct', [['profileid', '==', seeded_pid]])` | P0 |
| JP-06 | Saving a new journey purchase: `participantjourneyproduct`, `journeyproductpurchase`, and `participantsproduct` docs are created with the correct `profileid` and `journeystatus:'initiated'` | REAL-UI + CF-SIDEEFFECT | Firestore docs written by the product (writeBatch) — asserted by `getDoc` / `countWhere` against the known seeded profileid. NOT the test-seeded initial values; the NEW docs the product's save created. | P0 |
| JP-07 | Journey support (journeysupport/:pid) renders participant's initiated journey with correct `journeystatus` | REAL-UI | App reads `participantjourneyproduct where profileid == pid && journeystatus == 'initiated'`; rendered status text in DOM matches the seeded value in Firestore. App-computed display vs seeded status | P1 |
| JP-08 | Marking onboarded (journeysupport/:pid → mark onboard dialog): `participantjourneyproduct.onboarded` flips to `true` | REAL-UI | `getDoc('participantjourneyproduct', seeded_pjp_id)` — value the app's `updateDoc` wrote — asserted `onboarded == true`; the test never directly set this field (precondition was `onboarded: false`) | P0 |
| JP-09 | Onboarding email archive creation (onboardingremarks): submitting with "send email" checked creates an `email archive` doc with the correct `profileid` | CF-SIDEEFFECT | `countWhere('email archive', [['profileid', '==', seeded_pid]])` — value the product wrote (via `setDoc`) — against 0 before submit, 1 after | P1 |
| JP-10 | Sales lead approval (salesleads): approving a seeded pending lead sets `salesleads/{id}.status = 'approved'` AND creates a new `participantjourneyproduct` doc for that profileid | REAL-UI + CF-SIDEEFFECT | `getDoc('salesleads', seeded_lead_id).status`; `countWhere('participantjourneyproduct', [['profileid', '==', seeded_pid]])` — both written by the product's dialog+updateDoc, not by the test | P0 |
| JP-11 | Sales leads filter: filtering by journey narrows the visible rows (rendered count <= total seeded leads); clearing restores the original count | REAL-UI | App's client-side filter (`applyFilters()`) recomputes the table; rendered row count (app-computed) vs total seeded leads count — asserted as the app's own filtered value, not a test-computed filter | P1 |
| JP-12 | Participant delivery sequence (participantdeliverysequence/:pid): saving the sequence writes `participantdeliverysequence/{pid}` doc and all linked `deliverables` docs exist | REAL-UI | `getDoc('participantdeliverysequence', seeded_pid)` — doc written by product's `setDoc`; `countWhere('deliverables', [['profileid', '==', seeded_pid]])` >= seeded product count | P1 |
| JP-13 | Product initiation dashboard count: "Awaiting Initiation" count shown matches Firestore count of `participantjourneyproduct` where `paymentplan == null` for current month | ORACLE | Dashboard renders this count from its `collectionData` subscription; `getCountFromServer` on same query gives the oracle. Assert they agree. App-computed display vs server-side count | P1 |
| JP-14 | Product initiation dashboard: "Onboarded" count matches `countWhere('participantjourneyproduct', [['paymentplan', '!=', null]])` | ORACLE | Same oracle pattern as JP-13 but for the onboarded stream | P1 |
| JP-15 | Overall dashboard: page loads without console errors and renders at least one financial metric (totalRevenue > 0 or revenueGoal > 0) when Watson/salescrm external calls are stubbed | REAL-UI | App-rendered number > 0 (from its `participantsproduct` + `salesleads` streams); external HTTP calls are route-stubbed — no real Watson/salescrm data required | P2 |
| JP-16 | Formtemplate (formtemplate): loading a form for a seeded `queue_token` pre-fills the participant name from the token doc | REAL-UI | App reads `queue_token` (ts:363) and renders participant name in the form header; assert the rendered name matches the seeded token's participant name — value the app computed from its Firestore read | P2 |
| JP-17 | Package design list renders all seeded `package design` docs; filter narrows correctly | REAL-UI | `collectionData('package design')` drives the table; rendered row count matches `countWhere('package design', [])` (app-computed vs oracle count) | P2 |

---

## ATC exclusions within this group

The following are present in this group's source but are EXCLUDED from testing:

1. **`atcmodel` column / field** — Product catalog (`products` collection) and journey catalog (`journey` collection) carry an `atcmodel` reference field that points into the `atc model` **config catalog** collection. This is the reference-only safe config (`atc taxonomy`, `atc model` — explicitly listed as safe in CLAUDE.md). Tests that display the product/journey table will render this field but MUST NOT write to it or assert its value in a way that requires ATC data.

2. **`product-atcmodel` sub-components** (`Product Designer/product-atcmodel/view-atcmodel`, `create-atcmodel`) — These components read/write the `atc model` config collection (NOT off-limits) but their routes are NOT in the target list above. They are accessed via dialog from addproduct/addjourney — exclude them from the test suite. Do not navigate to these sub-routes.

3. **ATC-gated product fields** — When a product has `atcmodel` set, the product form may show ATC-related delivery tracking. Tests that exercise the purchase/delivery form should use a seeded product with `atcmodel: null` to avoid any ATC-adjacent paths.

4. **`salesleads` upgrade/downgrade paths involving `atc_*` collections** — All commented-out downgrade/upgrade code blocks in `saleslead.component.ts` (lines 667–855) are dead code. If revived they would touch `participantjourneyproduct` (which is safe), NOT any off-limits ATC collections.

No off-limits ATC collection (`atc_alpha`, `atc_initiated`, `atc_notes`, `atc_to_validate`, `ai_generated_atc_summary`, `triple atc`, `temporary_tripleatc`, `assignment_*atc*`, `atc assignment`, `big assignment atc_alpha`, `big temporary_ATC`, `0 atcinvolved issue`) is read, written, or seeded by any component in this group.

---

## Risks / unknowns

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-01 | **Role gates commented out** — every admin/integrator check in Product Designer and Journey Onboarding is commented out (ts:49–57 addjourney, ts:50–59 addproduct, ts:45–54 addpackage, ts:94 saleslead). Any authenticated user can access all routes. Tests must NOT assert that non-admin users are blocked — they won't be. | Medium | Treat as "no role-gate tests in this group"; use one seeded admin for all cases. Do not design negative-access tests here. |
| R-02 | **Watson external project not accessible from the test environment** — `journey-product-purchase` and `saleslead` / `create-watson-profile` try to connect to `watsonproduction-becde` (via `getApp("watson")`). In the cloud test project `slabs-queue-e2e-exdcz` this config may not be present, causing Watson lookups to fail silently or show an alert. | High | Tests that drive the purchase form must NOT rely on Watson data. Seed `participantjourneyproduct` / `journeyproductpurchase` directly (bypassing the Watson flow). For `saleslead` approval, use the direct-write path (pre-seed the sales lead with already-linked PJP/JPP ids so the dialog skips Watson lookup). |
| R-03 | **salescrm external project not accessible** — `onboarding-pipeline` requires `getApp('salescrm')` to be configured. In the test env this config will be missing; the component shows `accessError` gracefully (ts:234). | Medium | Test the salescrm-absent error message renders correctly. Skip pipeline CRUD tests that require salescrm; cover only the starlabs-side writes (e.g. `participantjourneyproduct` schedule update at ts:769). |
| R-04 | **`breakthroughapprovedleads` external HTTP call on salesleads approve** — this call to an external salescrm CF is not stubbed by default and will fail or hang in a test environment. | High | Must add a Playwright `page.route()` stub before any test that clicks Approve on a salesleads row. |
| R-05 | **No `data-testid` attributes on this group's components** — unlike the queue suite (17 `qm-*` testids), this group's HTML files have NOT been audited for testids. All selectors will need class/text/role fallbacks. Implementer must audit the HTML files before writing page objects. | Medium | Use role+name selectors (Angular Material buttons, mat-table rows) and stable column headers as anchors. Do NOT propose editing app source to add testids. |
| R-06 | **`participantsproductinitiated` CF — trigger and side-effects unconfirmed** — this CF name appears in the task brief but was not found via `httpsCallable` grep in the app source. It may be a Firestore-triggered background CF on `participantsproduct` onCreate/onWrite. Its exact side-effects (if any) on `participantjourneyproduct` cannot be asserted without confirming it is deployed to `slabs-queue-e2e-exdcz`. | Medium | Mark JP-06 and JP-10 as potentially CF-triggered; use `pollUntil` with a 20s timeout on the expected write and add a `// CF-triggered — may or may not fire` comment. |
| R-07 | **`formtemplate` named DB `firestore-forms`** — the formtemplate component uses a second named Firestore database (`getFirestore('firestore-forms')`). The cloud test project `slabs-queue-e2e-exdcz` may not have this named DB provisioned, causing the formtemplate route to error. | High | JP-16 (formtemplate) should only run if the named DB exists. Check at test start: `node -e 'const a=require("firebase-admin");a.initializeApp(...);a.firestore(a.app(),"firestore-forms")...'`. Skip if absent. |
| R-08 | **overall-dashboard Watson + salescrm HTTP calls on mount** — these `firstValueFrom(http.get(url))` calls at ts:249–250 are awaited in `ngOnInit` and will fail/reject in the test env if not stubbed, potentially preventing the dashboard from rendering. | High | Always install Playwright `page.route()` stubs for both CF URLs before navigating to `/overall-dashboard`. |
| R-09 | **Shared (non-testrunid-scoped) catalog collections** — `journey`, `products`, `package`, `journey-to-product` are global config collections with no `testrunid` field. Tests that add records here will pollute the shared test project. | High | Tests that add catalog items (JP-02, JP-03, JP-04) must include TESTRUNID in the `journey`/`product` name for easy identification and cleanup. Use a `test.afterEach` that deletes the seeded catalog doc by its deterministic id. |
| R-10 | **`participant purchase logs` collection** — its write site was not found in the Angular app code (only read at :395 in journey-product-purchase). The logs may be written by a CF or by a separate admin tool. Do not assert log counts as a primary assertion. | Low | Use `participant purchase logs` as secondary evidence only. |
