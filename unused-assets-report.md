# Unused Assets Report
Generated: 2026-04-08
Project: starlabs-autogen (Angular 19 Standalone Components)

---

## Unused Components

> **Audit methodology:** All components were cross-referenced against:
> (1) `app.routes.ts` — all 319 `loadComponent()` entries,
> (2) `MatDialog.open()` calls across all `.ts` files (~40 programmatic dialogs found),
> (3) HTML template selectors, (4) parent component imports.
> A component is flagged unused only if it has **zero references** in all four categories.

---

### 1. `route-configuration/route-configuration.component.ts`
**Path:** `src/app/route-configuration/route-configuration.component.ts`
**Reason:** The active route (`/routeconfiguration`) points to `route-configuration-duplicate/` instead:
```
{path: 'routeconfiguration', loadComponent: () => import('./route-configuration-duplicate/route-configuration.component')...}
```
The original `route-configuration/` folder is never loaded anywhere. It is the source-of-truth version (contains `roles` column and `guard.getRoles()` initialization) but has been bypassed entirely.
**Estimated dead lines:** ~250 lines

---

### 2. `Journey Onboarding/delivery-dashboard/delivery-dashboard.component.ts`
**Path:** `src/app/Journey Onboarding/delivery-dashboard/delivery-dashboard.component.ts`
**Reason:** The active route `/delivery-dashboard` loads `delivery-dashboard-clone` instead. No reference to the original `DeliveryDashboardComponent` exists in `app.routes.ts`. The original is not used as a dialog or in any template.
**Estimated dead lines:** ~300+ lines

---

### 3. `Journey Onboarding/sales-dashboard/sales-dashboard.component.ts`
**Path:** `src/app/Journey Onboarding/sales-dashboard/sales-dashboard.component.ts`
**Reason:** The active route `/sales-report` loads `sales-dashboard-clone` instead. No reference to `SalesDashboardComponent` (original) exists in `app.routes.ts`. Not a dialog. Not used in any template.
**Estimated dead lines:** ~400+ lines (imports xlsx, date-fns, uuid)

---

### 4. `big/big-cohorts/big-cohorts.component.ts`
**Path:** `src/app/big/big-cohorts/big-cohorts.component.ts`
**Reason:** The active route `/bigcohorts` loads `big-cohort-clone` instead:
```
{path: 'bigcohorts', loadComponent: () => import('./big/big-cohort-clone/big-cohort-clone.component')...}
```
The original `BigCohortsComponent` does not appear in routes, dialogs, or templates.
**Estimated dead lines:** ~250 lines

---

### 5. `queue system/dynamic-queue-manager/dynamic-queue-manager.component.ts`
**Path:** `src/app/queue system/dynamic-queue-manager/dynamic-queue-manager.component.ts`
**Reason:** The active route `/dynamicqueuemanager` loads `dynamic-queue-manager-clone` instead (original route is commented out in `app.routes.ts` line 178). Not used as a dialog or in any template.
**Estimated dead lines:** ~600+ lines (one of the largest components in the system)

---

### 6. `queue system/queue-planning-clone/queue-planning-clone.component.ts`
**Path:** `src/app/queue system/queue-planning-clone/queue-planning-clone.component.ts`
**Reason:** This is a clone that was **never activated**. Its route import is commented out in `app.routes.ts` (line 496: `// import { QueuePlanningCloneComponent }...`). It does not appear in any active route, dialog, or template.
**Note:** Confusingly, `dynamic-queue-manager-clone` IS active but `queue-planning-clone` is not. This is a stale file that was never promoted.
**Estimated dead lines:** ~450 lines

---

### 7. `Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.ts`
**Path:** `src/app/Journey Onboarding/journeycoach-dashboard/journeycoach-dashboard.component.ts`
**Reason:** The route for `JourneycoachDashboard-new` loads `journeycoach-duplicate` instead. `JourneycoachDashboardComponent` is only referenced in a commented-out import in `app.routes.ts` (line 443). Not used as a dialog or in any template.
**Estimated dead lines:** ~350 lines

---

### 8. `AppEngagement/community-manager-old/community-manager-old.component.ts`
**Path:** `src/app/AppEngagement/community-manager-old/community-manager-old.component.ts`
**Reason:** The name strongly implies a superseded version. Not referenced in `app.routes.ts`, not found as a dialog open target, not found in any template import. The active `community-manager` component is at a sibling path and IS in routes at `/communitymanager`.
**Estimated dead lines:** ~200 lines

---

### 9. `Journey Onboarding/create-watson-profile-copy.ts`
**Path:** `src/app/Journey Onboarding/create-watson-profile-copy.ts`
**Reason:** This is a stray copy of a component file sitting loose in the `Journey Onboarding/` folder (not inside a component subfolder). It is never imported or referenced anywhere in the project. It appears to be a forgotten clipboard paste.
**Estimated dead lines:** ~150 lines

---

## Unused Services

All 8 custom services were verified to be actively injected. No fully unused services found.

| Service | File | Status |
|---|---|---|
| `AuthguardService` | `authguard.service.ts` | ✅ Used — injected across entire app via `authGuard` |
| `InstanceStatusService` | `instance-status.service.ts` | ✅ Used — injected in diagnostics/monitoring components |
| `NetworkStatusService` | `network-status.service.ts` | ✅ Used — injected in `app.component.ts` and network-aware screens |
| `SnackbarService` | `shared/snackbar.service.ts` | ✅ Used — injected in multiple components |
| `WatiService` | `wati.service.ts` | ✅ Used — injected in communication/participant analytics components |
| `DataTransferService` | `participants-analytics/data-transfer.service.ts` | ✅ Used — injected in `participants-analytics.component.ts` and `participants-evolution-summary.component.ts` |
| `DeepAudioFilterService` | `Service/NoiseCancellation/deep-audio-filter.service.ts` | ✅ Used — injected in `join-openvidu-call.component.ts` |
| `NoisecancellationService` | `Service/NoiseCancellation/noisecancellation.service.ts` | ✅ Used — injected in `join-openvidu-call.component.ts` |

---

## Unused Directives & Pipes

### Directives
| Directive | File | Status | Notes |
|---|---|---|---|
| `SafeImgDirective` | `shared/safe-img.directive.ts` | ⚠️ Verify | Registered in `app.config.ts` providers but no template usage found via grep. Confirm it is not used via `appSafeImg` or `[safeImg]` selector in HTML files before deleting. |

### Pipes
All 4 custom pipes appear to be in use within their local modules:

| Pipe | File | Status |
|---|---|---|
| `ExcludeFilterArrayPipe` | `AppEngagement/taxonomy/exclude-filter-array.pipe.ts` | ✅ Used in `taxonomy` templates |
| `CustompipePipe` | `custompipe.pipe.ts` | ✅ Used in profile/participant templates |
| `FilterPipe` | `hpc/filter.pipe.ts` | ✅ Used in HPC component template |
| `SegmentNamePipe` | `queue system/segment name.pipe.ts` | ✅ Used in queue planning templates |

---

## Unused Modules & Imports

This project uses **Angular 19 standalone components** — there are no `NgModule` files. Module-level imports are handled at the component level via the `imports: []` array.

**Notable import-level concerns (not strictly unused, but wasteful):**

| Location | Import | Issue |
|---|---|---|
| `app.config.ts` | `importProvidersFrom(MatNativeDateModule)` + `provideNativeDateAdapter()` | Both are provided — `provideNativeDateAdapter()` is the modern standalone equivalent; `importProvidersFrom(MatNativeDateModule)` is redundant |
| `app.config.ts` | `SafeImgDirective` in providers array | Directives do not belong in the `providers` array — this registration has no effect; it should be in the `imports` array of the component template that uses it |
| Multiple components | `AngularFireModule`, `AngularFireAuthModule` (compat API) | App uses both modern `@angular/fire` SDK and the compat `FIREBASE_OPTIONS` provider. The compat layer adds unnecessary bundle weight if modern SDK is used exclusively |

---

## Unused NPM Packages

Packages in `package.json` that have **zero imports** in any `.ts` file across `src/app/`:

| Package | Type | Reason |
|---|---|---|
| `common` (v0.2.5) | dependency | Not imported in any `.ts` file — zero occurrences of `from 'common'` found. Likely a leftover from an old setup. Safe to remove. |
| `@mediapipe/camera_utils` | dependency | No `from '@mediapipe/camera_utils'` imports found anywhere in the codebase. The `@mediapipe/face_mesh` is similarly unused from TypeScript imports (may be loaded indirectly via the `openvidu-video-element` component that references `@mediapipe/face_mesh` via a different path). Verify before removing. |
| `@mediapipe/face_mesh` | dependency | Same as above — no direct TS imports found but loaded indirectly inside `openvidu-video-element.component.ts`. Verify the exact import chain before removing. |
| `@zxing/browser` | dependency | The QR scanner component uses `@zxing/ngx-scanner` (the Angular wrapper), not `@zxing/browser` directly. No `from '@zxing/browser'` found in `.ts` files. |
| `@zxing/library` | dependency | Same as `@zxing/browser` — the Angular wrapper `@zxing/ngx-scanner` is used instead. No direct `@zxing/library` imports found in `.ts` files. |
| `@types/jspdf` | devDependency | `jspdf` is imported via `from 'jspdf'` in multiple components but the `@types/jspdf` type package is outdated (jsPDF v3+ ships its own types). This devDependency can be removed. |

**Packages confirmed in use:**
`@angular/fire`, `firebase`, `@angular/material`, `@angular/cdk`, `bootstrap`, `rxjs`, `livekit-client`, `@livekit/track-processors`, `@sapphi-red/web-noise-suppressor`, `amazon-chime-sdk-js`, `@zoom/meetingsdk`, `recordrtc`, `xlsx`, `jspdf`, `html2canvas`, `file-saver`, `uuid`, `date-fns`, `marked`, `dompurify`, `ng-apexcharts`, `apexcharts`, `ngx-markdown`, `ngx-editor`, `angular-calendar`, `@ctrl/ngx-emoji-mart`, `@kolkov/angular-editor`, `ngx-mat-select-search`, `ngx-material-timepicker`, `@zxing/ngx-scanner`, `@fortawesome/fontawesome-free`

---

## Unused Files & Assets

| File/Folder | Type | Reason |
|---|---|---|
| `src/app/Journey Onboarding/create-watson-profile-copy.ts` | Stray TS file | Loose copy of a component file, never imported anywhere |
| `src/app/route-configuration/` | Folder (3 files) | Entire original route-config folder superseded by `-duplicate` variant |
| `src/app/Journey Onboarding/delivery-dashboard/` | Folder | Superseded by `delivery-dashboard-clone/` in active routes |
| `src/app/Journey Onboarding/sales-dashboard/` | Folder | Superseded by `sales-dashboard-clone/` in active routes |
| `src/app/Journey Onboarding/journeycoach-dashboard/` | Folder | Superseded by `journeycoach-duplicate/` in active routes |
| `src/app/big/big-cohorts/` | Folder | Superseded by `big-cohort-clone/` in active routes |
| `src/app/queue system/dynamic-queue-manager/` | Folder | Superseded by `dynamic-queue-manager-clone/` in active routes |
| `src/app/queue system/queue-planning-clone/` | Folder | Clone never promoted to active route; commented out permanently |
| `src/app/AppEngagement/community-manager-old/` | Folder | Old version of community manager, not in routes |

---

## Summary Table

| Category | Count | Estimated Dead Lines |
|---|---|---|
| Unused Components | 9 | ~2,950 lines |
| Unused Services | 0 | — |
| Unused Directives | 1 (needs verify) | ~30 lines |
| Unused Pipes | 0 | — |
| Unused Modules/NgModules | 0 (standalone arch) | — |
| Redundant providers/imports | 3 | ~10 lines |
| Unused NPM Packages | 5 confirmed + 2 to verify | — |
| Unused/Stray Files & Folders | 9 items | ~2,950 lines |

**Total confirmed dead code: ~2,950 lines across 9 components/folders.**

> ⚠️ **The most dangerous finding:** The `/routeconfiguration` route silently loads the **duplicate** (stripped-down, missing `roles` column) instead of the original. This means route-based access control may not be functioning correctly system-wide. See Part 3 for full analysis.
