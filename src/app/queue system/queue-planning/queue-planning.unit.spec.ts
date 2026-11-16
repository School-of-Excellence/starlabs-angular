// queue-planning.unit.spec.ts — unit tests for the Queue Planning screen's arithmetic.
//
// WHAT THESE PROTECT: the numbers and lists a queue admin plans slots against. Which planning rows a
// filter leaves on screen, how many people in a segment never joined the queue, who still has not
// confirmed a slot for a stage, which tokens are counted against a given slot, whether a slot already
// exists before another is created, and whether a saved draft comes back the way it went in. Slots get
// created and participants get chased on the strength of these.
//
// WHY THEY DID NOT EXIST BEFORE: queue-planning.component.ts is 3,029 lines, injects a Firestore, a
// Storage, an HttpClient, a MatDialog and an AuthguardService, and does its data loading inside the
// CONSTRUCTOR behind `guard.getRoles().then(...)`. The only spec it had was the 23-line Angular CLI
// `should create` stub. The component was rewritten across five commits between 2026-09-25 and
// 2026-11-03 (e7398263, fcc380ce, cc0cdf28, 3210a907, 854ad880) with no coverage added.
//
// HOW THE COMPONENT IS REACHED WITHOUT A BACKEND: AuthguardService is stubbed so `getRoles()` and
// `getProfileMap()` return promises that never settle, which leaves the constructor's whole data-loading
// body unreached. Firestore, Storage and HttpClient are provided as bare objects — nothing in the methods
// under test touches them. `detectChanges()` is never called, so the template never renders. State is then
// seeded directly onto the public fields, which is how a planner's screen actually looks mid-session.
//
// CASES MARKED "DEFECT (pinned)" assert behaviour that is WRONG, so the suite stays green and honest
// about what ships. Each says what the fix is. Fixing the code turns the pinned case red — that is the
// point: it is a reminder to come back here, not a passing grade.
//
// THE CLOCK IS NOT FROZEN because none of these methods read `now` — every date is an explicit argument
// or seeded state.
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';

import { AuthguardService } from '../../authguard.service';
import { QueuePlanningComponent } from './queue-planning.component';

// A Firestore Timestamp is only ever read through `.toDate()` here, so that is all the double needs.
const ts = (d: Date) => ({ toDate: () => d });

const never = () => new Promise<any>(() => {});

function makeComponent(): QueuePlanningComponent {
  TestBed.configureTestingModule({
    imports: [QueuePlanningComponent],
    providers: [
      { provide: AuthguardService, useValue: { getRoles: never, getProfileMap: never } },
      { provide: Firestore, useValue: {} },
      { provide: Storage, useValue: {} },
      { provide: HttpClient, useValue: {} },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => {} }) }) } },
    ],
  });
  // No detectChanges: the class is what is under test, not the template.
  return TestBed.createComponent(QueuePlanningComponent).componentInstance;
}

/** A planning row with one stage holding one dated slot. */
function row(over: any = {}): any {
  return {
    id: 'r1',
    selectedSegment: 's1',
    selectedVariation: 'v1',
    stageData: {},
    ...over,
  };
}

/** One entry in a row's `stageData[stage].dates`. */
function slot(over: any = {}): any {
  return {
    title: null,
    description: null,
    startdate: new Date(2026, 10, 10, 9, 0),
    enddate: new Date(2026, 10, 10, 17, 0),
    starttime: '09:00',
    endtime: '17:00',
    maxslot: 10,
    usedslot: 0,
    bigparticipants: [],
    participants: [],
    ...over,
  };
}

describe('QueuePlanningComponent (unit)', () => {
  let c: QueuePlanningComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    c = makeComponent();
  });

  // ===============================================================================================
  // QPL-01 — time conversion at the slot-editing boundary
  // ===============================================================================================
  describe('QPL-01 time conversion', () => {
    it('formats a Date as zero-padded 24-hour "HH:mm"', () => {
      expect(c.formatTimeTo24Hour(new Date(2026, 10, 10, 9, 5))).toBe('09:05');
      expect(c.formatTimeTo24Hour(new Date(2026, 10, 10, 23, 59))).toBe('23:59');
      expect(c.formatTimeTo24Hour(new Date(2026, 10, 10, 0, 0))).toBe('00:00');
    });

    it('turns midnight into 12 AM and noon into 12 PM, not 00 and 00', () => {
      expect(c.formatTimeTo12Hour('00:00')).toBe('12:00 AM');
      expect(c.formatTimeTo12Hour('12:00')).toBe('12:00 PM');
      expect(c.formatTimeTo12Hour('12:30')).toBe('12:30 PM');
    });

    it('formats afternoon and morning times either side of noon', () => {
      expect(c.formatTimeTo12Hour('13:05')).toBe('01:05 PM');
      expect(c.formatTimeTo12Hour('09:00')).toBe('09:00 AM');
      expect(c.formatTimeTo12Hour('23:59')).toBe('11:59 PM');
    });

    it('reads an empty time as the empty string rather than "NaN:NaN"', () => {
      expect(c.formatTimeTo12Hour('')).toBe('');
      expect(c.formatTimeTo12Hour(null)).toBe('');
    });

    it('combines a date and a "HH:mm" into one Date, zeroing seconds', () => {
      const out = c.combineDateAndTime(new Date(2026, 10, 10, 23, 59, 58, 999), '09:30');
      expect(out.getFullYear()).toBe(2026);
      expect(out.getMonth()).toBe(10);
      expect(out.getDate()).toBe(10);
      expect(out.getHours()).toBe(9);
      expect(out.getMinutes()).toBe(30);
      expect(out.getSeconds()).toBe(0);
      expect(out.getMilliseconds()).toBe(0);
    });

    it('does not mutate the date it was handed', () => {
      const original = new Date(2026, 10, 10, 23, 59);
      c.combineDateAndTime(original, '09:30');
      expect(original.getHours()).toBe(23);
      expect(original.getMinutes()).toBe(59);
    });

    it('returns null when either half is missing', () => {
      expect(c.combineDateAndTime(null, '09:30')).toBeNull();
      expect(c.combineDateAndTime(new Date(2026, 10, 10), '')).toBeNull();
      expect(c.combineDateAndTime(new Date(2026, 10, 10), null)).toBeNull();
    });
  });

  // ===============================================================================================
  // QPL-02 — which tokens count against a slot
  //
  // This is where the 854ad880 rename lands. `queue-planning-review.component.ts` writes the booked
  // slot under `bookedslot` (lines 5400, 5566) and six readers were migrated to match, but this
  // component was not: it still reads `token.selectedstageslot`.
  // ===============================================================================================
  describe('QPL-02 participants for a slot', () => {
    const start = new Date(2026, 10, 10, 9, 0);
    const end = new Date(2026, 10, 10, 17, 0);

    function tokenWith(field: string): any {
      return {
        docid: 't1',
        profile_id: 'p1',
        variationid: 'v1',
        currentstage: 'Stage A',
        [field]: { 'Stage A': { segmentid: 's1', stagename: 'Stage A', startdate: start, enddate: end } },
      };
    }

    // TARGET (red until the fix lands): `bookedslot` is the field queue-planning-review writes and
    // that planning.engine.ts, studio v2, dynamic-queue-manager-clone, QueueWebVersion1 and
    // events-stage-data all read. This component still reads `selectedstageslot`, which nothing has
    // written since 854ad880. FIX: point the 5 reads (lines 642, 957-959, 1398, 2762) at `bookedslot`.
    it('counts a token booked under `bookedslot`', () => {
      c.queueTokenList = [tokenWith('bookedslot')];
      const out = c.getParticipantsForSlot('v1', 's1', 'Stage A', start, end);
      expect(out.length).toBe(1);
      expect(out[0].docid).toBe('t1');
    });

    // Legacy-only tokens (`selectedstageslot` and no `bookedslot`) are deliberately NOT asserted
    // either way. Whether the fix reads the old name as a fallback or the data is backfilled is the
    // fixer's call with Dharshan; pinning one answer here would pre-empt that decision.

    it('matches a slot whose dates arrive as Firestore Timestamps', () => {
      const token = tokenWith('bookedslot');
      token.bookedslot['Stage A'].startdate = ts(start);
      token.bookedslot['Stage A'].enddate = ts(end);
      c.queueTokenList = [token];
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', start, end).length).toBe(1);
    });

    it('ignores a token on a different variation, segment or stage', () => {
      const other = tokenWith('bookedslot');
      other.variationid = 'v2';
      c.queueTokenList = [other];
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', start, end)).toEqual([]);

      c.queueTokenList = [tokenWith('bookedslot')];
      expect(c.getParticipantsForSlot('v1', 's9', 'Stage A', start, end)).toEqual([]);
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage Z', start, end)).toEqual([]);
    });

    it('ignores a slot that starts or ends one minute off', () => {
      c.queueTokenList = [tokenWith('bookedslot')];
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', new Date(2026, 10, 10, 9, 1), end)).toEqual([]);
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', start, new Date(2026, 10, 10, 17, 1))).toEqual([]);
    });

    it('returns nothing when either end of the window is missing or unparseable', () => {
      c.queueTokenList = [tokenWith('bookedslot')];
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', null, end)).toEqual([]);
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', start, null)).toEqual([]);
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', new Date('nonsense'), end)).toEqual([]);
    });

    it('survives an unset token list', () => {
      c.queueTokenList = null;
      expect(c.getParticipantsForSlot('v1', 's1', 'Stage A', start, end)).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPL-03 — who has not confirmed a slot
  //
  // The gate: a token counts as "should have confirmed" when its current stage sits at or before the
  // stage being asked about, and after the most recent EARLIER stage that has slots planned.
  // ===============================================================================================
  describe('QPL-03 non-confirmed participants', () => {
    const start = new Date(2026, 10, 10, 9, 0);
    const end = new Date(2026, 10, 10, 17, 0);

    beforeEach(() => {
      c.queueStages = ['Stage A', 'Stage B', 'Stage C'];
      c.queueVariationList = [{ id: 'v1', stages: ['Stage A', 'Stage B', 'Stage C'] }];
      c.planningRows = [];
    });

    const tok = (over: any = {}) => ({ docid: 't1', profile_id: 'p1', variationid: 'v1', currentstage: 'Stage A', ...over });

    it('lists a token sitting at or before the stage with no slot booked', () => {
      c.queueTokenList = [tok({ currentstage: 'Stage A' })];
      const out = c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end);
      expect(out.length).toBe(1);
      expect(out[0].docid).toBe('t1');
    });

    it('drops a token whose current stage is past the stage asked about', () => {
      c.queueTokenList = [tok({ currentstage: 'Stage C' })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('drops a token that is standing on the stage itself', () => {
      // `isOnThisStage` — someone currently being served does not need chasing.
      c.queueTokenList = [tok({ currentstage: 'Stage B' })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('drops a token holding ANY slot for that stage, whatever its dates', () => {
      c.queueTokenList = [tok({
        currentstage: 'Stage A',
        bookedslot: { 'Stage B': { startdate: new Date(2030, 0, 1), enddate: new Date(2030, 0, 2) } },
      })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    // TARGET (red until the fix lands): line 642 reads `token.selectedstageslot`, so
    // `hasSelectedAnySlotForThisStage` is always false and the "Not Confirmed" panel lists people who
    // HAVE booked. FIX: read `bookedslot`.
    it('does not chase a token booked under `bookedslot`', () => {
      c.queueTokenList = [tok({
        currentstage: 'Stage A',
        bookedslot: { 'Stage B': { startdate: start, enddate: end } },
      })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('narrows the window to tokens past the last earlier stage that has slots planned', () => {
      // Stage A has slots, so only tokens that have moved beyond Stage A are expected to confirm for B.
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: [], dates: [slot()] } } })];
      c.queueTokenList = [
        tok({ docid: 'still-on-a', currentstage: 'Stage A' }),
        tok({ docid: 'moved-to-b', profile_id: 'p2', currentstage: 'Stage B' }),
      ];
      // 'still-on-a' is at the last stage with slots, not past it; 'moved-to-b' is on the stage itself.
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('only counts an earlier stage as "has slots" when a row for THIS variation carries dates', () => {
      c.planningRows = [row({ selectedVariation: 'v2', stageData: { 'Stage A': { cohortIds: [], dates: [slot()] } } })];
      c.queueTokenList = [tok({ currentstage: 'Stage A' })];
      // The Stage A slots belong to another variation, so the window stays wide open and Stage A counts.
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end).length).toBe(1);
    });

    it('treats an earlier stage with an empty dates array as having no slots', () => {
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: [], dates: [] } } })];
      c.queueTokenList = [tok({ currentstage: 'Stage A' })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end).length).toBe(1);
    });

    it('ignores a token on another variation', () => {
      c.queueTokenList = [tok({ variationid: 'v2' })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('ignores a token whose current stage is not in the configured stage list', () => {
      c.queueTokenList = [tok({ currentstage: 'Retired Stage' })];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('returns nothing when the variation does not run that stage', () => {
      c.queueVariationList = [{ id: 'v1', stages: ['Stage A'] }];
      c.queueTokenList = [tok()];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('returns nothing for an unknown stage or an unknown variation', () => {
      c.queueTokenList = [tok()];
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage Z', start, end)).toEqual([]);
      expect(c.getNonConfirmedParticipants('v9', 's1', 'Stage B', start, end)).toEqual([]);
    });

    it('returns nothing when any argument is blank', () => {
      c.queueTokenList = [tok()];
      expect(c.getNonConfirmedParticipants('', 's1', 'Stage B', start, end)).toEqual([]);
      expect(c.getNonConfirmedParticipants('v1', '', 'Stage B', start, end)).toEqual([]);
      expect(c.getNonConfirmedParticipants('v1', 's1', '', start, end)).toEqual([]);
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', null, end)).toEqual([]);
      expect(c.getNonConfirmedParticipants('v1', 's1', 'Stage B', start, null)).toEqual([]);
    });

    it('DEFECT (pinned): the segmentId argument gates the call but never filters anything', () => {
      // `segmentId` is only read by the blank-argument guard at the top. Two segments on the same
      // variation and stage therefore return the SAME list, so a per-segment "Not Confirmed" count is
      // really a per-variation count. FIX: filter the tokens by segment, or drop the parameter.
      c.queueTokenList = [tok()];
      const a = c.getNonConfirmedParticipants('v1', 'segment-a', 'Stage B', start, end);
      const b = c.getNonConfirmedParticipants('v1', 'segment-b', 'Stage B', start, end);
      expect(a.length).toBe(1);
      expect(b.length).toBe(1);
    });

    it('counts the same list the panel shows', () => {
      c.queueTokenList = [tok(), tok({ docid: 't2', profile_id: 'p2' })];
      expect(c.getNonConfirmedCount('v1', 's1', 'Stage B', start, end)).toBe(2);
    });
  });

  // ===============================================================================================
  // QPL-04 — B!G cohort planner slots and the duplicate-slot check
  //
  // These read `cohortQueuePlannerList[].selectedslots`, which 854ad880 did NOT touch, so they are
  // unaffected by the rename.
  // ===============================================================================================
  describe('QPL-04 planner slots', () => {
    const start = new Date(2026, 10, 10, 9, 0);
    const end = new Date(2026, 10, 10, 17, 0);

    const planner = (over: any = {}) => ({
      docid: 'c1',
      selectedslots: [{ stagename: 'Stage A', variationid: 'v1', segmentid: 's1', startdate: start, enddate: end }],
      ...over,
    });

    it('returns the planner with the matching slot attached', () => {
      c.cohortQueuePlannerList = [planner()];
      const out = c.getBigParticipantsForSlot('v1', 's1', 'Stage A', start, end);
      expect(out.length).toBe(1);
      expect(out[0].docid).toBe('c1');
      expect(out[0].slotInfo.stagename).toBe('Stage A');
    });

    it('matches a planner slot whose dates are Firestore Timestamps', () => {
      c.cohortQueuePlannerList = [planner({
        selectedslots: [{ stagename: 'Stage A', variationid: 'v1', segmentid: 's1', startdate: ts(start), enddate: ts(end) }],
      })];
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage A', start, end).length).toBe(1);
    });

    it('returns one entry per matching slot when a planner holds several', () => {
      c.cohortQueuePlannerList = [planner({
        selectedslots: [
          { stagename: 'Stage A', variationid: 'v1', segmentid: 's1', startdate: start, enddate: end },
          { stagename: 'Stage A', variationid: 'v1', segmentid: 's1', startdate: start, enddate: end },
        ],
      })];
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage A', start, end).length).toBe(2);
    });

    it('requires all five keys to line up', () => {
      c.cohortQueuePlannerList = [planner()];
      expect(c.getBigParticipantsForSlot('v2', 's1', 'Stage A', start, end)).toEqual([]);
      expect(c.getBigParticipantsForSlot('v1', 's2', 'Stage A', start, end)).toEqual([]);
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage B', start, end)).toEqual([]);
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage A', new Date(2026, 10, 11, 9, 0), end)).toEqual([]);
    });

    it('survives a planner with no slots and an unset list', () => {
      c.cohortQueuePlannerList = [planner({ selectedslots: undefined })];
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage A', start, end)).toEqual([]);
      c.cohortQueuePlannerList = null;
      expect(c.getBigParticipantsForSlot('v1', 's1', 'Stage A', start, end)).toEqual([]);
    });

    it('finds an already-planned slot so a duplicate is not created', () => {
      c.cohortQueuePlannerList = [planner()];
      expect(c.checkSlot('v1', 's1', 'Stage A', start, end)).toBeTruthy();
      expect(c.checkSlot('v1', 's1', 'Stage A', start, end).stagename).toBe('Stage A');
    });

    it('accepts ISO strings for the window it is asked about', () => {
      c.cohortQueuePlannerList = [planner()];
      expect(c.checkSlot('v1', 's1', 'Stage A', start.toISOString(), end.toISOString())).toBeTruthy();
    });

    it('reads null when no slot matches or the window is unusable', () => {
      c.cohortQueuePlannerList = [planner()];
      expect(c.checkSlot('v1', 's1', 'Stage B', start, end)).toBeNull();
      expect(c.checkSlot('v1', 's1', 'Stage A', null, end)).toBeNull();
      expect(c.checkSlot('v1', 's1', 'Stage A', 'nonsense', end)).toBeNull();
    });

    it('DEFECT (pinned): checkSlot cannot read a planner slot stored as a Timestamp', () => {
      // `checkSlot`'s own `toTime` calls `new Date(d)` without the `.toDate()` branch that
      // `getBigParticipantsForSlot` has, so a Timestamp becomes NaN and never matches. A slot read
      // straight from Firestore is therefore invisible to the duplicate check, and a second identical
      // slot can be created over it. FIX: unwrap `.toDate()` in checkSlot's toTime as well.
      c.cohortQueuePlannerList = [planner({
        selectedslots: [{ stagename: 'Stage A', variationid: 'v1', segmentid: 's1', startdate: ts(start), enddate: ts(end) }],
      })];
      expect(c.checkSlot('v1', 's1', 'Stage A', start, end)).toBeNull();
    });
  });

  // ===============================================================================================
  // QPL-05 — the planning-row filter bar
  // ===============================================================================================
  describe('QPL-05 row filtering', () => {
    beforeEach(() => {
      c.queueStages = ['Stage A'];
      c.segmentList = [
        { id: 's1', segmentname: 'Alpha Cohort', tagids: ['t1'], participantlistid: ['l1'] },
        { id: 's2', segmentname: 'Beta Cohort', tagids: ['t2'], participantlistid: ['l2'] },
      ];
      c.planningRows = [
        row({ id: 'r1', selectedSegment: 's1', stageData: { 'Stage A': { cohortIds: [], dates: [slot()] } } }),
        row({ id: 'r2', selectedSegment: 's2', stageData: { 'Stage A': { cohortIds: [], dates: [slot()] } } }),
      ];
    });

    it('keeps every row when no filter is set', () => {
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1', 'r2']);
      expect(c.hasActiveFilters()).toBe(false);
    });

    it('matches a segment name case-insensitively on a substring', () => {
      c.filterSegmentSearch = 'alpha';
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1']);
      c.filterSegmentSearch = 'COHORT';
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1', 'r2']);
    });

    it('filters by tag and by participant list', () => {
      c.filterSelectedTags = ['t2'];
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r2']);
      c.filterSelectedTags = [];
      c.filterSelectedLists = ['l1'];
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1']);
    });

    it('drops a row whose segment carries no tags or lists at all', () => {
      c.segmentList = [{ id: 's1', segmentname: 'Alpha Cohort' }];
      c.filterSelectedTags = ['t1'];
      expect(c.getFilteredPlanningRows()).toEqual([]);
    });

    it('keeps a row when any one of several selected tags matches', () => {
      c.filterSelectedTags = ['t1', 't9'];
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1']);
    });

    it('keeps a row whose slot OVERLAPS the date window, not only one inside it', () => {
      // matchesStart: slotEnd >= filterDateStart; matchesEnd: slotStart <= filterDateEnd.
      c.filterDateStart = new Date(2026, 10, 10, 16, 0);
      c.filterDateEnd = new Date(2026, 10, 11, 0, 0);
      expect(c.getFilteredPlanningRows().length).toBe(2);
    });

    it('drops a row whose only slot finishes before the window opens', () => {
      c.filterDateStart = new Date(2026, 10, 11, 0, 0);
      expect(c.getFilteredPlanningRows()).toEqual([]);
    });

    it('drops a row whose only slot starts after the window closes', () => {
      c.filterDateEnd = new Date(2026, 10, 9, 0, 0);
      expect(c.getFilteredPlanningRows()).toEqual([]);
    });

    it('drops a row with no dated slots once a date filter is on', () => {
      c.planningRows = [row({ id: 'r1', stageData: { 'Stage A': { cohortIds: [], dates: [] } } })];
      c.filterDateStart = new Date(2026, 10, 1);
      expect(c.getFilteredPlanningRows()).toEqual([]);
    });

    it('ignores a slot missing either end of its own range', () => {
      c.planningRows = [row({ id: 'r1', stageData: { 'Stage A': { cohortIds: [], dates: [slot({ enddate: null })] } } })];
      c.filterDateStart = new Date(2026, 10, 1);
      expect(c.getFilteredPlanningRows()).toEqual([]);
    });

    it('applies every active filter together', () => {
      c.filterSegmentSearch = 'cohort';
      c.filterSelectedTags = ['t1'];
      c.filterSelectedLists = ['l1'];
      c.filterDateStart = new Date(2026, 10, 10, 0, 0);
      c.filterDateEnd = new Date(2026, 10, 10, 23, 0);
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['r1']);
    });

    it('DEFECT (pinned): a row with no segment slips past the segment, tag and list filters', () => {
      // Each of those three blocks is guarded by `&& row.selectedSegment`, so a half-filled row — the
      // state right after "Add row" — is never filtered out and sits in a filtered view it does not
      // match. FIX: drop rows with no segment once any segment-based filter is on.
      c.planningRows = [row({ id: 'blank', selectedSegment: null, stageData: {} })];
      c.filterSegmentSearch = 'alpha';
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['blank']);
      c.filterSegmentSearch = '';
      c.filterSelectedTags = ['t1'];
      expect(c.getFilteredPlanningRows().map(r => r.id)).toEqual(['blank']);
    });

    it('reports an active filter for each control and clears all of them together', () => {
      c.filterSegmentSearch = 'a';
      expect(c.hasActiveFilters()).toBe(true);
      c.filterSegmentSearch = '';
      c.filterSelectedTags = ['t1'];
      expect(c.hasActiveFilters()).toBe(true);
      c.filterSelectedTags = [];
      c.filterSelectedLists = ['l1'];
      expect(c.hasActiveFilters()).toBe(true);
      c.filterSelectedLists = [];
      c.filterDateStart = new Date();
      expect(c.hasActiveFilters()).toBe(true);
      c.filterDateEnd = new Date();

      c.filterSegmentSearch = 'a';
      c.filterSelectedTags = ['t1'];
      c.filterSelectedLists = ['l1'];
      c.clearAllFilters();
      expect(c.hasActiveFilters()).toBe(false);
      expect(c.filterSegmentSearch).toBe('');
      expect(c.filterDateStart).toBeNull();
      expect(c.filterDateEnd).toBeNull();
      expect(c.filterSelectedTags).toEqual([]);
      expect(c.filterSelectedLists).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPL-06 — the draft round-trip
  //
  // saveDraft() stores serializePlanningRows() and loadDraftFromFirestore() replays it through
  // deserializePlanningRows(). Anything the pair drops is lost from a recovered draft.
  // ===============================================================================================
  describe('QPL-06 draft serialization', () => {
    it('carries dates out as ISO strings and back as Dates', () => {
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: ['c1'], dates: [slot()] } } })];
      const saved = c.serializePlanningRows();
      expect(saved[0].stageData['Stage A'].dates[0].startdate).toBe(new Date(2026, 10, 10, 9, 0).toISOString());

      const back = c.deserializePlanningRows(JSON.parse(JSON.stringify(saved)));
      const date = back[0].stageData['Stage A'].dates[0];
      expect(date.startdate instanceof Date).toBe(true);
      expect(date.startdate.getTime()).toBe(new Date(2026, 10, 10, 9, 0).getTime());
      expect(date.enddate.getTime()).toBe(new Date(2026, 10, 10, 17, 0).getTime());
    });

    it('keeps the row identity, segment, variation and cohorts', () => {
      c.planningRows = [row({ id: 'r9', selectedSegment: 's9', selectedVariation: 'v9', stageData: { 'Stage A': { cohortIds: ['c1', 'c2'], dates: [slot()] } } })];
      const back = c.deserializePlanningRows(JSON.parse(JSON.stringify(c.serializePlanningRows())));
      expect(back[0].id).toBe('r9');
      expect(back[0].selectedSegment).toBe('s9');
      expect(back[0].selectedVariation).toBe('v9');
      expect(back[0].stageData['Stage A'].cohortIds).toEqual(['c1', 'c2']);
    });

    it('empties the participant lists on purpose — they are re-derived from tokens', () => {
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: [], dates: [slot({ participants: [{ p: 1 }], bigparticipants: [{ b: 1 }] })] } } })];
      const saved = c.serializePlanningRows();
      expect(saved[0].stageData['Stage A'].dates[0].participants).toEqual([]);
      expect(saved[0].stageData['Stage A'].dates[0].bigparticipants).toEqual([]);
    });

    it('carries a null date through as null rather than inventing one', () => {
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: [], dates: [slot({ startdate: null, enddate: null })] } } })];
      const saved = c.serializePlanningRows();
      expect(saved[0].stageData['Stage A'].dates[0].startdate).toBeNull();
      const back = c.deserializePlanningRows(saved);
      expect(back[0].stageData['Stage A'].dates[0].startdate).toBeNull();
    });

    it('fills missing times and counts with the screen defaults on the way back', () => {
      const back = c.deserializePlanningRows([{ id: 'r1', selectedSegment: 's1', selectedVariation: 'v1', stageData: { 'Stage A': { dates: [{}] } } }]);
      const date = back[0].stageData['Stage A'].dates[0];
      expect(date.starttime).toBe('09:00');
      expect(date.endtime).toBe('17:00');
      expect(date.maxslot).toBe(0);
      expect(date.usedslot).toBe(0);
      expect(back[0].stageData['Stage A'].cohortIds).toEqual([]);
    });

    it('survives a stage that holds no dates and several stages at once', () => {
      c.planningRows = [row({ stageData: { 'Stage A': { cohortIds: [], dates: [] }, 'Stage B': { cohortIds: [], dates: [slot()] } } })];
      const back = c.deserializePlanningRows(JSON.parse(JSON.stringify(c.serializePlanningRows())));
      expect(back[0].stageData['Stage A'].dates).toEqual([]);
      expect(back[0].stageData['Stage B'].dates.length).toBe(1);
    });

    it('DEFECT (pinned): every appointment field is dropped from a saved draft', () => {
      // fcc380ce and 3210a907 added slottype, availabilityid, hostref, appointmentref, bookedby, docid,
      // title and description to a slot, but serializePlanningRows names its fields one by one and was
      // never updated — it has not changed since the repo's first commit. An appointment slot therefore
      // comes back out of a draft as a plain queue slot with no host and no appointment, silently.
      // FIX: carry those fields through both halves of the pair.
      c.planningRows = [row({
        stageData: {
          'Stage A': {
            cohortIds: [],
            dates: [slot({
              docid: 'd1',
              slottype: 'appointment',
              availabilityid: 'a1',
              hostref: { id: 'h1' },
              appointmentref: { id: 'ap1' },
              bookedby: { id: 'b1' },
              title: 'Coaching call',
              description: 'with the specialist',
            })],
          },
        },
      })];
      const saved = c.serializePlanningRows()[0].stageData['Stage A'].dates[0];
      expect(saved.slottype).toBeUndefined();
      expect(saved.availabilityid).toBeUndefined();
      expect(saved.hostref).toBeUndefined();
      expect(saved.appointmentref).toBeUndefined();
      expect(saved.bookedby).toBeUndefined();
      expect(saved.docid).toBeUndefined();
      expect(saved.title).toBeUndefined();
      expect(saved.description).toBeUndefined();
    });
  });

  // ===============================================================================================
  // QPL-07 — the multi-segment slot dialog's save gate
  // ===============================================================================================
  describe('QPL-07 multi-slot validation', () => {
    beforeEach(() => {
      c.editingStageName = 'Stage A';
      c.multiSlotData = { selectedSegments: ['s1'] };
      c.editingDateEntry = {
        startdate: new Date(2026, 10, 10),
        enddate: new Date(2026, 10, 10),
        starttime: '09:00',
        endtime: '17:00',
        maxslot: 10,
      };
    });

    it('accepts a fully filled dialog', () => {
      expect(c.isMultiSlotDataValid()).toBe(true);
    });

    it('accepts a maxslot of zero — unlimited is a real choice', () => {
      c.editingDateEntry.maxslot = 0;
      expect(c.isMultiSlotDataValid()).toBe(true);
    });

    it('rejects a negative maxslot', () => {
      c.editingDateEntry.maxslot = -1;
      expect(c.isMultiSlotDataValid()).toBe(false);
    });

    it('rejects a dialog with no stage and one with no segments', () => {
      c.editingStageName = null;
      expect(c.isMultiSlotDataValid()).toBe(false);
      c.editingStageName = 'Stage A';
      c.multiSlotData.selectedSegments = [];
      expect(c.isMultiSlotDataValid()).toBe(false);
    });

    it('rejects a missing date or a missing time on either end', () => {
      for (const field of ['startdate', 'enddate', 'starttime', 'endtime']) {
        const keep = c.editingDateEntry[field];
        c.editingDateEntry[field] = null;
        expect(c.isMultiSlotDataValid()).withContext(field).toBe(false);
        c.editingDateEntry[field] = keep;
      }
    });

    it('survives an unset selectedSegments', () => {
      c.multiSlotData = {};
      expect(c.isMultiSlotDataValid()).toBe(false);
    });
  });

  // ===============================================================================================
  // QPL-08 — how many people in a segment never joined the queue
  // ===============================================================================================
  describe('QPL-08 non-selected participant count', () => {
    beforeEach(() => {
      c.selectedQueue = { id: 'q1' };
      c.segmentList = [{ id: 's1', participantlistid: ['l1', 'l2'] }];
      c.participantListsList = [
        { docid: 'l1', profilelist: ['p1', 'p2'] },
        { docid: 'l2', profilelist: ['p3'] },
      ];
      c.queueTokenList = [{ profile_id: 'p1' }];
    });

    it('counts the union of the segment lists minus whoever holds a token', () => {
      expect(c.getNonSelectedCount('s1')).toBe(2);
    });

    it('counts a member appearing on two lists once', () => {
      c.participantListsList = [
        { docid: 'l1', profilelist: ['p1', 'p2'] },
        { docid: 'l2', profilelist: ['p2'] },
      ];
      expect(c.getNonSelectedCount('s1')).toBe(1);
    });

    it('reads zero once everyone on the lists holds a token', () => {
      c.queueTokenList = [{ profile_id: 'p1' }, { profile_id: 'p2' }, { profile_id: 'p3' }];
      expect(c.getNonSelectedCount('s1')).toBe(0);
    });

    it('ignores a token with no profile_id', () => {
      c.queueTokenList = [{ profile_id: null }, {}];
      expect(c.getNonSelectedCount('s1')).toBe(3);
    });

    it('reads zero with no queue picked, no segment, or a segment with no lists', () => {
      c.selectedQueue = null;
      expect(c.getNonSelectedCount('s1')).toBe(0);
      c.selectedQueue = { id: 'q1' };
      expect(c.getNonSelectedCount('')).toBe(0);
      expect(c.getNonSelectedCount('unknown')).toBe(0);
      c.segmentList = [{ id: 's1', participantlistid: [] }];
      expect(c.getNonSelectedCount('s1')).toBe(0);
    });

    it('skips a referenced list that is not loaded and one holding no members', () => {
      c.segmentList = [{ id: 's1', participantlistid: ['l1', 'gone'] }];
      c.participantListsList = [{ docid: 'l1', profilelist: ['p1', 'p2'] }, { docid: 'l3' }];
      expect(c.getNonSelectedCount('s1')).toBe(1);
    });

    it('survives an unset token list', () => {
      c.queueTokenList = null;
      expect(c.getNonSelectedCount('s1')).toBe(3);
    });
  });

  // ===============================================================================================
  // QPL-09 — name lookups behind the row chips
  // ===============================================================================================
  describe('QPL-09 name lookups', () => {
    it('falls back to the raw id when a profile is not in the map', () => {
      c.mapProfile = { p1: 'Ada Lovelace' };
      expect(c.getProfileName('p1')).toBe('Ada Lovelace');
      expect(c.getProfileName('p2')).toBe('p2');
    });

    it('filters the queue list by name, case- and space-insensitively', () => {
      c.queueList = [{ queuename: 'Morning Queue' }, { queuename: 'Evening Queue' }];
      c.searchQueue = '  MORNING ';
      expect(c.returnQueue().map((q: any) => q.queuename)).toEqual(['Morning Queue']);
    });

    it('returns the whole queue list when the search box is empty', () => {
      c.queueList = [{ queuename: 'Morning Queue' }, { queuename: 'Evening Queue' }];
      for (const empty of [null, undefined, '']) {
        c.searchQueue = empty as any;
        expect(c.returnQueue().length).toBe(2);
      }
    });
  });
});
