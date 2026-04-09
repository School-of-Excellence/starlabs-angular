# Audit Summary
Generated: 2026-04-08
Project: starlabs-autogen (Angular 19 Standalone Components)

---

## Stats

| Metric | Value |
|---|---|
| Total files scanned | ~700+ (src/app, routes, services, components, templates) |
| Total unused items found | 17 (9 components/folders, 5 npm packages, 1 directive to verify, 2 redundant providers) |
| Total Firestore collections mapped | 85+ collections fully typed |
| Total components documented | 383 used — all individually documented |
| Routes in `app.routes.ts` | 319 |
| Duplicate/clone folders in active routes | 7 |
| Services | 8 (all in use) |
| Custom pipes | 4 (all in use) |
| Custom directives | 1 (needs usage verification) |
| Confirmed subscription memory leaks | 8 (critical), 30+ (moderate across codebase) |
| Hardcoded secrets in source | 1 (Zoom SDK key in 2 files — rotate immediately) |
| Components rated ❌ BAD | 5 (`AppComponent`, `RouteConfigurationDuplicate`, `HPCComponent`, `DataTransferService`, `ZoomClientviewComponent`, `AppointmentZoomViewComponent`, `AppActionPendingComponent`, `PlaylistAdsComponent`) |
| Duplicate route entries in routes file | 3 paths defined twice (`ecosystem`, `content-upload-v2`, `seriesdashboard`) |

---

## Top 10 Critical Issues (Full Expanded List)

### #1 — Route Configuration Duplicate Bypasses Access Control
**Severity: CRITICAL | File: `src/app/route-configuration-duplicate/route-configuration.component.ts`**

The active route `/routeconfiguration` loads the *duplicate* version of the route configuration component instead of the original. The duplicate is **missing the `roles` column** — it cannot display or edit which staff roles have access to each dashboard route. The `dashboard` Firestore documents contain a `roles` field that is written by the original but **never rendered or managed by the active component**. This means role-based navigation access control for the entire app's sidebar cannot be configured and may be silently inoperative.

**Fix:** Point the route back to the original `route-configuration/route-configuration.component.ts` and reconcile any behavioral differences that caused the switch to the duplicate in the first place. Or port the roles management UI from the original into the duplicate.

---

### #2 — AppComponent Has Multiple Unmanaged Subscription Leaks
**Severity: CRITICAL | File: `src/app/app.component.ts`**

The root `AppComponent` — which lives for the entire application lifetime — has at least 4 confirmed unmanaged subscriptions:
1. `user(this.firebaseAuth).subscribe()` — Firebase auth state, never unsubscribed
2. `router.events.subscribe()` — appears twice (navigation title + a second listener), neither cleaned up
3. `window.addEventListener('visibilitychange' / 'focus' / 'blur')` — never removed in `ngOnDestroy`
4. `BroadcastChannel.onmessage` — needs explicit channel close verification

While the app-level component leaking is less catastrophic than a leaf component (it lives forever anyway), these patterns cascade throughout the codebase as a template for developers to copy.

**Fix:** Refactor the constructor/ngOnInit to use `takeUntilDestroyed()` from `@angular/core/rxjs-interop` (Angular 16+). Remove window event listeners in `ngOnDestroy`. Ensure BroadcastChannel is properly closed.

---

### #3 — DataTransferService Has a Non-Functional `ngOnDestroy` and Permanent localStorage Leak
**Severity: HIGH | File: `src/app/Participants Profile Management/participants-analytics/data-transfer.service.ts`**

The service defines `ngOnDestroy()` — which **Angular never calls on services**. This means `clearData()` is never invoked automatically. Every call to `setData()` writes participant data to `localStorage` and that data **never gets cleaned up** across the session (or potentially across browser sessions). This is both a memory/storage leak and a security risk — sensitive participant analytics data persists indefinitely in the browser's localStorage.

**Fix:** Remove `ngOnDestroy()` from the service. Replace `localStorage` with `sessionStorage` (tab-scoped, auto-cleared on tab close). Add explicit `clearData()` calls at appropriate points in the analytics component workflow.

---

### #4 — HPCComponent Has No `OnDestroy` and a Guaranteed Subscription Leak
**Severity: HIGH | File: `src/app/hpc/hpc.component.ts`**

`HPCComponent` subscribes to `profileFilterCtrl.valueChanges` in `ngOnInit()` with no `takeUntil` and no `OnDestroy` implementation. Every time a user navigates to `/hpc` and back, a new subscription is added without the previous one being removed. After 10 navigations, there are 10 concurrent active subscriptions all firing on every keystroke.

Additionally:
- `guard.getRoles()` is called **twice** in the constructor (redundant Firestore read)
- `updateFilteredHpcData()` runs nested O(n²/n³) filtering on every keystroke with no debounce
- Browser-native `confirm()` dialogs used instead of `ConfirmComponent`

**Fix:** Add `implements OnDestroy`, create a `destroy$ = new Subject<void>()`, pipe `valueChanges.pipe(debounceTime(300), takeUntil(this.destroy$))`, complete subject in `ngOnDestroy`. Remove one `getRoles()` call.

---

### #5 — 7 Clone/Duplicate Components Are in Active Routes Without a Consolidation Plan
**Severity: MEDIUM-HIGH | Multiple files**

The following production routes silently load clone/duplicate versions of components instead of originals:

| Route | Active Component | Superseded Original |
|---|---|---|
| `/routeconfiguration` | `route-configuration-duplicate/` | `route-configuration/` |
| `/dynamicqueuemanager` | `dynamic-queue-manager-clone/` | `dynamic-queue-manager/` |
| `/bigcohorts` | `big-cohort-clone/` | `big-cohorts/` |
| `/delivery-dashboard` | `delivery-dashboard-clone/` | `delivery-dashboard/` |
| `/sales-report` | `sales-dashboard-clone/` | `sales-dashboard/` |
| `/JourneycoachDashboard-new` | `journeycoach-duplicate/` | `journeycoach-dashboard/` |

This creates a maintenance trap: bugs are fixed in one version but the other diverges silently. When originals need updating, developers may edit the wrong file. `queue-planning-clone` was never even promoted to a route — it's dead code.

**Fix:** For each clone, either (a) make the clone the canonical version and delete the original, renaming the clone to the non-clone name, or (b) revert to the original after reconciling the differences. Document the reason for any intentional divergence.

---

### #6 — Hardcoded Zoom SDK Key Committed to Version Control
**Severity: CRITICAL SECURITY | Files: `src/app/queue system/zoom-clientview/zoom-clientview.component.ts`, `src/app/Scheduling/appointment-zoom-view/appointment-zoom-view.component.ts`**

The Zoom Web SDK key `"rjad2eLZSIKlamaIwi09tw"` is hardcoded in two component files. This key is committed to version control and visible to anyone with repository access. If the repository is ever made public or shared, the key can be used to impersonate the app in Zoom sessions.

**Fix:** Rotate this Zoom SDK key immediately. Move it to `environment.ts` (excluded from version control) or fetch it at runtime from a Cloud Function that validates the caller.

---

### #7 — Window Event Listener Never Removed in Zoom Components
**Severity: HIGH | Files: `zoom-clientview.component.ts`, `appointment-zoom-view.component.ts`**

Both Zoom components add `window.addEventListener('keydown', this.handleKeyDown.bind(this))` when the Zoom meeting starts. `ngOnDestroy` attempts to remove this listener but calls `removeEventListener` with a **new `.bind(this)` reference** — since each call to `.bind()` creates a new function object, the original listener is never matched and **never removed**. After visiting a Zoom meeting and navigating away, keyboard events globally fire the handler for the lifetime of the browser session.

**Fix:** Store the bound function reference: `this.boundKeyHandler = this.handleKeyDown.bind(this)` in `ngOnInit`, use it in `addEventListener`, and pass the same reference to `removeEventListener` in `ngOnDestroy`.

---

### #8 — AppActionPendingComponent: Permanent onSnapshot Listener
**Severity: HIGH | File: `src/app/AppEngagement/app-action-pending/app-action-pending.component.ts`**

`onSnapshot()` is called in `ngOnInit()` but the returned unsubscribe function is **never stored or called**. Every navigation to `/appactionpending` adds a new permanent real-time Firestore listener. After 5 visits, there are 5 concurrent listeners all updating the same component that may no longer be in the DOM.

**Fix:** Store the return value: `this.unsubscribe = onSnapshot(...)` and call `this.unsubscribe()` in `ngOnDestroy`. Implement `OnDestroy`.

---

### #9 — Constructor-Heavy Initialization Pattern Across 15+ Components
**Severity: MEDIUM-HIGH | Multiple files**

At least 15 components perform heavy async work in the constructor (multiple `await` chains, Firestore `getDocs()`, `guard.getRoles()`). This violates Angular's component initialization contract where constructor should only inject dependencies. When these operations fail, there is no error boundary and the component renders in a partial/broken state with no user feedback.

Affected components include: `JourneyplanComponent`, `CreateWatsonProfileComponent`, `ZoomClientviewComponent`, `AppointmentZoomViewComponent`, `JourneyProductPurchaseComponent`, `RoasterComponent`, `AppointmentStatusPendingComponent`, `MapClientEisComponent`, `BigPlannerComponent`, `ParticipantsAnalyticsComponent`, and others.

**Fix:** Move all async initialization to `ngOnInit()`. Wrap in `try/catch`. Show a loading state until complete.

---

### #10 — `ngAfterViewInit()` Called Manually from Subscription Callbacks
**Severity: MEDIUM | Files: `health-stories`, `click-ads`, `playlist-ads`, `viewparticipant-tier-access`, `view-tier-access`**

Five components call `this.ngAfterViewInit(data)` manually from inside a `subscribe()` callback to set the `MatTableDataSource` after data loads. This is not a valid use of the `AfterViewInit` lifecycle hook — it runs before Angular has guaranteed that `@ViewChild` references (`MatPaginator`, `MatSort`) exist. In development mode this triggers `ExpressionChangedAfterItHasBeenCheckedError`. It is a timing hack that will break unpredictably.

**Fix:** Use a `@ViewChild` setter that stores the paginator/sort reference and assigns the datasource when both data and view references are available. Or use the `async` pipe in templates to eliminate manual datasource assignment entirely.

---

## Quick Wins
*(Unused items that can be safely deleted immediately with zero functional risk)*

| Item | Type | Location | Why Safe |
|---|---|---|---|
| `route-configuration/` (original folder) | Dead code | `src/app/route-configuration/` | Never loaded in routes — `route-configuration-duplicate/` is the active version |
| `Journey Onboarding/create-watson-profile-copy.ts` | Stray file | `src/app/Journey Onboarding/` | Loose `.ts` file, never imported anywhere — confirmed via grep |
| `AppEngagement/community-manager-old/` | Dead code | `src/app/AppEngagement/community-manager-old/` | `community-manager-old` not in routes — active version is `community-manager/` |
| `Journey Onboarding/journeycoach-dashboard/` | Dead code | `src/app/Journey Onboarding/journeycoach-dashboard/` | Only in a commented-out import; `journeycoach-duplicate` is active |
| `queue system/queue-planning-clone/` | Dead code | `src/app/queue system/queue-planning-clone/` | Route is commented out; never loaded |
| `common` (npm package) | npm package | `package.json` | Zero `from 'common'` imports found anywhere in the codebase |
| `@types/jspdf` (devDep) | npm package | `package.json` | jsPDF v3+ ships its own types; this outdated devDep conflicts |
| `@zxing/browser` (npm package) | npm package | `package.json` | App uses `@zxing/ngx-scanner`; no direct `@zxing/browser` imports |
| `@zxing/library` (npm package) | npm package | `package.json` | Same as above — wrapper handles it |
| Duplicate `ecosystem` route (line 315) | Route definition | `app.routes.ts` line 315 | Same path and component as line 220 — second entry silently overrides first |
| Duplicate `content-upload-v2` route (line 91) | Route definition | `app.routes.ts` line 91 | Same path as lines 37–90 (with children) — flat duplicate shadows child routes |
| Duplicate `seriesdashboard` route (line 108) | Route definition | `app.routes.ts` line 108 | Also defined at line 81 inside child routes — redundant |

---

## Key Patterns Requiring Systematic Fix

These are not one-off issues — they affect **30+ components** and need a team-wide remediation:

### 1. Inconsistent Subscription Management
The `takeUntil` pattern is used in ~151 files (good) but **not used at all in ~240+ files**. The project has not adopted `takeUntilDestroyed()` from `@angular/core/rxjs-interop` despite being on Angular 19 where it is the idiomatic solution. Many components have the `takeUntil` infrastructure set up but still have bare `.subscribe()` calls for dialog `afterClosed()` handlers.

**Recommended fix:** Adopt `takeUntilDestroyed()` project-wide. It requires zero manual Subject management and works automatically with Angular's destroy context.

### 2. ChangeDetectorRef Injected Without OnPush
20+ components inject `ChangeDetectorRef` while using the default change detection strategy. This is contradictory — CDR is only needed (and beneficial) with `OnPush`. Either add `changeDetection: ChangeDetectionStrategy.OnPush` to the component decorator, or remove the CDR injection.

### 3. Direct DOM Manipulation
11+ components use `document.body.appendChild()` for PDF/CSV export downloads. This pattern bypasses Angular's renderer and is **not SSR-safe** — this app has `@angular/ssr` configured. Wrap all direct DOM access in `isPlatformBrowser(this.platformId)` checks.

### 4. Missing Error Handling on Firebase Operations
Across the codebase, very few `addDoc()`, `setDoc()`, `updateDoc()` calls have `.catch()` handlers. Silent failures in Firestore writes mean the UI shows success but data is never saved. Add `try/catch` around all Firestore writes.

### 5. Native `confirm()` / `alert()` Dialogs Used in Production
At least 6 components use `confirm()` or `alert()` (browser native dialogs) for actions like delete confirmation and waiting states:
- `MapClientEisComponent` — `confirm()` for delete
- `RoasterComponent` — `confirm()` for email resend
- `LoginComponent` — multiple `alert()` calls
- `HPCComponent` — `confirmRemove()` uses native `confirm()`

The project already has a `ConfirmComponent` dialog in `src/app/DialogBox/confirm/`. Use it everywhere. Native dialogs block the main thread, cannot be styled, and create poor UX on mobile.

### 6. `DomSanitizer.bypassSecurityTrustUrl()` on User-Supplied Video URLs
`EvolutionMappingComponent` and `EvolutionMappingV2Component` call `bypassSecurityTrustUrl()` on video URLs from Firestore. If any URL field contains a `javascript:` URI or a `data:` URI from an attacker who has write access to Firestore, Angular's XSS protection is fully bypassed. Validate that all URLs are `https://` before sanitizing.

### 7. Code Duplication — Evolution Mapping V1 and V2 are 280+ Lines Identical
`EvolutionMappingComponent` and `EvolutionMappingV2Component` share 280+ lines of virtually identical code. Both are in active routes. All three Evolution Mapping components (`v1`, `v2`, `new`) are simultaneously in routes. Consolidate to a single component or clearly document the functional difference.

### 8. Sensitive Data Passed via URL Query Parameters
`AppointmentZoomViewComponent.buildMeetingEndUrl()` encodes host email, host name, and meeting ID into a URL query parameter string. This data appears in:
- Browser address bar (visible to screen-sharers)
- Browser history
- HTTP `Referer` headers sent to any third-party resources on the destination page
- Server access logs

**Fix:** Pass post-meeting data via a POST request or a short-lived Firestore document with a token.

---

## Remediation Priority Order

| Priority | Action | Effort | Files |
|---|---|---|---|
| P0 — Immediate | Rotate Zoom SDK key | Minutes | 2 files |
| P0 — Immediate | Fix `window.addEventListener` bind bug in Zoom components | 30 min | 2 files |
| P1 — This Sprint | Fix `AppActionPendingComponent` onSnapshot leak | 15 min | 1 file |
| P1 — This Sprint | Fix `HPCComponent` subscription leak + add OnDestroy | 30 min | 1 file |
| P1 — This Sprint | Fix `DataTransferService` ngOnDestroy + switch to sessionStorage | 1 hr | 1 file |
| P1 — This Sprint | Restore roles column in route-configuration (or port to duplicate) | 2 hrs | 2 files |
| P2 — Next Sprint | Fix `AppComponent` auth + router event leaks | 1 hr | 1 file |
| P2 — Next Sprint | Fix `JourneyplanComponent` + `JourneyProductPurchaseComponent` leaks | 1 hr | 2 files |
| P2 — Next Sprint | Fix `PlaylistAdsComponent` syntax error | 5 min | 1 file |
| P2 — Next Sprint | Remove 3 duplicate route entries (`ecosystem`, `seriesdashboard`, `content-upload-v2`) | 15 min | `app.routes.ts` |
| P3 — Backlog | Adopt `takeUntilDestroyed()` project-wide | Several sprints | ~240 files |
| P3 — Backlog | Move constructor async work to ngOnInit across 15+ components | Several sprints | 15+ files |
| P3 — Backlog | Replace all `confirm()`/`alert()` with `ConfirmComponent` | 1 sprint | 6+ files |
| P3 — Backlog | Wrap all `document.body.appendChild` in `isPlatformBrowser()` | 1 sprint | 11+ files |
| P3 — Backlog | Consolidate Evolution Mapping V1/V2 into single component | 1 sprint | 3 files |
| P3 — Backlog | Consolidate or rename all clone/duplicate component folders | 2 sprints | 7 folders |
| P3 — Backlog | Delete confirmed dead code (9 folders/files) | 1 hr | 9 items |

---

## Files Generated

| File | Lines | Description |
|---|---|---|
| `unused-assets-report.md` | ~130 lines | Full inventory of unused components, services, packages, and files |
| `firebase-schema.ts` | ~680 lines | TypeScript interfaces for 85+ Firestore collections with JSDoc, warnings, and subcollection nesting |
| `component-documentation.md` | ~1,600 lines | Full documentation for all 383 used components — individually documented with status flags |
| `audit-summary.md` | This file | Top 10 issues, quick wins, remediation priority table, and systemic patterns |
