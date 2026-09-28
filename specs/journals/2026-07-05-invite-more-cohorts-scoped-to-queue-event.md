# 2026-07-05 — Enter-Studio / Invite-More specialist chips scoped to the queue's event

Operator: the specialist chips come from cohorts — filter those cohorts by the EVENT mapped to the queue
(don't offer every cohort's specialists).

Working-tree only (ds-v2.ts has prior WIP; not committed). TS in dynamic-studio-v2 only.

## Data model (corrected by operator)
A `big cohorts` doc's `eventref` points to an **`event collection`** doc (a "Live Event") — NOT the
`queue generation` doc. The queue-generation doc links to that event via its **`eventid`** field. This is
exactly big-planner's mapping (big-planner.component.ts ~L228):
```
this.selectedEvent = this.selectedQueue['eventid'];
const eventRef = doc(this.firestore, 'event collection', this.selectedEvent);
query(collection('big cohorts'), where('eventref','==', eventRef), where('status','==','active'))
```
(`event-opportunity-dashboard` also reads `mapQueue[queueid]['eventid']`.) Note `eventref` can point to
either `event collection` (Live Event) or `queue generation` (Queue Event) — code elsewhere disambiguates
via `eventref.parent.id`.

## Change (dynamic-studio-v2.component.ts)
`activitySpecialistMap` (activityId -> specialist profileIds, feeds the chips) previously unioned **every**
active cohort. Now scoped to the queue's event:
- New `private allCohortsCache` — raw cohorts snapshot from the live `big cohorts` subscription.
- New `rebuildActivitySpecialistMap()` — builds the map from the cache, keeping only cohorts where
  `cohort.eventref.id === ongoingQueue['eventid']` AND `cohort.eventref.parent.id === 'event collection'`
  (and status active), unioning `participantidlist` per `bigactivity`. Null / other-event / queue-event
  refs are skipped.
- The `big cohorts` subscription now just caches + calls the rebuild.
- `getStudio()` (runs on initial load via onQueueSelect AND every queue switch, after `ongoingQueue` is
  set) also calls the rebuild — handling the load-order race (cohorts resolving before the queue):
  whichever resolves last produces a correctly-scoped map.

Applies to BOTH the lobby Enter-Studio popup and the live Invite-More chips (both read
`activitySpecialistMap`) — correct, both operate within the same queue/event.

## Verification
- Mirrors big-planner's queue->eventid->event-collection->cohorts mapping (the canonical queue-scoped
  cohort lookup). Field/method placement verified in-class; `ongoingQueue['eventid']` confirmed as the
  established field (big-planner + event-opportunity-dashboard).
- Not verified against live data (auth-gated; prod off-limits). Overall ng-serve build is red from
  PARALLEL edits in zoom-clientview.component.ts + web-studio-invitation.component.ts, not these files.
  Operator to confirm the chips show only this event's cohort specialists.

## Revert
Restore the old inline cohorts subscription (union all active cohorts into activitySpecialistMap); drop
`allCohortsCache`, `rebuildActivitySpecialistMap()`, and its call in getStudio().
