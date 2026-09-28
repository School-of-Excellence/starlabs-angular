# Participant Delivery Sequence — load performance & profile patch fix

**Date:** 2026-07-03
**Screen:** `participantdeliverysequence/:pid` → `ParticipantDeliverySequenceComponent`
**File:** `src/app/Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts`

## Symptom (operator report)
The delivery-sequence screen loaded very slowly, and "patching the logged-in profile id"
(setting the selected profile's status/flags) took a long time.

## Root causes found
1. **Whole `profile_data` collection downloaded and *awaited* before render.** `mapData()`
   started with `await getDocs(query(profile_data, orderBy("name")))`. The constructor did
   `await this.mapData().then(() => … onProfileSelect())`, so the participant's actual
   delivery data could not begin loading until *every* profile in the system was fetched and
   mapped. The list only feeds the "Select Profile" switcher, which is `[disabled]="!developer"`
   — so non-developers paid the full cost for a control they can't use.
2. **Profile patch scanned the whole list.** `onProfileSelect()` did
   `profileList[findIndex(e => e.id == selectedProfileid)]` to read one profile's
   status/flags — i.e. it depended on the full collection load above, then linear-scanned it.
   This is the "patching the profile id is slow" part.
3. **`sortDelivery()` called inside every loop iteration.** All 6 delivery collections
   (appointment/form/report/event/queue/fieldwork) called `this.sortDelivery()` on *every*
   pushed doc — re-sorting the whole growing `deliveryList` each time → O(n² log n).

## What changed (WHY)
- Extracted the profile-list load into `loadProfileList()` and call it **only when
  `developer`**, **without `await`** (fire-and-forget in the constructor). The full list is
  never on the critical render path anymore.
- `mapData()` no longer loads/awaits profiles — it resolves as soon as the reference-map
  reads are dispatched, so `onProfileSelect()` (the participant's data) runs immediately.
- New `patchProfileStatus()`: prefers the cached list entry if present (developers), else does
  a **single `getDoc(profile_data/{pid})`** to read `datastatus`/`sequencechanged`/
  `migrationrequired`. One doc read instead of a full-collection scan.
- `onProfileSelect()` now fires `getParticipantDeliverySequence()` (main content) and
  `patchProfileStatus()` in parallel; neither blocks the other.
- Moved each `sortDelivery()` call to run **once after** its collection's loop (6 sorts total
  instead of thousands). Final ordering is identical.

Net: non-developers do zero `profile_data` reads on load; developers load it in the
background. First meaningful paint no longer waits on the participant roster.

## Behaviour preserved
- Profile switcher dropdown still works for developers (list loads async; `returnProfile()`
  filters the same shape). Non-developers never had it enabled.
- Status radio + `sequencechanged`/`migrationrequired` checkboxes populate the same values
  (same defaults: "Not entered" / false / false).
- `deliveryList` final sort order unchanged.

## Revert guide (per-screen)
Single-file change; `git checkout <pre> -- "src/app/Participants Profile Management/participant-delivery-sequence/participant-delivery-sequence.component.ts"` reverts the whole screen. Piecewise:
- **Restore blocking profile load:** move the `loadProfileList()` body back to the top of
  `mapData()` as `await getDocs(... profile_data ...)` and delete the `if (this.developer)
  loadProfileList()` call in the constructor.
- **Restore old profile patch:** replace `patchProfileStatus()` + its call with the original
  `selectedProfile = profileList[findIndex(...)]` block inside `onProfileSelect()`.
- **Restore per-iteration sort:** move each `this.sortDelivery()` back inside its `for` loop
  (6 delivery blocks).

## Pending / follow-ups
- The 6 reference collections (journey/product/appointmenttype/forms/report/events/queue/
  fieldwork) are still full-collection reads on every load; they're config-sized so left as-is.
- `getParticipantAppointment()` appends to `clientAppointment` without clearing on profile
  switch — pre-existing, not addressed here.
## UPDATE (2026-07-03, session 2) — the REAL bottleneck, found by live profiling

The first-pass fix (moving the profile load off the *await* path) was **not enough** — the
screen still took ~70s. Live profiling on `localhost:4200`
(`/participantdeliverysequence/AiHI877bf1ujv9KIrAV5`, dev = Charan Reddy P) with in-code
`performance.now()` markers showed:

- `loadProfileList` reads **3,296** `profile_data` docs (~4.9s to fetch).
- Even though it was fire-and-forget, running it concurrently **starved the participant's own
  reads**: a *single* `getDoc(participantdeliverysequence/{pid})` took **21.4s**, and the whole
  `getParticipantDeliverySequence()` took **72.1s** (participantsproduct 22 docs, deliverables
  31 docs — tiny).
- **Controlled experiment:** disabling `loadProfileList` dropped
  `getParticipantDeliverySequence()` from **72,117 ms → 2,975 ms** (~24×). Decisive.

Mechanism: the 3,296-doc read saturates Firestore's multiplexed WebChannel and blocks the main
thread building/binding the huge list, so the participant's completed reads can't resolve their
`.then` callbacks promptly. Concurrency ≠ free when one task is this heavy.

**Real fix (implemented):** the switcher roster is now **lazy-loaded only when the developer
opens the dropdown** (`onSwitcherOpened($event)` on the mat-select's `openedChange`), guarded by
`profileListLoaded` so it runs once. `patchProfileStatus()` seeds `profileList` with just the
current profile (from the single `getDoc` it already does) so the dropdown label shows the name
immediately. Non-developers and the initial render do **zero** roster reads.

Live verification after the fix: initial data (`loading=false`, 22 products, correct
"Charan Reddy P" label) at **~4s** with `profileList.length === 1`; opening the dropdown then
lazily loads all 3,296 and the searchable switcher works normally. `tsc --noEmit`: 0 errors.

Files touched: `participant-delivery-sequence.component.ts` (+ `.html` `openedChange` binding).
Note: rendering 3,297 `<app-profile-picture>` avatars when the dropdown opens is a *separate*
known cost (per-avatar `profile_data` query) — out of scope here, only happens on explicit open.

### Revert guide (this update)
- Re-add the eager `if (this.developer) this.loadProfileList()` in the constructor and remove
  the `onSwitcherOpened`/`profileListLoaded` method + the `(openedChange)` binding in the HTML.
- Remove the profileList-seeding block in `patchProfileStatus()`.

## UPDATE (2026-07-03, session 2b) — switcher disabled, roster load removed entirely

Operator decision: grey out the "Select Profile" switcher (as before) — there's no need to
switch profiles here since the participant is fixed by the `:pid` route param. With the switcher
disabled there is **no reason to load the roster at all**, so the lazy-on-open loader was also
removed. Net: this screen now reads **only the current participant** (one `getDoc` for
name/status via `patchProfileStatus`, plus the participant's own product/deliverable queries).
Zero `profile_data` roster reads in any code path.

Changes: `.html` — `[disabled]="!developer"` → `[disabled]="true"`, removed the `openedChange`
binding. `.ts` — deleted `onSwitcherOpened`/`loadProfileList`/`profileListLoaded`; kept the
single-profile seed in `patchProfileStatus` so the disabled dropdown still shows the name.

Live-verified: dropdown greyed out (`mat-mdc-select-disabled`), `profileList.length === 1`,
`loading` reaches false with 22 products, label "Charan Reddy P". `tsc --noEmit`: 0 errors.

Revert: restore `[disabled]="!developer"` and re-add a `loadProfileList()` (eager or lazy) if
the developer profile switcher is ever wanted back.

## Verification done (2026-07-03)
- `tsc --noEmit -p tsconfig.app.json` — clean.
- Full Angular AoT build `ng build --configuration development` — **EXIT 0, 0 errors**,
  bundle generated (39s); `participant-delivery-sequence` compiled into the output. Remaining
  warnings are pre-existing and in unrelated files (journey-onboarding-detail CSS nesting,
  queue-web-version1 unused imports). App boots (dev server HTTP 200).
- **Not measurable here:** a live timed load behind `authGuard` requires the operator's
  developer login + real participant data (entering their credentials is out of scope). The
  speedup is structural, though — see below.

## Why the fix resolves the report (deterministic, not heuristic)
The slowness was blocking Firestore reads on the render critical path:
- **Before:** the constructor `await`ed a query that reads the **entire `profile_data`
  collection** (N = every participant) *before* the participant's delivery data could load,
  then `onProfileSelect()` did an O(N) `findIndex` over it to read one profile's status.
- **After:** blocking `profile_data` reads on the render path drop from **N → 0**.
  Non-developers fetch nothing extra; the profile's status/flags come from a **single
  `getDoc`** run in parallel with the delivery load. Developers still get the switcher list,
  but it loads in the background (un-awaited), off the critical path.
- Delivery-list sort went from O(D² log D) (sorted on every pushed doc) to O(D log D)
  (sorted once per collection).
