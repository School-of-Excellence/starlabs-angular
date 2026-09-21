# Workshop dashboard: All Assignments — a typed answer expands its own card

**Date:** 2026-09-21 · **Branch:** `nanda-development` (uncommitted) · **Status:** built, 52 unit cases green, hub WDC-12 pushed, runtime unverified

Operator: in All Assignments, clicking a card should expand **that card only** to view the complete content.

## What was actually wrong
The assignment groups already expand per assignment. The stuck piece was the participant card for a
**typed** answer (`question` + `submissionformat: 'text'`): its text is clamped to three lines
(`arc-text-clamp`), the card looks clickable (`hasResult`), but `viewParticipantAssignment` returns
`null` for text — so a click did nothing and the answer could never be read in full.

## Change
- One click handler for the card, `onAssignmentCardClick`: a text answer toggles **its own** expansion
  (keyed `assign-<i>:<profileid>`, so neither the neighbour card nor the same person under another
  assignment moves); files and forms keep opening their viewer.
- Expanded: the clamp class comes off, the text wraps as typed (`white-space: pre-wrap`), the card
  gets an accent border, and a small "View complete answer / Show less" toggle (`wdash-arc-text-toggle`)
  makes the affordance explicit; the text itself is `wdash-arc-text`.
- Tests: 4 Karma cases (52 in the logic suite). Hub **WDC-12**: a precondition adds a completed text
  assignment with a long answer to p0's progress document, then the spec asserts clamped → click → full
  text (`END-OF-ANSWER` marker visible, height grew) with exactly one expanded card → toggle collapses;
  `resetParticipantWorkshopP0` restores the seed (its `set(..., {merge:true})` replaces the whole
  `challenges` array).
- Dependency detour again: the merged `package.json` wants `@livekit/krisp-noise-filter`, absent from
  `node_modules`; `npm ci --legacy-peer-deps` + the `--no-save` reinstall of react/redux/redux-thunk.
  Manifests untouched.

## Same day — Challenge Progress Overview: exclusive buckets, first-row rule, zoom rows

Operator: the overview double-counted — "Ready to Start" was also inside "Not Started" (91 + 165 + 111 +
458 ≠ 714), the first challenge showed the same 68 people as both Ready and Not Started, and zoom-call
rows showed three meaningless zero chips plus a Zoom Call Action button that is not ready.

Decision (operator): change the **engine rule itself**, not a display layer on top of it. In
`challengeStatusBuckets` (`workshop-dashboard.engine.ts`) the four challenge-level buckets are now
exclusive and add up to the participant total: 'notstartedcurrent' = not started with every earlier real
challenge done; 'notstarted' = not started and blocked. A challenge with no earlier real challenge (the
first, or one that only follows zoom calls) has no Ready bucket — everyone not started is simply Not
Started. Sub-challenge buckets follow the same split (the very first step never "ready"). meena's pinned
"SUBSET" test was rewritten to the new contract plus two cases (later challenge adds up; zoom-only
predecessors count as first). 168/168 unit cases across her suite and mine.

Template: header chips and the four status buttons are gated off zoom-call rows; the Zoom Call Action
button is commented out in place (its hook id stays declared, so the gate sees no drift). Zoom Attendees
stays. `onChallengeMainStatusClick` needs no change — the panel now lists exactly what the chip counted.

Hub: WDC-13 (pushed `27c89b1`) seeds a three-challenge shape and asserts all three rules end to end.

Sub-challenge rows (same day, operator): Completed / Not Started always, Ready to Start when anyone is ready,
review-flow statuses when non-empty; no In Progress chip on a step (a step is done or not).
Before, the row list omitted `notstartedcurrent` entirely and hid In Progress at zero, which is why
248 + 347 ≠ 714 on 3.1. Engine sub-level split pinned by a unit case; hub WDC-13 extended (`27c89b1`+).
