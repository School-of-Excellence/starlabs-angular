# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-09-29 (centralised appointment system)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-09-29-centralised-appointments.md`.

## Current state
- Branch `feature-test`: the new `/specialistappointmentstudio` screen is committed and **pushed** to
  `origin/feature-test`. It builds clean (production), and 58/58 of its specs pass.
- `starlabs-cloud-function` (`development`): one **uncommitted, undeployed** change to
  `computeSlot`, for static availability.
- Nothing is deployed.

## Last session changes (2026-09-29)
- **Centralised appointments**: one route whose view depends on the user's role (Mentor > A&H > CW),
  built from the prototype `starlabs-appointments-v2.html`. The operator dictated every section in plan mode.
  - **CW**: Home. It shows stats (window hours · booked slot time · delivered · unutilised ·
    delivered ÷ available), a week/month calendar, upcoming sessions (Join copies the Zoom URL) and past
    sessions (filters: Completed / Cancelled / Status updation pending → the calendar's detail and
    mark-status dialogs).
  - **Mentor**: Home plus My Team. The team comes from productowner → products → delivery sequence →
    appointment types → roles → EIS.
  - **A&H**: Overview (everyone, with a specialist filter), Mentors, Utilisation, Book Session
    (the existing `BookAppointmentComponent`, embedded) and Settings (view only).
  - **Add availability**: Auto (`computeSlot` intervals, with a preview) or Static (`fixed: true`, one
    slot per type). Uses a single-month range calendar, and keeps the existing gate and overlap rules.
  - **Why window hours:** `computeSlot` slots overlap per type, so adding them up overcounted.
  - `AppointmentDetailComponent` gained an optional `disableCancel` flag, so only A&H can cancel from this screen.
- Later the same day: View as dropdown, the all-specialists calendar, per-day static slots, past-session paging,
  Join opening AppointmentZoomView, No-show shown as Cancelled, and a fix for stale loads. Details are in the journal.
- **Failures and root causes:** the first test run failed 3 add-availability specs. The cause was that
  `ngOnInit` re-ran `loadProfile()` after the test had loaded it, which cleared the types. The test order
  was fixed; this was not a component bug.

## Pending
- A `dashboard` access entry for `specialistappointmentstudio`. Without it the guard shows "Contact Admin".
- Deploy `computeSlot`. Until then, Static availability still gets 30-minute slots.
- A live check on starlabs-test as a CW, a Mentor and an A&H user. The preview pane needs a login.
- **e2e coverage is missing**: the screen was pushed before a starlabs-e2e-tests suite existed (operator's call).
  Add the suite, seed and spec next. The hook prefixes are in the journal.
- Flag: Book Session treats `ahmember`/`developer`/`tester`-only users as participants. This comes from
  book-appointment's own role check.
- Carried: create `static meta data/Workshop Admin` in production by hand (workshop Dashboard Access).
