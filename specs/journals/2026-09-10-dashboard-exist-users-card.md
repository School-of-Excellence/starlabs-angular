# Workshop dashboard: Exist Users Enrolled, and the `movedtoexist` rule

**Date:** 2026-09-10 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, builds green, runtime unverified behind login

Operator: add an **Exist Users Enrolled** card before New Users Enrolled showing everyone
enrolled who is not a new user; treat a `new_user_data` doc with `movedtoexist: true` as an
existing user and read that person from `participant metadata` instead; put the journey
filter (the one the category-based workshops have on Total Enrolled) on the new card; and
add a customer-status filter beside it.

---

## 1. Which collection this screen uses — the operator asked

**`participant metadata`**, not `profile_data`. `getParticipantMetaMapForIds()` queries it
in batches of 30 with `where('profileid','in', …)` for the enrolled ids. `profile_data` is
not read anywhere in this component. `new_user_data` is loaded once, whole, and is only for
the New Users counts. `customerstatus` and `activejourney` both live on the metadata doc.

## 2. The bug behind the request

`mapProfile` was built as:

```ts
this.mapProfile = { ...participantData.docdata, ...this.mapProfileNew };
```

The new-user map was spread **last**, so for anyone present in both collections the
`new_user_data` document won. A person migrated to a full profile therefore kept resolving
through their stale new-user doc — which has no `activejourney` and no `customerstatus` —
so they were invisible to journey filters and counted as a new user forever.

The rule is now in one place and everything routes through it:

```ts
isNewUserProfile(id) => !!mapProfileNew[id] && mapProfileNew[id].movedtoexist !== true
```

and the overlay only carries the still-new entries, so a moved person keeps their metadata.

## 3. What changed

- **New card, `existUsersEnrolled`**, inserted before New Users Enrolled.

  **Correction to my first pass:** I inserted it into three places believing the template
  had three live layout blocks. Two of them sit inside `<!-- ... -->` — the second and third
  `metrics-section` blocks are commented out, so only the first is live. The two dead copies
  have been removed. A comment-aware scan is what caught it; a plain text search does not.
- **Counts corrected.** New Users Enrolled and New Users Not Enrolled now exclude moved
  users, so Exist + New now equals Total Enrolled exactly.
- **Two filters on the new panel**: journey and customer status. Options are derived from
  the people actually in the list rather than from the workshop config, so they are never
  empty — the existing Total Enrolled journey filter reads `selectedjourneys` off the
  workshop, which would be blank on most workshops.
- **Deliberate choice:** these two filters are **not** gated on `categorybased`. The
  existing Total Enrolled filter is, but this card appears on every workshop, so gating
  would hide its filters almost everywhere. Say the word if it should be gated instead.
- **Two filters I had to fix as well.** The subscriber-code and referred-only filters on the
  New Users panels rebuilt their list from the full new-user map, so a moved user would
  reappear in the panel while the card count excluded them. Both now apply the same rule.

## 4. Verification

- Dev and production builds green.
- The counting and filtering rules were run against a fixture (four enrolled: two plain
  existing, one moved-to-existing, one genuinely new):

  | | result | expected |
  |---|---|---|
  | Total Enrolled | 4 | 4 |
  | Exist Users Enrolled | 3 | 3 — includes the moved user |
  | New Users Enrolled | 1 | 1 — moved user excluded |
  | New Users Not Enrolled | 1 | 1 — moved user excluded |
  | Exist + New = Total | true | the two cards partition the set |

  The moved user resolved to the metadata journey and customer status, not the stale
  new-user doc, and both filters selected the right people.
- Card order and the filter menu rendered in a harness: the new card sits before New Users
  Enrolled, with Journey Filter and Customer Status sections and removable chips.
- **Not verified at runtime** — the dashboard is behind login. The operator pass should open
  a workshop that has at least one moved-to-existing user and check that Exist + New equals
  Total, then filter the new panel by a journey and by a customer status.

## 5. Note for later

`mapProfileNew` is still passed whole to the new-users dialog (`manualenroll` / the New
Users management screen). That is outside this card's scope and was left alone, but if that
dialog should also stop showing moved users, it needs the same rule.


## 6. The CI gate, testids, and the tests (2026-09-10, same day)

The console blocked the branch: **"8 new interactive element(s) have no data-testid"**.

The 8 were my 6 live new controls plus the 2 dead cards described above (the gate's diff is
comment-blind, so it counted them). Removing the dead pair and adding ids to the rest clears
it. This screen had **no** testids before, so the `wdash-` prefix is new here; the names
follow the repo's existing `<screen>-<thing>-<kind>` convention:

`wdash-exist-users-card` · `wdash-exist-users-count` (the number, for assertions) ·
`wdash-exist-filter-btn` · `wdash-exist-journey-option` · `wdash-exist-status-option` ·
`wdash-exist-clear-filters-btn` · `wdash-exist-status-chip`

### The tests
The e2e specs live in the hub repo (`starlabs-e2e-tests`), which is not checked out here, so
the suite's own cases have to be added there. What *can* live in this repo is the logic, and
that is where the risk actually is — so
`workshop-dashboard.exist-users.spec.ts` covers it: **23 cases, all passing.** The rule,
the four counts, the Exist+New partition, the moved user resolving through participant
metadata, the derived filter options, and the filters (single, AND, OR, empty result,
clearing, toggling, and *not* leaking into the Total Enrolled panel).

They build the component from its prototype and set only the fields the logic reads, rather
than booting Angular — the real component needs Firestore, routing and a live snapshot, none
of which this behaviour depends on. So the suite runs offline and touches no data.

**Two things worth knowing about running them:**
- `ng test` is broken repo-wide, and not by this change:
  `src/app/content/series-dashboard/assigncategorydialog/assigncategorydialog.component.spec.ts`
  imports `AssigncategorydialogComponent` while the class is `AssignCategoryDialogComponent`,
  and `tsconfig.spec.json` compiles every spec, so one stale stub fails the whole run. I
  scoped the test tsconfig temporarily to run this suite and **reverted it** — that one-line
  import fix would unblock `ng test` for everyone.
- One test failed first time and it was **my fixture**, not the product: the options getter
  sorts through `JourneyMap`, which the component always initialises but my fixture had not
  set. Fixed in the fixture; no product change.

### A dependency detour, and the mess it made
The build broke mid-task on `@livekit/krisp-noise-filter` — declared in `package.json` but
missing from `node_modules` after the operator's recent pull. My first fix,
`npm install <pkg> --legacy-peer-deps`, **bumped the version spec to ^0.4.4 and stripped 847
lines from the lockfile**. I reverted both manifests, but reverting the lock does not restore
`node_modules`, and the prune had removed the `@zoom/meetingsdk` peers (react, redux,
redux-thunk) that `--legacy-peer-deps` will not reinstall — so the build then failed on
those instead. Restored with `npm ci --legacy-peer-deps` plus a `--no-save` install of the
three peers. **`package.json` and `package-lock.json` are byte-identical to HEAD.**

Lesson: in this repo install with `--no-save`, or expect npm to rewrite the manifests and
prune peers that only exist because someone once installed without `--legacy-peer-deps`.


## 7. Second gate pass — what cleared and what cannot clear from this repo

The recheck moved the message on, which is useful: the *missing-testid* count fell from 8 to
1, and two new findings appeared.

**Fixed here — the last untagged element.** I diffed the branch against `origin/development`
the way the gate does and listed *every* new element, not just the ones I judged interactive.
Eighteen new elements; the only one a gate would reasonably call interactive and that still
lacked an id was the filter's `<mat-menu>`. It now carries `wdash-exist-filter-menu`. The
rest are `<i>`, `<ng-container>`, `<ng-template>` and plain layout `<div>`s with no handlers.

**Cannot clear from this repo — the other two findings:**
- *"New elements no spec references"* — the eight ids exist but nothing selects them.
- *"Nothing exercises: …workshop-dashboard.component"*.

Both want **e2e specs, and those live in the hub repo `starlabs-e2e-tests`**, which is not
checked out on this machine. Checked, so this is not a guess: **no spec anywhere in this
repo references a `data-testid`** — the id→spec linkage is entirely a hub concern, which is
also what `E2E.md` describes ("the hub repo owns the engine, seeds and specs; this repo only
carries the thin callers").

So the Karma suite added in §6 does not and cannot satisfy those two findings. It is still
worth having — it covers the counting and filtering logic, which is where this change could
actually be wrong — but the gate is asking for something else, and the honest position is
that finishing it needs the hub repo. Deliberately not guessed at: writing a spec for
another repo without seeing its framework, helpers or layout would most likely be wrong.

**To finish it:** check out `starlabs-e2e-tests` (or point me at it) and the workshops suite
needs a case that opens a workshop dashboard, reads `wdash-exist-users-count`, clicks
`wdash-exist-users-card`, opens `wdash-exist-filter-btn`, ticks a
`wdash-exist-journey-option` and a `wdash-exist-status-option`, checks the list narrows and
a `wdash-exist-status-chip` appears, then clears with `wdash-exist-clear-filters-btn`.
