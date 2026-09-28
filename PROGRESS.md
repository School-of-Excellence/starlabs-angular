# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-09-23 (workshop Dashboard Access)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-09-23-workshop-dashboard-access.md`.

## Current state
- Branch `nanda-development` @ `29c4e88b` + one uncommitted build fix. Builds clean.
  **Not pushed** — the operator pushes `starlabs-angular` manually.
- `starlabs-e2e-tests` `main` @ `9772ace` — **pushed**. 125 workshop-suite tests; the CI
  readiness gate reports **MATCHED** for this diff (1193 selectors resolve).
- Workshop screens now deny by default. Nothing in production is gated yet because
  `static meta data/Workshop Admin` does not exist — see Pending.

## Last session changes (2026-09-23)
- **Dashboard Access** — per-person permissions for the workshop screens.
  - New `src/app/New-Workshop/workshop-access/` — `workshop-access.model.ts` (pure rules,
    11 action keys) and `workshop-access.service.ts` (reads/writes + session and IndexedDB
    caches).
  - New **Dashboard Access** section in workshop config › Settings (after Communication).
    Writes `workshopsettings/{workshop id}.dashboardaccess` (profileid → actions) and the
    three shared lists in `static meta data/Workshop Admin`. People are picked from
    `participant metadata` only. The section saves itself, separately from Settings.
  - Gated: the dashboard header (Communication / Q&A / Diagnose / Clear / Enroll), the side
    panel's send and export actions, the progress-table export, row click, Move next and
    Review, the evergreen extend flow, and the three archive sections; the workshops list's
    New/Edit/Duplicate and three switches; the New Users button and `/newusersprofile`; both
    workshop editor URLs.
  - **Deny by default, no bypass** — two operator corrections. The first cut used
    "empty list = unrestricted"; the second added four founding profileids as a recovery
    path. Both were rejected: access now comes only from the two documents. Two hard-coded
    allow-lists were deleted in the process, including the private one inside
    `moveParticipantToNext()` that popped `alert('No Access')`.
  - **Why the picker was slow:** `participant metadata` has no cached reader (unlike
    `profile_data`, which `getProfileMap` caches), so it re-read the whole collection each
    time. Now cached as a compact list in the same IndexedDB store and warmed in the
    background. Picker rows also wrap instead of ellipsising a name.
- **e2e:** `workshops/seed-workshops.js` §6c seeds both access documents (without them
  every workshop spec would be blocked), plus a `limited` actor — same roles and route
  grants as `admin`, on no shared list, two actions on `W_DASH`.
  `workshops/workshop-dashboard-access.spec.ts` WDA-00…WDA-15.

## Pending
- **Production bootstrap, by hand, once.** Create `static meta data/Workshop Admin` with
  `workshopeditaccess`, `workshopdashboardadmin` and `workshopnewusersaccess` arrays
  containing at least the operator's profileid. Until then nobody can open either workshop
  editor — there is no in-app way in, deliberately.
- Operator to commit + push `starlabs-angular` (`nanda-development`).
- The workshops suite has not been run against this branch yet.
- Carried: `workshopprogressmessagev2` still runs Charan's 2026-09-22 15:48 build (old code,
  same latent `watitoken` bug) if anything calls it.
