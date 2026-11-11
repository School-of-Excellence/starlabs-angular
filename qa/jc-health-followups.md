# Contract: jc-health-followups
Surface: /journey-coach-health -> Journey Planning (Participants table, participant slide-over, Summary Schedule card)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4303
URL: http://localhost:4303/journey-coach-health (tab "Journey Planning")

## Requirement (operator-approved 2026-11-11, item 5)
The slide-over's New log > Schedule writes healthtracker_activity {type:'schedule', profileid, dueDate, note, actor, timestamp}
but nothing showed it except the timeline. Make open follow-ups visible:
(a) "Due d MMM" chip on the participant row (red when overdue);
(b) "Follow-ups" list in the slide-over Upcoming (Events) section with Mark done, which writes an additive
    {type:'schedule_done', profileid, scheduleId, actorUid, actorName, timestamp};
(c) "Follow-ups" group in the Schedule card with Today / Next 7 days / Overdue counts that filter its list.
New follow-ups appear without reload after saving.

## Source
healthtracker_activity. Specific coach: where('profileid','in', chunk30(rosterIds())) + where('type','==','schedule' |
'schedule_done') (equality only, no composite index). ALL / UNASSIGNED: where('type','==','schedule' | 'schedule_done')
once (same shape as the existing loadAddressed read; healthtracker_activity is not a PII collection), filtered to the
roster client-side. Open = schedule without a schedule_done for its id. Buckets by due day: < today overdue,
== today today, today+1..+7 next 7 days.

## User moves
1. Open the URL, Journey Planning, Viewing = a coach with a test participant.
2. Open the participant (slide-over), New log > Schedule, pick a due date, save.
3. Expect at once: slide-over Follow-ups lists it (so-fu-item); the row shows Due d MMM (jchd-row-due);
   Schedule card Follow-ups count rises (sched-fu-today / sched-fu-week / sched-fu-overdue).
4. Click a Follow-ups tile: list (sched-fu-list) filters to that bucket; click again: all.
5. Mark done (so-fu-done): it leaves the slide-over list, the row chip and the Schedule counts.

## Invariants
- Follow-ups tile N == list length for that bucket.
- Viewing coach C => every follow-up row belongs to C's roster.
- JC and Onboarding schedule columns unchanged (still disjoint).
- Mark done is additive (no update/delete of the schedule doc).

## Banned
- Composite-index queries / orderBy on these reads
- New MatDialog (slide-over is the existing one)
- Production Firebase as a test target
- ATC collections and src/app/ATC/**

## Hooks (literal strings only)
- jchd-row-due -> row due chip
- so-fu-list / so-fu-item / so-fu-done / so-fu-empty -> slide-over Follow-ups
- sched-fu / sched-fu-today / sched-fu-week / sched-fu-overdue / sched-fu-list / sched-fu-item -> Schedule card Follow-ups

## Proof
- Spec path: qa/checks/jc-health-followups.mjs (bucketing executed)
- Command: node qa/checks/jc-health-followups.mjs
- Fail if reverted: yes (12 of 13 FAIL against the previous sources; FU13 is a completeness guard)
- Last run: PASS 13/13
