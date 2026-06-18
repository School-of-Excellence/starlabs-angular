# 2026-06-06 — queueadmin/queuementor: UID → PROFILEID (and the admin-branch caveat)

## What was asked
`seedQueueAndVariations` seeded `queueadmin: operators…map(o => o.uid)` (auth UIDs). The recon
(`e2e/queue/recon/schemas.md:83`) documented the board picker as `where("queueadmin","array-contains",
profileid)`. Question: does the board filter by **uid** or **profileid**? Reconcile the seeder
(`seedQueueAndVariations` + the `seedSecondQueue` decoy), keep `queueadmin` an ARRAY, confirm the index.

## Verified against the production source
- **It is profileid.** `dynamic-queue-manager-clone.component.ts:1531` sets
  `this.profileid = roles.profile_ref.id`; `:1546` filters `where("queueadmin","array-contains", this.profileid)`.
- `authguard.service.ts:307 getRoles()` returns the `users_roles` doc body (found via `profile_data.user_ref`,
  then `role_ref`); `roles.profile_ref.id` = the profileid.
- The **production creation UI** is the clincher: `queue-creation-v3` binds BOTH the `queueadmin` and
  `queuementor` `<mat-select multiple>` to `[value]="profile.id"` (html:62 / :44) where
  `profile.id = profile_ref.id` (ts:487). So **both fields store profileids**, never auth uids.

## KEY FINDING (load-bearing — the original premise was incomplete)
The `array-contains` filter is the **`else` branch only**. `:1543` →
`if (roles.ah || roles.admin) queryBy orderBy("queuename")` (ALL queues, **no `queueadmin` filter**);
the filtered branch (`:1546`) runs **only for non-admins**. The base-seeded operator
`admin+<run>@example.com` has `roles:['admin']` → it ALWAYS hits the admin branch and sees every queue.

Consequences (these correct the stated failure mode "uids break OP-02 / make OP-02b vacuous"):
- **OP-02** logs in as that admin and asserts it sees BOTH queues — via `/queuelist`
  (`queue-list.component.ts:62`, an *unfiltered* `orderBy("queuestartdate")` stream) and the admin branch.
  It never reads `queueadmin`, so a UID there did **not** break it.
- **OP-02b** is **not vacuous**: it seeds a *dedicated* NON-admin operator (`op02b`, `eventcoordinator`
  only) and `arrayUnion`s **its profileid** into queue 1 at test time (`operator.spec.ts:829`); queue 2's
  decoy excludes it. So OP-02b passed regardless of what `seedQueueAndVariations` wrote.
- ⇒ The seeded UID was **functionally harmless today** but semantically wrong, a latent landmine (any
  future non-admin login relying on queue-1 visibility would silently lose the queue), and
  self-contradictory with the file's own comments, recon `:83`, `seedEmptyQueueForOperator`
  (already used `<run>_pf_admin_0`), and AUTH-01 (drives the real UI, stores `profile.id`).

## Fix applied (worktree `starlabs-angular-queue-e2e`, branch `test/queue-e2e`)
- `e2e/fixtures/seed-test-project.js`
  - `seedQueueAndVariations`: `queueadmin`/`queuementor` `.map(o => o.uid)` → `.map(o => o.profileid)` (+ comment).
  - `seedSecondQueue`: `decoyAdminUid = ${run}_admin_DECOY` → `decoyAdminProfileId = ${run}_pf_admin_DECOY`
    (a profileid no seeded operator holds); both fields + the return key renamed; JSDoc updated.
- `e2e/queue/recon/schemas.md:83-84`: "operator uids"/"mentor uids" → **profileids** (`profile_ref.id`),
  and documented the admin/ah all-queues branch so the next reader doesn't re-derive the uid premise.
- `e2e/queue/operator.spec.ts` OP-02b precondition comment: replaced the now-stale "seed stores queueadmin
  as UIDs" rationale with the real reason (the base operator is `admin` → admin branch → can't exercise
  the non-admin filter).

## Index — unchanged, still matches
`firestore.indexes.json` `queue generation` → `queueadmin CONTAINS` + `queuename ASC` is a **field-level**
index (value-type-agnostic). uid→profileid does not affect it. No change needed.

## Safety
All `seedQueueAndVariations` callers (`runSeed`, `seed-emulator.js:89`, `variation-seeds/_common.ts:130`)
pass `makeStaff().operators`, which carry both `.uid` and `.profileid` → no `undefined`. `node --check`
on the seeder passes. No currently-passing case depends on the old UID value (OP-02 = unfiltered list +
admin branch; OP-02b injects its own profileid via `arrayUnion`). Files are untracked working-tree changes
(not committed), consistent with the rest of the in-progress e2e work on this branch.
