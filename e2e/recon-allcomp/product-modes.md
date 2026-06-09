# Product Modes & App Engagement — e2e recon

> KEY: product-modes | written 2026-06-10
>
> ANTI-CIRCULARITY DISCIPLINE: every candidate test case uses only APP/CF-written values as assertions.
> Seed writes go to `participantsproduct`, `product mode config`, `evolutionwishlistlog`, etc. — the
> APP reads those and computes derived values; we assert on the DERIVED output.

---

## Routes (path → component file:line, role/guard, ATC? note)

| path | Component file | Guard | Role requirement | ATC? |
|---|---|---|---|---|
| `/modedashboard` | `src/app/AppEngagement/mode-dashboard/mode-dashboard.component.ts` | `authGuard` (auth.guard.ts:10) | dynamic via `dashboard` collection; role-check commented-out in component — effectively any auth user (comment block :89–109) | NO |
| `/mode-dashboard-new` | `src/app/AppEngagement/mode-dashboard-new/mode-dashboard-new.component.ts` | `authGuard` | dynamic via `dashboard` collection | NO |
| `/productmodeconfig` | `src/app/AppEngagement/product-mode-config/product-mode-config.component.ts` | `authGuard` | dynamic via `dashboard` collection; role-check commented-out :43–69 | NO |
| `/evolutionwishlist` | `src/app/AppEngagement/evolution-wishlist-form/evolution-wishlist-form.component.ts` | **NO authGuard** (app.routes.ts:154 — no `canActivate`) | public — participant-facing shareable link with encoded `?data=` param | NO |
| `/evolutionwishlistlog` | `src/app/AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component.ts` | `authGuard` | dynamic; `fullAccess = roles["developer"]` (:88) for Delete column — but main data loads unconditionally | NO |
| `/interimreportlog` | `src/app/AppEngagement/interim-report-log/interim-report-log.component.ts` | `authGuard` | dynamic via `dashboard`; role-check commented-out :170 | NO |
| `/appactionpending` | `src/app/AppEngagement/app-action-pending/app-action-pending.component.ts` | `authGuard` | dynamic via `dashboard`; role-check commented-out :57 | NO |
| `/recommendedplaylist` | `src/app/AppEngagement/manage-recommended-playlist/manage-recommended-playlist-component.ts` | `authGuard` | dynamic via `dashboard` | NO |
| `/bigwall` | `src/app/AppEngagement/bigwall-data-adding/bigwall-data-adding.component.ts` | `authGuard` | dynamic via `dashboard` | NO (community/arena data, not ATC) |

**authGuard mechanics** (auth.guard.ts:10): checks Firebase Auth state, then reads `dashboard` collection for the cleaned URL path to find `roles[]` / `profileid[]`. If neither is configured for that route, the guard shows "No roles configured" dialog and returns false. Roles comparison via `currentRoles[key] === true` — standard `users_roles` doc shape.

---

## Firestore collections (name, read|write|both, what for, named-DB if not default)

All default Firestore DB unless noted.

| Collection | RW | Used by (component:line) | Purpose |
|---|---|---|---|
| `participantsproduct` | read | mode-dashboard.ts:251,259,305; mode-dashboard-new.ts:447,705 | Per-participant product delivery record; `mode`, `nextmode`, `nextmodedate` are the core mode-engine state |
| `participantdashboard` | read | mode-dashboard.ts:229 | Denorm snapshot; filtered by `customerstatus=active`, `financialstatus in [defaulted,regular]` to build `modeProfile` map |
| `participant metadata` | read | mode-dashboard-new.ts:306; interim-report-log.ts:210; manage-recommended-playlist.ts:143 | CQRS projection (11 `*_to_pmd` CF triggers); carries `participantmode` (denorm of `profile_data.participantmode`) |
| `profile_data` | read | evolution-wishlist-log-screen.ts:94; interim-report-log.ts:198; bigwall-data-adding.ts:107 | Participant profile; `participantmode` is the CF-computed headline |
| `product mode config` | read+write | mode-dashboard.ts:196; mode-dashboard-new.ts:349; product-mode-config.ts:47; product-mode-configupdate.ts:278–287 | (product × mode) config: `widgets[]`, `modetips[]`, `lastupdate`; setDoc on save |
| `modes` | read | mode-dashboard.ts:128; mode-dashboard-new.ts:222,350 | 15-entry catalog ordered by `sequence`; drives mode list display |
| `products` | read | mode-dashboard-new.ts:354; product-mode-config.ts:56 | Product catalog; `modeflow[]` determines which (product×mode) pairs to show |
| `evolutionwishlistlog` | read+write | evolution-wishlist-form.ts:67,273,297; evolution-wishlist-log-screen.ts:102; evolution-wishlist-log.ts:46,72 | Per-participant wishlist doc; `status` lifecycle: initiated→sended→completed or cancelled |
| `evolutionwishlistquestions` | read | evolution-wishlist-form.ts:114; evolution-wishlist-log-screen.ts:198 | Dynamic question set (enabled questions); includes `knowmorelinks` doc |
| `interimreport log` | read+write | interim-report-log.ts:233 | Interim report tracking doc per participant; `reports[]`, `status`, `duedate`, `lockdate` |
| `ask AH` | read+write | interim-report-log.ts:119 (collectionMap index 0); toggleLike/toggleFlag writes | Ask A&H submission docs; `liked`, `tagged`, `critical`, `opportunity`, `notes[]` |
| `love letter` | read+write | interim-report-log.ts:119 (collectionMap index 1) | Love Letter submission docs; same flag fields |
| `email archive` | write | interim-report-log.ts:833 | Email queuing for batch send |
| `appactionpending` | read+write | app-action-pending.ts:103; add-pending-action.ts:197 | Per-participant pending-actions doc; `formspending[]`, `videoaskpending[]`, `quiz[]`, `mandatoryaction[]` |
| `buffermix archive` | read+write | manage-recommended-playlist.ts:170,334,934 | Group playlist record; `delete` toggle |
| `recommended mix playlist` | read+write | manage-recommended-playlist.ts:210,337,444 | Per-participant playlist assignment; `bufferdocref`, `type`, `completedplaylist[]`, `completedcontent[]`, `delete` |
| `event collection` | read | mode-dashboard-new.ts:188; bigwall-data-adding.ts:87 | Event reference data for mode-dashboard event filter |
| `queue generation` | read | mode-dashboard-new.ts:204 | Queue reference data for mode-dashboard queue filter |
| `adsplaylist` | read | mode-dashboard.ts:140; mode-dashboard-new.ts:251; product-mode-config.ts:76 | Reference list for widget configuration |
| `solar voice playlist` | read | mode-dashboard.ts:151; mode-dashboard-new.ts:252 | Reference list for widget configuration |
| `series` | read | mode-dashboard.ts:162; manage-recommended-playlist.ts:354 | EiFlix series for widget config and playlist meta |
| `content_urls` | read | product-mode-config.ts:113; manage-recommended-playlist.ts:382 | General content items for widget config |
| `delivery forms` | read | mode-dashboard.ts:184; app-action-pending.ts:71 | Form templates for widget config and pending action display |
| `dashboard` | read | auth.guard.ts:36 → authguard.service.ts:325 | Route access config — `roles[]` per path |
| `Achievements/posts/postcollection` | read+write | bigwall-data-adding/select-achievementpost.ts:48 | Achievement posts for bigwall curating |
| `arena highlights` | read+write | bigwall-data-adding/videoasktranscribe.ts:196 | Video-ask arena content |
| `participant AEL` | read+write | participant-ael.ts:226 | AEL record per participant; linked to `accelerated evolution level` |
| `accelerated evolution level` | read | participant-ael.ts:154 | AEL definitions |
| `participant mode checklist` | write | participantmode.js:239–250 (CF only) | CF-written per-mode-transition record; `{ mode, profileid, participantproductid, aelid, widget[] }` |
| `evolution log` | write | participantmode.js:251–262 (CF only) | CF-written audit log per mode transition |
| `wati archive` | write | interim-report-log.ts:895 | Wati broadcast archive docs |

**ATC collections explicitly excluded:** `atc_alpha` (used by participant-ael.component.ts:111,119 via `getFirestore("firestore-atc")` — named DB). The `participant-ael` route is entirely excluded.

---

## Config drivers (docs/flags that change behavior; where read in code with file:line)

| Config | Collection / Doc | Read by (file:line) | Effect |
|---|---|---|---|
| `modes[].sequence` | `modes` collection (15 docs) | mode-dashboard.ts:128; mode-dashboard-new.ts:222,350 | Ordered mode list; rollup rule is lowest-sequence mode wins (participantmode.js:201) |
| `products[].modeflow[]` | `products` | mode-dashboard-new.ts:395 | Which (product×mode) pairs to list in configured/notconfigured views |
| `product mode config[].widgets[]` | `product mode config` | product-mode-configupdate.ts:151–178; mode-dashboard.ts:60–65 | Widget set shown per mode in the Flutter app |
| `product mode config[].lastupdate` | `product mode config` | mode-dashboard.ts:60,70 | Controls button label "Review" vs "set up" |
| `products.integrationdays / performancedays / extendedperformancedays` | `products` | participantmode.js:108–133 (CF) | Post-completion arc timing; edited product knob does not re-pace already-completed participants (TD-017) |
| `participantsproduct.nextmodedate` | `participantsproduct` | mode-dashboard.ts:305; mode-dashboard-new.ts:447 | Window filter (startDay → endDay) for next-mode transition display |
| `/Atestdate/date` | test-clock doc | participantmode.js:12–17 (CF) | Overrides `new Date()` in the CF — CI-safe test-clock |
| `dashboard[].roles[]` / `dashboard[].profileid[]` | `dashboard` | auth.guard.ts:36; authguard.service.ts:320–348 | Route access; if empty array → "no roles configured" dialog |
| `evolutionwishlistquestions[enabled==true]` | `evolutionwishlistquestions` | evolution-wishlist-form.ts:114 | Dynamic question set for wishlist form |
| `evolutionwishlistquestions/knowmorelinks.links[]` | `evolutionwishlistquestions` doc id `knowmorelinks` | evolution-wishlist-form.ts:94 | Optional "Know More" links shown to wishlist responder |

---

## Cloud Functions involved (name → trigger → side-effect a test can assert)

### In-scope CFs confirmed in `starlabs-cloud-function/functions/components/`

| CF name | Trigger (file:line) | Assertable side-effect |
|---|---|---|
| `calculateParticipantMode` | `onDocumentWritten('/participantsproduct/{id}')` (participantmode.js:7) | 1) `participant metadata.productmode[]` updated (sorted by `modes.sequence`) · 2) `profile_data.participantmode` updated to new headline · 3) `participant mode checklist` doc created (:239–250) · 4) `evolution log` doc created (:251) |
| `productNextModeUpdate` | `onSchedule("05 00 * * *", Asia/Kolkata)` (participantmode.js:358) | `participantsproduct.mode` advanced to `nextmode` for rows where `nextmodedate` ≤ today; test-clock `/Atestdate/date` can fast-forward |
| `onEventApprovalProductMode` | `onDocumentWritten("event participation request/{docid}")` (participantmode.js:498) | DEAD CODE (flag F1: guard always-false :503). Zero side-effects — do not design tests for it. |
| `evolutionFamilyWishlistOnWrite` | `onDocumentWritten('/evolutionwishlistlog/{docid}')` (wishlist.js:8) | When `status=="sent"`: sends Wati WhatsApp + Postmark email per contact, then updates `status → "sended"` (:86). When `status=="sended"` + all contacts received: updates `status → "completed"` (:100). |
| `profiledata_to_participantmetadata` | `onDocumentWritten('profile_data/{id}')` (participantmetadata.js:12) | Mirrors `profile_data.participantmode` into `participant metadata.participantmode` (change-guarded, :31,46) |
| `journey_to_pmd` | `onDocumentWritten('participantjourneyproduct/{docid}')` (participantmetadata.js:245) | Recomputes `customerstatus`; overrides `participant metadata.participantmode` to Exploration Mode (non-active) or null |
| `productsdata_to_pmd` | `onDocumentWritten('participantsproduct/{id}')` (participantmetadata.js:471) | Updates `participant metadata` projection fields from product writes |

### CFs from the candidate list NOT confirmed or out-of-scope:
- `performanceMode`, `priorityMode`, `eventMode`, `eventPreparationMode`, `queuePreparationMode`, `extendedPerformanceMode`, `afterextendedPerformanceMode`, `priorityPreparationMode`, `installationEventMode` — these are **not distinct exported functions** in `participantmode.js`. The mode-advance logic for these modes is inline within `calculateParticipantMode` (the completion-arc sections :80–159) and `productNextModeUpdate` (the cron :358). There are no separately exported CF names with those identifiers.
- `onQueueTokenCreateUpdateProductMode` — not found in AppEngagement CFs; may be in `queuesystem.js` (queue group's responsibility, not this group).

---

## External services to stub (call sites file:line)

| Service | Call site | Trigger | Stub needed |
|---|---|---|---|
| **Wati WhatsApp** | wishlist.js:22–63 (CF, via `commonService.createWatiArchiveDocument`) | `evolutionwishlistOnWrite` when status=="sent" and contact type=="number" | Wati HTTP intercept stub (like existing `installWatiStub`) |
| **Postmark email** | wishlist.js:72–80 (CF, via `postmarkClient.sendEmailWithTemplate`) | `evolutionwishlistOnWrite` when contact type=="gmail" | Postmark/email intercept stub — CF-side, not Angular-side |
| **sendBatchEmail HTTP CF** | interim-report-log.ts:851 | Manual "send email" button on selected records | Angular `http.post` to `https://us-central1-*.cloudfunctions.net/sendBatchEmail`; stub via Playwright `page.route()` |
| **sendWhatsAppBroadcast HTTP CF** | interim-report-log.ts:905 | Manual "send Wati" button | Angular `http.post`; stub via Playwright `page.route()` |
| **workshopprogressmessage HTTP CF** | manage-recommended-playlist.ts:1056,1141 | Side-panel "send" from recommended playlist | Angular `http.post`; stub via Playwright `page.route()` |
| **FCM push notifications** | guard.saveNotificationRecord() → interim-report-log.ts:805; manage-recommended-playlist.ts:997 | "Notify in Breakthrough" button | FCM via `AhNotificationComponent`; stub existing `installFcmStub` |
| **Firebase Storage** | interim-report-log.ts:795–800; manage-recommended-playlist.ts:991 | Notification image upload | Storage upload; stub with `page.route()` for storage URL |

**NB:** The Wati/Postmark calls in `evolutionFamilyWishlistOnWrite` run server-side (CF), not in the Angular page. For tests that set `status = "sent"`, the CF fires but we cannot intercept server-side external calls via Playwright stubs. Design tests to seed the doc at `status = "sended"` (post-CF) to avoid real external sends, OR test only the Angular UI side and verify the Firestore write (`status` field) as the assertion target.

---

## Actors / roles (who can do what; landing routes; role-gate file:line)

| Actor | Access mechanism | Effective gate | Notes |
|---|---|---|---|
| **Admin / ah** | `dashboard` collection config; role-check commented-out in most components | Any authenticated user who has a `dashboard` entry for the route | Most AppEngagement screens have role guards commented out — effectively gated by `authGuard` only (login required) |
| **developer** | `roles["developer"]` checked at evolution-wishlist-log-screen.ts:88 | Unlocks `fullAccess = true` for the Delete/Cancel column | Ordinary admins see the table but not the destructive actions |
| **Participant (public)** | No authGuard on `/evolutionwishlist` (app.routes.ts:154) | Public; link requires valid `?data=` JSON with `docid` + `contact` | External wishlist responder — not a logged-in app user |

**Route access is data-driven** via the `dashboard` Firestore collection (authguard.service.ts:320–348). The test seed must ensure the seeded admin has a `dashboard` entry granting access to each route under test, OR confirm these routes have no role restriction configured (which several AppEngagement screens don't).

---

## Key user flows (numbered, end-to-end, with the Firestore write each step produces)

### Flow 1 — Admin views next-mode transitions on Mode Dashboard (modedashboard)
1. Admin navigates to `/modedashboard`.
2. Component reads `participantdashboard` (active participants), `product mode config` (live stream), `modes` catalog, reference playlists.
3. Admin enters `startDay=0, endDay=10`, clicks "Fetch Data".
4. Component queries `participantsproduct where nextmodedate >= today, <= today+10d`.
5. **App computes:** groups by productid+mode, intersects with `participantdashboard` profileids to produce `hierarchyprofile.length` count.
6. Admin sees participant counts per mode-transition group.

**No write occurs in this read flow. Anti-circular assertion: the rendered count (X participants) can be verified against a seeded count of `participantsproduct` docs with matching productref + mode + nextmodedate window.**

---

### Flow 2 — Admin saves a product mode config (productmodeconfig → ProductModeConfigupdateComponent dialog)
1. Admin navigates to `/productmodeconfig`, selects a product+mode, clicks the edit button.
2. `ProductModeConfigupdateComponent` dialog opens with existing widgets or empty form.
3. Admin adds a widget (e.g. "solarvoice"), selects playlist reference, clicks Save.
4. **Write: `setDoc("product mode config", docid, { productref, mode, widgets[], modetips[], lastupdate: serverTimestamp() })` (product-mode-configupdate.ts:279–287)**
5. `/productmodeconfig` page re-renders with `lastupdate` visible.

**Anti-circular assertion: after save, read `product mode config` doc where productref.id == seededProductId && mode == seededMode; assert `lastupdate != null` (CF computed nothing; the APP wrote `serverTimestamp()`). Also assert the dialog closes and the list shows the `check_circle` icon (app renders from the fresh snapshot).**

---

### Flow 3 — Admin initiates an Evolution Wishlist (evolutionwishlistlog)
1. Admin navigates to `/evolutionwishlistlog`, clicks "Initiate" for a participant.
2. `EvolutionWishlistLogComponent` dialog opens.
3. Admin selects type (familyandpeers or self), clicks Create.
4. **Write (batch): `setDoc("evolutionwishlistlog", newDocId, { docid, profileid, type, status:"initiated", created:serverTimestamp() })` (evolution-wishlist-log.ts:72–80)**
5. The log screen's real-time subscription picks up the new doc; the `initiatedCount` counter increments.

**Anti-circular assertion: count `evolutionwishlistlog` docs where `profileid == seededParticipantId && status == "initiated"` — must equal 1 after initiation. The COUNT is what the app computed (Firebase server-side aggregation), not a value the test wrote.**

---

### Flow 4 — Participant submits Evolution Wishlist form (evolutionwishlist — public route)
1. Participant opens a deep link `/evolutionwishlist?data=<encoded>` containing `docid` + `contact`.
2. Component reads `evolutionwishlistlog/<docid>` to verify contact exists and not yet submitted.
3. Component reads `evolutionwishlistquestions` for enabled questions.
4. Participant fills form, clicks Submit.
5. **Write: `updateDoc("evolutionwishlistlog", docid, { contacts: [...updated], status: still "sended" })` — the matching contact gets `submitted:true, status:"received", submitteddate, wishlistquestionmap` (evolution-wishlist-form.ts:256–277)**
6. CF `evolutionFamilyWishlistOnWrite` fires: if all contacts received → **Write: `updateDoc("evolutionwishlistlog", docid, { status:"completed" })`** (wishlist.js:100).

**Anti-circular assertion (for the Angular write): after submit, read the `evolutionwishlistlog` doc; assert the contact with matching `contact` field has `submitted==true` (the app wrote it). For the CF auto-complete: seed a doc with 1 contact at `status="sended"` and the contact at `submitted=false`; trigger the form submit; poll until `status=="completed"` (CF wrote it).**

---

### Flow 5 — Admin cancels / re-enables an Evolution Wishlist (evolutionwishlistlog)
1. Admin clicks Cancel on an `initiated` or `sended` row.
2. **Write: `updateDoc("evolutionwishlistlog", docid, { closedbeforeshare:true, status:"cancelled" })` (evolution-wishlist-log-screen.ts:226–232)**
3. The `cancelledCount` increments in the UI.

**Anti-circular assertion: before cancel, count docs with `status=="initiated"` for profileid = N; after click, read the doc and assert `status == "cancelled"` (the APP wrote it).**

---

### Flow 6 — Admin views and tags an Ask A&H entry (interimreportlog)
1. Admin navigates to `/interimreportlog`, tab "Ask A&H".
2. Component fetches `ask AH` collection ordered by `created`.
3. Admin clicks the "flag" icon on a row.
4. **Write: `updateDoc("ask AH", docId, { tagged:true, tagdetails:{ user:loggedInProfileId, time:serverTimestamp() } })` (interim-report-log.ts:608–617)**
5. `totalNeedsAttention` counter increments.

**Anti-circular assertion: read the `ask AH` doc after flag click; assert `tagged == true` and `tagdetails.user == seededAdminProfileId`. The test seeded the doc with `tagged:false`, the APP wrote `tagged:true`.**

---

### Flow 7 — Admin toggles playlist active/inactive (recommendedplaylist)
1. Admin navigates to `/recommendedplaylist`.
2. Component loads `buffermix archive` (date-ranged) and `recommended mix playlist` docs.
3. Admin toggles the delete slider on a group row → confirms.
4. **Write: `updateDoc("buffermix archive", row.docid, { delete: newValue })` then batch `updateDoc("recommended mix playlist", ...)` for linked docs (manage-recommended-playlist.ts:334–351)**
5. Table row toggles visually; `personalisedStats.disabled` count updates.

**Anti-circular assertion: after toggle, read `buffermix archive` doc; assert `delete == true`. Then count linked `recommended mix playlist` docs where `delete == true` — must equal the count of playlist items for that bufferdocref.**

---

### Flow 8 — CF calculateParticipantMode writes participant mode checklist on product completion
1. Test seeds a `participantsproduct` doc for seededParticipantId with `status:"ongoing"` and all day-knobs set.
2. Test writes `status:"completed"`, `statusdate.completed: now`.
3. **CF fires (onDocumentWritten):**
   - Writes `participant metadata.participantmode = lowest-sequence mode` (e.g. Integration Mode)
   - Writes `profile_data.participantmode = same`
   - Creates `participant mode checklist` doc with `{ mode:"Integration Mode", profileid, participantproductid, aelid, widget[] }`
   - Creates `evolution log` doc
4. `profiledata_to_participantmetadata` CF fires: mirrors `profile_data.participantmode` into `participant metadata.participantmode`.

**Anti-circular assertion: count `participant mode checklist` where `profileid == seededParticipantId && mode == "Integration Mode"` — must equal 1. The test seeded 0; the CF computed 1. Also assert `profile_data.participantmode == "Integration Mode"` (CF wrote it, test seeded null).**

---

## Seed requirements (exact docs/users/refs to seed; reuse seed-test-project helpers where possible)

| # | What to seed | Collection | Key fields | Notes |
|---|---|---|---|---|
| S1 | Admin user | `users_roles` | `admin:true` (or whatever role the `dashboard` config requires) | Reuse existing `actors.operatorAdmin` pattern |
| S2 | Developer user (for fullAccess tests) | `users_roles` | `developer:true` | Separate seeded user for Delete/Cancel access on evolutionwishlistlog |
| S3 | `dashboard` entries for each route | `dashboard` | `{ route:"/modedashboard", roles:["admin"] }` × 8 routes | Ensures routes are accessible; check if already present in test project |
| S4 | Seeded product with `modeflow[]` and day-knobs | `products` | `{ modeflow:["Integration Mode","Performance Mode",...], integrationdays:30, performancedays:30, extendedperformancedays:30 }` | Needed by CF calculateParticipantMode arc |
| S5 | `participantsproduct` doc for seeded participant | `participantsproduct` | `{ profileid, productref, mode:"Journey Planning Mode", status:null, nextmodedate:today+5 }` | Starting state for mode dashboard tests |
| S6 | `participantsproduct` doc with `status:"ongoing"` | `participantsproduct` | `{ mode:"Priority Mode", status:"ongoing", deliverymode:"Priority Mode" }` | For CF completion trigger test |
| S7 | `product mode config` doc — one configured, one not | `product mode config` | `{ productref, mode:"Performance Mode", widgets:[...], lastupdate }` | One with widgets (configured), one without (not configured) — for dashboard display tests |
| S8 | `modes` catalog (should already exist in test project) | `modes` | All 15 docs ordered by `sequence` | Verify these exist via `node -e` count check |
| S9 | `evolutionwishlistlog` doc in `initiated` state | `evolutionwishlistlog` | `{ docid, profileid, type:"familyandpeers", status:"initiated", created:now }` | For cancel test |
| S10 | `evolutionwishlistlog` doc in `sended` state with 1 contact | `evolutionwishlistlog` | `{ status:"sended", contacts:[{ name, type:"gmail", contact:"test@example.com", submitted:false }] }` | For form-submit CF-sideeffect test; contact type gmail avoids Wati call |
| S11 | `ask AH` doc | `ask AH` | `{ profileid, askah:"test content", created:now, liked:false, tagged:false }` | For tagging test on interim-report-log |
| S12 | `buffermix archive` + linked `recommended mix playlist` docs | `buffermix archive` | `{ docid, type:"eiflix", eiflix:[{id:seededSeriesId}], date:now, delete:false }` + 2 `recommended mix playlist` docs with `bufferdocref` | For toggle test |
| S13 | `participantdashboard` doc for seeded participant | `participantdashboard` | `{ profileid, customerstatus:"active", financialstatus:"regular", participantmode:"Journey Planning Mode" }` | Required by modedashboard's `fetchProfileList()` query |
| S14 | `profile_data` doc for seeded participant | `profile_data` | `{ profileid, name:"Test User", participantmode:null }` | Starting state for CF mode-write test |
| S15 | `participant metadata` doc for seeded participant | `participant metadata` | `{ profileid, name:"Test User", participantmode:null }` | Starting projection state |

Reuse `seed-test-project.js`'s `planSeed()` / helper pattern. Deterministic IDs via `TESTRUNID` suffix (e.g. `product_<TESTRUNID>`, `participant_<TESTRUNID>`).

---

## Candidate test cases

> Type key: REAL-UI = drives Angular UI and asserts app-rendered value | CF-SIDEEFFECT = seeds Firestore, polls for CF-written output | ORACLE = cross-check known seeded count against app-displayed count.
> Anti-circular basis = what the APP/CF computed, vs. what the TEST seeded (never assert a value the test itself just wrote).

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| PM-01 | Mode Dashboard: 15 modes catalog renders in sequence order | REAL-UI | App fetches `modes` ordered by `sequence` and renders them as `<p class="mode">` elements. Assert count==15 and first visible text == "Big" (sequence 0) against the seeded `modes` catalog count. | P0 |
| PM-02 | Mode Dashboard: next-mode count for seeded window matches participantsproduct query | ORACLE | Seed N=3 `participantsproduct` docs with `nextmodedate` in the 0–10 day window. App renders "X Participant will move..." with hierarchyprofile.length. Assert UI shows count ≤ N; separately countWhere participantsproduct nextmodedate in range and compare to what the app rendered. | P0 |
| PM-03 | Mode Dashboard (new): configured vs. not-configured split matches product×modeflow data | ORACLE | Seed 1 `product mode config` with widgets (configured) and 1 without (notconfigured) for the same seeded product's modeflow. App renders two separate sections. Assert the "configured" section contains the known product+mode, and "not configured" contains the other. The split is computed by the app (filterModesConfig :388–434). | P1 |
| PM-04 | Product Mode Config: save new config writes to Firestore with serverTimestamp | REAL-UI | Seed a product with no existing config. Drive the UI: navigate to /productmodeconfig, locate the product, click edit, add one widget (solarvoice), save. Assert: (a) dialog closes, (b) admin-read of `product mode config` where `productref.id==seededProductId && mode==seededMode` has `lastupdate != null` and `widgets.length == 1`. Test seeded 0 widgets; app wrote 1 + timestamp. | P0 |
| PM-05 | Product Mode Config: update existing config preserves widget count | REAL-UI | Seed a `product mode config` doc with 2 widgets. Drive: open edit dialog, add 1 more widget, save. Assert `product mode config` doc has `widgets.length == 3`. App wrote the merged array; test seeded 2. | P1 |
| PM-06 | Evolution Wishlist Log: initiate creates doc with status="initiated" | REAL-UI | Seed participant profile. Drive /evolutionwishlistlog → open "Initiate" dialog → select type "familyandpeers" → Create. Assert: countWhere("evolutionwishlistlog", profileid==seededId, status=="initiated") == 1. The app wrote 1 doc; test seeded 0. | P0 |
| PM-07 | Evolution Wishlist Log: cancel changes status to "cancelled" | REAL-UI | Seed an `evolutionwishlistlog` doc with status="initiated" (S9). Drive: click Cancel. Assert: read doc → `status == "cancelled"` and `closedbeforeshare == true`. App wrote status=cancelled; test seeded status=initiated. | P0 |
| PM-08 | Evolution Wishlist Form (public): submit marks contact as submitted | REAL-UI | Seed an `evolutionwishlistlog` doc in status="sended" with 1 enabled contact (type="gmail", submitted=false). Navigate to /evolutionwishlist?data=<encoded>. Fill form. Submit. Assert: read the `evolutionwishlistlog` doc; the matching contact has `submitted == true` and `wishlistquestionmap` non-empty. App wrote the contact update; test seeded submitted=false. | P0 |
| PM-09 | CF evolutionFamilyWishlistOnWrite: all-contacts-submitted triggers status=completed | CF-SIDEEFFECT | Seed a `evolutionwishlistlog` doc with status="sended" and 1 contact with `status="received"` (already "received", not yet tallied). Write a second `updateDoc` to trigger the onWrite CF (or re-trigger by seeding exactly 1 contact with `submitted:true`). pollUntil `status=="completed"`. Test seeded status="sended"; CF computed status="completed". | P1 |
| PM-10 | CF calculateParticipantMode: completing a product writes participant mode checklist doc | CF-SIDEEFFECT | Seed `participantsproduct` (S6) with status="ongoing", day-knobs all set. Write `status:"completed"`, `statusdate.completed:now`. pollUntil count(`participant mode checklist` where profileid==seededId && mode=="Integration Mode") == 1. Test seeded 0 checklist docs; CF computed 1. | P0 |
| PM-11 | CF calculateParticipantMode: completing a product updates profile_data.participantmode | CF-SIDEEFFECT | Same trigger as PM-10. pollUntil `profile_data[seededParticipantId].participantmode == "Integration Mode"`. Test seeded null; CF wrote "Integration Mode". | P0 |
| PM-12 | CF profiledata_to_participantmetadata: mode change mirrors to participant metadata | CF-SIDEEFFECT | After PM-11 lands, pollUntil `participant metadata[seededParticipantId].participantmode == "Integration Mode"`. Test seeded null in participant metadata; CF chain (profiledata_to_participantmetadata) wrote the mirror. | P1 |
| PM-13 | Interim Report Log: "Ask A&H" tab renders records from ask AH collection | REAL-UI | Seed N=2 `ask AH` docs for seededParticipantId. Navigate /interimreportlog. Assert the table renders at least 2 rows with matching content in the ask AH column. App fetches from `ask AH` collection; seeded count known. | P1 |
| PM-14 | Interim Report Log: flag action toggles tagged field in ask AH collection | REAL-UI | Seed 1 `ask AH` doc with `tagged:false`. Drive: find row, click flag icon. Assert: read `ask AH` doc → `tagged == true` and `tagdetails.user == loggedInProfileId`. App wrote tagged=true; test seeded false. | P1 |
| PM-15 | Interim Report Log: interim report tab renders log with correct status counts | ORACLE | Seed 2 `interimreport log` docs: 1 `status:"completed"`, 1 with no status + non-empty `reports[]` (= ongoing). Drive: click "Interim Report Log" tab. Assert: totalReportsCompleted counter displays 1 and totalReportsOngoing displays 1. App computed from the seeded docs; test seeded exact counts. | P1 |
| PM-16 | Recommended Playlist: disable toggle writes delete=true to buffermix archive and linked playlist docs | REAL-UI | Seed 1 `buffermix archive` doc (delete:false) + 2 `recommended mix playlist` docs with `bufferdocref` pointing to it. Drive: navigate /recommendedplaylist, find the group, toggle the delete slider, confirm. Assert: read `buffermix archive` doc → `delete == true`; countWhere("recommended mix playlist", bufferdocref==seededRef, delete==true) == 2. App wrote the cascade; test seeded delete=false. | P1 |
| PM-17 | App Action Pending: pending actions table shows only participants with non-empty actions | ORACLE | Seed 1 `appactionpending` doc with empty `formspending`, `videoaskpending`, `quiz`, `mandatoryaction` (should be filtered out by component :123–132). Seed 1 doc with non-empty `formspending[]`. Assert table renders exactly 1 row. App filtered to non-empty; test seeded known counts. | P2 |
| PM-18 | Mode Dashboard guard: unauthenticated user redirected to /login | REAL-UI | Navigate to /modedashboard without logging in. Assert URL becomes /login (or contains "login"). authGuard uses Firebase Auth state (auth.guard.ts:21–26). | P0 |
| PM-19 | Evolution Wishlist Form: invalid/expired link shows error message | REAL-UI | Navigate to /evolutionwishlist with malformed or missing `data` param. Assert the page renders `errormessage` text ("Invalid Link."). No Firestore write occurs; app shows the error state it computed from a missing/null docid check (evolution-wishlist-form.ts:107–111). | P1 |

---

## ATC exclusions within this group

| Component / route | ATC touchpoint | Disposition |
|---|---|---|
| `src/app/AppEngagement/participant-ael/participant-ael.component.ts:111,119` | Reads `atc_alpha` collection via `getFirestore("firestore-atc")` named DB | **EXCLUDE `/participantael` route entirely** from this suite. This is the core ATC reader in this folder. |
| `src/app/AppEngagement/product-mode-config/product-mode-configupdate.ts:116` | Widget type `"reviewatc"` (widgetid in widgetList) | This is a widget label that a user could select in the config form. The widget itself is downstream mobile-app behavior. The config-save test (PM-04) should use a non-ATC widget (e.g. `solarvoice`). |
| `src/app/AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component.ts:99–100` | `isInEcosystem()` filters on `ecosystemContacts` built from `profile_data` email/number — **not** ATC data | Safe — no ATC collection read. |
| `productmodeConfig[...].mode == "ATC something"` | Mode names could theoretically include ATC references if configured; seed only non-ATC mode names | Use standard mode names from the 15-entry `modes` catalog. |

---

## Risks / unknowns

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `dashboard` collection route config may not have entries for these routes in the test project, causing authGuard to reject all test users with "no roles configured" dialog | HIGH | Seed `dashboard` docs for each route (S3) with `roles:["admin"]` as part of test setup. Verify via count query before test run. |
| R2 | `calculateParticipantMode` CF has a guard at line :105 requiring all three day-knobs to be non-null; if the seeded product is missing any, the CF logs "Integration period not updated" and no mode checklist is created | HIGH | Seed S4 / S6 with all three day-knobs explicitly set. |
| R3 | `participantdashboard` collection used by `/modedashboard` may not exist or have no docs in the test project (it's a denorm view, not guaranteed by seed) | MEDIUM | Seed S13 directly. Alternatively, seed `profile_data` and let the projections materialize (slower). |
| R4 | `evolutionFamilyWishlistOnWrite` sends real Wati + Postmark when `status=="sent"`. Test project CF is real — cannot stub server-side | HIGH | Never set status to "sent" from tests; seed docs at "sended" to test the all-received→completed branch. For the UI initiation test (PM-06), only assert the Firestore write (status="initiated"), not the downstream send. |
| R5 | The `product mode config` collection name contains a space — must pass as `'product mode config'` string (already confirmed correct in source) | LOW | Already using collection name verbatim; document for implementers. |
| R6 | `/mode-dashboard-new` uses `collectionData` (real-time) streams that trigger `nextModeChange()` automatically when `modeProfile` first populates — tests must wait for the async stream before asserting counts | MEDIUM | Use `waitForFunction` or `page.waitForSelector` polling for the rendered count element; give 15–20s timeout. |
| R7 | `participant mode checklist` and `evolution log` are written by `calculateParticipantMode` server-side; CF execution latency on cloud test project may be 5–30 seconds | MEDIUM | Use `pollUntil` with 60s timeout for CF-SIDEEFFECT test cases (PM-10, PM-11, PM-12, PM-09). |
| R8 | `/evolutionwishlist` route has no authGuard; but `?data=` param must be a valid JSON with `docid` and `contact` matching a real doc. Malformed encoding breaks the component constructor at :62 | LOW | Test PM-08 seeds the exact doc and constructs the encoded URL programmatically in the test. |
| R9 | `modes` catalog (15 docs) must already exist in the test project — it is a config collection likely seeded at project creation | MEDIUM | Verify with count query before suite runs; if count < 15, seed the missing docs. |
| R10 | Code anomaly F3 (confirmed live): `participantsproduct` rows with `mode ∈ {Event, Installation Event, Big}` and `nextmode=="Integration Mode"` are NOT advanced by the daily cron (participantmode.js:414 excludes them). Tests that seed these modes + expect cron advancement will fail | HIGH | Do not design CF tests that rely on cron advancing Event-mode rows. Use Priority/Performance modes for cron advancement tests. |
| R11 | Several component role checks are commented out — any logged-in user with a valid session may access these screens. Tests relying on role-based denial for non-admin users may be fragile | MEDIUM | For role-denial tests, verify the `dashboard` collection config is the enforcer; do not rely on component-level checks. |
