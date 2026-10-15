# 2026-10-15 — Auth guard: "doc() cannot be called with an empty path" on refresh

**Files:** `auth.guard.ts`, `role.guard.ts`, `authguard.service.ts` (`getRoles`, `username`).

## Symptom
On a full load or refresh of a protected route other than `/EISDashboard`, while the Firebase session
was still persisted, the console showed `Error checking permissions:` followed by
`FirebaseError: Function doc() cannot be called with an empty path.` The guard's `catch` then
redirected to `/EISDashboard`. In a fresh browser (no saved session) it never happened, so it looked
like a "before login" error.

## Root cause (WHY)
`AuthguardService.uid` is a plain field that only one place sets, as a side effect:
`AppComponent` → `user(this.firebaseAuth).subscribe(...)` → `guard.setUid(user.uid)`.
The constructor's `this.user.pipe(map(...))` meant to set it is **never subscribed**, so it never runs.

The guards listen to a *different* stream: `authState(auth)` (`onAuthStateChanged`), while
AppComponent uses `user()` (`onIdTokenChanged`). These are two separate Firebase listeners with no
ordering guarantee (AngularFire also reschedules emissions through its zone wrappers). When the guard
won, `getRoles()` ran `doc(this.user_dataRef, this.uid)` with `uid === undefined`, and the SDK
rejects that as an empty path.

This was not introduced by the `development` merge. The startup code diff did not touch it; only the
timing varied.

## Fix
`getRoles(uid = this.uid)` and `username(uid = this.uid)` take an optional uid. `authGuard` and
`roleGuard` pass the `user.uid` they already got from `authState`, so they no longer depend on
AppComponent having run first.

**Why this shape and not the others:**
- The default parameter keeps all 142 `getRoles()` and 13 `username()` callers byte-for-byte
  identical in behavior.
- Rejected: calling `setUid(user.uid)` in the guards. It would make the guards a second writer of the
  shared state that caused the bug, and push an extra emission through `uid$`
  (`workshop-configuration` subscribes to it).
- Deferred: subscribing to `authState` inside `AuthguardService` so `uid` is always set early. That
  would fix the race for every caller, but it changes startup behavior of a central service and needs
  its own plan.

## Pending / known
- Components that call `getRoles()` / `username()` / `getuid()` on unguarded routes (22 routes)
  opened directly by URL can still hit the same race. The deferred service-level fix covers them.
- If a signed-in user has no `profile_data` doc, `getRoles()` returns `undefined` and
  `Object.keys(undefined)` in `authGuard` throws a different error. Separate bug, not fixed here.

## Verification
- `tsc -p tsconfig.app.json --noEmit` is green.
- Manual: refresh a protected non-dashboard route while signed in → no permissions error; an
  unauthorized route still shows "Access denied"; signed out still redirects to `/login?returnUrl=…`.
  (Requires a real sign-in, so the operator runs it.)
