# 2026-11-04 — Storage signed URLs: why each constraint landed

Plan: `specs/plans/2026-11-04-storage-signed-urls.md`

## What this session did

Investigated a publicly reachable Storage listing URL, found the same hole open on
`starlabs-test`, and built the first screen of the signed-URL migration: a `getMediaUrls`
callable in the Functions repo, a `MediaUrlService` in `src/app/shared/`, and `/profilelist`
wired to use them. Nothing deployed. Nothing pushed.

## What was found

`starlabs-test.firebasestorage.app` answered an **unauthenticated** list with HTTP 200:
88 top-level prefixes, about 35 of them real people's names, and tokenless GETs on objects
returned 200. `call_recordings/` alone holds 7,822 publicly downloadable objects, and
`flutterSqlite/` holds per-user SQLite databases. The listing also hands out
`downloadTokens` in object metadata, so tightening the rule does not retire the URLs
already minted.

Profile photos upload to `<profile name>/profile/<timestamp> <file>`
(`profileimage.dart:133`). **That is why ~35 of the 88 prefixes are human names** — the
person's display name is the first path segment. Worth knowing before anyone designs a
bucket layout: the current one leaks identity through the path itself.

## Why these constraints, not the obvious alternatives

**Why the resolver accepts a legacy token URL instead of only `{bucket, path}`.**
This is the load-bearing decision. If it took only a structured ref, the day the resolver
ships every row still holding a token URL breaks, forcing a flag-day cutover of 33 Flutter
files and 94 Angular sites at once. Accepting the stored URL and *throwing its token away*
inverts that: screens migrate one at a time against an untouched database, the migration
can stop halfway, and the DB rewrite becomes a separate reversible step. The cost is that
the parser must stay strict, because it is now reachable with arbitrary user-stored strings
— hence the per-ref `unparseable`/`bucket-not-allowed`/`path-not-allowed` outcomes and the
`..` check.

**Why `[src]` on the template instead of changing `ProfilePictureComponent`.**
That component is used by **144 avatars across 69 templates**. Changing it would make the
pilot a whole-app change, which defeats the point of a pilot. It already has an `@Input() src`
that, when non-null, bypasses its own `profile_data` query — so passing `[src]` scopes the
new behaviour to exactly one screen with no shared-code risk. The template binds
`signedProfileUrls[...] ?? ''` rather than letting it go null **on purpose**: null would fall
through to the component's own query and render the token URL, silently defeating the test.
`''` resolves to the component's default avatar, so an unresolved row shows a placeholder and
never the thing we are trying to stop using.

**Why expiry rounds up to a window boundary instead of `now + 15min`.**
A per-caller expiry makes a per-caller URL string, which defeats the browser cache, any CDN
in front of GCS, and Flutter's `CachedNetworkImage`. Rounding up means every caller in the
same 15-minute window gets byte-identical URLs. The trade-off, recorded here so nobody
"fixes" it later: a URL handed out at the tail of a window is short-lived, so clients must
re-request on 403 rather than assume a full window. `SKEW_MS = 60s` in the service is the
client half of that bargain.

**Why the callable is fenced to `<name>/profile/**` rather than signing anything.**
A general "sign any object for any signed-in user" endpoint would hand every authenticated
caller the 7,822 call recordings — a *worse* exposure than the one being fixed, because it
would survive any rules change. The fence starts at the one prefix this screen needs. The
unit test asserts `call_recordings/` and `flutterSqlite/` are refused, so widening the fence
carelessly fails the suite.

**Why per-ref errors are returned, not thrown.** A table page resolves 50 refs in one call.
Throwing on the first unparseable row would blank 49 good avatars. The result array carries
`{ref, error}` per row instead.

**Why `getFunctions(app, 'us-central1')` and not `provideFunctions()`.**
`app.config.ts` has no `provideFunctions`, and `atc-firebase.service.ts` already builds
`Functions` straight off the injected `FirebaseApp`. Following that avoids touching
app-wide providers for a one-screen pilot. The app's dominant pattern is actually hardcoded
`onRequest` URLs + `HttpClient` (104 `onRequest` vs 25 `onCall`), but an `onRequest`
endpoint would mean attaching and verifying the ID token by hand; `onCall` gets the auth
gate for free, which is the security requirement.

## Surprises

- **The exposure is not an "unauthenticated screen" problem.** A tokenless Storage URL in
  `<img src>` or `Image.network` sends no ID token — the browser never attaches one — so
  `request.auth` is null *even for a signed-in user*. The 5 production 403s found earlier
  were broken for logged-in users, not anonymous ones. (Those screens turned out to be
  deprecated, so nothing was actually broken.)
- **`rules_version` drift has a root cause in the repo**: `firebase.json` has no `storage`
  block and there is no `storage.rules` here, so production rules only ever existed in the
  Console.
- **The Storage emulator is already wired** (`firebase.emulator.json`, port 9199, pointing
  at a permissive `storage.rules`). Phase 5 is writing assertions, not building harness.
- **Only 35 of 237 `getDownloadURL` calls persist their URL to Firestore.** The other 183
  are transient display calls, which is why the write-side migration is ~35–50 sites rather
  than 237.
- **`functions/package.json` currently has `"main": "index.emulator.js"`** — leftover state
  from an emulator run (the deploy script repoints it). A bare `firebase deploy --only
  functions` in this state would deploy the FILTERED 17-export emulator set. Not this
  session's change, deliberately not touched, but it must be reverted before any deploy.

## Pending

1. Grant `roles/iam.serviceAccountTokenCreator` to the Functions runtime SA, then deploy
   `getMediaUrls` to `starlabs-test`. Until then every ref returns `sign-failed`.
2. Deploy the list-deny rule to `starlabs-test` (`allow list: if false`) — verified to break
   nothing, since neither app lists.
3. e2e: `/profilelist` changed, so per the e2e rule it needs a case before push. The avatar
   is not currently asserted by `profiles/profilelist.spec.ts` (only `pl-*` role-filter
   hooks), so nothing is red — but the new behaviour is uncovered. Needs `getMediaUrls`
   added to `index.emulator.js` first, which must stay ATC-free (it is: the module requires
   only `firebase-admin` and `firebase-functions/v2/https`).
4. Then: write/delete path with pid-matching, the remaining screens, the DB rewrite, and
   the token-revocation metadata sweep — in that order. Removing a URL from Firestore does
   **not** revoke its token; that needs a separate Admin SDK pass per object.
