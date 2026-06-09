# Auth & Role-gated navigation — e2e recon

> Concept group: `auth-roles` | Routes: `login`, `EISDashboard`, `profile-role-access`
> Source: `src/app/login`, `src/app/main-dashboard`, `src/app/Business Dashboard/profile-based-access`
> Docs read: `specs/AUTH-ROLES.md`, existing `e2e/auth-nav.spec.ts` (skipped; needs rewire)

---

## Routes

| Path | Component file:line | Guard | ATC? |
|---|---|---|---|
| `/login` | `src/app/login/login.component.ts:36` | None (public) | No |
| `/EISDashboard` | `src/app/main-dashboard/main-dashboard.component.ts:27` | `authGuard` (line 28-29 of `auth.guard.ts`: always `true` once auth'd — bypass) | No |
| `/profile-role-access` | `src/app/Business Dashboard/profile-based-access/profile-based-access.component.ts:54` | `authGuard` — `dashboard` ACL expected; guard checks roles AND profileid at `auth.guard.ts:44` | No |
| `''` (empty) | redirect to `/EISDashboard` | — | No |

Guard source: `src/app/auth.guard.ts`. Key lines:
- **No auth → redirect to `/login`** (`auth.guard.ts:25`)
- **`/EISDashboard` always allowed** (`auth.guard.ts:28-29`)
- **All other routes**: `routeConfig(route)` → `{roles[], profileid[]}` from `dashboard` collection → `hasAccess = roles.some(r ∈ activeRoles) || profileid.includes(loggedProfileId)` (`auth.guard.ts:44`)
- **No ACL configured**: "Contact Admin" dialog shown, returns `false` (`auth.guard.ts:48-58`)
- **Insufficient role**: "Access denied" dialog, returns `false` (`auth.guard.ts:63-77`)

---

## Firestore collections

| Collection | Access | Purpose | Named DB? |
|---|---|---|---|
| `profile_data` | read | Login: query by email to get `role_ref`, `number`, `countrycode`, `profileid` (`login.component.ts:136`) | default |
| `user_data` | read + write | Login: `user_ref` pointer for profile lookup; Registration writes `user_data/{uid}` (`login.component.ts:286`); auth chain (`app.component.ts:240`) | default |
| `users_roles` | read | Auth chain: dereferenced from `profile_data.role_ref` to get boolean role flags (`auth.guard.ts:32`, `authguard.service.ts:314`) | default |
| `dashboard` | read (stream) | Nav: `app.component.ts:584` — `where showInSidenav==true`, sorted by `order`; guard: `authguard.service.ts:325`; profile-based-access reads full `dashboard` collection (`profile-based-access.component.ts:133`) | default |
| `classify` | read + write | `AHCRM_dashboard_access` doc: per-profile Business Dashboard access list; read at `profile-based-access.component.ts:537`; written at `:301-302` | default |
| `FCM_token` | read + write | `authguard.service.ts:1417` — written on login after Firebase Messaging token is resolved; read/deactivated on new device login | default |
| `loginlog` | write | `authguard.service.ts:1463` — written when `daysDifference > 7` on an FCM token update (background, not primary auth) | default |
| `emailOTPs` | read + write | Workshop self-registration only: OTP creation (`user_registration.js:132`) and verification (`user_registration.js:199`) | default |
| `new_user_data` | write | Workshop self-registration CF side-effect (`user_registration.js:252`) | default |
| `user` | write | Registration: `login.component.ts:279` — `user/{uid}` doc set alongside `user_data` | default |
| `participant metadata` | write | CF side-effect of `createProfile_registeredUser` when a new `user_data` is created (`user_registration.js:86`) | default |

**Note:** `profile-based-access.component.ts` also reads/writes `dashboarduseraccess` collection (`ts:245-395`). However, the Add form is **commented out** in the production HTML (`html:9-128`); current UI only exposes the dashboard-direct edit dialog. The `dashboarduseraccess` reads are therefore dead UI as of this source revision.

---

## Config drivers

| Config | What it controls | Where read |
|---|---|---|
| `dashboard` collection (23 docs) | Nav tree + per-route ACL (`label`, `route`, `roles[]`, `profileid[]`, `children[]`, `showInSidenav`, `order`) | `authguard.service.ts:325`; `app.component.ts:584` |
| `classify/AHCRM_dashboard_access` | Per-profile access to named Business Dashboard sections | `profile-based-access.component.ts:537`; `docData()` live stream |
| `users_roles/{id}` | Per-user boolean role flags (admin, participant, ah, ahmember, eis, capacityplanner, developer, eventcoordinator, changeagent, …) | `authguard.service.ts:315`; `auth.guard.ts:38` |
| `environment.firebase.projectId` | Selects which Watson verification URL to call during registration (`login.component.ts:211-220`) | Compile-time |
| `classify/eventwati` | Wati WhatsApp API key/serverid (only for OTP registration via `verifyEmailOTPNewUsers`) | `user_registration.js:293` |

**IndexedDB cache**: `authguard.service.ts` caches `cache_loggedInRoles`, `cache_loggedInProfile`, `cache_dashboardItems` in IDB (10-minute TTL). On login the cached roles are loaded first, then live Firestore snapshot overrides. Tests must not rely on a stale cache — use fresh Playwright contexts (no `storageState` sharing across role-switch tests).

---

## Cloud Functions involved

| Function | Trigger | Side-effect a test can assert |
|---|---|---|
| `createProfile_registeredUser` | `onDocumentCreated("user_data/{docid}")` | Writes `profile_data/{pid}` (with `name`, `email`, `user_ref`, `role_ref → users_roles/{id}`, `enable:true`, `block:false`) AND `users_roles/{id}` (all roles false except `participant:true`) AND `participant metadata/{pid}` | `user_registration.js:13` |
| `sendEmailOTPNewUsers` | `onCall` | Writes `emailOTPs/{id}` (`otp`, `email`, `expiresAt`, `verified:false`), sends Postmark email | `user_registration.js:104` |
| `verifyEmailOTPNewUsers` | `onCall` | On OTP match: creates Firebase Auth user, writes `new_user_data/{pid}`, marks `emailOTPs/{id}.verified=true`, sends welcome email + Wati WhatsApp | `user_registration.js:185` |
| `resendEmailOTPNewUsers` | `onCall` | Invalidates old OTPs (`verified:true, invalidated:true`), writes new `emailOTPs/{id}` | `user_registration.js:360` |

**NOT exported (deprecated):** `emailOTP` (`depreciated.js:9`) — NOT in `index.js`, not deployed to the test project. Tests must not reference it.

**External services invoked by these CFs:**
- Postmark (email): `sendEmailOTPNewUsers` → template `register-otp-newuser`; `verifyEmailOTPNewUsers` → template `welcome-email`
- Wati WhatsApp: `verifyEmailOTPNewUsers` → `live-mt-server.wati.io` template `eiflixworkshopv8`

---

## External services to stub

| Service | Call site | When triggered |
|---|---|---|
| **FCM** (`getToken`, `onMessage`) | `authguard.service.ts:1267` (`getToken`), `:1313` (`onMessage`) | On every login (browser notification permission → `updateFCMToken`) |
| **FCM legacy HTTP push** | `authguard.service.ts:207` (`http.post fcm.googleapis.com`) | Only when `sendPushMessage()` is called (admin action, not on login path under test) |
| **Postmark** (email) | `user_registration.js:147` (`sendEmailOTPNewUsers`), `:259` (`verifyEmailOTPNewUsers`) | Workshop OTP registration only — NOT in the login or EISDashboard flows being tested |
| **Wati WhatsApp** | `user_registration.js:301-323` (`verifyEmailOTPNewUsers`) | Workshop OTP registration only |
| **Watson verification HTTP** | `login.component.ts:223` (`http.get starlabs_userverification`) | Registration `doregister()` only — NOT in `dologin()` |
| **Phone OTP dialog** | `login.component.ts:97` — `phoneAuthentication()` returns `true` immediately (body is a bare `return true`, rest is commented out) | Dead code — no stub needed |

**Critical:** FCM `getToken` must be intercepted (or the notification permission request suppressed) in every test that exercises `loginAs`. The queue suite already does this via `e2e/queue/stubs/fcm.stub.ts`. Auth-roles tests must call `installFcmStub(page)` from `e2e/queue/stubs/index.ts` in `beforeEach`.

---

## Actors / roles

| Actor | Seed email | `users_roles` flags | Landing route | Role gate (file:line) |
|---|---|---|---|---|
| Admin/Operator | `admin+<run>@example.com` | `admin:true` | `/EISDashboard` (then nav to any route; guard always-true on EISDashboard) | `auth.guard.ts:28-29` bypass |
| Participant | `participant0+<run>@example.com` | `participant:true` (only) | `/EISDashboard` | Same bypass; but gated routes deny |
| Developer/Specialist | `specialist0+<run>@example.com` | `admin:true, changeagent:true` | `/EISDashboard` | Auth chain same path |
| BIG Admin | `big0+<run>@example.com` | `admin:true, eventcoordinator:true` | `/EISDashboard` | Same |

**Landing after login** (`login.component.ts:191`): `navigateByUrl(routeParams != null ? routeParams : '/EISDashboard')`. Every successful login lands on `/EISDashboard` (unless a `?returnUrl=` was passed). `EISDashboard` always passes the guard (`auth.guard.ts:28-29`), so the post-login landing never bounces.

**`profile-role-access` ACL**: The live `dashboard` collection's `profile-role-access` child entry is expected to carry `roles: [admin]` (or similar admin-only gating). The auth.guard checks the `dashboard` ACL for this route; an admin user must pass. A pure-participant must be denied ("Access denied" dialog, guard returns `false`).

---

## Key user flows

**Flow 1 — Login (staff/admin)**
1. `GET /login` — `LoginComponent` renders, no Firestore read yet.
2. User fills email + password, submits (`dologin`).
3. `profile_data` queried by `where email == value.email` (`login.component.ts:136`). Reads: `profile_data.number`, `profile_data.countrycode`, `profile_data.role_ref`.
4. `users_roles/{id}` fetched via `role_ref` (`login.component.ts:157-160`). Read: `roleData.participant` (used as a check but not gating).
5. `signInWithEmailAndPassword` fires (Firebase Auth).
6. `router.navigateByUrl('/EISDashboard')` (`login.component.ts:191`).
7. **App.component.ts**: `user(firebaseAuth).subscribe` fires → `setUid(uid)` (`app.component.ts:220`). OnSnapshot on `profile_data where user_ref == user_data/{uid}` (`app.component.ts:240-241`). Once profile resolves: `role_ref` → `users_roles` onSnapshot → sets `loggedinRoles`, `profileEligibleRoles`, calls `filterNavItems()`.
8. `fetchNavigationItems()` — queries `dashboard where showInSidenav==true`, sorted by `order` (`app.component.ts:584-595`). Filters each child: keep iff `roles ∩ profileEligibleRoles ≠ ∅ OR profileid ∈ child.profileid` (`app.component.ts:541-544`). Sets `guard.favouriteDashboard`.
9. **Firestore writes produced:** `FCM_token` (upsert after `getToken()`, `authguard.service.ts:1417/1449`); conditionally `loginlog` if >7 days since last token update (`authguard.service.ts:1463`).

**Flow 2 — Auth-gated route navigation**
1. User clicks a nav item → Angular router fires `authGuard`.
2. `authState(auth).pipe(take(1))`: if no user → redirect `/login` (`auth.guard.ts:21-26`).
3. `authService.getRoles()` reads `profile_data where user_ref == user_data/{uid}` → `role_ref` → `users_roles` (`authguard.service.ts:307-318`). Returns full role map.
4. `authService.username()` reads same profile, returns `profileid` (`authguard.service.ts:351-362`).
5. `routeConfig(cleanUrl)` scans all `dashboard` docs, matches `route` or `children[].route` (`authguard.service.ts:320-348`).
6. `hasAccess = rolesArray.some(r ∈ roles[]) || routeProfiles.includes(profileid)` (`auth.guard.ts:44`). Returns `true` or opens dialog + returns `false`.
7. **No Firestore writes** — this flow is read-only.

**Flow 3 — EISDashboard (Main Dashboard)**
1. User lands at `/EISDashboard` — guard bypassed (always `true`, `auth.guard.ts:28-29`).
2. `MainDashboardComponent` mounts. Nav-building code is **commented out** (`main-dashboard.component.ts:46-127`). The active nav is rendered by `app.component.ts` in the sidenav.
3. Dashboard renders `authguard.favouriteDashboard` as quick-access cards (`main-dashboard.component.html:8`). These are populated by `filterNavItems()` from `dashboard.favourites[]` (`app.component.ts:550`).
4. **No Firestore writes in this component.** The favourites write path is in `app.component.ts:711-716` (toggle favourite), not exercised by landing.

**Flow 4 — profile-role-access (admin screen)**
1. Auth guard checks `dashboard` ACL for `/profile-role-access`.
2. On mount: `loadScreenAccess()` — subscribes to full `dashboard` collection stream, filters docs with non-empty `profileid[]` arrays (`profile-based-access.component.ts:131-165`).
3. `loadAHCRMaccess()` — live `docData` stream on `classify/AHCRM_dashboard_access` (`ts:537`).
4. `authguard.getProfileMap()` — loads all `profile_data` docs for the profile name picker (`ts:113`).
5. Admin edits a dashboard entry → opens edit dialog → saves → `updateDoc(dashboard/{docid}, {...})` (`ts:498`). This is the Firestore write this flow produces.
6. Admin adds an AHCRM section → `setDoc(classify/AHCRM_dashboard_access, {...})` (`ts:302`).

---

## Seed requirements

These reuse the queue suite's existing `seed-test-project.js` helpers where possible.

1. **Admin actor** (`admin+<TESTRUNID>@example.com`): already seeded by `seedAuthChain()` in `seed-test-project.js:361`. Must have `users_roles.admin = true`. Confirmed: all queue suite tests reuse this seed.
2. **Participant actor** (`participant0+<TESTRUNID>@example.com`): already seeded by `seedParticipantToken()` path in `seed-test-project.js:397`. Has `users_roles.participant = true` only.
3. **`dashboard` collection**: Already present in the test project `slabs-queue-e2e-exdcz` — the queue suite's `seed-test-project.js:1075` lists `dashboard` in the teardown allowlist (i.e., it is expected to be written). The nav-rendering tests need at least one doc with `showInSidenav:true`, `roles:["admin"]` and one with `roles:["participant"]`. The live 23-doc tree in the test project satisfies this. **Do NOT seed `dashboard` per-run** — it is shared config. Read it from the live project.
4. **`classify/AHCRM_dashboard_access`**: Already a live doc in the test project (confirmed by `specs/AUTH-ROLES.md §3`: `classify` count 36, `AHCRM_dashboard_access` is one of them). Read-only for most tests; one test (AR-09) needs to verify the write shape — seed a test-scoped key (`TESTRUNID_test`) and clean it up.
5. **`profile_data` with `number` != null**: The seeded admin/participant actors already carry `number` (set by `seedAuthChain`/`seed-test-project.js:372` — the `number` field must be non-null for `dologin` to proceed past the gate at `login.component.ts:149`). Confirmed: the seed writes `number` to `profile_data` via the staff auth chain.
6. **FCM stub**: no seed doc needed; the FCM stub intercepts `getToken` at the browser level (`e2e/queue/stubs/fcm.stub.ts`).

---

## Candidate test cases

| ID | Title | Type | Anti-circular basis | Priority |
|---|---|---|---|---|
| AR-01 | Admin logs in via the real form and lands on /EISDashboard (guard bypass, no bounce, no console error) | REAL-UI | Guard bypasses EISDashboard (auth.guard.ts:28-29); URL asserted as app-routed value — not the test's navigation target | P0 |
| AR-02 | Participant logs in and lands on /EISDashboard; navigation to admin-only route is denied (dialog shown, stays on current URL) | REAL-UI | Guard returns false for participant on admin route; URL the app stays on (not where the test tried to go); dialog text app-computed | P0 |
| AR-03 | Admin navigates to /profile-role-access; guard admits them (no dialog, route mounts) | REAL-UI | App route resolves (URL assertion) — the guard read `dashboard` ACL and computed `hasAccess=true` against seeded admin roles | P0 |
| AR-04 | Participant navigates directly to /profile-role-access; guard shows "Access denied" dialog and returns false (URL does not change to profile-role-access) | REAL-UI | App shows dialog (rendered by the guard) and does not navigate — both values app-computed from its dashboard ACL read | P0 |
| AR-05 | EISDashboard renders only role-permitted sidenav items for admin (admin-role items present; developer-only item absent for non-developer admin) | REAL-UI | Nav item presence/absence is what the app rendered from its dashboard stream filtered by profileEligibleRoles (app.component.ts:541-544); asserted against known seeded roles, not the test's data | P0 |
| AR-06 | EISDashboard renders only role-permitted sidenav items for participant (participant-role items present; admin-only items absent) | REAL-UI | Same nav filter logic; seeded participant has only participant:true; admin-only items are absent — app-computed nav | P0 |
| AR-07 | Quick-access favorites card count on EISDashboard matches the number of dashboard docs that carry this user's profileid in their `favourites[]` | REAL-UI | `authguard.favouriteDashboard.length` (app-computed from `filterNavItems`) vs count of `dashboard` docs with profileid in `favourites[]` read by admin via Firestore | P1 |
| AR-08 | profile-role-access Screen Access table renders the seeded dashboard profileid entries (rows ≥ count of dashboard docs with non-empty profileid[]) | REAL-UI | Row count is what the app rendered from its `dashboard` stream filtered for non-empty profileid (ts:152-159); asserted against count the test reads from Firestore — two independent derivations | P1 |
| AR-09 | profile-role-access edit dialog updates the dashboard doc's profileid[] in Firestore (app writes the right doc with the right array) | CF-SIDEEFFECT | After the admin saves the edit dialog, read `dashboard/{docid}.profileid` from Firestore via admin SDK; assert it contains the profile the app was shown — value app wrote, not the test | P1 |
| AR-10 | AHCRM Dashboard Access table renders all keys from classify/AHCRM_dashboard_access (row count == key count the CF/admin last wrote) | REAL-UI | Table row count is app-computed from its `classify/AHCRM_dashboard_access` live stream vs countWhere classify (1 doc, key count from admin SDK read) | P1 |
| AR-11 | Unauthenticated direct navigation to /profile-role-access redirects to /login (guard no-user branch) | REAL-UI | URL after navigation is app-routed /login — app computed this from `!user || !user.uid` check (auth.guard.ts:21-26); not the test's URL target | P0 |
| AR-12 | Login with wrong password: stays on /login, no navigation, no console error | REAL-UI | URL is still /login (app did not navigate) — app-computed post-Firebase-Auth-failure state | P1 |
| AR-13 | Login with email that has no profile_data: alert shown, stays on /login | REAL-UI | App shows alert for empty profileSnapshot (login.component.ts:143-145); URL stays on /login | P1 |
| AR-14 | createProfile_registeredUser CF: writing a user_data doc creates profile_data + users_roles with participant:true (CF side-effect assertion) | CF-SIDEEFFECT | Seed a raw `user_data/{uid}` doc (no prior profile_data); poll until CF creates `profile_data` (where email==seeded email) with `role_ref → users_roles`; assert `users_roles.participant == true` — CF-computed value vs seeded user_data | P1 |
| AR-15 | sendEmailOTPNewUsers CF: calling the callable writes an emailOTPs doc with `verified:false`, `expiresAt` ~5 min ahead, correct email | CF-SIDEEFFECT | After calling the CF, read `emailOTPs where email==seeded; assert verified:false and expiresAt > now+4min — CF-written values vs known seeded email | P2 |

---

## ATC exclusions within this group

No routes in this group (`/login`, `/EISDashboard`, `/profile-role-access`) are themselves ATC routes. However:

- **`dashboard` collection** contains ATC parent/children entries (e.g. the `ATC` parent with 14 children, `EI AI` → `/viewaigeneratedatc` with `roles:[ah,developer,eis]`). Tests that read the nav tree must **not** navigate to those routes, and **must not** assert on the ATC nav entries (filter them out by route prefix when asserting item counts).
- **AR-05/AR-06**: Nav item assertions must exclude ATC children. The filter: skip any `dashboard` child whose `route` is in `ATC_EXCLUDED_ROUTES` (from `e2e/_support/excluded-routes.ts`).
- **`profile-role-access`** renders the full `dashboard` collection's `profileid[]` entries, which may include ATC-parent entries. Tests on AR-08/AR-09/AR-10 must NOT assert on ATC-route rows specifically; use the total-count or non-ATC row approach.
- **`classify/AHCRM_dashboard_access`**: The live doc key `"business dashboard"` maps to 6 profileids. Not an ATC collection — safe to read/write in AR-10 (test-scoped key only).

---

## Risks / unknowns

1. **FCM `getToken` fires on every login** (`authguard.service.ts:1267`). If the browser notification permission prompt fires in Playwright (headless), it can block the test. The `installFcmStub` from the queue suite must be applied before login in every auth-roles test.
2. **Dashboard ACL is shared config**, not per-run seeded. If another test run or a developer modifies the live `dashboard` collection on `slabs-queue-e2e-exdcz`, AR-05/AR-06/AR-08 assertions on role counts could drift. Use lower-bound containment assertions (e.g., "at least one admin-role item is visible") rather than exact counts.
3. **No `data-testid` attributes** on any of the three components (confirmed: grep found zero). Selectors must use `formcontrolname` (login form), role+name (Material buttons/inputs), and stable CSS classes (sidenav items, table rows). This is a fallback chain risk.
4. **`profile-role-access` Add form is commented out** in the HTML (`html:9-128`) so `addAccess()` / `addAhcrmScreenAccess()` cannot be triggered via the UI today. AR-09 tests the edit dialog only. This is a coverage gap; flag for the product backlog.
5. **No `returnUrl` assertion**: `login.component.ts:71` reads `?returnUrl` from the query string but the commented-out subscription (`ts:74-89`) is inactive. The route param is read once in the constructor but the redirect `navigateByUrl(routeParams ?? '/EISDashboard')` (`ts:191`) does use it. An AR-11 variant testing returnUrl redirect is possible but the dead code path makes it fragile.
6. **`createProfile_registeredUser` CF** is triggered by `user_data` creates. The test project's allowlist (`e2e/lib/test-project.js`) must include `user_data` as a writable collection for AR-14. Verify: `user_data` is listed in `seed-test-project.js:1072-1075`.
7. **Auth user creation** for AR-14/AR-15 must use `firebase-admin.auth().createUser()` in the seed helper (not through the browser login form) so the CF trigger fires. The seed then polls Firestore for the CF output.
8. **`main-dashboard.component.ts` nav is dead** (`:46-127` commented out). The active nav is in `app.component.ts`. Tests on EISDashboard must interact with `app-root`'s sidenav, not any element rendered by `MainDashboardComponent` itself (which only renders the favourites grid from `authguard.favouriteDashboard`).
9. **IndexedDB cache TTL**: If tests reuse browser state across role switches (same page context), the 10-minute cache could serve stale roles. Always use fresh Playwright browser contexts (`browser.newContext()`) when switching roles within a single spec run.
