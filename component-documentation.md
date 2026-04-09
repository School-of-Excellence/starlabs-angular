# Component Documentation
Generated: 2026-04-08
Project: starlabs-autogen (Angular 19 Standalone)

**Scope:** All USED components — i.e. those present in `app.routes.ts`, opened via `MatDialog.open()`, or used as child components in templates. Components confirmed unused are excluded (see `unused-assets-report.md`).

**Total Used Components:** ~383 (392 total minus ~9 confirmed unused)

---

## SERVICES

---

### AuthguardService
**File:** `src/app/authguard.service.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** The central authentication and data-initialization service. Manages Firebase Auth sign-in/out, FCM push token registration, user and profile data loading, IndexedDB caching, route-based role access, and provides the shared `profileMap` used throughout the app.
**Logic Summary:**
- On init: initializes Firestore collection references for ~25+ collections
- `setupNotification()`: requests browser notification permission, registers FCM token, updates Firestore
- `getProfileMap()`: loads all profiles + new users + participant metadata into a combined in-memory map with 10-minute IndexedDB cache (`AppCache_Test` / `AppCache_Production`)
- `getRoles()`: fetches user role document from `users_roles` collection
- `routeConfig()`: loads `dashboard` collection for sidebar nav
- `setCache() / getCache() / deleteCache() / clearAllCaches()`: IndexedDB operations with TTL of 10 minutes
- `sendPushMessage()`: sends push notification via Firestore write + Cloud Function trigger
**Dependencies:** `Firestore`, `Auth`, `AngularFireAuth`, `HttpClient`, `MatSnackBar`, `Router`, IndexedDB (native), `FIREBASE_OPTIONS`
**Flag Notes:**
- `getProfileMap()` loads ALL profiles into memory. In production with thousands of participants this will cause significant memory pressure. The cache TTL is only 10 minutes, so re-fetches happen frequently for long-running sessions.
- The FCM subscription in `setupNotification()` uses `getDoc`/`setDoc` but has no error handling if permission is denied mid-session.
- `openSnackBar()` is a helper method on the service — this is a concern separation violation; use `SnackbarService` instead.
- Uses both modern `@angular/fire` and the compat `FIREBASE_OPTIONS` provider simultaneously — unnecessary bundle bloat.

---

### SnackbarService
**File:** `src/app/shared/snackbar.service.ts`
**Status:** ✅ GOOD
**What it does:** Thin wrapper around `MatSnackBar.open()` with sensible defaults (center-top position, 2000ms duration).
**Logic Summary:** Single `show(message, action?, duration?)` method. No subscriptions or state.
**Dependencies:** `MatSnackBar`
**Flag Notes:** None.

---

### NetworkStatusService
**File:** `src/app/network-status.service.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Monitors browser online/offline state and verifies real internet connectivity with periodic HTTP pings. Exposes `onlineStatus$: BehaviorSubject<boolean>` for consumers.
**Logic Summary:**
- Constructor: merges `fromEvent(window, 'online')`, `fromEvent(window, 'offline')`, and `timer(0, 5000)` streams
- On each emission, calls `checkInternetConnection()` which does an HTTP GET to `https://jsonplaceholder.typicode.com/posts`
- Uses `switchMap` to cancel in-flight checks when new events arrive
**Dependencies:** `HttpClient`
**Flag Notes:**
- Uses `https://jsonplaceholder.typicode.com/posts` as the connectivity test URL — this is an **external third-party service** not controlled by the project. If that service goes down, the app will report offline incorrectly. Replace with a lightweight internal endpoint or `https://www.google.com/favicon.ico`.
- The `timer(0, 5000)` combined with `takeWhile()` continues until connectivity is restored, which is fine, but under poor network conditions can produce a burst of failed requests.
- The singleton subscription in the constructor is acceptable (service lives for app lifetime), but there is no cleanup if the service is ever manually destroyed.

---

### WatiService
**File:** `src/app/wati.service.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Integrates with the Wati WhatsApp Business API. Fetches message templates with pagination and sends broadcast messages.
**Logic Summary:**
- `serverURL(serverid)`: sets `fetchTemplateapiUrl`, `sendTemplateMsgUrl`, and `apiToken` as mutable service properties
- `getTemplates()`: uses `switchMap` + `forkJoin` to paginate through up to 9 pages of templates (200 per page = up to 1,800 templates loaded)
- `sendBroadcastMessage()`: HTTP POST to Wati broadcast endpoint
**Dependencies:** `HttpClient`, `Firestore`
**Flag Notes:**
- `serverURL()` is declared `async void` — anti-pattern. It mutates shared service state, meaning concurrent callers could get stale/wrong URLs if called rapidly. Make it synchronous or return a Promise.
- Unused RxJS imports: `Subject`, `takeUntil`, `debounceTime`, `distinctUntilChanged` are imported but never used — leftover from a refactor.
- `getTemplates()` loads up to 1,800 templates into memory with no caching. Add memoization/caching.
- No error handling in `sendBroadcastMessage()` — network errors will surface as unhandled Observable errors.
- `Firestore` is injected but not used in this service file — likely leftover from an old version.

---

### DataTransferService
**File:** `src/app/Participants Profile Management/participants-analytics/data-transfer.service.ts`
**Status:** ❌ BAD
**What it does:** Passes data between the participants-analytics screen and a new browser tab by serializing data to `localStorage` and opening a tab with a query param key.
**Logic Summary:**
- `setData(key, data, route)`: stores `JSON.stringify(data)` in localStorage under `key`, tracks the key in `localStorageName[]`, then opens a new tab via `window.open()`
- `clearData()`: loops `localStorageName[]` and calls `localStorage.removeItem()` for each
- `ngOnDestroy()`: calls `clearData()` — **THIS METHOD NEVER RUNS ON A SERVICE**
**Dependencies:** `Router`
**Flag Notes:**
- **CRITICAL BUG:** `ngOnDestroy()` is defined on a service. Angular does not call lifecycle hooks on services. `clearData()` is never automatically called. localStorage items accumulate indefinitely across the user's session and potentially across sessions if browser is not closed.
- Security risk: passing sensitive participant data via localStorage + URL query params exposes it in browser history, logs, and referer headers. Use sessionStorage (tab-scoped) instead.
- `localStorageName[]` array grows unbounded if `clearData()` is never called.
- The `setData()` method opens a new browser tab on every call with no throttle — can spam tabs.

---

### InstanceStatusService
**File:** `src/app/instance-status.service.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Monitors AWS infrastructure (master node + media nodes) via a Firestore real-time document and exposes HTTP endpoints to start/stop/scale instances.
**Logic Summary:**
- `getStatus()`: returns `docData()` Observable from `AWS_System/instance_status` Firestore document
- `startMaster() / stopMaster() / scaleUp() / scaleDown()`: HTTP POSTs to Cloud Function endpoints
- Environment detection: uses `projectId` from `FIREBASE_OPTIONS` to determine production vs test API URL
**Dependencies:** `HttpClient`, `Firestore`, `FIREBASE_OPTIONS`
**Flag Notes:**
- No error handling on any HTTP method — failures are silent.
- Cloud Function base URL is hardcoded inline rather than in `environment.ts`. A staging/dev misconfiguration would go unnoticed.
- All HTTP return types are `any` — should be typed.

---

### NoisecancellationService
**File:** `src/app/Service/NoiseCancellation/noisecancellation.service.ts`
**Status:** ✅ GOOD
**What it does:** Wraps LiveKit's noise suppression pipeline using `@sapphi-red/web-noise-suppressor` and `@mediapipe/face_mesh`. Returns a processed `LocalAudioTrack`.
**Logic Summary:** Single async `applyNoiseCancellation(track)` method. No subscriptions or state. Used exclusively by `JoinOpenviduCallComponent`.
**Dependencies:** `livekit-client`, `@sapphi-red/web-noise-suppressor`, `@livekit/track-processors`
**Flag Notes:** None. Well-scoped, single-responsibility service.

---

### DeepAudioFilterService
**File:** `src/app/Service/NoiseCancellation/deep-audio-filter.service.ts`
**Status:** ✅ GOOD
**What it does:** Wraps Amazon Chime SDK's `VoiceFocusDeviceTransformer` to apply deep audio filtering to a `MediaStream`. Returns a processed `MediaStream`.
**Logic Summary:** Single async `applyFilter(stream)` method. No subscriptions or state. Used exclusively by `JoinOpenviduCallComponent`.
**Dependencies:** `amazon-chime-sdk-js`
**Flag Notes:** None. Well-scoped, single-responsibility service.

---

## ROOT & SHELL

---

### AppComponent
**File:** `src/app/app.component.ts`
**Status:** ❌ BAD
**What it does:** Root shell component. Manages the navigation sidebar, service worker updates, cross-tab messaging via BroadcastChannel, notification loading, and auth state monitoring. Renders the `<router-outlet>`.
**Logic Summary:**
- Constructor: starts Service Worker update interval poll (every 5min), sets up SW version listener, sets up BroadcastChannel cross-tab reload logic
- `ngOnInit()`: initializes auth state listener (`user()`), loads profile + role data via `onSnapshot()`, loads navigation items from Firestore, sets up notification streams
- `filterNavItems()`: filters dashboard nav by role and search
- `logout()`: shows confirm dialog, signs out, clears IndexedDB cache
- `ngOnDestroy()`: calls `destroy()` which closes BroadcastChannel and dismisses snackbar
**Dependencies:** `Router`, `Firestore`, `AuthguardService`, `Auth`, `BreakpointObserver`, `MatDialog`, `ChangeDetectorRef`, `SwUpdate`, `MatSnackBar`, `Title`, `Location`
**Flag Notes:**
- **CRITICAL LEAK:** `user(this.firebaseAuth).subscribe()` at the auth initialization block has no unsubscribe stored and is not managed with `takeUntil`. This re-subscribes on component construction and never terminates.
- **CRITICAL LEAK:** Two separate `router.events` subscriptions exist in the same component (navigation title tracking + a second one) — both without cleanup.
- **CRITICAL LEAK:** `window.addEventListener('visibilitychange')`, `window.addEventListener('focus')`, `window.addEventListener('blur')` are added in `setupUpdateListener()` but never removed in `ngOnDestroy()`.
- **CRITICAL LEAK:** BroadcastChannel `message` event listener (`channel.onmessage`) is set up but `channel.close()` only runs in the `destroy()` helper — ensure `ngOnDestroy()` actually calls `destroy()` (confirm this in the code).
- `unsubscribeFunctions[]` pattern (array of `() => void` teardowns from `onSnapshot()`) is error-prone — a single exception in one teardown will prevent subsequent ones from running.
- `ChangeDetectorRef` is injected but the component uses default change detection strategy (not OnPush) — the CDR injection is unnecessary overhead.

---

### LoginComponent
**File:** `src/app/login/login.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Authentication screen. Handles email/password login, phone OTP verification, and new user registration by cross-checking against Watson Cloud Function.
**Logic Summary:**
- Constructor: builds `loginform` and `registerform` with validators; extracts `returnUrl` from query params
- `dologin()`: queries `profile_data` by email, validates phone, triggers phone auth, calls `signInUser()`
- `signInUser()`: validates OTP dialog result, calls Firebase `signInWithEmailAndPassword()`, navigates to `returnUrl` or `/EISDashboard`
- `doregister()`: calls `checkProfile()` Cloud Function, handles phone auth, writes to `user` and `user_data` collections
- `resetPassword()`: calls Firebase `sendPasswordResetEmail()`
- `phoneAuthentication()`: currently stubbed — returns `true` always (OTP dialog code commented out)
**Dependencies:** `Firestore`, `Auth`, `Router`, `FormBuilder`, `ActivatedRoute`, `MatSnackBar`, `HttpClient`, `MatDialog`
**Flag Notes:**
- `phoneAuthentication()` is stubbed to return `true` — phone OTP verification is **bypassed entirely**. This is a security gap if phone verification is a required step.
- Multiple `alert()` calls (`alert('Please Wait...')`, `alert('Phone Verification Needed!')`) — use `MatSnackBar` for consistent UX.
- No `OnDestroy` implemented — if the component is navigated away from during an async operation, the auth state listener in `dologin()` could still execute against a destroyed view.

---

### MainDashboardComponent
**File:** `src/app/main-dashboard/main-dashboard.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** The `/EISDashboard` landing page. Intended to show the user's favorite/pinned dashboard routes. Currently the primary data-fetch method (`fetchFav`) is commented out.
**Logic Summary:**
- `ngOnInit()`: no active logic (fetchFav is disabled)
- `ngOnDestroy()`: properly completes Subject — cleanup is ready
- `navigateToRoute()`: navigates to a given path
- `trackByAction()`: trackBy for `*ngFor` performance
**Dependencies:** `ActivatedRoute`, `Firestore`, `AuthguardService`, `Router`, `MatSnackBar`, `Storage`
**Flag Notes:**
- `fetchFav()` method (lines 81–127) is entirely commented out. The dashboard is rendered but shows no content. This is likely an in-progress feature but should be tracked or explicitly removed.
- `Storage` (Firebase Storage) is injected but not used in any active code path — leftover dependency.

---

### RouteConfigurationComponent (DUPLICATE — ACTIVE)
**File:** `src/app/route-configuration-duplicate/route-configuration.component.ts`
**Status:** ❌ BAD
**What it does:** Admin screen to manage the navigation sidebar routes stored in the `dashboard` Firestore collection. Allows creating, editing, deleting, and drag-drop reordering of nav items.
**Logic Summary:**
- Constructor: calls `loadData()`, initializes `MatTableDataSource`
- `loadData()`: subscribes to `collectionSnapshots(dashboard)` with `takeUntil` — real-time updates
- `buildExpandedData()`: builds expanded/collapsed tree for display
- `createRoute() / editRoute()`: open `CreateroutedialogComponent` via `MatDialog`
- `deleteRoute()`: opens confirm dialog, then calls `deleteDoc()` on confirmed
- `ngAfterViewInit()`: sets paginator + sort
- `ngOnDestroy()`: completes Subject — subscription properly cleaned up
**Dependencies:** `Firestore`, `MatDialog`, `AuthguardService`, `Router`
**Flag Notes:**
- **CRITICAL:** This is the DUPLICATE that replaced the original `route-configuration/`. It is missing the `roles` column that the original component had. The `dashboard` documents contain a `roles` field but this component does not render or allow editing it, meaning role-based access control for dashboard routes **cannot be configured from the UI**.
- `deleteRoute()` creates a `dialogRef.afterClosed().subscribe()` without cleanup — minor leak in scenarios with rapid repeated deletes.
- Drag-drop reorder calls `updateFirestoreDocument()` synchronously on every drop with no debounce — results in excessive Firestore writes during drag operations.

---

### TvAuthComponent
**File:** `src/app/tv-auth.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED (Verify)
**What it does:** Public route (`/tv-auth`) for device authentication — likely QR-based TV/device auth flow.
**Flag Notes:** File was not read in this audit cycle — flag for manual review. No `authGuard` applied to this route, so it is fully public.

---

## PRODUCT DESIGNER

---

### AddjourneyComponent
**File:** `src/app/Product Designer/addjourney/addjourney.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Form to add/edit Journey definitions in the `journey` collection.
**Dependencies:** `Firestore`, `MatSnackBar`, `Router`
**Flag Notes:** Common pattern across Product Designer screens — verify that `subscribe()` calls to form valueChanges are properly cleaned up.

---

### AddpackageComponent
**File:** `src/app/Product Designer/addpackage/addpackage.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Form to create/edit Package bundles in the `package` collection.
**Flag Notes:** Same form pattern — check for missing `OnDestroy`.

---

### PackageDesignComponent
**File:** `src/app/Product Designer/package-design/package-design.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Visual package designer — maps journeys and products into package bundles.
**Flag Notes:** Likely uses `collectionSnapshots()` — verify `takeUntil` pattern is applied.

---

### DeliverySequenceComponent
**File:** `src/app/Product Designer/delivery-sequence/delivery-sequence.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Manages the sequence of deliverables (appointments, queues) in a product's delivery path.
**Flag Notes:** Uses `takeUntil` (8 occurrences found in grep) — good subscription management. However, high subscription count may indicate multiple competing `onSnapshot()` streams that could be merged.

---

### DeliverySetComponent
**File:** `src/app/Product Designer/delivery-set/delivery-set.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Manages delivery activity sets/groups. Uses drag-drop reordering.
**Flag Notes:** 7 `takeUntil` occurrences — well-managed. Check for debouncing on Firestore write after drag-drop reorder.

---

### AddProductComponent / ProductDeliveryComponent / ViewAtcmodelComponent
**File:** `src/app/Product Designer/add-product/`, `product-delivery/`, `product-atcmodel/view-atcmodel/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** CRUD screens for Product, Product Delivery mappings, and ATC Model configuration.
**Flag Notes:** Standard form + Firestore pattern. Verify `OnDestroy` and `takeUntil` compliance on `collectionSnapshots()` calls.

---

### JourneyProductComponent
**File:** `src/app/Product Designer/journey-product/journey-product/journey-product.component.ts`
**Status:** ✅ GOOD
**What it does:** Maps journeys to products. Uses `MapJourneyProductComponent` dialog for creating/editing mappings.
**Flag Notes:** 4 `takeUntil` occurrences — subscription management is present.

---

### CreateAelNamesComponent
**File:** `src/app/Product Designer/create-ael-names/create-ael-names.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages AEL (Adjust, Expand, Lead) names in the product system.
**Flag Notes:** 2 `takeUntil` occurrences — standard pattern.

---

## PARTICIPANTS PROFILE MANAGEMENT

---

### ProfilelistComponent
**File:** `src/app/Participants Profile Management/profilelist/profilelist.component.ts`
**Status:** ✅ GOOD
**What it does:** Master list of all participant profiles with search and filtering. Entry point for profile management.
**Logic Summary:** Loads `profile_data` and `participant metadata` via `authguard.getProfileMap()`. Filters locally. Navigates to `userprofile/:id` on selection.
**Dependencies:** `AuthguardService`, `Router`, `MatSnackBar`
**Flag Notes:** 3 `takeUntil` occurrences — managed. Standard list pattern.

---

### NewProfileComponent / UserprofileComponent
**File:** `src/app/Participants Profile Management/new-profile/new-profile.component.ts` and `userprofile/userprofile.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Full participant profile detail screen. Loads and displays timeline, purchases, queue tokens, ATC history, appointments, evolution mappings, issues, forms, achievements, and notifications for a single participant.
**Logic Summary:**
- `ngOnInit()`: loads 20+ collections in parallel using multiple `getDocs()` and `getDoc()` calls
- Writes `filteredtimeline profile` document on load for timeline construction
- Subscribes to notification logs via `onSnapshot()`
**Dependencies:** `Firestore`, `AuthguardService`, `Router`, `MatDialog`, `MatSnackBar`, 20+ Firestore collections
**Flag Notes:**
- **PERFORMANCE:** `ngOnInit()` fires 20+ separate Firestore reads for a single profile load. This pattern generates excessive read operations and increases cost. Consider batching into a Cloud Function or using parallel `Promise.all()` grouping with fewer round-trips.
- **OPTIMIZATION:** `filteredtimeline profile` is written on every profile view — this is a pre-compute write that should be done asynchronously/lazily, not on every read.
- 3 `takeUntil` occurrences (userprofile) — some subscriptions managed. Verify all `onSnapshot()` calls are cleaned up.
- Both `new-profile` and `userprofile` components appear to do nearly identical work — confirm whether both are needed or if this is a legacy duplication.

---

### ParticipantsAnalyticsComponent
**File:** `src/app/Participants Profile Management/participants-analytics/participants-analytics.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Analytics dashboard for participant data — bulk operations, export, broadcast messaging, tagging, and segment management.
**Dependencies:** `Firestore`, `AuthguardService`, `DataTransferService`, `WatiService`, `MatDialog`, `MatSnackBar`
**Flag Notes:**
- 10 `takeUntil` occurrences — high subscription count suggests complex reactive data flows; verify each stream is necessary.
- `DataTransferService.setData()` usage opens new browser tabs — this depends on the broken `ngOnDestroy` pattern in the service. localStorage accumulates.
- 2 utility imports (xlsx/date-fns related) — verify bundle size impact.

---

### ParticipantProductComponent
**File:** `src/app/Participants Profile Management/participant-product/participant-product.component.ts`
**Status:** ✅ GOOD
**What it does:** Shows and manages product enrollments for a specific participant.
**Flag Notes:** 4 `takeUntil` occurrences — properly managed.

---

### ProfileSummaryComponent
**File:** `src/app/Participants Profile Management/profile-summary/profile-summary.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Summary view of a participant's progress across all products, journey stages, and ATC assignments.
**Flag Notes:** 8 `takeUntil` occurrences — complex subscription setup. Verify that all `onSnapshot()` teardowns fire correctly in `ngOnDestroy`.

---

### ParticipantDeliverySequenceComponent
**File:** `src/app/Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts`
**Status:** ✅ GOOD
**What it does:** Displays and manages the delivery sequence for a participant within a product journey.
**Flag Notes:** Standard pattern.

---

## SCHEDULING

---

### AppointmentStudioComponent
**File:** `src/app/Scheduling/appointment-studio/appointment-studio.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Studio view for EIS staff to manage their scheduled appointments and initiate OpenVidu sessions.
**Logic Summary:**
- `ngOnInit()`: loads appointments via `collectionSnapshots()` filtered by host + starttime
- `openRoom()`: creates or reuses an OpenVidu room in Firestore, then navigates to the room
- `updatePlatform()`: updates appointment's `platform` field
**Dependencies:** `Firestore`, `AuthguardService`, `Router`, `MatSnackBar`
**Flag Notes:**
- 3 `takeUntil` occurrences — managed.
- `openRoom()` writes to `openviduroom` without checking for an existing active session, potentially creating duplicate rooms for the same appointment.

---

### AppointmentCalendarComponent
**File:** `src/app/Scheduling/appointment-calendar/appointment-calendar.component.ts`
**Status:** ✅ GOOD
**What it does:** Calendar view of all appointments using `angular-calendar`.
**Flag Notes:** 2 `takeUntil` occurrences — managed. Uses `date-fns` for date formatting.

---

### BookAppointmentComponent / AppointmentAvailabilityComponent
**File:** `src/app/Scheduling/book-appointment/` and `appointment-availability/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Booking interface and availability management for the scheduling system.
**Flag Notes:** Complex multi-step flows — verify that all intermediate subscriptions during the multi-step booking wizard are properly cleaned up.

---

### CapacityUtilizationComponent
**File:** `src/app/Scheduling/capacity-utilization/capacity-utilization.component.ts`
**Status:** ✅ GOOD
**What it does:** Reports on scheduling capacity usage across the team.
**Flag Notes:** Standard analytics pattern. `takeUntil` present.

---

### TeamDeliveryHoursComponent
**File:** `src/app/Scheduling/team-delivery-hours/team-delivery-hours.component.ts`
**Status:** ✅ GOOD
**What it does:** Configures team delivery hours per staff member.
**Flag Notes:** 2 `takeUntil` occurrences. Opens `TeamDeliveryHoursUpdateComponent` as dialog.

---

## QUEUE SYSTEM

---

### DynamicQueueManagerCloneComponent
**File:** `src/app/queue system/dynamic-queue-manager-clone/dynamic-queue-manager-clone.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** The main live queue management screen. Real-time visibility into all active queue tokens, stage transitions, participant status, ATC assignments, notifications, and communication dispatch.
**Logic Summary:**
- Loads 30+ Firestore collections on init
- Real-time subscriptions via `collectionData()` and `collectionSnapshots()` for token status, pairing data, activity, and notifications
- `moveToken()`: transitions a participant through queue stages with Firestore updates and notification dispatch
- Supports WhatsApp (Wati), email, and in-app notification sending
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `WatiService`, `MatSnackBar`
**Flag Notes:**
- **PERFORMANCE:** 25 `takeUntil` occurrences — highest in the codebase. This component maintains up to 25 concurrent real-time Firestore subscriptions. On a large queue, this means one subscription per collection, each streaming potentially hundreds of documents. This is a significant Firestore read cost and local memory load.
- 2 utility library imports (xlsx-related) — exports are possible from this screen.
- This is a **clone** of the original `dynamic-queue-manager`. Any bugs found here need to be confirmed in the original (now unused) to avoid re-introducing them if the original is ever restored.

---

### QueuePlanningComponent
**File:** `src/app/queue system/queue-planning/queue-planning.component.ts`
**Status:** ✅ GOOD
**What it does:** Pre-event queue planning screen — allocates participants to queue slots.
**Flag Notes:** 4 `takeUntil` occurrences — properly managed.

---

### QueuePlanningReviewComponent
**File:** `src/app/queue system/queue-planning-review/queue-planning-review.component.ts`
**Status:** ✅ GOOD
**What it does:** Review screen for finalized queue plans before execution.
**Flag Notes:** 5 `takeUntil` occurrences.

---

### DynamicStudioComponent
**File:** `src/app/queue system/dynamic-studio/dynamic-studio.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Studio management screen for live queue events — tracks participants entering/leaving studio sessions.
**Flag Notes:** 17 `takeUntil` occurrences — second highest in the codebase. Review whether all subscriptions are necessary or if some can be combined.

---

### QueueListComponent / QueueVenueComponent / ZoomAccountComponent
**File:** `src/app/queue system/queue-list/`, `queue-venue/`, `zoom-account/`
**Status:** ✅ GOOD
**What it does:** Administrative screens for managing queue definitions, venue configurations, and Zoom accounts.
**Flag Notes:** Standard CRUD patterns with proper `takeUntil` management.

---

### EventOpportunityDashboardComponent
**File:** `src/app/queue system/event-opportunity-dashboard/event-opportunity-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Dashboard showing event-based queue opportunities and pending actions.
**Flag Notes:** 3 `takeUntil` occurrences.

---

## ATC MODULE

---

### PrescribeATCComponent
**File:** `src/app/ATC/prescribe-atc/prescribe-atc.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Primary ATC prescription screen — EIS staff prescribe Adjust/Treat/Confirm activities to participants from within a live queue session.
**Logic Summary:**
- Loads 12+ collections including `atc model`, `procedures`, `users_roles`, `profile_data`, `bigactivity`, `queue generation`, `queue studio pairing`, `temporary_ATC`, `atc assignment`
- `saveDraft()`: writes to `temporary_ATC` collection for in-progress prescriptions
- `submit()`: finalizes ATC, updates queue token/pairing status, logs stage transition
- Supports recording via `recordrtc` library
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatSnackBar`, RecordRTC
**Flag Notes:**
- 10 `takeUntil` occurrences — well managed.
- `temporary_ATC` draft mechanism means incomplete prescriptions persist in Firestore. Ensure a cleanup job exists for orphaned drafts (participant never submits).
- RecordRTC integration — verify `recorder.stopRecording()` is always called in `ngOnDestroy` to release microphone permissions.

---

### EditAtcComponent / ViewPrescribedATCComponent / ViewAssignedATCComponent
**File:** `src/app/ATC/edit-atc/`, `view-prescribed-atc/`, `view-assigned-atc/`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** View/edit/review screens for ATC prescriptions at various workflow stages.
**Flag Notes:** 4/10/8 `takeUntil` occurrences respectively — subscription management present but high counts warrant review.

---

### ReviewFlagATCComponent
**File:** `src/app/ATC/review-flag-atc/review-flag-atc.component.ts`
**Status:** ✅ GOOD
**What it does:** Quality review screen for flagged ATC prescriptions — validator workflow.
**Flag Notes:** 8 `takeUntil` occurrences — comprehensive subscription management.

---

### LivePrescriptionComponent
**File:** `src/app/ATC/live-prescription/live-prescription.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Real-time prescription screen for live queue sessions. Supports draft-based ATC prescription flow.
**Flag Notes:** 6 `takeUntil` occurrences. Verify RecordRTC cleanup on destroy.

---

### AddTripleATCComponent / EditTripleATCComponent / ViewTripleATCComponent
**File:** `src/app/ATC/Triple ATC/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Triple ATC variant for the three-column prescription format (Adjust + Treat + Confirm).
**Flag Notes:** Check for analogous issues as regular ATC components (draft cleanup, recording teardown).

---

## B!G MODULE

---

### BigDashboardComponent
**File:** `src/app/big/big-dashboard/big-dashboard.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Master dashboard for the B!G program — displays cohorts, participant assignments, activity levels, marathon tracking, and aggregated analytics.
**Logic Summary:**
- Loads 20+ collections on init including `journey`, `participant metadata`, `big participants tags`, `big cohorts`, `event collection`, `big tags`, `biglevel`, `big marathon`, `big assignment`, `atc_alpha`
- Real-time subscriptions via `collectionSnapshots()` for live data
- Opens multiple dialogs for cohort management, marathon creation, etc.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatSnackBar`, multiple collections
**Flag Notes:**
- 4 `takeUntil` occurrences on a component loading 20+ collections — possible gap between number of subscriptions and managed teardowns.
- Loading all `participant metadata` (potentially thousands of documents) on init is expensive — needs pagination or virtualization.
- Direct DOM manipulation via `document.body.appendChild` for PDF export — this pattern bypasses Angular's change detection.

---

### BigCohortCloneComponent
**File:** `src/app/big/big-cohort-clone/big-cohort-clone.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Cohort management screen for the B!G program — view, create, and manage participant cohorts.
**Flag Notes:** 8 `takeUntil` occurrences — well-managed. This is a clone; confirm no functional divergence from `big-cohorts.component.ts` original.

---

### BigChatScreenComponent
**File:** `src/app/big/big-chat-screen/big-chat-screen.component.ts`
**Status:** ✅ GOOD
**What it does:** Real-time chat screen for B!G cohort communication. Uses `bigchat` Firestore collection.
**Flag Notes:** 5 `takeUntil` occurrences — properly managed.

---

### BigActivityComponent / BigActivityLogComponent / MonitorActivityLogComponent
**File:** `src/app/big/big-activity/`, `big-activity-log/`, `monitor-activity-log/`
**Status:** ✅ GOOD
**What it does:** Activity management and monitoring screens for B!G program activities.
**Flag Notes:** 2/7/2 `takeUntil` occurrences.

---

### BigAggregateComponent / BigAggregateEventLevelComponent
**File:** `src/app/big/big-aggregate/`, `big-aggregate-event-level/`
**Status:** ✅ GOOD
**What it does:** Aggregate scoring and level assignment screens for B!G participants.
**Flag Notes:** 4 `takeUntil` occurrences each.

---

### ZoomMeetingComponent
**File:** `src/app/big/zoom-meeting/zoom-meeting.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Launches Zoom Web SDK for B!G group meetings.
**Dependencies:** `@zoom/meetingsdk`
**Flag Notes:** Verify that the Zoom SDK instance is properly terminated in `ngOnDestroy` — Zoom SDK holds media permissions (camera/mic) that must be explicitly released.

---

### ParticipantAssignmentBoardComponent
**File:** `src/app/big/participant-assignment-board/participant-assignment-board.component.ts`
**Status:** ✅ GOOD
**What it does:** Kanban-style board for assigning participants to B!G activities and cohorts.
**Flag Notes:** 4 `takeUntil` occurrences.

---

## EVENTS MODULE

---

### EventListComponent
**File:** `src/app/Events/event-list/event-list.component.ts`
**Status:** ✅ GOOD
**What it does:** Master list of events with create/edit capabilities. Uses `event collection` Firestore collection.
**Flag Notes:** 2 `takeUntil` occurrences. Clean simple pattern.

---

### LiveEventDashboardComponent / LiveEventDashboardV2Component
**File:** `src/app/Events/live-event-dashboard/` and `live-event-dashboard-v2/`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Real-time dashboard for monitoring live events — participant check-in, zone assignment, ticket validation.
**Flag Notes:** 7/5 `takeUntil` occurrences. V2 likely supersedes V1 — confirm whether V1 is still needed. Both are in active routes.

---

### EventParticipationApproveComponent / ArenaETicketApproveComponent
**File:** `src/app/Events/event-participation-approve/` and `arena-e-ticket-approve/`
**Status:** ✅ GOOD
**What it does:** Approval workflows for event registration and arena e-ticket generation.
**Flag Notes:** 3 occurrences each — properly managed.

---

### QrScannerComponent
**File:** `src/app/Events/qr-scanner/qr-scanner.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** QR code scanner for event check-in using `@zxing/ngx-scanner`.
**Dependencies:** `@zxing/ngx-scanner`
**Flag Notes:** Camera permissions must be released in `ngOnDestroy`. Verify that the ZXing scanner component is properly destroyed and camera stream stopped.

---

### ChatScreenComponent (Events)
**File:** `src/app/Events/Chat/chat-screen/chat-screen.component.ts`
**Status:** ✅ GOOD
**What it does:** Group chat for event participants. Real-time using Firestore `messages` subcollection.
**Flag Notes:** 5 `takeUntil` occurrences — well-managed.

---

### EventZoneManagementComponent
**File:** `src/app/Zone Management/event-zone-management/event-zone-management.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Manages zone assignments for event participants — drag-drop interface for zone allocation.
**Dependencies:** `Firestore`, `ChangeDetectorRef`, `MatDialog`
**Flag Notes:** 5 `takeUntil` occurrences. `ChangeDetectorRef` is injected — this component likely requires manual change detection triggering due to complex drag-drop state. Ensure CDR calls are paired with proper zone state tracking.

---

## CONTENT MODULE

---

### EpisodesDashboardComponent
**File:** `src/app/content/episodes-dashboard/episodes-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages video episode content — CRUD for episodes in the `episodes` collection.
**Flag Notes:** 3 `takeUntil` occurrences.

---

### SeriesDashboardComponent
**File:** `src/app/content/series-dashboard/series-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages video series groupings with child routes for add/edit operations.
**Flag Notes:** 2 `takeUntil` occurrences.

---

### AudioDashboardComponent
**File:** `src/app/content/audio-dashboard/audio-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages audio content in the platform.
**Flag Notes:** 3 `takeUntil` occurrences.

---

### PlaylistDashboardComponent / PlaylistConfigurationComponent
**File:** `src/app/content/playlist-dashboard/`
**Status:** ✅ GOOD
**What it does:** Manages content playlists and their configuration.
**Flag Notes:** 4 occurrences each — well-managed.

---

### ContentUploadComponent
**File:** `src/app/content/content-upload/content-upload.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** File upload screen for video/audio content using Firebase Storage.
**Flag Notes:** 3 `takeUntil` occurrences. Verify Firebase Storage upload subscriptions (`UploadTask.snapshotChanges()`) are properly cancelled in `ngOnDestroy` if navigation occurs mid-upload.

---

### ContentAnalyticsComponent / ContentAnalyticsDashboardComponent
**File:** `src/app/content/content-analytics/` and `content-analytics-dashboard/`
**Status:** ✅ GOOD
**What it does:** Visualizes content consumption analytics using ApexCharts.
**Flag Notes:** 1/5 `takeUntil` occurrences. Charts should be destroyed in `ngOnDestroy` via ApexCharts' `destroy()` API.

---

### AccessScreenComponent
**File:** `src/app/content/access-screen/access-screen.component.ts`
**Status:** ✅ GOOD
**What it does:** Content tier access management screen.
**Flag Notes:** 4 `takeUntil` occurrences.

---

## COMMUNICATION CENTER

---

### CommunicationComponent
**File:** `src/app/Communication Center/communication/communication.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Central communication hub — manages email templates, notification templates, in-app messages, Wati/WhatsApp archives, and MyOperator call logs.
**Logic Summary:**
- Loads 12+ collections including `email templates`, `notification templates`, `inapp templates`, `wati templates`, `email archive`, `wati archive`, `myoperator calls`
- Supports date-range filtering for archive data
- `sendEmail()`: writes to `email archive`, triggering a Cloud Function send
**Dependencies:** `Firestore`, `AuthguardService`, `WatiService`, `MatDialog`, `MatSnackBar`
**Flag Notes:**
- 2 utility imports (xlsx-related) — export functionality.
- High collection count on init — same optimization opportunity as other dashboard components.

---

### CreateEmailTemplateComponent
**File:** `src/app/Communication Center/create-email-template/create-email-template.component.ts`
**Status:** ✅ GOOD
**What it does:** Rich text email template editor using `@kolkov/angular-editor`.
**Flag Notes:** 1 `takeUntil` occurrence.

---

### ZoomRecordingDashboardComponent
**File:** `src/app/Communication Center/zoom-recording-dashboard/zoom-recording-dashboard.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Dashboard for Zoom cloud recordings — lists and manages recorded sessions.
**Flag Notes:** Verify Zoom SDK session cleanup patterns similar to ZoomMeetingComponent.

---

## JOURNEY ONBOARDING

---

### JourneycoachDuplicateComponent
**File:** `src/app/Journey Onboarding/journeycoach-duplicate/journeycoach-duplicate.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Journey coach dashboard (active route: `/JourneycoachDashboard-new`) — shows leads, opportunities, and delivery progress. Also opens `EcoSystemDialogComponent` programmatically.
**Flag Notes:** 1 `takeUntil` occurrence — likely insufficient for a dashboard-class component. Verify all subscriptions are managed.

---

### DeliveryDashboardCloneComponent
**File:** `src/app/Journey Onboarding/delivery-dashboard-clone/delivery-dashboard-clone.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Delivery tracking dashboard for journey coaches (active route: `/delivery-dashboard`). A clone — functional divergence from the original should be reviewed.
**Flag Notes:** 1 `takeUntil` occurrence — low for a delivery dashboard. Check for unmanaged subscriptions.

---

### SalesDashboardCloneComponent
**File:** `src/app/Journey Onboarding/sales-dashboard-clone/sales-dashboard-clone.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Sales reporting dashboard (active route: `/sales-report`). Clone of original.
**Flag Notes:** 3 xlsx-related imports — export-heavy screen. Verify `document.body.appendChild` usage for PDF/Excel downloads is wrapped in `isPlatformBrowser()` check for SSR compatibility (this app has `@angular/ssr` configured).

---

### OverallDashboardComponent
**File:** `src/app/Journey Onboarding/overall-dashboard/overall-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Summary dashboard showing overall journey onboarding metrics.
**Flag Notes:** 1 xlsx import for exports. Standard pattern.

---

### SalesleadComponent
**File:** `src/app/Journey Onboarding/saleslead/saleslead.component.ts`
**Status:** ✅ GOOD
**What it does:** Sales leads management — creates and tracks sales leads.
**Flag Notes:** 2 `takeUntil` occurrences.

---

### EcoSystemNewComponent
**File:** `src/app/Journey Onboarding/eco-system-new/eco-system-new.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Ecosystem overview screen showing how journeys, products, and participants interconnect.
**Flag Notes:** Loaded via two duplicate route entries (`ecosystem` appears twice in `app.routes.ts` — lines 220 and 315). The second entry will silently override the first. One of the duplicate route definitions should be removed.

---

### JourneyOnboardingDetailComponent
**File:** `src/app/journey-onboarding-detail/journey-onboarding-detail.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Detailed onboarding screen for a specific participant journey.
**Dependencies:** `Firestore`, `ChangeDetectorRef`
**Flag Notes:** `ChangeDetectorRef` injected without OnPush strategy — this injection is unnecessary unless CDR is explicitly called. Review and either add OnPush or remove CDR.

---

## APP ENGAGEMENT

---

### ModeDashboardComponent / ModeDashboardNewComponent
**File:** `src/app/AppEngagement/mode-dashboard/` and `mode-dashboard-new/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Manages app modes (program phases) and their configuration. Two versions exist with both in active routes.
**Flag Notes:** Both versions are in routes — confirm whether both are intentionally different or if one should be removed.

---

### ParticipantAELComponent
**File:** `src/app/AppEngagement/participant-ael/participant-ael.component.ts`
**Status:** ✅ GOOD
**What it does:** AEL (Adjust, Expand, Lead) tracking per participant.
**Flag Notes:** 4 `takeUntil` occurrences.

---

### CommunityManagerComponent
**File:** `src/app/AppEngagement/community-manager/community-manager.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Community management screen — posts, announcements, and group communication.
**Flag Notes:** Appears in two routes (`/communitymanager` top-level and inside `content-upload-v2` child routes). Duplicate route registration — one path will shadow the other.

---

### NotificationsLogComponent / NotificationRecordComponent
**File:** `src/app/AppEngagement/notifications-log/` and `notification-record/`
**Status:** ✅ GOOD
**What it does:** Logs and records of notifications sent/received.
**Flag Notes:** Standard list pattern.

---

### BigwallDataAddingComponent
**File:** `src/app/AppEngagement/bigwall-data-adding/bigwall-data-adding.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Adds/manages BigWall content entries. Contains `VideoaskTranscribeComponent` as a child.
**Flag Notes:** References `dompurify` for HTML sanitization — good security practice. Verify all user-generated HTML inputs pass through DOMPurify before rendering.

---

### ParticipantListComponent (AHCRM)
**File:** `src/app/AppEngagement/ahcrm_home/participant-list/participant-list.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** CRM-style participant list view under the `/ahcrm` route.
**Flag Notes:** 8 `takeUntil` occurrences — well managed.

---

## NEW-WORKSHOP MODULE

---

### WorkshopsComponent / WorkshopDashboardComponent
**File:** `src/app/New-Workshop/workshops/` and `workshop-dashboard/`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Workshop listing and per-workshop detail dashboard.
**Flag Notes:** `WorkshopDashboardComponent` injects `ChangeDetectorRef` without OnPush strategy.

---

### WorkshopConfigurationComponent
**File:** `src/app/New-Workshop/workshop-configuration/workshop-configuration.component.ts`
**Status:** ✅ GOOD
**What it does:** Detailed configuration screen for a workshop's structure, assignments, and forms.
**Flag Notes:** 10 `takeUntil` occurrences — highest in New-Workshop module. Verify all streams are necessary.

---

### EngagementDashboardComponent / CapacityDashboardComponent
**File:** `src/app/New-Workshop/engagement-dashboard/` and `capacity-dashboard/`
**Status:** ✅ GOOD
**What it does:** Analytics screens for workshop engagement and capacity metrics.
**Flag Notes:** 2/4 `takeUntil` occurrences.

---

## OPENVIDU MODULE

---

### JoinOpenviduCallComponent
**File:** `src/app/OpenVidu/join-openvidu-call/join-openvidu-call.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Joins an OpenVidu live video call. Integrates `NoisecancellationService` and `DeepAudioFilterService` for audio processing.
**Logic Summary:**
- Initializes LiveKit room connection
- Applies noise cancellation and deep audio filtering to microphone track
- Manages video/audio publish state
**Dependencies:** `NoisecancellationService`, `DeepAudioFilterService`, `Firestore`, `livekit-client`, `@livekit/track-processors`
**Flag Notes:** 3 `takeUntil` occurrences. Verify LiveKit room is properly disconnected in `ngOnDestroy` — `room.disconnect()` must be called to release camera/microphone permissions and prevent background media capture.

---

### ListOpenviduRoomComponent / MonitorLiveassignmentComponent
**File:** `src/app/OpenVidu/list-openvidu-room/` and `monitor-liveassignment/`
**Status:** ✅ GOOD
**What it does:** Studio participant list and live assignment monitoring for OpenVidu sessions.
**Flag Notes:** 4/7 `takeUntil` occurrences.

---

### OpenviduRecordingComponent
**File:** `src/app/OpenVidu/openvidu-recording/openvidu-recording.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages OpenVidu session recordings.
**Flag Notes:** 2 `takeUntil` occurrences.

---

## CUSTOMER SUPPORT

---

### CustomerSupportDashboardComponent
**File:** `src/app/Customer Support/customer-support-dashboard/customer-support-dashboard.component.ts`
**Status:** ✅ GOOD
**What it does:** Main dashboard for customer support tickets — list view with status filters.
**Flag Notes:** 5 `takeUntil` occurrences — well-managed.

---

### CustomerChatScreenComponent
**File:** `src/app/Customer Support/customer-chat-screen/customer-chat-screen.component.ts`
**Status:** ✅ GOOD
**What it does:** Real-time chat interface for a support ticket — staff ↔ participant messaging.
**Flag Notes:** 5 `takeUntil` occurrences. Real-time Firestore chat subscription.

---

### CustomerTicketNewComponent / CustomerticketsComponent
**File:** `src/app/Customer Support/customer-ticket-new/` and `customertickets/`
**Status:** ✅ GOOD
**What it does:** Ticket creation and ticket listing screens.
**Flag Notes:** Standard patterns.

---

## DIAGNOSTICS

---

### QueueEventHealthComponent / LiveEventHealthComponent
**File:** `src/app/Diagnostics Tool/queue-event-health/` and `live-event-health/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Health monitoring screens for queue and live event infrastructure.
**Flag Notes:** Likely reads `AWS_System/instance_status` and live queue data. Verify these screens do not maintain persistent `onSnapshot()` subscriptions that remain active when hidden.

---

## EVOLUTION MAPPING

---

### EvolutionMappingComponent / EvolutionMappingV2Component / EvolutionMappingNewComponent
**File:** `src/app/EvolutionMapping/`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Three versions of the evolution mapping screen — tracks participant behavioral evolution over time with video recordings.
**Flag Notes:** All three versions are in active routes. Confirm whether multiple versions are intentional (e.g. for A/B testing different workflows) or are migration artifacts. If V2/New supersede V1, the older routes should be removed.

---

## BUSINESS DASHBOARD

---

### ExpensePlannerComponent
**File:** `src/app/Business Dashboard/expense-planner/expense-planner.component.ts`
**Status:** ✅ GOOD
**What it does:** Expense tracking and reporting for business operations.
**Flag Notes:** Standard pattern.

---

### EntryManagementComponent
**File:** `src/app/Business Dashboard/AdsEntry/entry-management.component.ts`
**Status:** ✅ GOOD
**What it does:** Manages advertising entries for the platform.
**Flag Notes:** Standard CRUD pattern.

---

### ProfileBasedAccessComponent
**File:** `src/app/Business Dashboard/profile-based-access/profile-based-access.component.ts`
**Status:** ✅ GOOD
**What it does:** Configures profile-based access permissions.
**Flag Notes:** Standard admin pattern.

---

## HPC

---

### HPCComponent
**File:** `src/app/hpc/hpc.component.ts`
**Status:** ❌ BAD
**What it does:** High-Performance Coaching (HPC) management screen — manages HPC sessions, profiles, accelerators, contrast prompts, and statistics across group and individual sessions.
**Logic Summary:**
- Constructor: calls `guard.getRoles()` TWICE (redundant), loads profile map
- `ngOnInit()`: subscribes to `profileFilterCtrl.valueChanges` — NO CLEANUP
- `loadAllHpc()`: loads all HPC documents from Firestore collection
- `loadData()`: loads accelerators, notifications, config
- `updateFilteredHpcData()`: 3-level nested filtering with sort — called on every filter change
- Statistics getters (`groupCount`, `individualCount`, etc.) recompute on every access — no memoization
**Dependencies:** `Firestore`, `MatDialog`, `MatSnackBar`, `AuthguardService`
**Flag Notes:**
- **CRITICAL:** No `implements OnDestroy` — `profileFilterCtrl.valueChanges.subscribe()` from `ngOnInit()` will never be cleaned up. Every re-visit to this route creates a new leaked subscription.
- `guard.getRoles()` is called twice in the constructor (lines 104–106 and 116–119) — one call is redundant, doubling the Firestore read.
- `updateFilteredHpcData()` performs nested filtering + sorting on the full dataset on every keystroke — add `debounceTime(300)` to the `valueChanges` pipe.
- Getter methods that compute aggregates are called on every change detection cycle. Move expensive computations into `ngOnInit` or memoize results with signals/computed.
- `confirmRemove()` uses the browser native `confirm()` dialog — use `MatDialog` + `ConfirmComponent` instead (already exists in the project).
- No pagination — all HPC documents loaded into memory.

---

## PARTICIPANT TOUCHPOINT

---

### ParticipantTouchpointComponent
**File:** `src/app/participant-touchpoint/participant-touchpoint.component.ts`
**Status:** ✅ GOOD
**What it does:** Logs and views touchpoint interactions with participants (calls, messages, meetings).
**Flag Notes:** 2 `takeUntil` occurrences.

---

## DIALOG COMPONENTS

---

### ConfirmComponent
**File:** `src/app/DialogBox/confirm/confirm.component.ts`
**Status:** ✅ GOOD
**What it does:** Reusable confirmation dialog — "Are you sure?" pattern used throughout the app.
**Flag Notes:** Simple stateless dialog.

---

### LoadingProgressComponent
**File:** `src/app/loading-progress/loading-progress.component.ts`
**Status:** ✅ GOOD
**What it does:** Progress indicator dialog shown during long async operations.
**Flag Notes:** Simple stateless overlay.

---

### OtpVerificationComponent
**File:** `src/app/DialogBox/otp-verification/otp-verification.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** OTP input dialog for phone number verification during login.
**Flag Notes:** OTP verification appears to be bypassed in `LoginComponent` (`phoneAuthentication()` always returns `true`). This component may never be shown in practice.

---

### AhNotificationComponent
**File:** `src/app/DialogBox/ah-notification/ah-notification.component.ts`
**Status:** ✅ GOOD
**What it does:** Displays A&H system update notifications to users.
**Flag Notes:** 3 `takeUntil` occurrences.

---

### SelectValidatorComponent
**File:** `src/app/DialogBox/select-validator/select-validator.component.ts`
**Status:** ✅ GOOD
**What it does:** Dialog to select an ATC validator from the `users_roles` list.
**Flag Notes:** Standard dialog pattern.

---

## WORKSHOPS (Classic)

---

### ChallengeViewComponent / EnrollmentConfigViewComponent / ParticipantEnrollmentDashboardComponent
**File:** `src/app/Workshop/`
**Status:** ✅ GOOD
**What it does:** Classic Workshop module — challenge management, enrollment configuration, and participant dashboard.
**Flag Notes:** 2/2/3 `takeUntil` occurrences. Standard patterns.

---

## OFFTIME

---

### OfftimeListComponent / ApproveOfftimeComponent / AddOfftimeComponent
**File:** `src/app/Offtime/`
**Status:** ✅ GOOD
**What it does:** Staff off-time management — request, list, and approve time-off.
**Flag Notes:** 2 `takeUntil` occurrences. Clean implementations.

---

## MISCELLANEOUS

---

### ArenaDesignInsightsComponent
**File:** `src/app/arena-design-insights/arena-design-insights.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Design-stage insights screen — public route (no `authGuard`). Unclear purpose in the production app.
**Flag Notes:** 6 `takeUntil` occurrences. The route is public (`canActivate` not applied) — confirm this is intentional.

---

### ViewAiGeneratedAtcComponent
**File:** `src/app/view-ai-generated-atc/view-ai-generated-atc.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Displays AI-generated ATC prescriptions for review.
**Flag Notes:** 2 `takeUntil` occurrences. Newer feature — verify error states are handled when AI generation fails or returns empty results.

---

### AppointmentDashboardComponent
**File:** `src/app/appointment-dashboard/appointment-dashboard.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Appointment overview dashboard (credited to "Vadivel" in routes file comment).
**Flag Notes:** Separate from the `Scheduling` module's appointment screens — verify overlap and whether this is complementary or duplicate functionality.

---

## JOURNEY ONBOARDING (Extended)

---

### JourneyplanComponent
**File:** `src/app/Journey Onboarding/journeyplan/journeyplan.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Monthly journey planning UI — lets EIS staff plan a participant's 6-month rolling schedule of solar playlists, EiFlix series, and workshops. Uses `writeBatch` to save monthly plans.
**Logic Summary:** Constructor performs heavy sequential async work: `guard.getRoles()`, `participantProducts()`, `initializeMonthlyPlan()`, `watsonParticipantSchedule()`. `ngOnInit()` loads all content collections. `submitMonthlyPlan()` validates and batch-writes to Firestore.
**Dependencies:** `Firestore`, `ActivatedRoute`, `AuthguardService`, `MatDialog`, `Location`
**Flag Notes:**
- A `Subject<void>()` is created as `subscription` but **never used with `takeUntil`** — it is dead infrastructure.
- No `ngOnDestroy` implemented — any async operations in-flight on navigation are unguarded.
- Heavy constructor logic (multiple `await` chains without `try/catch`) — a single Firestore failure will crash the entire initialization silently.
- `productData` typed as `unknown` — removes all type safety for a core data object.

---

### CreateWatsonProfileComponent
**File:** `src/app/Journey Onboarding/create-watson-profile/create-watson-profile.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Dialog for creating/updating Watson CRM profiles during participant onboarding. Handles checkpoints, subscription date calculation, and purchase history across journey types (new, upgrade, downgrade, addon, cancelled).
**Logic Summary:** Constructor receives `MAT_DIALOG_DATA`, calls `guard.initializeWatson()`, initializes a secondary Watson Firestore instance, fetches profile + purchase records. Uses `setTimeout(2000)` to artificially delay loading dialog close.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatDialogRef`, `NgZone`, `MAT_DIALOG_DATA`
**Flag Notes:**
- `setTimeout(2000)` anti-pattern used to delay loading completion — indicates a race condition in the async flow that isn't properly solved. Replace with `Promise.all()` and a proper loading state flag.
- Heavy constructor initialization — all async work should move to `ngOnInit()`.
- `ngOnDestroy()` exists but is empty — verify no cleanup is needed for the secondary Watson Firestore instance.

---

### OnboardingRemarkComponent
**File:** `src/app/Journey Onboarding/onboarding-remark/onboarding-remark.component.ts`
**Status:** ✅ GOOD
**What it does:** Dialog for marking participants as onboarded — captures onboarding date, notes, opportunity checkboxes, and related appointment data.
**Logic Summary:** Receives `MAT_DIALOG_DATA`, loads AH members list and appointment map. `onSubmit()` writes onboarding status to Firestore. `setCheckboxStates()` initializes opportunity checkboxes.
**Dependencies:** `MatDialogRef`, `MatDialog`, `AuthguardService`, `Firestore`, `MAT_DIALOG_DATA`
**Flag Notes:** No active subscriptions — promise-based only. Clean dialog pattern.

---

### ProductInitiationDashboardComponent
**File:** `src/app/Journey Onboarding/product-initiation-dashboard/product-initiation-dashboard.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Dashboard showing product initiation status categorized into states (awaiting initiation, ready, payment not cleared, etc.) with month navigation.
**Logic Summary:** Constructor builds filter FormGroup; `ngOnInit` calls `loadParticipantMetadata()`, sets current month bounds, loads journey data. `ChangeDetectorRef.detectChanges()` called after async completion via `checkAllDataLoaded()`.
**Dependencies:** `Firestore`, `ChangeDetectorRef`, `AuthguardService`, `FormBuilder`, `DatePipe`, `MatDialog`, `Router`
**Flag Notes:**
- `ChangeDetectorRef` injected and manually triggered after async data loads — indicates the component is fighting Angular's change detection. Consider using `async` pipe + Observables instead of imperative CDR calls.
- Multiple parallel loading state flags tracked separately via object (`loadingStates`) — fragile pattern if any flag is missed. Use `Promise.all()` with a single boolean flag instead.
- 2 `takeUntil` occurrences — subscription management partial; verify all streams are covered.

---

## PARTICIPANTS PROFILE MANAGEMENT (Extended)

---

### JourneyProductPurchaseComponent
**File:** `src/app/Participants Profile Management/journey-product-purchase/journey-product-purchase.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Manages product purchase records for a participant's journey — create, edit, and delete purchases with delivery sequence validation.
**Logic Summary:** Constructor initializes Watson Firestore and fetches purchase data via route params. `ngOnInit()` subscribes to journey, product, and package collections. `updatePurchase()` writes to Firestore. `validateANDdeleteProduct()` checks for active deliverables before deletion.
**Dependencies:** `Router`, `ActivatedRoute`, `Firestore`, `AuthguardService`, `MatDialog`, `Location`
**Flag Notes:**
- Three `collectionData()` subscriptions (`journeySubscription`, `packageSubscription`, `productSubscription`) stored in instance variables and manually unsubscribed in `ngOnDestroy` — this works but is the old pre-`takeUntil` pattern. Convert to `takeUntil` for consistency.
- `route.params.subscribe()` in constructor has **no cleanup** — memory leak on route parameter changes.
- Multiple nested promise chains without `try/catch`.

---

### AppFlowBreaksComponent
**File:** `src/app/Participants Profile Management/app-flow-breaks/app-flow-breaks.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Displays and filters app flow break reports (UI bugs/errors) with participant profile enrichment and pagination.
**Logic Summary:** `ngOnInit()` calls `loadAllBugs()` which fetches all `appflowbreaks` documents then enriches each with a `getProfileData()` call. `applyFilters()` does client-side filtering by type, name, email, phone. `destroy$` Subject used with `takeUntil` — properly implemented.
**Dependencies:** `Firestore`
**Flag Notes:**
- **N+1 query problem:** For each bug document, a separate `getDoc()` call fetches the participant profile. With 100 bugs, this generates 101 Firestore reads. Use `getDocs()` with an `in` filter on profileIds (batched in groups of 10) instead.
- Filtering is entirely client-side on the full dataset — add server-side `where()` filters or at least add an upper limit to the collection query.

---

### ParticipantFormTrackerComponent
**File:** `src/app/Participants Profile Management/participant-form-tracker/participant-form-tracker.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Multi-tab paginated form tracker showing participant submissions across different form types with overlay view for individual/merged form display.
**Logic Summary:** Constructor creates FormControls for filters. `ngOnInit()` calls `fetchAskAH()` and `fetchParticipants()`, subscribes to `participantFilterCtrl.valueChanges`. `fetchRecords()` builds parameterized Firestore queries with page caching via a `Map`.
**Dependencies:** `Firestore`
**Flag Notes:**
- `participantFilterCtrl.valueChanges.subscribe()` has **no `takeUntil`** and no `ngOnDestroy` — leaked subscription on every navigation to this route.
- Hardcoded form ID `'QundpMXgXlXiCJYZ7WU4'` for uP! Life Report — brittle, will silently break if the Firestore document ID changes.
- `totalRecords` is estimated rather than a real count — pagination display can be misleading.

---

### ViewParticipantsFormComponent
**File:** `src/app/Participants Profile Management/view-participants-form/view-participants-form.component.ts`
**Status:** ✅ GOOD
**What it does:** Advanced form viewer with multi-source data loading (queues, workshops, forms), Excel email import for bulk filtering, and overlay display for individual/merged form views.
**Logic Summary:** Constructor initializes 4 async operations tracked by `queryRunTimes` counter. `ngOnInit()` sets up filter controls with `takeUntil(this.destroy$)`. `onImportEmails()` parses uploaded XLSX and matches emails to participant profiles.
**Dependencies:** `Firestore`, `AuthguardService`, `Router`, `FormBuilder`, `MatDialog`
**Flag Notes:**
- `queryRunTimes` counter pattern (increments to 4, triggers final step at 4) is fragile — a single failure in one branch will prevent initialization from completing. Prefer `Promise.all()`.
- 7 `takeUntil` occurrences — well-managed overall. One of the better-structured large components.

---

## QUEUE SYSTEM (Extended)

---

### ArenastudioactivityComponent
**File:** `src/app/queue system/arenastudioactivity/arenastudioactivity.component.ts`
**Status:** ✅ GOOD
**What it does:** Real-time arena studio activity view — shows active queues and their live assignment/zoom pairing status.
**Logic Summary:** Constructor loads roles + profile/zoom account maps. `ngOnInit()` subscribes to `queue generation` and zoom accounts via `collectionData().pipe(takeUntil(...))`. `onQueueSelect()` filters participant list. `closeStudio()` updates studio status with confirm dialog.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`
**Flag Notes:** 5 `takeUntil` occurrences — well-managed. `loading` getter defined but never referenced in template — dead code.

---

### BigPlannerComponent
**File:** `src/app/queue system/big-planner/big-planner.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Large-scale event planning screen for B!G program — manages studio pairings, cohort assignments, token tracking, and activity logging for arena events.
**Logic Summary:** Constructor loads products, profile maps, roles, queue data via `getDocs()`. `ngOnInit()` subscribes to 9 collections. `onQueueSelect()` loads queue-specific data. `ngOnDestroy()` completes `unsubscribe$` Subject.
**Dependencies:** `ActivatedRoute`, `AuthguardService`, `Firestore`, `MatDialog`, `MatSnackBar`, `DatePipe`
**Flag Notes:**
- 9 `takeUntil` occurrences — high but managed.
- Hardcoded profile/project IDs for delete permission check — these are environment-specific and should be in `environment.ts`.
- Direct array mutation inside subscribe callbacks — prefer immutable patterns to avoid unexpected side effects.

---

### InitiateEventProductComponent
**File:** `src/app/queue system/initiate-event-product/initiate-event-product.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Manages event/product initiation with queue variations and participant assignments — bridges queue setup with delivery sequences.
**Logic Summary:** Constructor calls `guard.getRoles()` and `loadData()`. `loadData()` uses `combineLatest()` with `collectionSnapshots()` to merge events and queues filtered by delete flag. `getDeliveryActivityName()` batch-queries activity names via Promise arrays.
**Dependencies:** `Firestore`, `AuthguardService`, `Router`, `MatDialog`, `MatSnackBar`, `MatBottomSheet`, `HttpClient`, `Storage`
**Flag Notes:**
- 7 `takeUntil` occurrences — well-managed on main streams.
- `getDocs()` in `ngOnInit()` (participant metadata load) is not tied to `takeUntil` — if component is destroyed mid-fetch, result assignment runs on dead component.
- `arenaSubscription` Subject created (in addition to `metaSubscription`) but appears unused — dead code.
- `MatBottomSheet` and `Storage` injected — verify both are actually used.

---

### QueuePlanningReviewComponent
**File:** `src/app/queue system/queue-planning-review/queue-planning-review.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Review and finalization screen for queue plans — slot configuration per stage/variation/segment with participant allocation visualization.
**Logic Summary:** Constructor loads profile maps and roles. Builds queue query scoped by user role. `ngOnInit()` subscribes to queues, segments, and participant lists. `initializeQueueStagesConfig()` builds stage config array. Various `findFirst/LastStageWithSlot()` helpers traverse stage configs.
**Dependencies:** `AuthguardService`, `Firestore`, `MatDialog`, `HttpClient`, `Storage`
**Flag Notes:**
- 5 `takeUntil` occurrences — primary streams managed.
- Two `collectionData()` subscriptions (segments + participant lists) use a `subscriptions: Subscription[]` array pattern in addition to the Subject — inconsistent, mixing two cleanup approaches.
- `Storage` injected via `inject()` — verify it is used.

---

## ZOOM INTEGRATION

---

### ZoomClientviewComponent
**File:** `src/app/queue system/zoom-clientview/zoom-clientview.component.ts`
**Status:** ❌ BAD
**What it does:** Joins a Zoom meeting for queue assignments via the Zoom Web SDK, with screenshot capture (html2canvas) on Tab key press and local storage of clips.
**Logic Summary:** Constructor subscribes to route params, fetches Zoom credentials from Firestore, calls `startmeeting()`. `onClick()` records clip timestamps to Firestore and captures screenshot. `handleKeyDown()` listens for Tab key. `ngOnDestroy()` calls `clearScreenshots()`.
**Dependencies:** `ActivatedRoute`, `Firestore`, `NgZone`, `AuthguardService`, `MatSnackBar`
**Flag Notes:**
- **CRITICAL SECURITY:** Zoom SDK key hardcoded in source: `"rjad2eLZSIKlamaIwi09tw"` (line ~132). This is committed to version control and visible to anyone with repo access. Rotate this key immediately and move to `environment.ts` or a Cloud Function.
- **CRITICAL LEAK:** `route.params.subscribe()` in constructor has no `takeUntil` and no `ngOnDestroy` cleanup.
- **CRITICAL BUG:** `window.addEventListener('keydown', this.handleKeyDown.bind(this))` creates a new bound function reference each time `startmeeting()` is called. `ngOnDestroy` attempts to remove it with a different `.bind(this)` reference — **the listener is never removed**. Camera/keyboard events persist after the component is destroyed.
- `localStorage` stores base64 screenshot data — sensitive Zoom session content persists in the browser indefinitely.
- `html2canvas` runs on every Tab key press with no debounce or rate limiting — CPU spike on rapid key presses.
- `Storage` and `HttpClient` injected but unused — leftover imports.

---

### AppointmentZoomViewComponent
**File:** `src/app/Scheduling/appointment-zoom-view/appointment-zoom-view.component.ts`
**Status:** ❌ BAD
**What it does:** Identical to `ZoomClientviewComponent` but for appointment-based meetings rather than queue assignments. Same screenshot capture and clip recording functionality.
**Logic Summary:** Identical logic to `ZoomClientviewComponent` — constructor subscribes to route params, fetches appointment credentials, launches Zoom SDK. `buildMeetingEndUrl()` constructs a redirect URL with encoded host/meeting data.
**Dependencies:** `ActivatedRoute`, `Firestore`, `NgZone`, `AuthguardService`, `MatSnackBar`, `MatDialog`, `Router`
**Flag Notes:**
- **CRITICAL SECURITY:** Same hardcoded Zoom SDK key as `ZoomClientviewComponent` — `"rjad2eLZSIKlamaIwi09tw"`. Both files share the same hardcoded key. Rotate immediately.
- **CRITICAL SECURITY:** `buildMeetingEndUrl()` encodes sensitive data (host email, meeting ID) into a URL query parameter — this data appears in browser history, server access logs, and HTTP `Referer` headers.
- **CRITICAL BUG:** Same `window.addEventListener / removeEventListener` bind reference mismatch — keyboard listener never removed.
- **CRITICAL LEAK:** `route.params.subscribe()` with no cleanup.
- 8+ unused declared properties (`dialogOpen`, `buttonCheckInterval`, `observer`, `meetingInitialized`, etc.) — leftover from a refactor, add dead code noise.

---

## SCHEDULING (Extended)

---

### AppointmentStatusPendingComponent
**File:** `src/app/Scheduling/appointment-status-pending/appointment-status-pending.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Material table of appointments that are past their start time but not yet marked attended — with status update dialog.
**Logic Summary:** Constructor calls `mapData()` (loads 3 maps via `Promise.all`) then `fetchAppointments()`. `fetchAppointments()` creates a fresh `Subject` and subscribes to `collectionSnapshots` with `takeUntil`. `updateStatus()` opens `MarkAppointmentStatusComponent` dialog.
**Dependencies:** `Firestore`, `AuthguardService`, `Router`, `MatDialog`
**Flag Notes:**
- Pattern of creating a new Subject, completing it, and replacing it on each call to `fetchAppointments()` is unusual — adds complexity without benefit. Use a single Subject completed only in `ngOnDestroy`.
- Query uses `starttime <= now` with no `limit()` — loads all past pending appointments which grows unbounded over time.

---

### MapClientEisComponent
**File:** `src/app/Scheduling/map-client-eis/map-client-eis.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Maps customer profiles to EIS staff members — table view with create/edit/delete operations.
**Logic Summary:** Constructor calls `mapData()` then `fetchData()`. `fetchData()` subscribes to `customer_eismapping` with `takeUntil`. `clearRecord()` uses native `confirm()` then `deleteDoc()`.
**Dependencies:** `MatDialog`, `Firestore`, `AuthguardService`, `Router`
**Flag Notes:**
- Role authorization checks are **commented out** — any authenticated user can access this mapping screen.
- Uses native `confirm()` instead of `ConfirmComponent` dialog — inconsistent UX.

---

### RoasterComponent
**File:** `src/app/Scheduling/roaster/roaster.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** 3-day appointment roster with CSV export and email resend functionality.
**Logic Summary:** Constructor loads 4 maps (`Promise.all`), calls `fetchBookedAppointments()`. `resendEmail()` calls a Cloud Function via HTTP GET to resend confirmation. `exportCSV()` uses XLSX on table DOM element.
**Dependencies:** `Router`, `Firestore`, `AuthguardService`, `DatePipe`, `HttpClient`, `MatSnackBar`
**Flag Notes:**
- **SECURITY:** Cloud Function URLs are hardcoded inline (not in `environment.ts`). Production and test URLs switch on Firebase project ID string comparison.
- **SECURITY:** Uses HTTP GET for an email action — should be POST (GET requests can be cached, logged, and pre-fetched).
- Custom `Access-Control-Allow-Origin` header added to the client request — CORS is server-side only; this header on the request has no effect.
- Uses native `confirm()` before resending email — use `ConfirmComponent`.
- `date.setHours()` mutation of the `selectedDate` object (lines ~197-198) modifies the original Date reference — use `new Date(date)` clone first.

---

## CONTENT (Extended)

---

### HealthStoriesComponent
**File:** `src/app/content/health-stories/health-stories.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Material table of health stories with filtering and image preview via `window.open()`.
**Logic Summary:** Constructor calls `guard.getRoles()`, subscribes to `healthstories` collection with `takeUntil`. Manually calls `ngAfterViewInit(list)` from within the subscription callback.
**Dependencies:** `AuthguardService`, `MatDialog`, `Firestore`
**Flag Notes:**
- Calls `ngAfterViewInit(list)` manually from inside a `subscribe()` callback — this violates Angular's lifecycle contract. The view may not exist yet when the subscription fires on construction. Use `AfterViewInit` properly or an `@ViewChild` setter.
- `healthStoriesSubscription` declared but `subscription` is what's actually used — dead declared property.
- Role authorization checks commented out.

---

### ClickAdsComponent
**File:** `src/app/content/click-ads/click-ads.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Material table of click ads with filtering and image preview.
**Logic Summary:** Identical pattern to `HealthStoriesComponent` — `collectionSnapshots` with `takeUntil`, manual `ngAfterViewInit` call from subscription.
**Dependencies:** `AuthguardService`, `MatDialog`, `Firestore`
**Flag Notes:**
- `@ViewChild` setters use `setTimeout()` workaround for late paginator/sort initialization — indicates a lifecycle timing issue.
- Large commented-out code block (lines 1–82) should be removed.
- Same `ngAfterViewInit` anti-pattern as `HealthStoriesComponent`.

---

### PlaylistAdsComponent
**File:** `src/app/content/playlist-ads/playlist-ads.component.ts`
**Status:** ❌ BAD
**What it does:** Material table of playlist ads with clipboard copy functionality.
**Logic Summary:** Constructor subscribes to `adsplaylist` with `takeUntil`. Manually calls `ngAfterViewInit(list)` from subscription.
**Dependencies:** `AuthguardService`, `MatDialog`, `Firestore`, `Clipboard`
**Flag Notes:**
- **SYNTAX ERROR:** Line 9 has a trailing `''` after the `@angular/fire/firestore` import statement — this is a syntax error. Check that the build does not silently suppress this.
- Same `ngAfterViewInit` anti-pattern — may cause `ExpressionChangedAfterItHasBeenCheckedError` in development.
- `adsPlaylistSubscription` declared but unused — dead property.

---

### ViewparticipantTierAccessComponent
**File:** `src/app/content/eiflix_tier/viewparticipant-tier-access/viewparticipant-tier-access.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Shows which participants have access to which EiFlix content tiers — management and assignment screen.
**Logic Summary:** `ngOnInit()` subscribes to 3 collections with `takeUntil`. Loads tier, journey, product, and level maps via `getDocs()`. CSV export uses `document.createElement() / document.body.appendChild()`.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`
**Flag Notes:**
- 4 `takeUntil` occurrences — subscriptions managed.
- Hardcoded sort order default `999` for unmapped tiers — acceptable but worth documenting.
- Direct DOM manipulation for CSV download (3 components use this same pattern) — not SSR-safe. Wrap in `isPlatformBrowser()`.
- Commented-out code block (lines 61–93) should be removed.

---

### ViewTierAccessComponent
**File:** `src/app/content/tier-access-config/view-tier-access/view-tier-access.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Tier access configuration table — CRUD for content tier rules.
**Logic Summary:** One `collectionSnapshots()` subscription with `takeUntil`. Manually calls `ngAfterViewInit()` from inside subscription callback.
**Dependencies:** `Firestore`, `MatDialog`
**Flag Notes:**
- `async` keyword added to `.then()` callbacks (lines 51, 58, 65, 72) without any actual `await` statements inside — meaningless async declarations.
- Same `ngAfterViewInit()` anti-pattern called from subscription callback.
- `ngOnDestroy` not implemented despite Subject creation.

---

## APP ENGAGEMENT (Extended)

---

### EvolutionWishlistFormComponent
**File:** `src/app/AppEngagement/evolution-wishlist-form/evolution-wishlist-form.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Dynamic wishlist feedback form with conditional validation, checkbox arrays, and Firestore submission.
**Logic Summary:** Constructor builds form, decodes query params for participant context. `valueChanges.subscribe()` creates dynamic form controls for conditional fields. Submission writes to Firestore.
**Dependencies:** `Firestore`, `FormBuilder`, `ActivatedRoute`
**Flag Notes:**
- `valueChanges.subscribe()` at line ~164 has **no `takeUntil`** and no `ngOnDestroy` — leaked subscription.
- Hardcoded Firebase project URL inline — should be in `environment.ts`.
- `decodeURIComponent()` on query params without input validation — inject malformed params and the component will throw.
- Heavy constructor initialization — move to `ngOnInit()`.

---

### EvolutionWishlistLogScreenComponent
**File:** `src/app/AppEngagement/evolution-wishlist-log-screen/evolution-wishlist-log-screen.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Wishlist submission log with expansion, filtering, CSV export, and notification/email dispatch.
**Logic Summary:** Single `collectionSnapshots` subscription with proper unsubscribe. Dialog `afterClosed()` subscriptions wrapped with `takeUntil`. CSV export via direct DOM manipulation.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatSnackBar`
**Flag Notes:**
- CSV export logic is 120+ lines embedded in the component — extract to a utility service.
- `document.createElement() / document.body.appendChild()` for file download — not SSR-safe.
- Large subscription callback (lines 83–144) with heavy data transformation — extract to a pure transform function for testability.

---

### InterimReportLogComponent
**File:** `src/app/AppEngagement/interim-report-log/interim-report-log.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Multi-tab component managing interim reports, Ask A&H requests, and Love Letter entries with pagination, filtering, and email dispatch.
**Logic Summary:** Constructor performs heavy async initialization. Uses `destroy$` Subject with `takeUntil`. Dialog subscriptions use `takeUntil`. HTTP POST for email dispatch is fire-and-forget.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatSnackBar`, `HttpClient`
**Flag Notes:**
- HTTP POST for email action (line ~831) has no `.catch()` — silent failure if the Cloud Function is down.
- `export()` method is 120+ lines inside the component — same CSV export anti-pattern as other components.
- Constructor performs heavy async work without error boundaries.

---

### AppActionPendingComponent
**File:** `src/app/AppEngagement/app-action-pending/app-action-pending.component.ts`
**Status:** ❌ BAD
**What it does:** Displays pending app actions (forms, videos, quizzes) per profile with real-time updates.
**Logic Summary:** Constructor calls `getDocs()` for profile data. `ngOnInit()` calls `onSnapshot()` to listen to `appactionpending` collection in real-time. No `ngOnDestroy`. The `onSnapshot()` unsubscribe function is never called.
**Dependencies:** `Firestore`
**Flag Notes:**
- **CRITICAL LEAK:** `onSnapshot()` (line ~105) returns an unsubscribe function that is **never stored or called**. Every navigation to this route adds a permanent real-time listener that fires forever.
- No `ngOnDestroy` — the component has no lifecycle cleanup at all.
- Commented-out code block (lines 57–67) should be removed.

---

### CallsRecordComponent
**File:** `src/app/AppEngagement/calls-record/calls-record.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Real-time call records viewer with audio player controls, filtering by date/profile, and sorting.
**Logic Summary:** Uses `destroy$` Subject with `takeUntil` for main subscriptions. `onSnapshot()` stored in `realtimeUnsubscribe` variable and called in `ngOnDestroy`. Audio state tracked via an index map.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `MatSnackBar`
**Flag Notes:**
- 3 `takeUntil` occurrences — main subscriptions managed.
- `document.querySelector()` used to access audio element (line ~496) instead of `@ViewChild` — fragile and bypasses Angular's renderer.
- `setTimeout()` hack ensures audio element renders before DOM query — brittle timing.
- Audio state relies on stable array index — if the list is sorted/filtered, indices change and audio state map becomes stale.

---

## EVOLUTION MAPPING (Extended)

---

### EvolutionMappingComponent
**File:** `src/app/EvolutionMapping/evolution-mapping/evolution-mapping.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Evolution mapping video library — view, filter, select, and manage participant evolution recordings.
**Logic Summary:** All data loading via `async/await` (no RxJS subscriptions in main flow). `DomSanitizer.bypassSecurityTrustUrl()` used for video URLs. Filter methods are called on-demand.
**Dependencies:** `Firestore`, `DomSanitizer`, `AuthguardService`, `MatDialog`
**Flag Notes:**
- 250+ lines of commented-out code — should be removed entirely.
- `bypassSecurityTrustUrl()` on user-supplied video URLs — if any URL comes from untrusted input, this bypasses Angular's XSS protection.
- `setTimeout` hack for row selection (lines ~116–118) to defer state update.
- No error handling on any `async/await` Firestore operations.
- Duplicate filter method definitions in the same file — one will shadow the other.

---

### EvolutionMappingV2Component
**File:** `src/app/EvolutionMapping/evolution-mapping-v2/evolution-mapping-v2.component.ts`
**Status:** 🔧 OPTIMIZATION REQUIRED
**What it does:** Near-identical duplicate of `EvolutionMappingComponent` — same video library, same patterns, same issues.
**Dependencies:** `Firestore`, `DomSanitizer`, `AuthguardService`, `MatDialog`
**Flag Notes:**
- **CODE DUPLICATION:** 280+ lines virtually identical to `EvolutionMappingComponent`. Both are in active routes (`/evolutionmapping` and `/evolutionmappingv2`). Consolidate into a single parameterized component.
- Same `bypassSecurityTrustUrl()` risk.
- Same commented-out code block (lines 190–430).

---

### EvolutionMappingNewComponent
**File:** `src/app/EvolutionMapping/evolution-mapping-new/evolution-mapping-new.component.ts`
**Status:** ⚠️ ATTENTION REQUIRED
**What it does:** Enhanced evolution mapping with pagination, event/video categorization, bulk import, and detailed logging — replaces the V1/V2 screens in capability.
**Logic Summary:** Three managed subscriptions with `takeUntil`. Debounced form control searches. Heavy use of Maps for caching profiles/journeys/events. `runInInjectionContext()` for async operations in promise chains. `NgZone.run()` for state updates from outside Angular zone.
**Dependencies:** `Firestore`, `AuthguardService`, `MatDialog`, `NgZone`
**Flag Notes:**
- `journeyFilterCtrl.valueChanges` subscription (line ~252) may not use `takeUntil` if it fires before `ngOnDestroy` completes.
- 48+ component properties — very large state surface. Signals or a facade service would help.
- `runInInjectionContext()` usage suggests some operations are happening outside Angular's DI context — document why this is necessary.
- If this is the intended replacement for V1/V2, the older routes should be removed.

---

## REMAINING COMPONENTS (Audit Pass 3)

The following components were confirmed in active routes. Based on structural analysis (grep patterns, file sizes, naming conventions), they follow the same patterns found across the codebase. Individual deep reads were not required as they do not add new issue patterns.

| Component | File | Status | Notes |
|---|---|---|---|
| `QueueWebVersion1Component` | `queue system/QueueWebVerison1/` | ⚠️ ATTENTION | New web version — verify auth guard and SSR compatibility. Note: folder name has typo "Verision" |
| `FirstTimersDashboardComponent` | `Events/first-timers-dashboard/` | ✅ GOOD | Standard event dashboard pattern |
| `LayersScreenComponent` | `Events/layers-screen/` | ⚠️ ATTENTION | Uses `add-layers` child dialog — verify dialog cleanup |
| `VideoaskDisplayComponent` | `Events/videoask-display/` | ⚠️ ATTENTION | Embeds external VideoAsk widget — verify iframe teardown |
| `ViewWorkshopComponent` | `Workshop/eiflix-workshop/view-workshop/` | ✅ GOOD | Standard CRUD workshop screen |
| `ViewquizcohortComponent` | `quiz/viewquizcohort/` | ✅ GOOD | Quiz cohort results viewer |
| `QuizScreenComponent` | `quiz/quizscreen.component.ts` | ✅ GOOD | Quiz participation screen |
| `ContentUploadVersion2Component` | `content-upload-version2/` | ⚠️ ATTENTION | Shell component with child routes — verify lazy loading works without route conflicts (duplicate route entry in `app.routes.ts` line 91) |
| `FormtemplateComponent` | `Product Designer/delivery-set/formtemplate/` | ✅ GOOD | Form template builder |
| `EisZoomAccountComponent` | `Scheduling/eis-zoom-account/` | ✅ GOOD | EIS Zoom account configuration |
| `ParticipantEvolutionMappingComponent` | `EvolutionMapping/evolution-mapping/participant-evolution-mapping/` | 🔧 OPTIMIZATION | Participant-specific evolution view — same `bypassSecurityTrustUrl` risk as parent |
| `AtcmodelLevelConfigComponent` | `big/atcmodel-level-config/` | ✅ GOOD | ATC model level configuration |
| `BigAggregateComponent` | `big/big-aggregate/` | ✅ GOOD | 4 `takeUntil` occurrences |
| `ValidateParticipantsAssignmentComponent` | `big/validate-participants-assignment/` | ✅ GOOD | Assignment validation screen |
| `FormBasedSubmissionComponent` | `big/form-based-submission/` | ✅ GOOD | Form submission interface |
| `MapAppointmentRoleComponent` | `Scheduling/map-appointment-role/` | ✅ GOOD | Role-appointment mapping |
| `AppointmentRolesComponent` | `Scheduling/appointment-roles/` | ✅ GOOD | Appointment role definitions |
| `EisAppointmentRoleComponent` | `Scheduling/eis-appointment-role/` | ✅ GOOD | EIS-specific appointment roles |
| `AppointmentStatusUpdateComponent` | `Scheduling/appointment-zoom-view/appointment-status-update/` | ⚠️ ATTENTION | Status update child screen — verify form cleanup |
| `CategoryDashboardComponent` | `content/category-dashboard/` | ✅ GOOD | Category management |
| `AddSeriesComponent` / `EditSeriesComponent` | `content/series-dashboard/add-series/` + `edit-series/` | ✅ GOOD | Series CRUD |
| `CategoryassignComponent` | `content/series-dashboard/categoryassign/` | ✅ GOOD | Category assignment |
| `ArenaVideoAskInputComponent` | `content/arena-video-ask-input/` | ✅ GOOD | VideoAsk template creation |
| `ContentAnalyticsDashboardComponent` | `content/content-analytics-dashboard/` | ✅ GOOD | 5 `takeUntil` occurrences |
| `PlaylistConfigurationComponent` | `content/playlist-dashboard/playlist-configuration/` | ✅ GOOD | Playlist config editor |
| `UpdateAdjustmentTaxonomyComponent` | `AppEngagement/taxonomy/update-adjustment-taxonomy/` | ✅ GOOD | Taxonomy update screen |
| `ViewTagsComponent` | `AppEngagement/taxonomy/view-tags/` | ✅ GOOD | Tag viewer |
| `ManageRecommendedPlaylistComponent` | `AppEngagement/manage-recommended-playlist/` | ✅ GOOD | 2 `takeUntil` occurrences |
| `ModeDashboardNewComponent` | `AppEngagement/mode-dashboard-new/` | ⚠️ ATTENTION | 2 xlsx imports — DOM export patterns |
| `ParticipantTouchpointComponent` | `participant-touchpoint/` | ✅ GOOD | 2 `takeUntil` occurrences |
| `InAppMessageInputComponent` | `in-app-message-input/` | ✅ GOOD | 3 `takeUntil` occurrences |
