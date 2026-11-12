# Firebase Storage — removing permanent download URLs

**Status: DRAFT — awaiting senior validation.** Nothing in Phase 2 onward starts until this is signed off.
**Date:** 2026-11-05
**Scope:** `starlabs-test` first, then `fir-sample-aae4a` (production)
**Repos:** starlabs-angular (`dharshan-working`), Starlabs Functions (`development`), breakthroughs-flutter

---

## 1. The problem

Every media file in Firebase Storage is referenced from Firestore by a **Firebase download URL** that
carries a `token` query parameter:

```
https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media&token=6ac2e768-...
```

Three properties of that token make it the issue:

| Property | Consequence |
|---|---|
| **No TTL. It cannot expire.** There is no API to set one. | A URL leaked once is a working handle on that object forever. |
| **It bypasses Storage Security Rules entirely.** | Tightening rules does nothing to a URL already issued. |
| **It is a bearer credential** — anyone holding the string is authorised. | Anyone who can read the Firestore row, or an old log, cache, email or screenshot, has the file. |

Because the URL is in `<img src>`, the browser sends **no Firebase ID token** with the request, so
`request.auth` is null even for a signed-in user. Rules were never in the path to begin with.

### Verified exposure on `starlabs-test`

Measured this engagement, read-only (status codes and headers only, never content):

- **88 top-level prefixes**, roughly **35 of them a person's name**
- **7,822 objects under `call_recordings/`**, reachable unauthenticated
- A **tokenless** `GET` on exposed objects returns **200** — the bucket is readable without any credential
- Storage rules for the real buckets are **not in source control**. Only the CI console bucket's rules are
  versioned (`starlabs-e2e-tests/console/storage.rules`); that file's own comment says the real bucket's
  rules "live in the Firebase console". They are therefore un-reviewed, un-diffable and untested.

### What replaces it

A **V4 signed URL**, minted on demand by an authenticated Cloud Function, expiring inside 15 minutes.
The expiry is signed into the URL, so it is not revocable-by-request but it *does* lapse on its own —
which the download token never does.

---

## 2. What is already proven

Not speculative. Built and measured before writing this plan.

| Claim | Evidence |
|---|---|
| Signed URLs can be **shared across all users**, not minted per user | Expiry is rounded up to the next wall-clock 15-min boundary, and V4 `GOOG4-RSA-SHA256` signing is deterministic, so identical inputs give a **byte-identical** URL. No coordination needed — callers agree by arithmetic. Preserves browser cache, CDN and Flutter `CachedNetworkImage`. |
| **20 media on a screen cost 1 network round-trip**, not 20 | Angular service batches refs within a 16ms window; 10 specs pass, incl. 250 refs → 2 calls (200+50). |
| A re-render costs **zero** requests | Client cache keyed by ref, with 60s skew; proven by spec. |
| One signature per object per 15-min window, not per request | Server-side memo keyed `path|expiresAt`; proven by test (second call in window computes 0 signatures). |
| Only **this project's** authenticated callers can get a URL | `onCall` verifies a Firebase ID token minted by this project's Auth; cross-project tokens fail in transport. |
| Signing is **fenced to an allow-list of paths** | Without the fence, any signed-in user could obtain all 7,822 call recordings — worse than today's exposure. |
| `allow list: if false` breaks nothing | Neither app makes a single Storage list call. (An earlier count of 5 Angular call sites was wrong — all substring false positives.) |
| Storage emulator is already wired | Port 9199, `@firebase/rules-unit-testing` present. |

**23 server-side unit tests pass**, covering ref parsing, the path fence, window rounding, cross-caller
URL identity, signature dedupe, the signBlob-denial shape, percent-encoding edge cases and the memo.

### Two findings that cost real debugging time

- **`decodeURIComponent` throws on a literal `%` in a filename** (legal in GCS, e.g. `100%_done.jpg`).
  Unguarded, that 500s the whole call and blanks *every* avatar on the page for one bad filename.
  Now guarded; 3 regression tests.
- **Per-ref errors are returned as data, not thrown** — so one unparseable row cannot blank a table page.
  That made them invisible server-side, so a structured log line per call was added.

---

## 3. Current state — read this before costing the plan

| Piece | State |
|---|---|
| `functions/components/media_signed_url.js` | **Written and wired** (`index.js:35`, `:333`). Untracked. **Not deployed.** |
| `functions/test/unit/media_signed_url.test.js` | 23 tests, passing. Sits in a **gitignored** directory (`functions/.gitignore:9`) — so CI cannot see them. |
| Angular `MediaUrlService` + `SignedURLTestComponent` | **Not on disk.** Built and verified last session, then lost. Must be rebuilt (~half a day; design is settled and specs were written, so this is re-typing, not re-deciding). |
| Storage rules for `starlabs-test` / production | Console-managed, not in git. |
| IAM | The runtime service account needs `roles/iam.serviceAccountTokenCreator` **on itself** to sign. Granted on `starlabs-test`; **not yet on production.** |
| Commits | Nothing committed in any repo. |

---

## 4. Rollout

Each phase has an explicit **exit gate**. The next phase does not start until the gate is met.
Phase numbering follows the agreed order: authorisation → remove download URLs → emulator tests →
storage maintenance.

### Phase 0 — Harness proves the mechanism end to end (`starlabs-test`)

The deliberate change of approach: **validate on a throwaway screen, not on a live one.** A live screen
mixes "does signing work" with "did I break the avatar", and last session that cost a day of debugging
a regression that had nothing to do with signed URLs.

1. Deploy `getMediaUrls` to `starlabs-test`.
2. Rebuild `MediaUrlService`. It inspects the stored string: **already an `http(s)` URL → return it
   unchanged, no network**; a path or `gs://` → request a signed URL. This is what lets the migration run
   row by row, with old and new formats live simultaneously.
3. Rebuild `SignedURLTestComponent` at `/signedurltest` — upload (name + image/audio/video) writing
   `{name, path, contentType, size, createdAt}` and **deliberately never calling `getDownloadURL()`**;
   a table that renders each medium through the service, showing the stored path, a live expiry
   countdown, and request counters.
4. Confine it to the `signed-url-test/` prefix so the whole sandbox is deletable wholesale.

**Exit gate.** On the harness screen: all three media types render; 20 rows cost 1 request; re-render
costs 0; expiry lapses and a reload re-mints; a tampered URL is rejected; a download-URL row passes
through untouched.

### Phase 1 — Authorisation

Order matters: the rules and claims land *before* URLs are removed, so there is no window where neither
protects the object.

1. **Custom claims on every Firebase user** — `profileid`, plus role flags. Backfill script over existing
   users, then set at creation. Storage Rules **cannot read Firestore**, so the claim is the only way a
   rule can know who the caller is.
2. **Rules into source control**, reviewed by diff, deployed from CI — not the console.
3. **`delete` only when `auth.token.<role>` is true.**
4. **Folder-scoped write** — `<folderid>/**` writable only when `folderid` matches `auth.token.profileid`.
5. **`read` stays `auth != null` in this phase, and `list` goes to `false`.** Deliberately conservative:
   tightening read to a pid match while live screens still read download URLs would change nothing
   (those URLs bypass rules) while risking a lockout once they don't. Read tightens in Phase 4, after
   migration.

**Exit gate.** Claims present on 100% of users; rules deployed from source; a signed-in user cannot
delete another profile's object; `list` denied; both apps still function.

### Phase 2 — One collection, one field, one screen

`profile_data` → the avatar fields → `/profilelist`.

1. Point `/profilelist` at `MediaUrlService`.
2. **Mirror the component's own resolution precedence exactly.** `ProfilePicture` prefers `profile`,
   falls back to `profileimg`, and treats a known placeholder as absent. Reading only `profile` is the
   bug that cost last session a day — one participant's avatar silently never appeared.
3. Leave the database untouched. Old rows pass through; the service handles both.

**Exit gate.** Every avatar on `/profilelist` renders, including fallback-field rows; request count is 1
per page; e2e coverage added (project rule: hooks land before the spec, literal `data-testid` only).

### Phase 3 — Widen to every avatar surface, both apps

~31 files read profile fields; ~73 reference the avatar component. Same service, one prefix added to the
server's allow-list. Flutter gets the equivalent service.

**Exit gate.** No avatar surface reads a download URL. Regression pass on both apps.

### Phase 4 — Migrate the database, then tighten read

1. Convert stored avatar values to object references.
2. **Tighten `read` to the pid match** once nothing depends on tokenless URLs.
3. **Revoke the old tokens.** *This is the step that actually closes the exposure.* Removing a URL from
   Firestore does **not** revoke its token — the object stays reachable by anyone who kept the string.
   Revocation requires rewriting `firebaseStorageDownloadTokens` in each object's metadata. A sweep over
   the migrated prefixes, run after migration, verified by spot-checking that old URLs now 403.

**Exit gate.** Zero download URLs in the migrated collection; a sampled set of previously-captured URLs
returns 403; apps unaffected.

### Phase 5 — Emulator security tests

Rules tests against the emulator (already wired): a caller with no claim, a wrong `profileid`, a wrong
role, and `list` — each asserted denied. Wired into CI so a rules regression fails the build.

### Phase 6 — Remaining media classes

`call_recordings/` (7,822 objects, the largest exposure), then the rest, highest-sensitivity first.
Each adds one allow-list prefix and reuses everything above.

### Phase 7 — Storage maintenance, separated

Bucket inventory and reorganisation, retention per class, orphan sweep, and lifecycle rules.

---

## 5. Scope

`getDownloadURL` call sites — the places that *mint* a permanent token:

| Repo | Occurrences | Files |
|---|---|---|
| starlabs-angular | 237 | 93 |
| breakthroughs-flutter | 21 | 14 |
| **Total** | **258** | **107** |

That is the full long-tail, Phase 6's problem. The avatar pilot (Phases 2–4) touches a far smaller
surface: ~31 reading files, ~73 avatar-component references, and the single Flutter writer
(`profileimage.dart:133`), which is where both avatar fields get written from one upload.

Reading sites migrate cheaply because they funnel through one service. **Writing sites are the long pole**
— each must stop calling `getDownloadURL()` and persist a path instead.

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **Signing fails in production for lack of IAM** — the one failure that blanks every image at once | Grant `roles/iam.serviceAccountTokenCreator` *before* any production deploy, and verify on the harness screen first. Failures are returned per-ref and never cached, so a transient denial does not poison the window. |
| **A migrated row is wrong and the image is simply gone** | Passthrough means old and new formats coexist; migrate in batches with a verification query between them; keep the pre-migration value until verified. |
| **Cold start.** First call after idle is ~25s, of which ~23s is loading 33 top-level `require`s the function does not need | Measured. Slimming the entrypoint is the real fix and is cheaper than `minInstances`. Worth scheduling, out of scope here. |
| Signed URL expires while a page sits open | Client re-requests on expiry with a 60s skew; a 403 triggers a re-mint rather than assuming a full window. |
| A tail-of-window URL is short-lived (as little as ~1s) | Accepted deliberately — it is the cost of URL sharing. Clients must re-request on 403, which they do. |
| **Signed URLs are still bearer credentials** for up to 15 minutes | This is a reduction, not elimination. It is the point: 15 minutes instead of forever. |
| Memo is per-instance, so N instances mean up to N signatures per object per window | Negligible at this volume. Cross-instance sharing would need Memorystore, not Firestore. |

### Explicitly rejected: storing signed URLs in Firestore

Proposed and turned down. A signed URL is a bearer capability; persisting it puts working,
unauthenticated access back into the database — the exact property this migration removes. A signed URL
is **derived, not issued**: there is no server-side token to keep, so an in-memory memo loses nothing.

---

## 7. Decisions needing sign-off

1. **Stored reference format** — `gs://bucket/path` (recommended: self-describing, survives a bucket move,
   unambiguous against a bare path) vs. a bare object path.
2. **Read rule staying `auth != null` through Phases 1–3**, tightening only in Phase 4. Conservative on
   purpose; confirm that sequencing is acceptable.
3. **Token revocation sweep** — confirm it is in scope. Without it, migration hides the URLs but does not
   close the exposure.
4. **`functions/test/` is gitignored.** Un-ignore it, or move the 23 tests to a tracked path?
   As-is, CI cannot run them.
5. **Rules into source control** — confirm the real buckets' rules move out of the console.
6. **Under-18 participants** — DPDP S.9 implications for retention and access. Needs a decision owner.
7. **Retention period per bucket class** — Phase 7 input; unknown today.
8. **Production grant window** — `roles/iam.serviceAccountTokenCreator` on production, and who grants it.

---

## 8. Rollback

Every phase is independently reversible except the Phase 4 token sweep.

| Phase | Rollback |
|---|---|
| 0–3 | Revert the client commit. Stored download URLs are untouched and the service passes them through, so the old path works immediately. |
| 1 (rules) | Redeploy the previous rules from git. |
| 4 (migration) | Restore stored values from the pre-migration snapshot. |
| 4 (token sweep) | **Not reversible.** Old tokens are gone by design. New signed access continues to work; anything still depending on an old URL breaks. Run only after Phase 3's gate, and take a Firestore export first. |
| 5–7 | Additive. |

---

## 9. Sequencing summary

```
Phase 0  harness on starlabs-test            ── gate: mechanism proven on throwaway screen
Phase 1  claims + rules + delete/write gates ── gate: claims on all users, rules from source
Phase 2  /profilelist only                   ── gate: every avatar renders, 1 request/page
Phase 3  all avatar surfaces, both apps      ── gate: no avatar reads a download URL
Phase 4  migrate DB, tighten read, REVOKE    ── gate: old URLs 403
Phase 5  emulator rules tests in CI          ── gate: denials asserted, build fails on regression
Phase 6  call_recordings/ + remaining classes
Phase 7  bucket reorg, retention, lifecycle
```

Phases 0–2 are the validation spine; 3–4 are the migration; 5 is the guard that stops it regressing;
6–7 are the long tail.
