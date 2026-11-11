# Contract: jc-evprep-board
Surface: /journey-coach-health -> Ev. Preparation tab (standalone `app-jc-evprep-board`)
Env: starlabs-test cloud (development config) — never production
App command: npx ng serve --configuration development --port 4300
URL: http://localhost:4300/journey-coach-health (click tab "3 Ev. Preparation")

## Requirement (operator, 2026-11-11)
Two kanban boards, cards moved by hand (drag or Next / back), every move needs a note:
1. New Participants — LIVE (wiring approved 2026-11-11): data and write rules from the other developer's
   journey-pipeline component, shown in this board's design.
2. Attended 1 uP! and above: JC Done (Yet to start) | AEL | uP! life report | Ready for SE — still a DESIGN PREVIEW
   on sample cards until its "JC Done" entry rule is defined.

## Data (New Participants)
- Columns: Onboarded (Yet to start) | every stage name across `evolution prep variation` docs (first-seen order) | Ready for SE.
  starlabs-test today: First cycle (AEL, uP! Aspiration, ATC Understanding), Next cycle (AEL, uP! Life Report).
- Yet to start: `participantjourneyproduct` onboardedtime >= 2026-10-01 (EVPREP_LIVE_FROM), onboarded, journeytype new,
  no non-cancelled prep created after onboarding, sale not excluded (rejected / excluded journey / internal test leads).
- Stage columns: `evolution prep` status initiated|ongoing, by currentstage. Ready for SE: status completed, created on/after the start date.
- Live subscription on `evolution prep`; names/emails from `participant metadata` and sales leads only by batched `in` queries.
- Writes (schema unchanged + additive fields notes[], stagesince, updatedby, updatedon):
  start = setDoc {docid, profileid, variationid, currentstage = first stage, completedstages [], status initiated, createdon, createdby};
  move = updateDoc {currentstage, completedstages = stages before it, status initiated|ongoing|completed, notes arrayUnion}.

## User moves
1. Open the URL, click Ev. Preparation (testid: jx-tab-evprep). New board shows loading (evp-loading), then live columns.
2. Click Next on a stage card (evp-card-next): move box (evp-move) shows from › to and past notes.
3. Save with an empty note: blocked, "A note is required". Type a note (evp-move-note), Save (evp-move-save):
   the card moves; both column counts (evp-col-count) change by 1; the doc's status / currentstage / completedstages update.
4. Back (evp-card-back) on that card: returns it; past notes list both notes.
5. Drag a card onto a stage its variation does not have: the box shows the reason (evp-move-error) and Save is disabled.
6. Yet-to-start card: "Start prep" -> pick a variation (evp-move-variation) + note -> new prep at the variation's first stage.
7. Returning board: moves stay on the page (preview banner evp-preview), reset on reload.

## Invariants
- Tile == list: each column count is the length of the array its cards render from.
- Columns are disjoint: a prep sits in exactly one column; Yet to start excludes anyone with a live prep started after onboarding.
- Moves follow the card's own variation; a started prep never returns to Yet to start; Ready for SE = status completed.
- Nothing moves until the note is saved; one running prep per participant + variation.
- No whole-collection PII reads (participant metadata / salesleads batched by id); no console.log of data.
- Writes are stamped with the coach profileid; no profile -> the move is refused.
- The move box is an in-page fixed overlay, not a MatDialog; no filter/transform on its ancestors.
- Other tabs unchanged: jc-health-tabs, jc-health-onboarding-tab, jc-onboarding-pipeline, jc-overall-summary stay green.

## Banned
- MatDialog / new dialog component for the move box.
- Whole-collection getDocs of `participant metadata` (or any PII collection).
- Production Firebase as a test target; participant PII in logs/commits.
- ATC collections and src/app/ATC/** ("ATC Understanding" is only a stage name).

## Known limitations
- Start date fixed at 2026-10-01 (operator default); earlier onboardings never show in Yet to start.
- A prep whose currentstage is not a stage of any variation is not shown (starlabs-test has one: status initiated, currentstage "completed").
- No Cancel action yet (journey-pipeline had one, visible to everyone); roles to be decided.
- Not scoped by the Viewing coach selector; repo firestore.rules are open (deployed starlabs-test rules allowed these reads/writes).

## Hooks (literal)
- jx-evprep-board, evp-root, evp-preview, evp-board, evp-board-total, evp-col, evp-col-count, evp-empty,
  evp-card, evp-card-days, evp-card-variation, evp-card-next, evp-card-back, evp-move, evp-move-note,
  evp-move-variation, evp-move-error, evp-move-save, evp-move-cancel, evp-loading, evp-error

## Proof
- Check: qa/checks/jc-evprep-board.mjs
- Command: node qa/checks/jc-evprep-board.mjs
- Fail if reverted: yes (board files reverted to HEAD -> 13 FAIL; restored -> 23/23 PASS)
- Live (starlabs-test, :4300, 2026-11-11): New board columns Onboarded 0 | AEL 3 | uP! Aspiration 0 | ATC Understanding 0 |
  uP! Life Report 0 | Ready for SE 1 (no starlabs-test onboardings since 2026-10-01; latest 2026-09). Empty note blocked.
  Test 55 AEL -> uP! Aspiration with note: AEL 3->2, uP! Aspiration 0->1, status ongoing, completedstages [AEL], note saved;
  back -> AEL, status initiated, completedstages [], 2 notes (data restored; 2 QA notes remain on that test prep).
  Next cycle card -> ATC Understanding blocked ("Next cycle has no such stage."); back to Yet to start blocked.
- Last run: PASS 23/23 (2026-11-11)
