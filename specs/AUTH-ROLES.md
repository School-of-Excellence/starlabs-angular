# AUTH-ROLES.md — Authentication, roles & config-driven navigation

> Subsystem reference (data-first, config-aware, evidence-backed). Authorization in StarLabs is **100% client-side and config-driven**: there are **no Firebase custom claims**. A user's roles come from a Firestore doc, and which screens they can reach is decided by the `dashboard` collection — the nav tree *and* the route ACL are configuration.
>
> Evidence: `specs/AUTH-ROLES-evidence/evidence.json` (the 23-doc nav tree, role-ref tally, users_roles/eisroles samples). Config model: `CONFIGURATION.md §6`. The hub service: `DESIGN.md` (AuthguardService). Graph community: [authguard](../graphify-out/wiki/authguard.md) (83 nodes — the #1 hub). Reliability: `data-reliability.md` (DRAFT).

## 1. Purpose
Authenticate a user (Firebase Auth), resolve their **roles**, and gate every screen + nav item by a per-route **ACL** held in Firestore config. Admins edit the nav/ACL config (`dashboard`) without code changes — add a route to a `children[]` array with a `roles[]` list and it appears for those roles.

## 2. Operator screens (from `operator-screens.md`)
- `login` (`LoginComponent`) — auth + profile/role resolution.
- `EISDashboard` (`MainDashboardComponent`) — landing (note: its sidenav code is commented out; nav is built in `app.component.ts`).
- `routeconfiguration` (`RouteConfigurationComponent`) — the `dashboard` nav/ACL editor.
- `profile-role-access` (`ProfileBasedAccessComponent`) — `classify`/`dashboarduseraccess` access editor.
- `appointmentrole` — reads `eisroles` (specialist role defs).

## 3. Collections by ROLE × reliability tier
| ROLE | Collection | Count | Note |
|---|---|---|---|
| **CONFIG** | `dashboard` | 23 | nav tree + per-route ACL (`label`, `route`, `roles[]`, `profileid[]`, `children[]`, `showInSidenav`, `order`) |
| **CONFIG** | `users_roles` | 3,252 | **per-user boolean auth-role flags** — the target of `profile_data.role_ref` |
| **CONFIG** | `eisroles` | 166 | **specialist/delivery role definitions** (`role`, `experiencestage`, `experiencelevel`) — used by Scheduling, *not* auth |
| **CONFIG** | `classify` | 36 | app-config singletons (e.g. `AHCRM_dashboard_access`) |
| **RUNTIME-STATE** | `profile_data` | 3,248 | the participant/operator profile (`role_ref`, `user_ref`, `participantmode`) |
| **RUNTIME-STATE** | `user_data` | 2,257 | thin Firebase-uid → user map |
| **RUNTIME-STATE** | `FCM_token` | 8,940 | push tokens (auth-adjacent) |

## 4. Configuration model — the auth chain (corrected against live data)
```
Firebase Auth (email/password)
   └─▶ user_data/{uid}                                   (thin uid→user map)
        └─ profile_data  where user_ref == user_data/{uid}        (app.component.ts:240; authguard.service.ts:311)
             └─ role_ref ──▶ users_roles/{id}            ★ NOT eisroles ★   (authguard.service.ts:314)
                  └─ roleMap = { participant:true, … }  (boolean flags)
                       └─ activeRoles = keys where value===true   (auth.guard.ts:38; app.component.ts:263)
                            └─ dashboard ACL: access if (activeRole ∈ roles[]) OR (profileid ∈ profileid[])
                                 (routeConfig authguard.service.ts:325-345 ; enforced auth.guard.ts:44)
```
**Verified facts:**
- **`role_ref → users_roles` (not `eisroles`).** Live: 60/60 sampled `profile_data.role_ref` point to `users_roles` (count 3,252 ≈ profile count); a sample doc's true flag = `participant`. `eisroles` (166) is the *separate* specialist-role catalog (e.g. "Breakthrough Mid Review Collaborator" / Diagnostics / Apprenticing) used by `Roles-To-EIS` in scheduling. *(This corrects DOCS/DESIGN, which said `role_ref → eisroles`.)*
- **No Firebase custom claims** anywhere — `grep -riE "customUserClaims|getIdTokenResult|token.claims"` over `src/` = **0 hits**. Authorization is entirely client-side Firestore config. (Security implication: the client enforces the ACL; a determined client could bypass nav gating — note for the security backlog.)
- **`dashboard`** is the single source of nav + ACL. `routeConfig(route)` scans all docs, matching the route at top level or inside `children[]`, returning `{roles[], profileid[]}`. The guard and the sidenav apply the **same** rule.
- **`main-dashboard.component.ts` does NOT build the live nav** — its `profile_data`/`dashboard` reads are commented out (`:46-127`); the active nav is `app.component.ts:539-594`.

`dashboard` doc shape (live `FwJ0g5qxzBfNUUJHSKUR`): `{label, route?, icon, showInSidenav, order, roles[], profileid[], children[]}`. `route` is 26% filled (only leaf items have a route; parents carry `children[]`).

## 5. Dynamic assembly / nav + guard
```
NAV (app.component.ts):   dashboard where showInSidenav==true  → sort by order (:594)
                          for each doc, walk children[] (:536); keep a child iff
                            child.showInSidenav && ( child.roles ∩ activeRoles ≠ ∅  OR  profileid ∈ child.profileid )   (:541-545)
GUARD (auth.guard.ts):    on navigate → getRoles() (:32) → routeConfig(firstUrlSegment) (:36)
                          hasAccess = activeRoles.some(r ∈ routeRoles) || routeProfiles.includes(profileid)   (:44)
                          no user → /login (:21) ; /EISDashboard always allowed (:28) ; no ACL configured → "Contact Admin" (:48)
```

## 6. Data flow
Login → `user_data/{uid}` → `profile_data` (by `user_ref`) → `role_ref` → `users_roles` (role flags) → cached as `loggedinRoles`/`profileEligibleRoles` → nav rendered from `dashboard` (filtered by role/profileid) → each route re-checked by `authGuard` against the same `dashboard` ACL. Admins change access by editing `dashboard` (route-configuration editor) or `classify/AHCRM_dashboard_access` (profile-based-access editor).

## 7. Worked example — a `dashboard` config doc → who sees the screen
The live nav is a 23-doc tree (by `order`), parents carrying `children[]` with leaf ACLs:
| Dashboard doc | route | sidenav | roles[] / gating | children |
|---|---|---|---|---|
| Dashboard | `/EISDashboard` | ✓ | (open; guard bypass) | 0 |
| Product Designer | (parent) | ✓ | gated at children | 14 |
| **Developer Settings** | `/routeconfiguration` | ✗ | **roles:[admin]** | 0 |
| **Form Template** | `/formtemplate` | ✗ | **roles:[admin,ah,ahmember,capacityplanner,developer,eis,participant]** | 0 |
| Content | (parent) | ✓ | gated at children | 17 |
| Queue System | (parent) | ✓ | gated at children | 14 |
| B!G | (parent) | ✓ | gated at children | 16 |
| ATC | (parent) | ✓ | (children are 🚫ATC-excluded) | 14 |
| **EI AI** | `/viewaigeneratedatc` | ✓ | **roles:[ah,developer,eis]** | 0 |
| **Journey Onboarding Detail** | `/journeyonboardingdetail` | ✓ | **roles:[admin,developer]** | 0 |
| **Development Mic Test** | `/devtestmic` | ✓ | **roles:[developer]** | 0 |

**Reading:** a user whose `users_roles` has `participant:true` (and not admin/developer) will, e.g., see **Form Template** (`participant` ∈ its roles) but **not** Developer Settings or Journey Onboarding Detail (no `participant`). The `authGuard` enforces the identical rule on direct navigation. Roles vocabulary observed across `dashboard`: `admin, developer, ah, ahmember, eis, capacityplanner, participant`. `classify/AHCRM_dashboard_access` = `{ "business dashboard": [6 profileids] }` — a per-profile access list for the Business Dashboard, edited by `profile-based-access` (not a runtime guard).

## 8. Known caveats
- **Client-side ACL only** — no server enforcement via custom claims; Firestore security rules (not in this repo) are the real backstop. Treat nav/route gating as UX, not a security boundary.
- **`role_ref → users_roles`**, not `eisroles` — older docs were wrong; `eisroles` is the specialist catalog (`SCHEDULING-DELIVERY.md`).
- Parents with `roles:[]` and no `route` aren't navigable directly (the guard's "no ACL configured" path); their `children[]` carry the real ACL.
- `loginlog` is a background auth log with **no operator screen** (demoted to infra, D-004) — not part of this trust set.

## 9. Evidence log
| Claim | Query / sample | Count | Source |
|---|---|---|---|
| role_ref → users_roles | 60/60 sampled profiles → `users_roles/…`; sample flag `participant` | 3,252 | evidence.json `.traces.roleRefTargetTally`/`.usersRolesDoc`; authguard.service.ts:314 |
| eisroles is specialist catalog | `0VDWDUDz6A6d9wyqn88g` "Breakthrough Mid Review Collaborator"/Diagnostics/Apprenticing | 166 | evidence.json `.traces.eisrolesDocs` |
| No custom claims | grep customUserClaims/getIdTokenResult = 0 | 0 | code audit |
| dashboard drives nav + ACL | routeConfig scans dashboard, matches route/children | 23 | authguard.service.ts:325; auth.guard.ts:44 |
| Nav filtered by role/profile | children kept iff roles∩activeRoles or profileid match | — | app.component.ts:541-545 |
| Leaf ACL examples | Developer Settings[admin], EI AI[ah,developer,eis], Mic Test[developer] | — | evidence.json `.traces.authTrace.dashboard` |
| main-dashboard nav is dead | dashboard reads commented out :46-127 | — | code audit |

## 10. Open questions (engineer validation)
1. Are Firestore security rules the actual server-side enforcement (since there are no custom claims)? Where are they?
2. Confirm the canonical role set in `users_roles` (admin/developer/ah/ahmember/eis/capacityplanner/participant/coach/rolemanager?).
3. Is `classify/AHCRM_dashboard_access` enforced anywhere at runtime, or purely an admin record?
4. Should the duplicate `route-configuration/` and `route-configuration-duplicate/` editors be deduped (TD-001)?
