# 2026-10-05 · Specialist Appointment Studio — testing report round 2

Plan: `specs/plans/2026-10-05-specialist-studio-testing-round2.md`. Previous round:
`specs/journals/2026-10-01-specialist-studio-testing-round1.md`.

## What was done
All 8 points are built, plus a Group by type / Sort by time toggle. Each point's logic was agreed with
the operator one at a time.

## Why each constraint landed
- **Slots, not windows, under any filter (2+3).** A full-day window with one booking has both booked and
  open slots, so window-level Booked / Not booked showed the same item in both. At slot level each item
  is either booked or not.
- **Collaborative sessions (6).**
  - Cause found: the calendar and Day view attached each session to the **first** matching window only,
    using a global `used` set. That deduped a joint session out of the second host's window, so only one
    specialist saw "Completion pending". Dedupe is now per (session, host).
  - Fix A, also done: hosts = `hosts` ∪ the profiles in `hostRole`.
  - Limit: Firestore queries still find sessions through `hosts`. A session whose second host exists
    **only** in `hostRole` won't be fetched for that host. Bookings from this app always write both, so
    this only matters for data written elsewhere (for example the Flutter app).
  - Marking a status already writes the single shared doc, so marking by either host clears it for both.
- **Booking engine moved into `AppointmentBookingService` (7).**
  - Reason: the Book calendar and Book Appointment must write identical docs: the slot flags, the
    appointment, the delivery sequence, product status and deliverable `fileref`.
  - `book-appointment` now calls `rolesFor`, `mergeSlots` and `book`. The alerts, the flow and the writes
    are unchanged.
  - `mergeSlots` generalises the old 1/2/3-role branches: the same start minute, a different person per
    role.
  - One deliberate difference: `book()` returns `unavailable` when no availability doc matched. The old
    code went ahead with zero hosts.
- **Calendar booking starts without a participant, so slots use required roles only.**
  - A picked participant must fit the slot: `planForSlot`. A `customer_eismapping` that pins other
    specialists rules them out.
  - A mapped *additional* role also rules them out, because the slot lacks that role. Those participants
    are booked By participant.
  - A participant is never their own specialist.
- **Eligible participants (7):**
  - a ready `deliverables` doc for the type;
  - an active `participantsproduct` (initiated / ongoing);
  - the delivery-sequence activity for that product with status `ready` (the operator chose ready only).
- **Specialist search (4).** Built as a shared `sas-person-select` (`ngx-mat-select-search`, the same as
  Book Appointment's profile picker), and reused for the participant picker.
- **Responsive (5), desktop + tablet only:**
  - below 1100px the nav becomes a 68px icon rail, with titles / aria-labels on each icon;
  - View as moves above the page (it can't fit in the rail);
  - the 1320px cap is gone;
  - the week grid shrinks to 700px before it scrolls;
  - phones (< 768px) keep the stacked top tabs.

## Found / surprised us
- `sas-team-table.component.spec.ts` was date-dependent. Its fake returned no sessions once the month began
  more than 8 days before "next week", so it started failing on 2026-10-05 with no code change.
  The fake now returns the sessions for every query.
- The `book-appointment` spec was an empty CLI stub that could never pass (no Firestore provider). It now
  has fakes and a filter test.

## Verified
- Development build is clean. 98/98 specs pass across the studio and book-appointment, including new specs
  for:
  - the booking service (`mergeSlots`, `planForSlot`), `hostIdsOf`;
  - the person picker, the Book calendar and the Book slot dialog;
  - the filtered Week, Sort by time, and Select all types.
- Not live-checked: localhost redirects to login.

## Pending
- Live check, especially a real booking from the Book calendar on **starlabs-test**. It writes the same docs
  as Book Appointment.
- e2e suite. New prefixes: `spp` (person picker), `sbk` (book calendar), `sbs` (book slot dialog).

## Revert guide (per change)
| Change | Files | How to revert |
|---|---|---|
| Product → type list, label | `sas-filter-bar` `shownTypes`, placeholder | iterate `types`; label "Appointment types" |
| Slot view + month counts | Home `slotMode`, `slotDays`, `slotCols`, month block in `apply`; template `sah-slot-week` branch, `#slotEntry` | drop the branch; set `slotMode` false |
| Group / sort toggle | `groupColumns` (logic), Home `groupBy`/`setGroup`, `sah-group-*`; `sbk-group-*` | always call with `'type'` |
| Specialist search | `sas-person-select/`; Home `people`, add-availability `people` | restore the native `<select>` (git history) |
| Collaborative sessions | Home `buildCalendar` `used` key; `dayColumns` `used` key; service `hostIdsOf` | key by `appt.id`; hosts = `hosts` only |
| Booking service | `book-appointment/appointment-booking.service.ts`; `book-appointment` `onAppointmentSelect`, `onDateSelect`, `mergeEISslots`, `confirmSlot` | restore the component from `8955e7e0` and delete the service |
| Book calendar | `sas-book-calendar/`, `sas-book-slot/`, shell `bookMode` + template; period bar `allowMonth` | remove the mode toggle; keep only the By participant section |
| Responsive | shell CSS (`@media (max-width:1100px)` blocks, `.sas-viewas-compact`), shell template compact View as, nav `title` | delete the blocks; restore `.sas-wrap { max-width:1320px }` and the 900px breakpoint |
| Select all types | add-availability `allPicked`/`toggleAllTypes`, `saa-type-all` | remove the chip |

## One component (operator, 2026-10-05: "build it into single component only")
The screen was 15 components. It is now **one**, `SpecialistAppointmentStudioComponent` (`.ts`/`.html`/`.css`/`.spec.ts`).
`sas-logic.ts` and the two services were not components, so they stay.

- **Tabs:** each tab's logic is a plain class in the component file: `HomeTab` (Home + Overview), `TeamTab`,
  `TeamTable`, `MentorsTab`, `UtilTab`, `SettingsTab` and `BookTab`. The component creates a fresh one each
  time a tab opens.
- **Dialogs:** `AddDialog`, `WindowDialog` and `BookSlotDialog` are classes. Their markup is an `<ng-template>`
  opened with `MatDialog.open(TemplateRef)`, which needs no component of its own.
- **Shared pieces:** `PeriodBar`, `FilterBar`, `PersonPicker` and the loader are `<ng-template>`s fed a state
  object through `ngTemplateOutlet`.
- **Test hooks:** all now use the one `sas-` prefix (the one-prefix-per-component rule):
  `sah-`→`sas-home-`, `saa-`→`sas-add-`, `stt-`→`sas-tt-`, `stm-`→`sas-team-`, `smn-`→`sas-mentors-`,
  `sut-`→`sas-util-`, `sst-`→`sas-settings-`, `sap-`→`sas-period-`, `saf-`→`sas-filter-`, `saw-`→`sas-window-`,
  `spp-`→`sas-person-`, `sbk-`→`sas-bookcal-`, `sbs-`→`sas-bookslot-`, `sal-loader`→`sas-loader`.
- **Found while merging:** an `@for` track expression can't read a template alias (`track a.dayKey(d)`
  threw in the dialog). It now tracks `d.getTime()`.
- **Verified:** dev build clean; 90/90 specs (all old component specs ported to the classes, plus
  rendered checks for every A&H tab and the Add dialog's type dropdown).
- **Revert guide:** the rows above now point at the classes and templates of the same names inside
  `specialist-appointment-studio.component.{ts,html}`. To undo only the merge, restore the folder from
  `8955e7e0` (round 1) and reapply round 2 from this journal.

## Why nothing can be booked: name the roles (operator, 2026-10-05)
For a delivery type with several required roles (for example EI Diagnostics + EI Implementation), the
booking screens only said "No EIS are available", "EIS Slots not available…" or "No open slots", and
never named the role that was missing. `slotGapMessage` (in `appointment-booking.service.ts`) now
builds one message everywhere a session is booked:
- Book Appointment (`/bookappointment`) and Book Session → By participant: the same alerts, with new text.
- Book Session → Calendar: a note above the slots for each picked type that has nothing to book.

It names, in this order:
1. the type has no roles set up;
2. a role nobody is mapped to;
3. the roles with no open slots in the date or week;
4. for a collaborative type, roles that have slots but never at the same start with different people.

Revert: restore the three `alert("…")` strings in `book-appointment.component.ts` and the old
`noRoles` line in the Book calendar.

## Joint delivery types grouped in the calendar (operator, 2026-10-05: all three, show once, partner names)
A **joint** type has 2 or more roles in `AppointmentType-To-Roles.required_role`. It is bookable at a time only
when each role has a different free person starting then, the same rule as booking (`mergeSlots`).
- **Badge on every joint slot (Day view and filtered Week):**
  - "Joint · with Ravi" when a partner is free at the same start;
  - "Joint · needs EI Implementation free at 14:00", status "Waiting for a partner", when no partner is free.
- **Booked joint session, one card:**
  - On Home it reads "Joint · with Ravi".
  - In the all-specialists Overview it reads "Joint · Anu + Ravi" and is drawn once, under the first host's
    window. Every host's window still counts it, so "Completion pending" still shows for both.
  - Upcoming and Past show the same "Joint · with …" line.
- **Day view:** joint types get their own tinted column, placed last and headed "Joint · 1h Kick-off". In the
  all-specialists view each joint start time is one entry listing everyone free then ("Anu + Ravi · bookable").

How (`sas-logic.ts`):
- `JointIndex` builds, per type and start minute, the free people per role. From that it answers `teams`,
  `partners`, `missing` and `uncovered`.
- `collapseJoint` merges the all-specialists entries.
- `svc.jointTypes()` reads the two role collections once.

Why Home now reads **partners' windows**: a specialist's own slots can't say whether the partner is free. In
self mode, the windows of everyone who shares one of that specialist's joint types are fetched for the same
range. They are used only by `JointIndex`, never drawn and never counted in hours.

Revert: remove `JointIndex` / `collapseJoint` and the partner fetch in `HomeTab.load`; draw `x.sessions`
instead of `x.cards`; drop `jointNote` / `hostLine` from the template.
- **Week and Month too.** The default Week view (window blocks) showed nothing for open joint availability.
  - Each window offering a joint type now carries a line, also shown in its tooltip:
    "👥 Joint: Kick-off · with Ravi" or "Joint: Kick-off · needs EI Implementation".
  - Each Month day shows "👥 Joint: 2 bookable · 1 booked".
  - Code: `HomeTab.windowJoint` and `dayJoint`. Revert: drop the `joint` field from the window and month cell.

## Calendar legend, and a double booking found (2026-10-05)
- **Legend under the calendar:**
  - Week and Day: availability (Open, Fully booked, Waiting for a partner, Ended or unused), sessions (Booked,
    In session, Completed, Completion pending, Cancelled) and the 👥 Joint icon.
  - Month: green = availability, blue = booked.
  - The operator removed the legend at the start, then asked for it back once the colours multiplied.
- **Found:** a specialist double-booked in one window (EI Implementation and Scope Enhancement, both 9:00–11:00).
  Booking closes every overlapping slot for all types, so this came in some other way.
  - Confirmed hole in the code: `AuthguardService.cancelAppointment` reopens every unbooked slot that overlaps
    the cancelled session, even when that slot also overlaps another session still booked.
  - Also possible: two bookings at the same moment (`book` doesn't use a transaction); another app booking.
  - Operator: **don't change the cancel code now; fix it later.** Pending: the cancel fix, a transactional
    `book`, and flagging existing double bookings.
