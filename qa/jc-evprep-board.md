# Contract: jc-evprep-board
Surface: /journey-coach-health -> Ev. Preparation tab (new standalone `app-jc-evprep-board`)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4301
URL: http://localhost:4301/journey-coach-health (click tab "3 Ev. Preparation")

## Requirement (operator, 2026-11-11; kanban mockup v2 approved)
Two kanban boards, cards moved by hand ("I want to see and move cards"), styled like the
/onboarding-pipeline Sources columns:
1. New Participants: Onboarded (Yet to start) | AEL | uP! Aspiration | ATC understanding | Ready for SE
2. Attended 1 uP! and above: JC Done (Yet to start) | AEL | uP! life report | Ready for SE
Stage entry rules ("variables") are planned later; today a card only exists if it has an `evprepboard` doc.

## Data (DESIGN PREVIEW, operator 2026-11-11: "just show the design now, no wiring")
- 15 sample participants (EVPREP_SAMPLE, fake names). No Firestore reads or writes; moves stay on the page and reset on reload.
- Wiring is deferred: starlabs-test's deployed rules deny an `evprepboard` collection (permission-denied), and entry rules are not defined.

## User moves
1. Open the URL, click Ev. Preparation (testid: jx-tab-evprep). Two boards render (testid: evp-board, data-board new|returning).
2. Click Next on a card (testid: evp-card-next): the move box opens (testid: evp-move) showing from › to and past notes.
3. Save with an empty note: blocked, "A note is required". Type a note (evp-move-note), Save (evp-move-save):
   the card is in the next column; both column counts (evp-col-count) change by 1.
4. Drag a card to another column of the same board: same move box; Cancel (evp-move-cancel) leaves it where it was.
5. Reload: the board returns to the sample state (preview banner, testid: evp-preview).

## Invariants
- Tile == list: each column count is the length of the array its cards render from.
- Columns are disjoint: one doc per participant, one board, one stage; docs for another board/unknown stage are not shown.
- A move only happens inside one board between two different stages (cards cannot be dropped on the other board).
- Nothing moves until the note is saved.
- No Firestore import or call in the board component (design preview).
- The move box is an in-page fixed overlay, not a MatDialog; no filter/transform on its ancestors.
- Other tabs unchanged: jc-health-tabs, jc-health-onboarding-tab, jc-onboarding-count-only, jc-onboarding-pipeline stay green.

## Banned
- MatDialog / new dialog component for the move box.
- Whole-collection getDocs of `participant metadata` (or any PII collection).
- Any Firestore read/write from the board while it is a design preview.
- Production Firebase as a test target; participant PII in logs/commits.
- ATC collections and src/app/ATC/** (the "ATC understanding" stage is only a column label today).

## Known limitations
- Sample data only; real participants, storage and entry rules come in the wiring step.
- Not scoped by the Viewing coach selector; no auto-advance; firestore.rules in the repo are open (no server-side role check).

## Hooks (literal)
- jx-evprep-board, evp-root, evp-preview, evp-board, evp-board-total, evp-col, evp-col-count, evp-empty,
  evp-card, evp-card-days, evp-card-next, evp-card-back, evp-move, evp-move-note, evp-move-save, evp-move-cancel

## Proof
- Check: qa/checks/jc-evprep-board.mjs
- Command: node qa/checks/jc-evprep-board.mjs
- Fail if reverted: yes (13/13 FAIL with the board removed and the shell restored)
- Live: :4301 Ev. Prep tab, new 3/2/2/1/1 -> Next + note -> 2/3/2/1/1; empty note blocked; Cancel no change.
- Last run: PASS 13/13; npx ng build --configuration production -> EXIT 0 (2026-11-11)
