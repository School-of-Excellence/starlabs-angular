// planning.engine.unit.spec.ts — unit tests for the Event Planning arithmetic.
//
// WHAT THESE PROTECT: the numbers an event organiser plans against. How many distinct people are in
// the queue, how many of them are confirmed for the event, how many still need a slot, what
// percentage of a phase is complete and whether that reads On track / At risk / Behind, and the
// drill-down lists behind every one of those numbers. Seats get booked and people get chased on the
// strength of these figures.
//
// WHY THEY DID NOT EXIST BEFORE: all of it lived as private methods on a component that injects a
// Firestore, a FormBuilder, a MatSnackBar, an AuthguardService and a PlanningDataService, takes
// eleven @Inputs, and debounces its own recompute behind a visibility gate. Nothing could reach the
// rules: not a unit test (private, and the constructor demands a Firestore) and not e2e, which could
// only assert a RENDERED number — and a rendered "42" cannot tell a correct 42 from a 42 that
// silently dropped every confirmed slot with no end date. Extracted 2026-09-10 into
// planning.engine.ts with the logic unchanged, following the delivery-dashboard.engine.ts /
// priority.engine.ts precedent in ../../../Journey Onboarding.
//
// THRESHOLDS AND STRINGS ARE ASSERTED BY VALUE ON PURPOSE. The 10-point risk band, the 15-row page,
// the six column keys and the card labels are product decisions; changing one changes what a planner
// sees, and that should be a deliberate edit that turns these tests red rather than silent drift.
//
// THE CLOCK IS FROZEN wherever time matters — `now` is an injected parameter defaulting to
// Date.now(), so slot expiry and the event countdown are asserted at exact boundaries.
//
// CASES MARKED "DEFECT (pinned)" assert behaviour that is arguably WRONG. They are pinned, not
// fixed: this was a refactor. Each carries a comment saying why. See the engine header / the report.
import {
  ALL_COLS,
  CardDef,
  CellDrillRow,
  DrillRow,
  FilterPhase,
  MatrixContext,
  PAGE_SIZE,
  PhaseStageRow,
  PlanningFilter,
  RING_CIRCUMFERENCE,
  RISK_BAND_PCT,
  ROW_DEFS,
  buildDrillRows,
  buildMatrixRow,
  cellIds,
  clampPage,
  clampTargetPct,
  cloneRows,
  cohortMembersUnion,
  colKey,
  colLabel,
  comparePhaseStage,
  completedSetForStage,
  computeCards,
  computeChanges,
  confirmationRateCells,
  confirmedSlotSetForStage,
  countdownLabel,
  daysToEvent,
  drillIds,
  emptyCells,
  eventNameFor,
  filterCellDrillRows,
  filterDrillRows,
  formatSlot,
  getRowStages,
  holderIdsFrom,
  isDfuOngoing,
  isTokenInQueue,
  journeyIdsFor,
  nextPage,
  pageCount,
  pageSlice,
  participantQueueStage,
  participantSlot,
  passesFilters,
  passesParticipantFilters,
  phasePct,
  phaseStatus,
  phaseStatusLabel,
  pickEventDate,
  potentialIds,
  prevPage,
  queueStages,
  rangeEnd,
  rangeStart,
  ringDash,
  rollup,
  rowMatches,
  signature,
  statusBucket,
  statusKey,
  statusLabel,
  toDate,
  toggleFilterToken,
  tokensForQueue,
  type2Ids,
} from './planning.engine';

// ---- Builders ----------------------------------------------------------------------------------

const ts = (d: Date) => ({ toDate: () => d });

/** A live token in queue `q`, on stage `s`, held by `pid`. */
const tok = (over: any = {}): any => ({
  queueref: { id: 'q1' },
  tokenstatus: 'Active',
  profile_id: 'p1',
  currentstage: 'Stage A',
  ...over,
});

const set = (...ids: string[]) => new Set<string>(ids);

const NOW = new Date('2026-09-10T12:00:00Z').getTime();

/** A matrix context with no completions and no confirmations unless a case supplies them. */
const ctx = (over: Partial<MatrixContext> = {}): MatrixContext => ({
  holders: [],
  scope: ['q1'],
  approved: set(),
  statusOf: () => 'active',
  completedSetFor: () => set(),
  confirmedSlotSetFor: () => set(),
  rollupRule: 'all',
  ...over,
});

/** A phase whose rows are configured stage-by-stage. */
const phase = (rows: { [k: string]: PhaseStageRow[] }, targetPct: any = null) =>
  ({ docid: 'ph1', phasename: 'Phase 1', targetPct, rows });

const stage = (stagename: string, queueid = 'q1'): PhaseStageRow => ({ queueid, stagename });

describe('planning.engine', () => {

  // ===============================================================================================
  // PLU-01 — customer status buckets and labels
  // ===============================================================================================
  describe('PLU-01 customer status', () => {
    it('buckets active / discontinued / everything-else', () => {
      expect(statusKey('Active')).toBe('a');
      expect(statusKey('DISCONTINUED')).toBe('d');
      expect(statusKey('non active')).toBe('na');
      expect(statusKey('')).toBe('na');
    });

    it('DEFECT (pinned): statusBucket does NOT lowercase, unlike statusKey', () => {
      // statusKey() lowercases its input; statusBucket() assumes the caller already did. The matrix
      // is fed from a map the component lowercases once, so it works today — but the two functions
      // answer the same question differently, and an un-lowercased 'Active' silently lands in the
      // Non-Active column, moving people between matrix columns with no error anywhere.
      expect(statusKey('Active')).toBe('a');
      expect(statusBucket('Active')).toBe('na');
      expect(statusBucket('active')).toBe('a');
    });

    it('crosses confirmed-ness with the bucket to make a column key', () => {
      expect(colKey('active', true)).toBe('c_a');
      expect(colKey('active', false)).toBe('n_a');
      expect(colKey('discontinued', true)).toBe('c_d');
      expect(colKey('whatever', false)).toBe('n_na');
    });

    it('labels known statuses, capitalises unknown ones, and dashes a blank', () => {
      expect(statusLabel('active')).toBe('Active');
      expect(statusLabel('discontinued')).toBe('Discontinued');
      expect(statusLabel('paused')).toBe('Paused');
      expect(statusLabel('')).toBe('—');
    });

    it('names the six matrix columns plus the total', () => {
      expect(colLabel('total')).toBe('Total');
      expect(colLabel('c_a')).toBe('Confirmed · Active');
      expect(colLabel('n_d')).toBe('Not confirmed · Discontinued');
      expect(ALL_COLS.map(c => c.k)).toEqual(['c_a', 'c_na', 'c_d', 'n_a', 'n_na', 'n_d']);
    });
  });

  // ===============================================================================================
  // PLU-02 — the participant filters (journey / DFU / cohort)
  // ===============================================================================================
  describe('PLU-02 participant filters', () => {
    const base = { selectedJourneys: [] as string[], dfuOn: false, selectedCohorts: [] as string[], selectedCohortMembers: set(), filterMode: 'only' as const };

    it('everyone passes when no filter is active', () => {
      expect(passesParticipantFilters('p1', base, [], false)).toBe(true);
    });

    it('"only" mode requires EVERY active filter to match', () => {
      const state = { ...base, selectedJourneys: ['j1'], dfuOn: true };
      expect(passesParticipantFilters('p1', state, ['j1'], true)).toBe(true);
      expect(passesParticipantFilters('p1', state, ['j1'], false)).toBe(false); // journey yes, DFU no
      expect(passesParticipantFilters('p1', state, ['other'], true)).toBe(false);
    });

    it('"remove" mode drops anyone matching ANY active filter', () => {
      const state = { ...base, filterMode: 'remove' as const, selectedJourneys: ['j1'], dfuOn: true };
      expect(passesParticipantFilters('p1', state, ['j1'], false)).toBe(false);
      expect(passesParticipantFilters('p1', state, [], true)).toBe(false);
      expect(passesParticipantFilters('p1', state, ['other'], false)).toBe(true);
    });

    it('cohort membership is checked by id', () => {
      const state = { ...base, selectedCohorts: ['c1'], selectedCohortMembers: set('p1') };
      expect(passesParticipantFilters('p1', state, [], false)).toBe(true);
      expect(passesParticipantFilters('p2', state, [], false)).toBe(false);
    });

    it('unions the selected cohorts\' members and ignores the rest', () => {
      const cohorts = [
        { id: 'c1', members: set('a', 'b') },
        { id: 'c2', members: set('b', 'c') },
        { id: 'c3', members: set('z') },
      ];
      expect([...cohortMembersUnion(cohorts, ['c1', 'c2'])].sort()).toEqual(['a', 'b', 'c']);
    });

    it('picks the journey field from the customer status', () => {
      const meta = { activejourney: 'jA', lastsubscribedjourney: 'jS', lastcompletedjourney: 'jC' };
      expect(journeyIdsFor(meta, 'active')).toEqual(['jA']);
      expect(journeyIdsFor(meta, 'discontinued')).toEqual(['jS']);
      expect(journeyIdsFor(meta, 'non active')).toEqual(['jC']);  // the default field
      expect(journeyIdsFor(meta, '')).toEqual(['jC']);
    });

    it('flattens nested journey arrays and stringifies scalars', () => {
      expect(journeyIdsFor({ activejourney: [['j1'], 'j2', null] }, 'active')).toEqual(['j1', 'j2']);
      expect(journeyIdsFor({ activejourney: 7 }, 'active')).toEqual(['7']);
      expect(journeyIdsFor({}, 'active')).toEqual([]);
      expect(journeyIdsFor(null, 'active')).toEqual([]);
    });

    it('DFU ongoing means holding a Priority-Mode product', () => {
      expect(isDfuOngoing({ activeproduct: ['x', 'prio'] }, set('prio'))).toBe(true);
      expect(isDfuOngoing({ activeproduct: ['x'] }, set('prio'))).toBe(false);
      expect(isDfuOngoing({ activeproduct: 'prio' }, set('prio'))).toBe(false); // must be an array
      expect(isDfuOngoing(null, set('prio'))).toBe(false);
    });
  });

  // ===============================================================================================
  // PLU-03 — the single "in queue" definition
  // ===============================================================================================
  describe('PLU-03 in-queue tokens', () => {
    const stages = ['Stage A', 'Stage B'];

    it('accepts an active, undeleted token on a configured stage', () => {
      expect(isTokenInQueue(tok(), 'q1', stages)).toBe(true);
    });

    it('is case-insensitive about tokenstatus but requires "active"', () => {
      expect(isTokenInQueue(tok({ tokenstatus: 'ACTIVE' }), 'q1', stages)).toBe(true);
      expect(isTokenInQueue(tok({ tokenstatus: 'Closed' }), 'q1', stages)).toBe(false);
      expect(isTokenInQueue(tok({ tokenstatus: undefined }), 'q1', stages)).toBe(false);
    });

    it('rejects a token of another queue or on an unlisted stage', () => {
      expect(isTokenInQueue(tok({ queueref: { id: 'q2' } }), 'q1', stages)).toBe(false);
      expect(isTokenInQueue(tok({ currentstage: 'Ghost Stage' }), 'q1', stages)).toBe(false);
    });

    it('does NOT filter by stage until the stage list has loaded', () => {
      // Deliberate: the count must be right immediately rather than settling after mapData lands.
      expect(isTokenInQueue(tok({ currentstage: 'Anything' }), 'q1', [])).toBe(true);
    });

    it('treats null / undefined / false `delete` as not deleted', () => {
      expect(isTokenInQueue(tok({ delete: null }), 'q1', stages)).toBe(true);
      expect(isTokenInQueue(tok({ delete: false }), 'q1', stages)).toBe(true);
      expect(isTokenInQueue(tok({ delete: true }), 'q1', stages)).toBe(false);
    });

    it('DEFECT (pinned): `delete: 0` or `delete: ""` counts as DELETED', () => {
      // The check is an identity match against exactly [null, undefined, false]. Any other falsy
      // value — a 0 from a numeric flag, an '' from a cleared text field — drops the participant out
      // of EVERY planning number even though nothing ever soft-deleted them, and there is no error
      // and no row anywhere to notice it by.
      expect(isTokenInQueue(tok({ delete: 0 }), 'q1', stages)).toBe(false);
      expect(isTokenInQueue(tok({ delete: '' }), 'q1', stages)).toBe(false);
    });

    it('prefers mapQueue stages over the late-arriving mapData ones', () => {
      expect(queueStages({ q1: { stages: ['A'] } }, { q1: { stages: ['B'] } }, 'q1')).toEqual(['A']);
      expect(queueStages({}, { q1: { stages: ['B'] } }, 'q1')).toEqual(['B']);
      expect(queueStages({}, {}, 'q1')).toEqual([]);
    });

    it('collects DISTINCT holders across queues', () => {
      const q1 = [tok({ profile_id: 'a' }), tok({ profile_id: 'b' })];
      const q2 = [tok({ profile_id: 'b' }), tok({ profile_id: 'c' }), tok({ profile_id: '' })];
      expect([...holderIdsFrom([q1, q2])].sort()).toEqual(['a', 'b', 'c']);
    });

    it('filters a whole queue at once', () => {
      const tokens = [tok({ profile_id: 'a' }), tok({ profile_id: 'b', queueref: { id: 'q2' } })];
      expect(tokensForQueue(tokens, 'q1', stages).length).toBe(1);
    });
  });

  // ===============================================================================================
  // PLU-04 — slot confirmation and stage completion sets
  // ===============================================================================================
  describe('PLU-04 confirmation and completion sets', () => {
    const future = new Date(NOW + 86400000);
    const past = new Date(NOW - 86400000);

    it('counts a confirmed slot whose end is still ahead', () => {
      const tokens = [tok({ selectedstageslot: { 'Stage A': { slotconfirmation: true, enddate: ts(future) } } })];
      expect([...confirmedSlotSetForStage(tokens, 'Stage A', NOW)]).toEqual(['p1']);
    });

    it('drops a confirmed slot that has already finished', () => {
      const tokens = [tok({ selectedstageslot: { 'Stage A': { slotconfirmation: true, enddate: ts(past) } } })];
      expect(confirmedSlotSetForStage(tokens, 'Stage A', NOW).size).toBe(0);
    });

    it('drops a slot at exactly now (the comparison is strict >)', () => {
      const tokens = [tok({ selectedstageslot: { 'Stage A': { slotconfirmation: true, enddate: ts(new Date(NOW)) } } })];
      expect(confirmedSlotSetForStage(tokens, 'Stage A', NOW).size).toBe(0);
    });

    it('ignores an unconfirmed slot and a slot on another stage', () => {
      const tokens = [
        tok({ profile_id: 'a', selectedstageslot: { 'Stage A': { slotconfirmation: false, enddate: ts(future) } } }),
        tok({ profile_id: 'b', selectedstageslot: { 'Stage B': { slotconfirmation: true, enddate: ts(future) } } }),
      ];
      expect(confirmedSlotSetForStage(tokens, 'Stage A', NOW).size).toBe(0);
    });

    it('DEFECT (pinned): a CONFIRMED slot with no enddate is not counted at all', () => {
      // `if (end && end.getTime() > now)` — a missing or unparseable enddate fails the guard, so the
      // participant confirmed but shows up under "Not Confirmed". The organiser chases them for a
      // confirmation they already gave, and the confirmation-rate row understates reality.
      const tokens = [tok({ selectedstageslot: { 'Stage A': { slotconfirmation: true } } })];
      expect(confirmedSlotSetForStage(tokens, 'Stage A', NOW).size).toBe(0);
    });

    it('reads completions out of the dashboard map, accepting either id field', () => {
      const map = { q1: { 'Stage A': { any: [{ participantid: 'a' }, { profile_id: 'b' }, { nothing: 1 }] } } };
      expect([...completedSetForStage(map, 'q1', 'Stage A')].sort()).toEqual(['a', 'b']);
    });

    it('returns an empty set when the stage has no completion map', () => {
      expect(completedSetForStage({}, 'q1', 'Stage A').size).toBe(0);
      expect(completedSetForStage(null, 'q1', 'Stage A').size).toBe(0);
    });
  });

  // ===============================================================================================
  // PLU-05 — the seven cards
  // ===============================================================================================
  describe('PLU-05 headline cards', () => {
    const cards = (over: any = {}): CardDef[] => computeCards({
      holders: set('a', 'b', 'c'), approved: set('a', 'z'), potentialTotal: 9, type2Count: 4, ...over,
    });
    const val = (list: CardDef[], key: string) => list.find(c => c.key === key)!.value;

    it('counts distinct people, not tokens', () => {
      const list = cards();
      expect(val(list, 'inQueue')).toBe(3);
      expect(val(list, 'confEvent')).toBe(2);
      expect(val(list, 'confInQueue')).toBe(1);   // 'a'
      expect(val(list, 'notConfInQueue')).toBe(2); // 'b','c'
      expect(val(list, 'confNotInQueue')).toBe(1); // 'z'
      expect(val(list, 'potential')).toBe(9);
      expect(val(list, 'type2')).toBe(4);
    });

    it('keeps the two reconciling identities', () => {
      const list = cards();
      expect(val(list, 'confInQueue') + val(list, 'confNotInQueue')).toBe(val(list, 'confEvent'));
      expect(val(list, 'confInQueue') + val(list, 'notConfInQueue')).toBe(val(list, 'inQueue'));
    });

    it('renders the seven cards in order with their labels', () => {
      expect(cards().map(c => c.key)).toEqual(
        ['confEvent', 'inQueue', 'confInQueue', 'confNotInQueue', 'notConfInQueue', 'potential', 'type2']);
      expect(cards()[1].label).toBe('Total in the queue');
    });

    it('DEFECT (pinned): filtering people OUT of view re-counts them as "not in the queue"', () => {
      // `holders` arrives already narrowed by the journey / DFU / cohort filters, so anyone the
      // filter hid is counted in confNotInQueue. Here 'a' IS in the queue but was filtered out of
      // view, and the card claims they are missing from it. The identity above still holds, which is
      // exactly why nothing on the dashboard looks wrong.
      const unfiltered = cards({ holders: set('a') });
      const filtered = cards({ holders: set() });
      expect(val(unfiltered, 'confNotInQueue')).toBe(1); // just 'z'
      expect(val(filtered, 'confNotInQueue')).toBe(2);   // 'z' AND the hidden 'a'
    });

    it('potential = owners minus approved minus requested', () => {
      expect(potentialIds(set('a', 'b', 'c'), set('a'), set('b')).sort()).toEqual(['c']);
    });

    it('type #2 = potential, in a segment, not holding a token', () => {
      expect(type2Ids(['a', 'b', 'c'], set('a', 'b'), set('b'))).toEqual(['a']);
    });

    it('type #2 is empty when no segment membership has loaded', () => {
      expect(type2Ids(['a'], set(), set())).toEqual([]);
    });
  });

  // ===============================================================================================
  // PLU-06 — card drill-downs
  // ===============================================================================================
  describe('PLU-06 card drill-downs', () => {
    const input = { holders: set('a', 'b'), approved: set('a', 'z'), potential: ['p'], type2: ['t'] };

    it('each card drills into its own set', () => {
      expect(drillIds('confEvent', input).sort()).toEqual(['a', 'z']);
      expect(drillIds('inQueue', input).sort()).toEqual(['a', 'b']);
      expect(drillIds('confInQueue', input)).toEqual(['a']);
      expect(drillIds('confNotInQueue', input)).toEqual(['z']);
      expect(drillIds('notConfInQueue', input)).toEqual(['b']);
      expect(drillIds('type2', input)).toEqual(['t']);
    });

    it('no card selected drills into nothing', () => {
      expect(drillIds(null, input)).toEqual([]);
      expect(drillIds('unknownCard', input)).toEqual([]);
    });

    it('DEFECT (pinned): the Potential card counts one source and drills into another', () => {
      // computeCards() shows `potentialTotal`, a number the event data service computed, while
      // drillIds('potential') returns potentialIds(), derived here from the owner/approved/requested
      // sets. Nothing keeps them in step: the card can read 9 and open a list of 1 with no hint that
      // anything was dropped.
      const shown = computeCards({ holders: set(), approved: set(), potentialTotal: 9, type2Count: 0 })
        .find(c => c.key === 'potential')!.value;
      expect(shown).toBe(9);
      expect(drillIds('potential', input).length).toBe(1);
    });

    it('builds drill rows name-sorted, with confirmation and in-queue flags', () => {
      const rows = buildDrillRows(
        ['b', 'a'], { a: 'Zoe', b: 'Amy' }, { a: '111' },
        set('a'), set('a', 'b'), () => 'active');
      expect(rows.map(r => r.name)).toEqual(['Amy', 'Zoe']);
      expect(rows[1]).toEqual({ name: 'Zoe', phone: '111', status: 'Active', confirmed: true, inQueue: true });
    });

    it('falls back to the raw id when no name is known', () => {
      const rows = buildDrillRows(['ghost'], {}, {}, set(), set(), () => '');
      expect(rows[0].name).toBe('ghost');
      expect(rows[0].phone).toBe('');
      expect(rows[0].status).toBe('—');
    });
  });

  // ===============================================================================================
  // PLU-07 — the readiness matrix
  // ===============================================================================================
  describe('PLU-07 readiness matrix', () => {
    it('rolls up "all": every configured stage must be cleared', () => {
      expect(rollup([set('a'), set('a')], 'a', 'all')).toBe(true);
      expect(rollup([set('a'), set()], 'a', 'all')).toBe(false);
    });

    it('rolls up "any": one cleared stage is enough', () => {
      expect(rollup([set('a'), set()], 'a', 'any')).toBe(true);
      expect(rollup([set(), set()], 'a', 'any')).toBe(false);
    });

    it('complete and notComplete are exact complements over the same stages', () => {
      const c = ctx({ completedSetFor: () => set('done') });
      const stages = [stage('Stage A')];
      const rdComplete = ROW_DEFS.find(r => r.key === 'complete')!;
      const rdNot = ROW_DEFS.find(r => r.key === 'notComplete')!;
      expect(rowMatches(rdComplete, stages, 'done', c)).toBe(true);
      expect(rowMatches(rdNot, stages, 'done', c)).toBe(false);
      expect(rowMatches(rdNot, stages, 'other', c)).toBe(true);
    });

    it('slotConfirmed and slotNotConfirmed are complements too', () => {
      const c = ctx({ confirmedSlotSetFor: () => set('conf') });
      const stages = [stage('Stage A')];
      expect(rowMatches(ROW_DEFS.find(r => r.key === 'slotConfirmed')!, stages, 'conf', c)).toBe(true);
      expect(rowMatches(ROW_DEFS.find(r => r.key === 'slotNotConfirmed')!, stages, 'conf', c)).toBe(false);
    });

    it('DEFECT (pinned): a row with NO stages configured matches NOBODY', () => {
      // "Not Completed" then reads 0, which is indistinguishable on the table from "everybody has
      // finished". An unconfigured phase looks complete instead of looking unconfigured, and the
      // planner reads a green row as good news.
      const rdNot = ROW_DEFS.find(r => r.key === 'notComplete')!;
      expect(rowMatches(rdNot, [], 'anyone', ctx())).toBe(false);
    });

    it('counts each matching holder into its confirmed × status cell', () => {
      const row = buildMatrixRow(phase({ notComplete: [stage('Stage A')] }), ctx({
        holders: ['a', 'b', 'c'],
        approved: set('a'),
        statusOf: id => id === 'c' ? 'discontinued' : 'active',
      }));
      const cells = row.lines.find(l => l.key === 'notComplete')!.cells;
      expect(cells.c_a).toBe(1);  // 'a' — confirmed, active
      expect(cells.n_a).toBe(1);  // 'b' — not confirmed, active
      expect(cells.n_d).toBe(1);  // 'c' — not confirmed, discontinued
      expect(cells.total).toBe(3);
    });

    it('ignores stages belonging to a queue outside the current scope', () => {
      const row = buildMatrixRow(phase({ notComplete: [stage('Stage A', 'qOTHER')] }), ctx({ holders: ['a'] }));
      // The only configured stage is out of scope → the row has no stages → matches nobody.
      expect(row.lines.find(l => l.key === 'notComplete')!.cells.total).toBe(0);
      // …but the LINE still reports its full configured stage list, so the dropdown shows the pick.
      expect(row.lines.find(l => l.key === 'notComplete')!.stages.length).toBe(1);
    });

    it('leaves the derived rate row out of the per-holder counting', () => {
      const row = buildMatrixRow(phase({ confRate: [stage('Stage A')] }), ctx({ holders: ['a'] }));
      expect(row.lines.find(l => l.kind === 'rate')!.cells.total).toBe(0);
    });

    it('confirmation rate = slot confirmed ÷ not completed, rounded, 0 on a zero denominator', () => {
      const notComp = { ...emptyCells(), c_a: 4, total: 4 };
      const slotConf = { ...emptyCells(), c_a: 1, total: 1 };
      const rate = confirmationRateCells(notComp, slotConf);
      expect(rate.c_a).toBe(25);
      expect(rate.n_a).toBe(0); // 0/0
    });

    it('rounds the rate to the nearest whole percent', () => {
      const rate = confirmationRateCells({ ...emptyCells(), total: 3 }, { ...emptyCells(), total: 1 });
      expect(rate.total).toBe(33);
    });

    it('DEFECT (pinned): the confirmation rate is not bounded at 100%', () => {
      // The numerator and denominator are counted independently — someone who confirmed a slot AND
      // already completed the stage is in Slot Confirmed but not in Not Completed. The planning
      // table then prints rates above 100%, e.g. "150%", which no reader can interpret.
      const rate = confirmationRateCells({ ...emptyCells(), total: 2 }, { ...emptyCells(), total: 3 });
      expect(rate.total).toBe(150);
    });

    it('phase percentage is completion over the whole matrix population', () => {
      expect(phasePct(1, 4)).toBe(25);
      expect(phasePct(0, 0)).toBe(0);  // no population → 0, not NaN
      expect(phasePct(1, 3)).toBe(33); // rounded
    });

    it('bands the phase against its target', () => {
      expect(RISK_BAND_PCT).toBe(10);
      expect(phaseStatus(80, 80)).toBe('ontrack');   // >= is on track
      expect(phaseStatus(75, 80)).toBe('risk');      // within the 10-point band
      expect(phaseStatus(70, 80)).toBe('risk');      // exactly on the band edge
      expect(phaseStatus(69, 80)).toBe('behind');
      expect(phaseStatus(50, null)).toBe('none');
    });

    it('DEFECT (pinned): a target of 10 or less can never read "Behind"', () => {
      // The risk floor is `target - 10` with no clamp, so it goes to zero or negative and every
      // possible percentage lands in the risk band. A phase nobody has started reports "At risk"
      // instead of "Behind", and it never surfaces on a behind-schedule list.
      expect(phaseStatus(0, 5)).toBe('risk');
      expect(phaseStatus(0, 10)).toBe('risk');
      expect(phaseStatus(0, 11)).toBe('behind'); // one point higher and it works
    });

    it('labels the bands for the chip', () => {
      expect(phaseStatusLabel('ontrack')).toBe('On track');
      expect(phaseStatusLabel('risk')).toBe('At risk');
      expect(phaseStatusLabel('behind')).toBe('Behind');
      expect(phaseStatusLabel('none')).toBe('');
    });

    it('reports pct, target and population on the row', () => {
      const row = buildMatrixRow(phase({ complete: [stage('Stage A')] }, 50), ctx({
        holders: ['a', 'b'], completedSetFor: () => set('a'),
      }));
      expect(row.pct).toBe(50);
      expect(row.target).toBe(50);
      expect(row.status).toBe('ontrack');
      expect(row.pop).toBe(2);
    });

    it('treats an empty-string target as no target at all', () => {
      expect(buildMatrixRow(phase({}, ''), ctx()).target).toBeNull();
      expect(buildMatrixRow(phase({}, undefined), ctx()).target).toBeNull();
      expect(buildMatrixRow(phase({}, '60'), ctx()).target).toBe(60); // numeric strings coerce
    });

    it('cellIds returns the ids behind one cell, and the whole row for "total"', () => {
      const c = ctx({ holders: ['a', 'b'], approved: set('a'), statusOf: () => 'active' });
      const p = phase({ notComplete: [stage('Stage A')] });
      expect(cellIds(p, 'notComplete', 'total', c).sort()).toEqual(['a', 'b']);
      expect(cellIds(p, 'notComplete', 'c_a', c)).toEqual(['a']);
      expect(cellIds(p, 'notComplete', 'n_a', c)).toEqual(['b']);
      expect(cellIds(p, 'nosuchrow', 'total', c)).toEqual([]);
    });

    it('reads a phase\'s configured stages defensively', () => {
      expect(getRowStages(phase({ complete: [stage('X')] }), 'complete').length).toBe(1);
      expect(getRowStages(phase({}), 'complete')).toEqual([]);
      expect(getRowStages(null, 'complete')).toEqual([]);
    });

    it('ring dash renders the arc for a percentage', () => {
      expect(RING_CIRCUMFERENCE).toBe(163);
      expect(ringDash(0)).toBe('0 163');
      expect(ringDash(100)).toBe('163 163');
      expect(ringDash(50)).toBe('82 163'); // 81.5 rounds up
    });
  });

  // ===============================================================================================
  // PLU-08 — dates, slots and the event countdown
  // ===============================================================================================
  describe('PLU-08 dates and countdown', () => {
    it('coerces Timestamps, Dates and parseable strings; rejects the rest', () => {
      const d = new Date('2026-09-10T00:00:00Z');
      expect(toDate(ts(d))!.getTime()).toBe(d.getTime());
      expect(toDate(d)).toBe(d);
      expect(toDate('2026-09-10T00:00:00Z')!.getTime()).toBe(d.getTime());
      expect(toDate('not a date')).toBeNull();
      expect(toDate(null)).toBeNull();
      expect(toDate(0)).toBeNull(); // falsy short-circuit: epoch 0 is "no date"
    });

    it('counts down to the earliest event still ahead', () => {
      const events = [
        { id: 'past', start_date: ts(new Date(NOW - 1000)) },
        { id: 'soon', start_date: ts(new Date(NOW + 1000)) },
        { id: 'later', start_date: ts(new Date(NOW + 9000)) },
      ];
      expect(pickEventDate(events, ['past', 'soon', 'later'], NOW)!.getTime()).toBe(NOW + 1000);
    });

    it('falls back to the LATEST past event when they have all been and gone', () => {
      const events = [
        { id: 'old', start_date: ts(new Date(NOW - 9000)) },
        { id: 'recent', start_date: ts(new Date(NOW - 1000)) },
      ];
      expect(pickEventDate(events, ['old', 'recent'], NOW)!.getTime()).toBe(NOW - 1000);
    });

    it('has no date when nothing is selected or nothing is dated', () => {
      expect(pickEventDate([{ id: 'a', start_date: ts(new Date(NOW)) }], [], NOW)).toBeNull();
      expect(pickEventDate([{ id: 'a' }], ['a'], NOW)).toBeNull();
    });

    it('names the single selected event', () => {
      expect(eventNameFor([{ id: 'a', name: 'Summit' }], ['a'], NOW)).toBe('Summit');
      expect(eventNameFor([], [], NOW)).toBe('');
    });

    it('with several selected, names the one being counted down to', () => {
      const events = [
        { id: 'a', name: 'Later', start_date: ts(new Date(NOW + 9000)) },
        { id: 'b', name: 'Sooner', start_date: ts(new Date(NOW + 1000)) },
      ];
      expect(eventNameFor(events, ['a', 'b'], NOW)).toBe('Sooner');
    });

    it('falls back to "N events" when the selected events have no names', () => {
      const events = [{ id: 'a' }, { id: 'b' }];
      expect(eventNameFor(events, ['a', 'b'], NOW)).toBe('2 events');
    });

    it('counts whole days from midnight to midnight', () => {
      const today = new Date(2026, 8, 10, 23, 0);
      expect(daysToEvent(new Date(2026, 8, 10, 1, 0), today)).toBe(0);   // same day despite 22h apart
      expect(daysToEvent(new Date(2026, 8, 11, 1, 0), today)).toBe(1);
      expect(daysToEvent(new Date(2026, 8, 3, 1, 0), today)).toBe(-7);
      expect(daysToEvent(null, today)).toBeNull();
    });

    it('phrases the countdown', () => {
      expect(countdownLabel(5)).toBe('in 5 days');
      expect(countdownLabel(2)).toBe('in 2 days');
      expect(countdownLabel(1)).toBe('tomorrow');
      expect(countdownLabel(0)).toBe('today');
      expect(countdownLabel(-1)).toBe('yesterday');
      expect(countdownLabel(-3)).toBe('3 days ago');
      expect(countdownLabel(null)).toBe('');
    });

    it('formats a slot as date, start and end', () => {
      const out = formatSlot({ startdate: ts(new Date(2026, 8, 10, 14, 0)), enddate: ts(new Date(2026, 8, 10, 15, 0)) });
      expect(out.startsWith('Sep 10, ')).toBe(true);
      expect(out).toContain('–'); // en dash between the two times
    });

    it('formats a slot with no end as date and start only', () => {
      const out = formatSlot({ startdate: ts(new Date(2026, 8, 10, 14, 0)) });
      expect(out.startsWith('Sep 10, ')).toBe(true);
      expect(out).not.toContain('–');
    });

    it('a slot with no start formats as the empty string', () => {
      expect(formatSlot({})).toBe('');
      expect(formatSlot(null)).toBe('');
    });

    it('picks the first configured stage for which a dated slot exists', () => {
      const tokensFor = (q: string) => q === 'q1'
        ? [tok({ profile_id: 'p1', selectedstageslot: { 'Stage B': { startdate: ts(new Date(2026, 8, 10, 9, 0)) } } })]
        : [];
      const out = participantSlot('p1', [stage('Stage A'), stage('Stage B')], tokensFor);
      expect(out.startsWith('Sep 10, ')).toBe(true);
    });

    it('reads "—" when the participant picked no slot on any configured stage', () => {
      expect(participantSlot('p1', [stage('Stage A')], () => [])).toBe('—');
    });
  });

  // ===============================================================================================
  // PLU-09 — cell drill: which queue and stage a participant matched from
  // ===============================================================================================
  describe('PLU-09 participant queue and stage', () => {
    const tokensFor = (q: string) => q === 'qA'
      ? [tok({ profile_id: 'p1', currentstage: 'A1' })]
      : q === 'qB' ? [tok({ profile_id: 'p1', currentstage: 'B1' })] : [];
    const nameOf = (q: string) => 'Queue ' + q;

    it('prefers the queue this row\'s stages belong to', () => {
      const out = participantQueueStage('p1', ['qA', 'qB'], tokensFor, nameOf, set('qB'));
      expect(out).toEqual({ queueName: 'Queue qB', stage: 'B1' });
    });

    it('falls back to scope order when the preferred queue has no token', () => {
      const out = participantQueueStage('p1', ['qA', 'qB'], tokensFor, nameOf, set('qZ'));
      expect(out).toEqual({ queueName: 'Queue qA', stage: 'A1' });
    });

    it('dashes both fields when the participant holds no token in scope', () => {
      expect(participantQueueStage('ghost', ['qA'], tokensFor, nameOf))
        .toEqual({ queueName: '—', stage: '—' });
    });

    it('dashes a stage-less token rather than rendering undefined', () => {
      const out = participantQueueStage('p1', ['qX'], () => [tok({ profile_id: 'p1', currentstage: '' })], nameOf);
      expect(out.stage).toBe('—');
    });
  });

  // ===============================================================================================
  // PLU-10 — drill tables: search, chips, pagination
  // ===============================================================================================
  describe('PLU-10 drill tables', () => {
    const rows: DrillRow[] = [
      { name: 'Amy', phone: '111', status: 'Active', confirmed: true, inQueue: true },
      { name: 'Bob', phone: '222', status: 'Discontinued', confirmed: false, inQueue: true },
      { name: 'Cal', phone: '333', status: 'Non Active', confirmed: true, inQueue: false },
    ];

    it('no chips means everything passes', () => {
      expect(passesFilters(set(), { conf: 'yes' })).toBe(true);
    });

    it('chips of the same dimension OR together', () => {
      expect(passesFilters(set('st:a', 'st:d'), { st: 'd' })).toBe(true);
      expect(passesFilters(set('st:a', 'st:d'), { st: 'na' })).toBe(false);
    });

    it('chips of different dimensions AND together', () => {
      expect(passesFilters(set('st:a', 'conf:yes'), { st: 'a', conf: 'yes' })).toBe(true);
      expect(passesFilters(set('st:a', 'conf:yes'), { st: 'a', conf: 'no' })).toBe(false);
    });

    it('searches name and phone, case-insensitively', () => {
      expect(filterDrillRows(rows, 'am', set()).map(r => r.name)).toEqual(['Amy']);
      expect(filterDrillRows(rows, '222', set()).map(r => r.name)).toEqual(['Bob']);
      expect(filterDrillRows(rows, '  ', set()).length).toBe(3); // whitespace-only = no query
    });

    it('combines the search box with the chips', () => {
      expect(filterDrillRows(rows, '', set('conf:yes')).map(r => r.name)).toEqual(['Amy', 'Cal']);
      expect(filterDrillRows(rows, '', set('inq:out')).map(r => r.name)).toEqual(['Cal']);
      expect(filterDrillRows(rows, 'c', set('conf:no')).length).toBe(0);
    });

    it('the cell table filters on slot presence instead of in-queue', () => {
      const cellRows: CellDrillRow[] = [
        { name: 'Amy', phone: '', queueName: 'Q', stage: 'A', status: 'Active', confirmed: true, slot: 'Sep 10, 2:00 PM' },
        { name: 'Bob', phone: '', queueName: 'Q', stage: 'A', status: 'Active', confirmed: true, slot: '—' },
        { name: 'Cal', phone: '', queueName: 'Q', stage: 'A', status: 'Active', confirmed: true, slot: '' },
      ];
      expect(filterCellDrillRows(cellRows, '', set('slot:has')).map(r => r.name)).toEqual(['Amy']);
      // Both the em dash and the empty string count as "no slot".
      expect(filterCellDrillRows(cellRows, '', set('slot:none')).map(r => r.name)).toEqual(['Bob', 'Cal']);
    });

    it('toggling a chip adds then removes it, without mutating the original set', () => {
      const start = set('a:1');
      const added = toggleFilterToken(start, 'b:2');
      expect([...added].sort()).toEqual(['a:1', 'b:2']);
      expect([...toggleFilterToken(added, 'b:2')]).toEqual(['a:1']);
      expect([...start]).toEqual(['a:1']);
    });

    it('pages at 15 rows and never reports fewer than one page', () => {
      expect(PAGE_SIZE).toBe(15);
      expect(pageCount(0)).toBe(1);
      expect(pageCount(15)).toBe(1);
      expect(pageCount(16)).toBe(2);
    });

    it('slices the requested page', () => {
      const many = Array.from({ length: 20 }, (_, i) => i);
      expect(pageSlice(many, 0, 15).length).toBe(15);
      expect(pageSlice(many, 1, 15)).toEqual([15, 16, 17, 18, 19]);
      expect(pageSlice(many, 5, 15)).toEqual([]);
    });

    it('reports a 1-based row range, and 0..0 for an empty table', () => {
      expect(rangeStart(20, 0, 15)).toBe(1);
      expect(rangeEnd(20, 0, 15)).toBe(15);
      expect(rangeStart(20, 1, 15)).toBe(16);
      expect(rangeEnd(20, 1, 15)).toBe(20);
      expect(rangeStart(0, 0, 15)).toBe(0);
      expect(rangeEnd(0, 0, 15)).toBe(0);
    });

    it('clamps the page into a shrunken table and never below zero', () => {
      expect(clampPage(5, 20, 15)).toBe(1);
      expect(clampPage(0, 0, 15)).toBe(0);
      expect(prevPage(0)).toBe(0);
      expect(nextPage(0, 20, 15)).toBe(1);
      expect(nextPage(1, 20, 15)).toBe(1); // already on the last page
    });
  });

  // ===============================================================================================
  // PLU-11 — saved filters: signature, clone, diff
  // ===============================================================================================
  describe('PLU-11 saved filters', () => {
    const ph = (over: Partial<FilterPhase> = {}): FilterPhase => ({
      phasename: 'P1', targetPct: 50, rows: { notComplete: [stage('Stage A')] }, ...over,
    });

    it('signature ignores the ORDER of queues, events and stages', () => {
      const a = signature(['q1', 'q2'], ['e1', 'e2'], [ph({ rows: { notComplete: [stage('A'), stage('B')] } })]);
      const b = signature(['q2', 'q1'], ['e2', 'e1'], [ph({ rows: { notComplete: [stage('B'), stage('A')] } })]);
      expect(a).toBe(b);
    });

    it('signature changes when a target or a stage actually changes', () => {
      expect(signature([], [], [ph()])).not.toBe(signature([], [], [ph({ targetPct: 60 })]));
      expect(signature([], [], [ph()]))
        .not.toBe(signature([], [], [ph({ rows: { notComplete: [stage('Stage B')] } })]));
    });

    it('signature ignores derived rate rows entirely', () => {
      const withRate = ph({ rows: { notComplete: [stage('Stage A')], confRate: [stage('Noise')] } });
      expect(signature([], [], [withRate])).toBe(signature([], [], [ph()]));
    });

    it('a missing target and an explicit null signature the same', () => {
      expect(signature([], [], [ph({ targetPct: null })]))
        .toBe(signature([], [], [{ phasename: 'P1', rows: { notComplete: [stage('Stage A')] } } as any]));
    });

    it('cloneRows copies only queueid and stagename', () => {
      const out = cloneRows({ notComplete: [{ queueid: 'q1', stagename: 'A', extra: 1 } as any] });
      expect(out['notComplete']).toEqual([{ queueid: 'q1', stagename: 'A' }]);
      expect(cloneRows(undefined)).toEqual({});
    });

    it('cloneRows detaches the copy from the original', () => {
      const src = { notComplete: [stage('A')] };
      const out = cloneRows(src);
      out['notComplete'].push(stage('B'));
      expect(src.notComplete.length).toBe(1);
    });

    it('compares phase-stage options by queue + stage', () => {
      expect(comparePhaseStage(stage('A'), stage('A'))).toBe(true);
      expect(comparePhaseStage(stage('A'), stage('B'))).toBe(false);
      expect(comparePhaseStage(null, null)).toBe(true);
      expect(comparePhaseStage(stage('A'), null)).toBe(false);
    });

    it('clamps a typed target into 0..100 and keeps "no target" as null', () => {
      expect(clampTargetPct(150)).toBe(100);
      expect(clampTargetPct(-5)).toBe(0);
      expect(clampTargetPct('60')).toBe(60);
      expect(clampTargetPct('')).toBeNull();
      expect(clampTargetPct(null)).toBeNull();
    });

    const changeInput = (over: any = {}) => ({
      saveTitle: 'My filter',
      queueIds: ['q1'],
      eventIds: ['e1'],
      phases: [{ phasename: 'P1', targetPct: 50, rows: { notComplete: [stage('Stage A')] } }],
      queueNameOf: (q: string) => 'Queue ' + q,
      eventNameOf: (e: string) => 'Event ' + e,
      ...over,
    });

    it('a NEW filter lists everything that will be saved', () => {
      const lines = computeChanges(null, changeInput());
      expect(lines[0]).toBe('Queues: Queue q1');
      expect(lines[1]).toBe('Events: Event e1');
      expect(lines[2]).toBe('Phases: 1');
      expect(lines[3]).toBe('  Phase "P1" · target 50%');
      expect(lines[4]).toBe('     Not Completed: Stage A');
    });

    it('a NEW filter with nothing selected dashes the empty lines', () => {
      const lines = computeChanges(null, changeInput({ queueIds: [], eventIds: [], phases: [] }));
      expect(lines).toEqual(['Queues: —', 'Events: —', 'Phases: 0']);
    });

    const applied: PlanningFilter = {
      docid: 'f1', title: 'My filter', queueIds: ['q1'], eventIds: ['e1'],
      phases: [{ phasename: 'P1', targetPct: 50, rows: { notComplete: [stage('Stage A')] } }],
    };

    it('an UPDATE with nothing changed says so', () => {
      expect(computeChanges(applied, changeInput())).toEqual(['No changes']);
    });

    it('spells out a renamed title, added queues and removed events', () => {
      const lines = computeChanges(applied, changeInput({
        saveTitle: 'Renamed', queueIds: ['q1', 'q2'], eventIds: [],
      }));
      expect(lines).toContain('Title: "My filter" → "Renamed"');
      expect(lines).toContain('Queue added: Queue q2');
      expect(lines).toContain('Event removed: Event e1');
    });

    it('spells out a target change and per-row stage additions and removals', () => {
      const lines = computeChanges(applied, changeInput({
        phases: [{ phasename: 'P1', targetPct: 80, rows: { notComplete: [stage('Stage B')] } }],
      }));
      expect(lines).toContain('"P1" target: 50% → 80%');
      expect(lines).toContain('"P1" · Not Completed +Stage B');
      expect(lines).toContain('"P1" · Not Completed −Stage A');
    });

    it('reports an added phase in full and a removed phase by name', () => {
      const lines = computeChanges(applied, changeInput({
        phases: [{ phasename: 'P2', targetPct: null, rows: {} }],
      }));
      expect(lines).toContain('Added Phase "P2"');
      expect(lines).toContain('Phase removed: "P1"');
    });

    it('DEFECT (pinned): two phases with the SAME NAME collapse, hiding real edits', () => {
      // Old and new phases are matched through a Map keyed by phasename, so a duplicate name
      // overwrites its twin on both sides and only the LAST one is ever compared. Here the FIRST
      // "P1" changed target (50 → 99) and stage (A → Q) while the shadowing second one did not, and
      // the panel still reports "No changes" — it tells the planner nothing is different at the
      // exact moment their work is about to be written over.
      const dupApplied: PlanningFilter = {
        ...applied,
        phases: [
          { phasename: 'P1', targetPct: 50, rows: { notComplete: [stage('Stage A')] } },
          { phasename: 'P1', targetPct: 77, rows: { notComplete: [stage('Stage Z')] } },
        ],
      };
      const lines = computeChanges(dupApplied, changeInput({
        phases: [
          { phasename: 'P1', targetPct: 99, rows: { notComplete: [stage('Stage Q')] } },
          { phasename: 'P1', targetPct: 77, rows: { notComplete: [stage('Stage Z')] } },
        ],
      }));
      expect(lines).toEqual(['No changes']);
    });
  });
});
