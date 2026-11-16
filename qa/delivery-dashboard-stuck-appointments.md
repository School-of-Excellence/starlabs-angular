# Contract: delivery-dashboard-stuck-appointments
Surface: /delivery-dashboard -> Participants tab -> Stuck Cases
Env: starlabs-test   (never production)
App command: npx ng serve --configuration development --port 4200
URL: http://localhost:4200/delivery-dashboard

## User moves
1. Open the URL logged in as an admin on starlabs-test
2. Click the Stuck flag in the funnel (testid: dd-funnel-stuck)
3. Read the APPOINTMENT, APPOINTMENT STATUS, APPOINTMENT DATE and DAYS STUCK columns
4. Expect rows with an attended appointment to show its type, "Attended", its real date,
   and days counted from it (testid: pm-stuck-days, data-basis="appointment")
5. Expect rows without one to show "No attended appointment", an em dash, and a DAYS
   STUCK value marked with an asterisk (data-basis="status")

## Why this exists
Four columns were not telling the truth:
- APPOINTMENT        hardcoded 'N/A'
- APPOINTMENT STATUS hardcoded 'N/A'
- APPOINTMENT DATE   showed lastActivity, a STATUS-change date, under an appointment heading
- DAYS STUCK         counted from that same status field, so a coach updating a status
                     without the participant attending anything reset the stuck clock

Measured on starlabs-test, 2026-11-13 (29 stuck, 8 resolved to an attended appointment):

| appointment | date | DAYS STUCK (new) | status-basis (old) | overstated by |
|---|---|---|---|---|
| EI Implementation | 2026-10-21 | 23 | 43 | 20 days |
| A&H Light Diagnostics | 2026-10-12 | 32 | 42 | 10 days |
| Wish Diagnostics | 2025-10-19 | 390 | 409 | 19 days |

The board was calling someone 43 days stuck who had been seen 23 days ago.

## Invariants
- DAYS STUCK counts from the last ATTENDED appointment where one exists, and says so
  (data-basis="appointment"); otherwise it falls back to the status figure and MARKS
  itself with an asterisk and a title explaining the basis.
- waitingperiod is preserved unchanged as the fallback basis - the new column is
  additive, it does not overwrite the old measure.
- A missing composite index must surface as a banner saying the columns are blank
  BECAUSE THE LOOKUP FAILED, not because there is no appointment.
- The lookup is roster-scoped: only stuck participants, chunked at 30 (the Firestore
  'in' limit). Never a whole-collection read of appointments.
- A newer refresh wins - a slow in-flight response cannot overwrite fresher data.
- A null value renders an em dash, never a green "0 DAYS" (same fake-zero the
  DAYS WAITING fix removed).
- The pre-existing journeycoach appointments index is not displaced.

## Banned
- Whole-collection getDocs of PII collections to the client
- backdrop-filter on an ancestor of a position:fixed overlay
- Production Firebase as a test target
- ATC collections and src/app/ATC/**
- Removing or renaming the waitingperiod field (other cohorts render it)
- Showing a DAYS STUCK number without indicating which basis produced it

## Hooks (literal strings only - no ${interpolation})
- pm-stuck-days                 -> the DAYS STUCK badge in Stuck Cases
- pm-stuck-appointments-error   -> the lookup-failure banner
- dd-funnel-stuck               -> the funnel flag that navigates here (pre-existing)

## Proof
- Spec path: qa/checks/delivery-dashboard-stuck-appointments.mjs
- Command: node qa/checks/delivery-dashboard-stuck-appointments.mjs
- Fail if reverted: yes - 23 of the 24 checks fail on revert. SA24 correctly stays
  green either way: it exists to prove the journeycoach index was not displaced.
- Last run: 2026-11-13 PASS 24/24; verified live on starlabs-test with 29 stuck rows,
  8 resolving to an attended appointment, 21 correctly marked as status-basis.

## Deployment note
The query needs appointments(participantproductid ASC, attended ASC, endtime DESC).
That index ALREADY EXISTS on starlabs-test - it had been created by hand and was
missing from firestore.indexes.json, so the repo did not describe the deployed state.
This change adds it to the file. Check it exists on any other project before shipping
there; without it every chunk throws and the banner appears for all users.

## Known gap
ASSIGNED TO is wired to read from the appointment but stays 'Unassigned' on current
data - appt['assignedto'] was falsy for all 8 resolving rows. The coach is most likely
in the appointment's `hosts` array (three indexes exist on it) rather than a flat
field. Resolving that is follow-up work, deliberately not in this chunk.
