# Centralised Appointment System (`/specialistappointmentstudio`)

## Context
Today's appointment screens are separate: availability, booking, calendar and studio. This plan puts them into **one role-aware screen** built from the prototype `~/Downloads/starlabs-appointments-v2.html`. It uses the **existing collections and flows** (`availability`, `appointments`, `computeSlot`, `book-appointment`, `AppointmentDetailComponent` → `MarkAppointmentStatusComponent`), so the participant app, emails and delivery-sequence updates keep working. The logic below is what you signed off section by section. Items marked **(assumed)** are my defaults; comment on any of them to change it.

---

## 1 · Locked logic

### Shell
| Item | Logic |
|---|---|
| Layout | No top bar and no bell. There's a screen title plus a **left nav that belongs to this screen only**. |
| Route | One route, `/specialistappointmentstudio` (already created), that changes by role. |
| Roles (`users_roles` flags) | **A&H** = `admin`, `ah`, `ahmember`, `developer`, `tester`, `scheduler` · **Mentor** = `mentor` · **CW** = EIS, journey coach, `changeagent`. The exact flag keys will be confirmed against `users_roles` at build time. |
| Priority | **Mentor > A&H > CW** (operator change, 2026-09-29). Someone with several roles gets the highest view, with no switcher **(assumed)**. |
| Nav per role | **CW**: Home · **Mentor**: Home, My Team · **A&H**: Overview, Mentors, Utilisation, Book Session, Settings. |
| Dropped | Participant view (parked) · Block time · Product Progress / stages · the A&H Products tab · Reschedule · notes · the calendar legend. |

### Home (CW = my data · Mentor = my data · A&H Overview = everyone's data)
| Item | Logic |
|---|---|
| Scope | CW and Mentor see **only the logged-in profileid**. A&H sees **everything**, with a Specialist filter (default "All"). The calendar shows once a specialist is picked **(assumed)**. |
| Header | A greeting plus **Add availability** only. |
| Period bar | Week, Month and **Today**. It **loads on Today (the current week)** by default. |
| Available | Σ (`endtime − starttime`) of `availability` windows in the period, i.e. window hours. |
| Booked | Σ slot hours where `booked: true`, with overlapping time counted once per window. |
| Delivered | `appointments` where `attended: true` and `cancelled: false` → Σ (`endtime − starttime`). |
| Unutilised | Available − Delivered. |
| Utilisation % | Delivered ÷ Available (e.g. 30h delivered of 40h available = 75%). |
| Calendar week view | Window chips coloured by state (open, fully booked, ended or unused), with the booked sessions under each window. |
| Calendar month view | Kept. Clicking a day opens that week. |
| Upcoming table | Date and time · type · participant · status · **Join**, which for now **copies the Zoom URL** · ⋯ menu. |
| Past table filter | **Completed · Cancelled · Status updation pending**. Pending means the time has passed and the appointment has `attended: false` and `cancelled: false`. The default is **Pending (assumed)**. |
| Row actions | Pending → opens **`AppointmentDetailComponent`** → **`MarkAppointmentStatusComponent`** (Completed, or Cancelled / **No-show**). A no-show is stored as it is today: `cancelled: true` with the reason `"Client didn't show up"`. Also: copy Zoom link. |
| Delete availability | The same rule as `appointment-availability.onrowdelete`: allowed only if there are no booked slots. There is no edit. |

### Add availability (dialog)
| Item | Logic |
|---|---|
| Types | Only the appointment types for the specialist's EIS roles. The chain is the one in `add-appointment-availability.onProfileSelect`: `Roles-To-EIS` → `AppointmentType-To-Roles`. |
| Gate | Keep the existing rule: you can't add availability while your last appointment's status hasn't been updated **(assumed)**. |
| Specialist picker | Shown for A&H only. CW and Mentor add for themselves. |
| Dates | A single-month range calendar. No weekends checkbox, so weekends are included **(assumed)**. |
| **Auto** mode | From and To times. A description plus a preview of the start times `computeSlot` will cut: longest type first, a new start every 30 minutes, keeping only slots that fit. No flag is added. The CF generates the slots. |
| **Static** mode | The specialist enters the start and end time. The doc gets **`fixed: true`**, and `computeSlot` creates **one slot per selected type, from starttime to endtime**. |
| Validation | No past times, end after start, no overlap with existing windows (`validateAvailabilityExists`). |
| Write | One `availability` doc per date: `{id, starttime, endtime, profileref, appointments[], fixed?}`, which is the same shape as today. |

### Mentor: team
| Item | Logic |
|---|---|
| Owned products | `users_roles.productowner[]` (atc model names, set in the profile list) → `products` where `atcmodel` is in that list. The existing query is at `appointment-studio.component.ts:208`. |
| Team | `productToDeliverySequence` for those products → `deliveryoptions[].deliverysequence[].activity` refs under `appointmenttype/` → `AppointmentType-To-Roles` (required and additional roles) → `Roles-To-EIS.assigned_eis`. |
| My Team table | EIS · status (in session / available / fully booked) · open time this week · participants (distinct `bookedby` on owned products) · utilisation % · delivered · completed · no-shows. Rows expand to show that EIS's participants and next session. It follows the period bar **(assumed)**. |

### A&H
| Tab | Logic |
|---|---|
| Overview | Home with everyone's data. Stat tiles and tables only, no products section. |
| Mentors | Every `mentor` profile: owned products · number of EIS · participants · team utilisation · delivered. Rows expand into that mentor's team table. |
| Utilisation | Filters: date range · role (Mentor / CW) · product · search. Per-specialist columns: available · booked · delivered · unutilised · cancelled · no-show · %, with a total row. The formulas are the same as Home. |
| Book Session | Embeds the existing **`BookAppointmentComponent`** unchanged. |
| Cancel | Through `AppointmentDetailComponent` (enabled before the start time) → the existing `guard.cancelAppointment()`. |
| Settings | **View only**: a list of `appointmenttype` with name · duration · group · changework. No create, update or delete. |

---

## 2 · Build

### Files (all new, under `src/app/Scheduling/specialist-appointment-studio/`)
| File | Purpose |
|---|---|
| `specialist-appointment-studio.component.*` (exists) | Shell: resolves the role, holds the left nav and title, and switches between tabs. |
| `specialist-appointment.service.ts` | Role resolution · queries · the hours maths (pure functions) · the mentor → team chain · a `computeSlot`-matching preview function. |
| `sas-home/` | Home for CW, Mentor and A&H Overview: stats, calendar week/month, upcoming and past tables. |
| `sas-add-availability/` | Add availability dialog (Auto and Static). |
| `sas-team-table/` | The team table with expandable rows (used by Mentor My Team and by A&H Mentors). |
| `sas-mentors/` · `sas-utilisation/` · `sas-settings/` | The A&H tabs. |
| `*.spec.ts` for each | Unit tests: the service maths, role priority, slot preview. |

**Reused as-is:** `AppointmentDetailComponent`, `MarkAppointmentStatusComponent`, `BookAppointmentComponent`, `guard.getRoles()`, `getAppointmentMap()`, `getProfileMap()`, `getAppointmentRolesMap()` and `guard.cancelAppointment()` (`authguard.service.ts:1046`). The styles use the prototype's bt- tokens, scoped to the component.

### Outside this repo
| Change | Where |
|---|---|
| `computeSlot`: if `fixed === true`, write one slot per type from starttime to endtime | `~/Projects/Functions/starlabs-cloud-function/functions/components/appointment.js:382`. It needs a CF deploy, which is a separate step you approve. |
| `dashboard` access entry for the route `specialistappointmentstudio` (roles: all of the above) | Firestore config, set through the route configuration screen. |

### Build order (one commit per step, only when you approve)
1. Service, role resolution and the shell nav.
2. CW Home.
3. Add availability, delete, and the `computeSlot` change.
4. Mentor Home and My Team.
5. A&H: Overview, Mentors, Utilisation, Book Session, Settings.
6. Specs, e2e `data-testid` hooks (one literal prefix per component), the journal, and a rewrite of PROGRESS.md.

## 3 · Verification
- `ng build --configuration production` is clean, and `ng test` passes for the new specs: hours maths (overlapping slots counted once), role priority, and a slot preview that matches `computeSlot` output.
- On your dev server (4200), log in as a **CW**, a **Mentor** and an **A&H** test profile on **starlabs-test**, never production. Check each nav and scope, that the stats match hand counts, that Auto and Static availability create the expected slots, that marking a pending appointment goes through, that the A&H cancel works, and that Book Session books.
- Check the screen at phone width, then take a screenshot of each role.
- Save the plan to `specs/plans/2026-09-29-centralised-appointments.md` and write the journal in `specs/journals/`.
