// queue-planning-review.unit.spec.ts — unit tests for the Queue Planning Review screen's arithmetic.
//
// WHAT THESE PROTECT: the review screen is where a queue admin signs slot planning off before a queue
// runs. Which planned slots merge into one row, how many segments and people sit behind each row, who
// is confirmed and who still needs chasing, how many seats are left, and which bookings point at a slot
// that no longer exists in planning. Those last two drive real decisions — seats get released and people
// get moved on the strength of them.
//
// WHY THEY DID NOT EXIST BEFORE: queue-planning-review.component.ts is 5,756 lines, injects a Firestore,
// a Storage, a MatDialog, an HttpClient and an AuthguardService, and loads in its CONSTRUCTOR behind
// `guard.getRoles().then(...)`. The only spec it had was the 23-line Angular CLI `should create` stub.
// cc0cdf28 ("migration of queue planner review") rewrote 484 lines of it with no coverage added.
//
// THIS COMPONENT IS THE WRITER for the queue-token slot field: `[`bookedslot.${stageName}`]: slotData`
// at line 5400 and `deleteField()` at 5566. That is what makes `bookedslot` the canonical name and
// queue-planning.component.ts's remaining `selectedstageslot` reads a defect — see QPL-02 in
// ../queue-planning/queue-planning.unit.spec.ts.
//
// HOW THE COMPONENT IS REACHED WITHOUT A BACKEND: AuthguardService is stubbed so `getRoles()` and
// `getProfileMap()` return promises that never settle, leaving the constructor's data-loading body
// unreached. Firestore, Storage, HttpClient and MatDialog are inert doubles. `detectChanges()` is never
// called. State is seeded onto the public fields; the two private ones the rules read
// (`planningSlotLookup`, built by rebuildMergedSlots) are reached through a cast, which is why most
// cases drive rebuildMergedSlots rather than hand-building the lookup.
//
// CASES MARKED "DEFECT (pinned)" assert behaviour that is WRONG, so the suite stays green and honest
// about what ships. Each says what the fix is. Fixing the code turns the pinned case red on purpose.
import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Storage } from '@angular/fire/storage';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';

import { AuthguardService } from '../../authguard.service';
import { QueuePlanningReviewComponent } from './queue-planning-review.component';

// The component's date readers accept three shapes; the doubles cover the two non-Date ones.
const ts = (d: Date) => ({ toDate: () => d });
const secs = (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000) });

const never = () => new Promise<any>(() => {});

function makeComponent(): QueuePlanningReviewComponent {
  TestBed.configureTestingModule({
    imports: [QueuePlanningReviewComponent],
    providers: [
      { provide: AuthguardService, useValue: { getRoles: never, getProfileMap: never } },
      { provide: Firestore, useValue: {} },
      { provide: Storage, useValue: {} },
      { provide: HttpClient, useValue: {} },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => ({ subscribe: () => {} }) }) } },
    ],
  });
  return TestBed.createComponent(QueuePlanningReviewComponent).componentInstance;
}

const START = new Date(2026, 10, 10, 9, 0);
const END = new Date(2026, 10, 10, 17, 0);

/** One document out of the `queue slot` collection, as onQueueSelect loads it. */
function planned(over: any = {}): any {
  return {
    id: 'slot1',
    stagename: 'Stage A',
    variationid: 'v1',
    segmentid: 's1',
    startdate: START,
    enddate: END,
    maxslot: 10,
    usedslot: 0,
    title: '',
    ...over,
  };
}

/** One document out of `queue_token`, booked into the slot above. */
function token(over: any = {}): any {
  return {
    docid: 't1',
    profile_id: 'p1',
    variationid: 'v1',
    currentstage: 'Stage A',
    tokenstatus: 'Active',
    stagestatus: 'Approved',
    delete: null,
    bookedslot: { 'Stage A': { segmentid: 's1', stagename: 'Stage A', variationid: 'v1', startdate: START, enddate: END } },
    ...over,
  };
}

describe('QueuePlanningReviewComponent (unit)', () => {
  let c: QueuePlanningReviewComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    c = makeComponent();
    c.queueStages = ['Stage A', 'Stage B', 'Stage C'];
    c.queueVariationList = [{ id: 'v1', variationname: 'Variation One' }];
    c.segmentList = [{ id: 's1', segmentname: 'Alpha Cohort', participantlistid: ['l1'] }];
    c.participantLists = [{ id: 'l1', profilelist: ['p1', 'p2'] }];
    c.queueTokenList = [];
    c.queueSlotList = [];
  });

  // ===============================================================================================
  // QPR-01 — the slot key and the labels on a slot row
  // ===============================================================================================
  describe('QPR-01 slot key and labels', () => {
    it('keys a slot on both timestamps, so two slots merge only on an exact match', () => {
      expect(c.generateSlotKey(START, END)).toBe(`${START.getTime()}_${END.getTime()}`);
      expect(c.generateSlotKey(START, END)).not.toBe(c.generateSlotKey(START, new Date(END.getTime() + 60000)));
    });

    it('formats a slot time as zero-padded 24-hour', () => {
      expect(c.formatTimeTo24Hour(new Date(2026, 10, 10, 9, 5))).toBe('09:05');
      expect(c.formatTimeTo24Hour(new Date(2026, 10, 10, 0, 0))).toBe('00:00');
    });

    it('turns midnight into 12 AM and noon into 12 PM', () => {
      expect(c.formatTimeTo12Hour('00:00')).toBe('12:00 AM');
      expect(c.formatTimeTo12Hour('12:00')).toBe('12:00 PM');
      expect(c.formatTimeTo12Hour('13:05')).toBe('01:05 PM');
      expect(c.formatTimeTo12Hour('')).toBe('');
    });

    it('writes a full date-and-time label for a confirmation row', () => {
      expect(c.formatDateTo12Hour(new Date(2026, 10, 10, 14, 5))).toBe('10/11/2026 02:05 PM');
      expect(c.formatDateTo12Hour(new Date(2026, 10, 10, 0, 0))).toBe('10/11/2026 12:00 AM');
      expect(c.formatDateTo12Hour(null)).toBe('');
    });

    it('writes the short booked-slot label with a three-letter month', () => {
      expect(c.getBookedSlotFormatedString(new Date(2026, 10, 10, 14, 5))).toBe('10 Nov 02:05 PM');
      expect(c.getBookedSlotFormatedString(new Date(2026, 0, 1, 12, 0))).toBe('1 Jan 12:00 PM');
      expect(c.getBookedSlotFormatedString(null)).toBe('');
    });

    it('takes a slot row title from the first stage entry that has one', () => {
      const slot: any = {
        segmentVariations: [{
          segmentId: 's1',
          variations: [
            { variationId: 'v1', stageData: { 'Stage A': { title: '' } } },
            { variationId: 'v2', stageData: { 'Stage A': { title: 'Morning intake' } } },
          ],
        }],
      };
      expect(c.getSlotTitle(slot, 'Stage A')).toBe('Morning intake');
      expect(c.getSlotTitle(slot, 'Stage B')).toBe('');
      expect(c.getSlotTitle(null, 'Stage A')).toBe('');
      expect(c.getSlotTitle(slot, '')).toBe('');
    });
  });

  // ===============================================================================================
  // QPR-02 — merging planned slots into review rows
  // ===============================================================================================
  describe('QPR-02 merging planned slots', () => {
    it('merges two slots sharing a start and end into one row holding both stages', () => {
      c.queueSlotList = [planned(), planned({ id: 'slot2', stagename: 'Stage B' })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots.length).toBe(1);
      expect(c.mergedSlots[0].stages.sort()).toEqual(['Stage A', 'Stage B']);
    });

    it('keeps slots with different windows apart', () => {
      c.queueSlotList = [planned(), planned({ id: 'slot2', startdate: new Date(2026, 10, 11, 9, 0) })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots.length).toBe(2);
    });

    it('groups variations under one segment entry', () => {
      c.queueVariationList = [{ id: 'v1', variationname: 'One' }, { id: 'v2', variationname: 'Two' }];
      c.queueSlotList = [planned(), planned({ id: 'slot2', variationid: 'v2' })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots[0].segmentVariations.length).toBe(1);
      expect(c.mergedSlots[0].segmentVariations[0].variations.length).toBe(2);
      expect(c.mergedSlots[0].segmentVariations[0].variations.map(v => v.variationName).sort()).toEqual(['One', 'Two']);
    });

    it('keeps two segments as separate entries on the same row', () => {
      c.queueSlotList = [planned(), planned({ id: 'slot2', segmentid: 's2' })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots[0].segmentVariations.map(sv => sv.segmentId).sort()).toEqual(['s1', 's2']);
    });

    it('reads a start and end stored as a Timestamp or as { seconds }', () => {
      c.queueSlotList = [planned({ startdate: ts(START), enddate: ts(END) })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots[0].startdate.getTime()).toBe(START.getTime());

      c.mergedSlots = [];
      c.queueSlotList = [planned({ startdate: secs(START), enddate: secs(END) })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots[0].startdate.getTime()).toBe(Math.floor(START.getTime() / 1000) * 1000);
    });

    it('skips a slot missing either end of its window', () => {
      c.queueSlotList = [planned({ startdate: null }), planned({ id: 'slot2', enddate: undefined })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots).toEqual([]);
    });

    it('carries the seat counts and the row times onto the row', () => {
      c.queueSlotList = [planned({ maxslot: 25, usedslot: 4, title: 'Intake' })];
      c.rebuildMergedSlots();
      const stageData = c.mergedSlots[0].segmentVariations[0].variations[0].stageData['Stage A'];
      expect(stageData.maxslot).toBe(25);
      expect(stageData.title).toBe('Intake');
      expect(c.mergedSlots[0].starttime).toBe('09:00');
      expect(c.mergedSlots[0].endtime).toBe('17:00');
    });

    it('leaves the previous rows alone when there are no planned slots to read', () => {
      c.mergedSlots = [{ startdate: START } as any];
      c.queueSlotList = [];
      c.rebuildMergedSlots();
      expect(c.mergedSlots.length).toBe(1);
    });

    it('leaves appointment slots out of the merged rows', () => {
      // Deliberate: appointment slots are rendered by getSlotsForStage's separate appointment path
      // (line 3566), not as queue rows. See the pinned case in QPR-04 for what that costs.
      c.queueSlotList = [planned({ slottype: 'appointment' })];
      c.rebuildMergedSlots();
      expect(c.mergedSlots).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPR-03 — does a booking still point at a planned slot
  // ===============================================================================================
  describe('QPR-03 slot-exists lookup', () => {
    it('finds a slot the planning rows actually contain', () => {
      c.queueSlotList = [planned()];
      c.rebuildMergedSlots();
      expect(c.checkSlotExistsInPlanning('v1', 's1', 'Stage A', START.getTime(), END.getTime())).toBe(true);
    });

    it('misses a different segment, stage or window', () => {
      c.queueSlotList = [planned()];
      c.rebuildMergedSlots();
      expect(c.checkSlotExistsInPlanning('v1', 's2', 'Stage A', START.getTime(), END.getTime())).toBe(false);
      expect(c.checkSlotExistsInPlanning('v1', 's1', 'Stage B', START.getTime(), END.getTime())).toBe(false);
      expect(c.checkSlotExistsInPlanning('v1', 's1', 'Stage A', START.getTime() + 1, END.getTime())).toBe(false);
    });

    it('ignores the variation — the lookup is keyed on segment, stage and window only', () => {
      c.queueSlotList = [planned()];
      c.rebuildMergedSlots();
      expect(c.checkSlotExistsInPlanning('any-variation', 's1', 'Stage A', START.getTime(), END.getTime())).toBe(true);
    });

    it('misses everything before any planning has been read', () => {
      expect(c.checkSlotExistsInPlanning('v1', 's1', 'Stage A', START.getTime(), END.getTime())).toBe(false);
    });
  });

  // ===============================================================================================
  // QPR-04 — who is confirmed for a slot
  // ===============================================================================================
  describe('QPR-04 confirmed participants', () => {
    beforeEach(() => {
      c.queueSlotList = [planned()];
      c.rebuildMergedSlots();
    });

    it('returns a token booked into that exact slot under `bookedslot`', () => {
      c.queueTokenList = [token()];
      const out = c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].docid).toBe('t1');
    });

    it('marks a booking whose slot is still in planning as valid', () => {
      c.queueTokenList = [token()];
      const out = c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out[0].hasInvalidSlot).toBe(false);
      expect(out[0].invalidSlotReason).toBeNull();
    });

    it('flags a booking whose planned slot has since been deleted', () => {
      c.queueSlotList = [];
      (c as any).planningSlotLookup = new Map();
      c.queueTokenList = [token()];
      const out = c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].hasInvalidSlot).toBe(true);
      expect(out[0].invalidSlotReason).toBe('Slot does not exist in queue planning');
    });

    it('DEFECT (pinned): a booking into an APPOINTMENT slot is flagged as invalid', () => {
      // rebuildMergedSlots skips `slottype === 'appointment'` (line 579), and planningSlotLookup is
      // built only from what it keeps — so no appointment slot is ever in the lookup and every
      // appointment booking reads "Slot does not exist in queue planning". The appointment work
      // (fcc380ce, 3210a907) added the slots without extending the lookup. FIX: index appointment
      // slots into planningSlotLookup too, or skip the validity check for them. Confirm which with
      // Dharshan before changing it — the appointment rows render through a separate path.
      c.queueSlotList = [planned({ slottype: 'appointment' })];
      c.rebuildMergedSlots();
      (c as any).planningSlotLookup = new Map();
      c.queueTokenList = [token()];
      const out = c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out[0].hasInvalidSlot).toBe(true);
    });

    it('matches a booking whose dates are a Timestamp or { seconds }', () => {
      c.queueTokenList = [token({ bookedslot: { 'Stage A': { segmentid: 's1', stagename: 'Stage A', startdate: ts(START), enddate: ts(END) } } })];
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(1);

      c.queueTokenList = [token({ bookedslot: { 'Stage A': { segmentid: 's1', stagename: 'Stage A', startdate: secs(START), enddate: secs(END) } } })];
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', secs(START) as any, secs(END) as any).length).toBe(1);
    });

    it('drops an inactive, unapproved or soft-deleted token', () => {
      for (const over of [{ tokenstatus: 'Cancelled' }, { stagestatus: 'Pending' }, { delete: true }]) {
        c.queueTokenList = [token(over)];
        expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END))
          .withContext(JSON.stringify(over)).toEqual([]);
      }
    });

    it('keeps a token whose delete flag is explicitly false or undefined', () => {
      for (const over of [{ delete: false }, { delete: undefined }]) {
        c.queueTokenList = [token(over)];
        expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length)
          .withContext(JSON.stringify(over)).toBe(1);
      }
    });

    it('drops a booking on another segment, stage or window', () => {
      c.queueTokenList = [token()];
      expect(c.getConfirmedParticipantsForSlot('v1', 's2', 'Stage A', START, END)).toEqual([]);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage B', START, END)).toEqual([]);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', new Date(2026, 10, 11, 9, 0), END)).toEqual([]);
    });

    it('returns nothing for an unknown stage or an unusable window', () => {
      c.queueTokenList = [token()];
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Retired Stage', START, END)).toEqual([]);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', null, END)).toEqual([]);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, null)).toEqual([]);
    });

    it('narrows to the interim card in focus', () => {
      c.queueTokenList = [token(), token({ docid: 't2', profile_id: 'p2' })];
      c.activeInterimCard = 'completed';
      c.completedInterimProfileIds = new Set(['p1']);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).map(t => t.docid)).toEqual(['t1']);

      c.activeInterimCard = 'not-completed';
      c.notCompletedInterimProfileIds = new Set(['p2']);
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).map(t => t.docid)).toEqual(['t2']);

      c.activeInterimCard = null;
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(2);
    });

    it('reads the profile id from either field name', () => {
      c.queueTokenList = [token({ profile_id: undefined, profileid: 'p1' })];
      const out = c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].participantSegmentId).toBe('s1');
    });

    it('survives an unset token list', () => {
      c.queueTokenList = null;
      expect(c.getConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPR-05 — who still needs a slot
  //
  // A token is chased for a stage when it belongs to the segment, is at or before that stage, sits at
  // or after the stage following the last earlier stage that HAS slots, and holds no booking there.
  // ===============================================================================================
  describe('QPR-05 non-confirmed participants', () => {
    beforeEach(() => {
      // Stage A and Stage B both carry planned slots for v1/s1, so Stage A is the first stage with a
      // slot and Stage B is the one after it. Only p1 is a segment member unless a case says otherwise.
      c.queueSlotList = [planned(), planned({ id: 'slot2', stagename: 'Stage B' })];
      c.rebuildMergedSlots();
      c.participantLists = [{ id: 'l1', profilelist: ['p1'] }];
    });

    it('chases a segment member sitting on the stage with no booking', () => {
      c.queueTokenList = [token({ bookedslot: {} })];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].isNonQueueParticipant).toBe(false);
      expect(out[0].reason).toBe('Slot not confirmed (First stage with slot)');
    });

    it('drops a member who already holds a booking for that stage', () => {
      c.queueTokenList = [token()];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
    });

    it('drops a token whose current stage is past the stage asked about', () => {
      c.queueTokenList = [token({ currentstage: 'Stage C', bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
    });

    it('drops the TOKEN of anyone who is not a member of that segment', () => {
      // p1 holds the token but is not on the segment's list, so the token is skipped. 'someone-else'
      // is on the list and holds no token, so the first-stage pass appends them instead.
      c.participantLists = [{ id: 'l1', profilelist: ['someone-else'] }];
      c.queueTokenList = [token({ bookedslot: {} })];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.map(x => x.profile_id)).toEqual(['someone-else']);
      expect(out[0].isNonQueueParticipant).toBe(true);
    });

    it('drops an inactive, unapproved or soft-deleted token', () => {
      for (const over of [{ tokenstatus: 'Cancelled' }, { stagestatus: 'Pending' }, { delete: true }]) {
        c.queueTokenList = [token({ bookedslot: {}, ...over })];
        expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END))
          .withContext(JSON.stringify(over)).toEqual([]);
      }
    });

    it('lists a person once even when two tokens carry the same profile', () => {
      c.queueTokenList = [token({ bookedslot: {} }), token({ docid: 't2', bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(1);
    });

    it('drops a token whose current stage is not configured on the queue', () => {
      c.queueTokenList = [token({ currentstage: 'Retired Stage', bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
    });

    it('returns nothing for an unknown stage or an unusable window', () => {
      c.queueTokenList = [token({ bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Retired Stage', START, END)).toEqual([]);
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', null, END)).toEqual([]);
    });

    it('narrows to the interim card in focus', () => {
      c.queueTokenList = [token({ bookedslot: {} })];
      c.activeInterimCard = 'completed';
      c.completedInterimProfileIds = new Set(['someone-else']);
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
      c.completedInterimProfileIds = new Set(['p1']);
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(1);
    });

    // --- the stage window -----------------------------------------------------------------------

    it('does NOT chase a token that has not yet passed the previous stage with slots', () => {
      // Asking about Stage B: Stage A is the last earlier stage with slots, so checkFromStageIndex is
      // 1 and a token still standing on Stage A (index 0) is not expected to have booked Stage B yet.
      c.queueTokenList = [token({ currentstage: 'Stage A', bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage B', START, END)).toEqual([]);
    });

    it('chases a token that HAS reached the stage after the previous stage with slots', () => {
      c.queueTokenList = [token({ currentstage: 'Stage B', bookedslot: {} })];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage B', START, END);
      expect(out.length).toBe(1);
      expect(out[0].isFirstStageWithSlot).toBe(false);
      expect(out[0].checkFromStageName).toBe('Stage B');
      expect(out[0].lastPreviousStageWithSlot).toBe('Stage A');
    });

    it('opens the window from the first stage when the stage asked about is the first with slots', () => {
      c.queueTokenList = [token({ currentstage: 'Stage A', bookedslot: {} })];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out[0].isFirstStageWithSlot).toBe(true);
      expect(out[0].checkFromStageIndex).toBe(0);
      expect(out[0].firstStageWithSlot).toBe('Stage A');
    });

    it('DEFECT (pinned): the variation argument never filters the tokens', () => {
      // Unlike queue-planning.component.ts's version, this one has no
      // `if (token.variationid !== variationid) return`. `variationid` is used only to pick the stage
      // config, so a token on variation v2 is chased in variation v1's panel and counted against v1's
      // slot. FIX: skip tokens whose variationid does not match, as the planning screen does.
      c.queueTokenList = [token({ variationid: 'v2', bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(1);
    });

    it('DEFECT (pinned): a segment/variation with NO planned slots still chases everyone', () => {
      // Nothing is planned for v2/s1, so findFirstStageWithSlot returns index -1, isFirstStageWithSlot
      // is false and checkFromStageIndex falls back to 0 — which opens the window on every stage rather
      // than closing it. A pairing that was never given slots therefore reports its whole segment as
      // "not confirmed". FIX: return [] when no stage in the config has a slot.
      c.queueSlotList = [];
      c.rebuildMergedSlots();
      (c as any).planningSlotLookup = new Map();
      c.queueSlotList = [];
      c.queueTokenList = [token({ bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v2', 's1', 'Stage A', START, END).length).toBe(1);
    });

    // --- segment members holding no token at all ---------------------------------------------------

    it('also lists a segment member with NO token, on the first stage with a slot', () => {
      c.participantLists = [{ id: 'l1', profilelist: ['p1', 'p2'] }];
      c.queueTokenList = [token()];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].profile_id).toBe('p2');
      expect(out[0].isNonQueueParticipant).toBe(true);
      expect(out[0].reason).toBe('No queue token - Awaiting first stage confirmation');
    });

    it('does NOT list a member with no token on a later stage', () => {
      // p1's token has reached Stage B and holds no Stage B booking, so it is chased. p2 holds no
      // token at all and is NOT appended, because Stage B is not the first stage with a slot.
      c.participantLists = [{ id: 'l1', profilelist: ['p1', 'p2'] }];
      c.queueTokenList = [token({ currentstage: 'Stage B' })];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage B', START, END);
      expect(out.map(x => x.profile_id)).toEqual(['p1']);
      expect(out[0].isNonQueueParticipant).toBe(false);
    });

    it('does not list a member twice when they already came through on their token', () => {
      c.participantLists = [{ id: 'l1', profilelist: ['p1'] }];
      c.queueTokenList = [token({ bookedslot: {} })];
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END).length).toBe(1);
    });

    it('prefers the B!G cohort planner record when the member has one', () => {
      c.participantLists = [{ id: 'l1', profilelist: ['p2'] }];
      c.queueTokenList = [];
      c.cohortQueuePlannerList = [{ profileid: 'p2', cohortname: 'Cohort One' }];
      const out = c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END);
      expect(out.length).toBe(1);
      expect(out[0].cohortname).toBe('Cohort One');
      expect(out[0].reason).toBe('No queue token - Awaiting first stage confirmation (from B!G list)');
    });

    it('holds a member with no token back behind the interim card filter too', () => {
      c.participantLists = [{ id: 'l1', profilelist: ['p2'] }];
      c.queueTokenList = [];
      c.activeInterimCard = 'completed';
      c.completedInterimProfileIds = new Set(['someone-else']);
      expect(c.getNonConfirmedParticipantsForSlot('v1', 's1', 'Stage A', START, END)).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPR-06 — the numbers on a slot row
  // ===============================================================================================
  describe('QPR-06 slot row counts', () => {
    function rowWith(stageData: any, segmentId = 's1'): any {
      return { segmentVariations: [{ segmentId, segmentName: 'Alpha', variations: [{ variationId: 'v1', variationName: 'One', stageData }] }] };
    }

    it('counts each segment that runs the stage once, however many variations it has', () => {
      const slot: any = {
        segmentVariations: [{
          segmentId: 's1',
          variations: [
            { variationId: 'v1', stageData: { 'Stage A': {} } },
            { variationId: 'v2', stageData: { 'Stage A': {} } },
          ],
        }],
      };
      expect(c.getSegmentsCountForSlot(slot, 'Stage A')).toBe(1);
      expect(c.getSegmentsCountForSlot(slot, 'Stage B')).toBe(0);
    });

    it('adds up confirmed, non-confirmed and B!G participants across variations', () => {
      const slot = rowWith({ 'Stage A': { confirmedParticipants: [1, 2], nonConfirmedParticipants: [3], bigparticipants: [4, 5, 6] } });
      expect(c.getConfirmedCountForSlot(slot, 'Stage A')).toBe(2);
      expect(c.getNonConfirmedCountForSlot(slot, 'Stage A')).toBe(1);
      expect(c.getBigParticipantsCountForSlot(slot, 'Stage A')).toBe(3);
    });

    it('reads zero for a stage the row does not run, and for a missing row or stage', () => {
      const slot = rowWith({ 'Stage A': { confirmedParticipants: [1] } });
      expect(c.getConfirmedCountForSlot(slot, 'Stage B')).toBe(0);
      expect(c.getConfirmedCountForSlot(null, 'Stage A')).toBe(0);
      expect(c.getConfirmedCountForSlot(slot, '')).toBe(0);
      expect(c.getNonConfirmedCountForSlot(null, 'Stage A')).toBe(0);
      expect(c.getBigParticipantsCountForSlot(null, 'Stage A')).toBe(0);
      expect(c.getRemainingSlotsCount(null, 'Stage A')).toBe(0);
      expect(c.getInvalidSlotsCountForSlot(null, 'Stage A')).toBe(0);
    });

    it('treats a stage entry with no participant arrays as zero, not a crash', () => {
      const slot = rowWith({ 'Stage A': {} });
      expect(c.getConfirmedCountForSlot(slot, 'Stage A')).toBe(0);
      expect(c.getNonConfirmedCountForSlot(slot, 'Stage A')).toBe(0);
      expect(c.getBigParticipantsCountForSlot(slot, 'Stage A')).toBe(0);
    });

    it('reports the seats left as max minus used', () => {
      expect(c.getRemainingSlotsCount(rowWith({ 'Stage A': { maxslot: 10, usedslot: 4 } }), 'Stage A')).toBe(6);
      expect(c.getRemainingSlotsCount(rowWith({ 'Stage A': {} }), 'Stage A')).toBe(0);
    });

    it('DEFECT (pinned): an overbooked slot reports NEGATIVE seats left', () => {
      // `maxSlot - usedSlot` is not floored. usedslot is set from the confirmed count in
      // calculateStageData, so a slot whose max was lowered after people booked reads "-2 remaining"
      // on the review screen. FIX: Math.max(0, maxSlot - usedSlot).
      expect(c.getRemainingSlotsCount(rowWith({ 'Stage A': { maxslot: 2, usedslot: 4 } }), 'Stage A')).toBe(-2);
    });

    it('counts only the confirmed bookings flagged invalid', () => {
      const slot = rowWith({ 'Stage A': { confirmedParticipants: [{ hasInvalidSlot: true }, { hasInvalidSlot: false }, {}] } });
      expect(c.getInvalidSlotsCountForSlot(slot, 'Stage A')).toBe(1);
    });

    it('narrows the confirmed and remaining counts to the segment filter', () => {
      const slot: any = {
        segmentVariations: [
          { segmentId: 's1', variations: [{ variationId: 'v1', stageData: { 'Stage A': { confirmedParticipants: [1], maxslot: 10, usedslot: 1 } } }] },
          { segmentId: 's2', variations: [{ variationId: 'v1', stageData: { 'Stage A': { confirmedParticipants: [2, 3], maxslot: 10, usedslot: 2 } } }] },
        ],
      };
      c.overallSegmentFilter = ['s1'];
      expect(c.getConfirmedCountForSlot(slot, 'Stage A')).toBe(1);
      expect(c.getRemainingSlotsCount(slot, 'Stage A')).toBe(9);
    });

    it('DEFECT (pinned): the other four counts ignore the segment filter', () => {
      // getConfirmedCountForSlot and getRemainingSlotsCount honour overallSegmentFilter; the segments,
      // non-confirmed, B!G and invalid counts do not. With a filter on, one row shows a confirmed count
      // for one segment beside a non-confirmed count for all of them, and the numbers no longer add up.
      // FIX: apply the same filter in all six, or in none.
      const slot: any = {
        segmentVariations: [
          { segmentId: 's1', variations: [{ variationId: 'v1', stageData: { 'Stage A': { nonConfirmedParticipants: [1], bigparticipants: [1], confirmedParticipants: [{ hasInvalidSlot: true }] } } }] },
          { segmentId: 's2', variations: [{ variationId: 'v1', stageData: { 'Stage A': { nonConfirmedParticipants: [2, 3], bigparticipants: [2, 3], confirmedParticipants: [{ hasInvalidSlot: true }] } } }] },
        ],
      };
      c.overallSegmentFilter = ['s1'];
      expect(c.getNonConfirmedCountForSlot(slot, 'Stage A')).toBe(3);
      expect(c.getBigParticipantsCountForSlot(slot, 'Stage A')).toBe(3);
      expect(c.getInvalidSlotsCountForSlot(slot, 'Stage A')).toBe(2);
      expect(c.getSegmentsCountForSlot(slot, 'Stage A')).toBe(2);
    });
  });

  // ===============================================================================================
  // QPR-07 — the names and ids behind a row
  // ===============================================================================================
  describe('QPR-07 name lookups', () => {
    it('DEFECT (pinned): getSegmentName never resolves a name', () => {
      // It looks a segment up by `s.docid`, but segmentList is loaded with `{ idField: 'id' }` (line
      // 313), so the documents carry `id`. Every other segment lookup in this file uses `seg['id']`
      // (lines 3401, 4341), as do queue-planning.component.ts and the shared `segmentName` pipe. So
      // this returns '' for every segment, and getParticipantSelectedSlots builds its segmentName from
      // it. FIX: match on `s.id`, as everything else does.
      expect(c.getSegmentName('s1')).toBe('');
      c.segmentList = [{ docid: 's1', segmentname: 'Alpha Cohort' }];
      expect(c.getSegmentName('s1')).toBe('Alpha Cohort');
    });

    it('reads an empty name for a blank segment id without throwing', () => {
      for (const blank of [null, undefined, '']) {
        expect(c.getSegmentName(blank as any)).withContext(String(blank)).toBe('');
      }
    });

    it('resolves a variation name and reads empty for an unknown one', () => {
      expect(c.getVariationName('v1')).toBe('Variation One');
      expect(c.getVariationName('v9')).toBe('');
    });

    it('falls back to the raw id when a profile is not in the map', () => {
      c.mapProfile = { p1: 'Ada Lovelace' };
      expect(c.getProfileName('p1')).toBe('Ada Lovelace');
      expect(c.getProfileName('p2')).toBe('p2');
    });

    it('collects every list member of a segment once', () => {
      c.participantLists = [
        { id: 'l1', profilelist: ['p1', 'p2'] },
        { id: 'l2', segmentid: 's1', profilelist: ['p2', 'p3'] },
      ];
      expect(c.getParticipantsForSegment('s1').sort()).toEqual(['p1', 'p2', 'p3']);
    });

    it('reads no members for a segment nothing maps to', () => {
      expect(c.getParticipantsForSegment('s9')).toEqual([]);
    });

    it('lists a participant booked slot per stage, skipping one with no segment', () => {
      c.segmentList = [{ docid: 's1', id: 's1', segmentname: 'Alpha Cohort' }];
      const out = c.getParticipantSelectedSlots({
        bookedslot: {
          'Stage A': { segmentid: 's1', startdate: START, enddate: END },
          'Stage B': { segmentid: '', startdate: START, enddate: END },
        },
      });
      expect(out.length).toBe(1);
      expect(out[0].stageName).toBe('Stage A');
      expect(out[0].segmentName).toBe('Alpha Cohort');
    });

    it('reads no slots for a participant that has never booked', () => {
      expect(c.getParticipantSelectedSlots({})).toEqual([]);
    });
  });

  // ===============================================================================================
  // QPR-08 — people sitting in more than one segment
  // ===============================================================================================
  describe('QPR-08 duplicate participants', () => {
    beforeEach(() => {
      c.queueSlotList = [planned(), planned({ id: 'slot2', segmentid: 's2' })];
      c.rebuildMergedSlots();
      c.segmentList = [{ id: 's1' }, { id: 's2' }];
    });

    it('flags only a profile that appears in two planned segments', () => {
      c.participantLists = [
        { id: 'l1', segmentid: 's1', profilelist: ['p1', 'p2'] },
        { id: 'l2', segmentid: 's2', profilelist: ['p2', 'p3'] },
      ];
      expect([...c.getDuplicateParticipantIds()]).toEqual(['p2']);
    });

    it('ignores a segment that is not in the planning at all', () => {
      c.segmentList = [{ id: 's1' }, { id: 's9' }];
      c.participantLists = [
        { id: 'l1', segmentid: 's1', profilelist: ['p1'] },
        { id: 'l2', segmentid: 's9', profilelist: ['p1'] },
      ];
      expect([...c.getDuplicateParticipantIds()]).toEqual([]);
    });

    it('flags nobody when every profile sits in one segment', () => {
      c.participantLists = [
        { id: 'l1', segmentid: 's1', profilelist: ['p1'] },
        { id: 'l2', segmentid: 's2', profilelist: ['p2'] },
      ];
      expect(c.getDuplicateParticipantIds().size).toBe(0);
    });

    it('knows which segments the planning covers', () => {
      expect(c.isSegmentInQueuePlanning('s1')).toBe(true);
      expect(c.isSegmentInQueuePlanning('s9')).toBe(false);
    });
  });

  // ===============================================================================================
  // QPR-09 — bookings pointing at a slot that is gone
  // ===============================================================================================
  describe('QPR-09 participant slot still exists', () => {
    beforeEach(() => {
      c.queueSlotList = [planned()];
      c.rebuildMergedSlots();
    });

    it('is satisfied by a booking that matches a planned row', () => {
      expect(c.checkParticipantSlotExistsInStage(token(), 'Stage A')).toBe(true);
    });

    it('reports a booking whose window no longer matches any row', () => {
      const t = token();
      t.bookedslot['Stage A'].startdate = new Date(2026, 10, 11, 9, 0);
      expect(c.checkParticipantSlotExistsInStage(t, 'Stage A')).toBe(false);
    });

    it('reports a booking whose segment is no longer on the matching row', () => {
      const t = token();
      t.bookedslot['Stage A'].segmentid = 's9';
      expect(c.checkParticipantSlotExistsInStage(t, 'Stage A')).toBe(false);
    });

    it('treats "never booked" as nothing to report', () => {
      expect(c.checkParticipantSlotExistsInStage({ bookedslot: {} }, 'Stage A')).toBe(true);
      expect(c.checkParticipantSlotExistsInStage({}, 'Stage A')).toBe(true);
    });

    it('treats a booking with an unreadable window as nothing to report', () => {
      const t = token();
      t.bookedslot['Stage A'].startdate = null;
      expect(c.checkParticipantSlotExistsInStage(t, 'Stage A')).toBe(true);
    });

    it('accepts a booking stored as a Timestamp', () => {
      const t = token();
      t.bookedslot['Stage A'].startdate = ts(START);
      t.bookedslot['Stage A'].enddate = ts(END);
      expect(c.checkParticipantSlotExistsInStage(t, 'Stage A')).toBe(true);
    });

    it('reports a booking on a stage the matching row does not run', () => {
      const t = token({ bookedslot: { 'Stage B': { segmentid: 's1', startdate: START, enddate: END } } });
      expect(c.checkParticipantSlotExistsInStage(t, 'Stage B')).toBe(false);
    });
  });

  // ===============================================================================================
  // QPR-10 — the panel's select-all tri-state
  // ===============================================================================================
  describe('QPR-10 participant selection', () => {
    beforeEach(() => {
      c.confirmedParticipants = [{ selected: false }, { selected: false }];
      c.nonConfirmedParticipants = [{ selected: true }];
      c.bigParticipants = [];
      c.allParticipantsForStage = [{ selected: false }, { selected: true }];
    });

    it('selects and clears every row of the list in focus', () => {
      c.toggleAllParticipants(true, 'confirmed');
      expect(c.areAllParticipantsSelected('confirmed')).toBe(true);
      expect(c.getSelectedParticipantsCount('confirmed')).toBe(2);
      c.toggleAllParticipants(false, 'confirmed');
      expect(c.getSelectedParticipantsCount('confirmed')).toBe(0);
    });

    it('treats "all" and "deleted-slots" as the same list', () => {
      c.toggleAllParticipants(true, 'deleted-slots');
      expect(c.areAllParticipantsSelected('all')).toBe(true);
      expect(c.getSelectedParticipantsCount('deleted-slots')).toBe(2);
    });

    it('reads an empty list as not-all-selected, so the box is not ticked on nothing', () => {
      expect(c.areAllParticipantsSelected('big')).toBe(false);
      expect(c.areSomeParticipantsSelected('big')).toBe(false);
      expect(c.getSelectedParticipantsCount('big')).toBe(0);
    });

    it('shows the indeterminate state only on a partial selection', () => {
      expect(c.areSomeParticipantsSelected('all')).toBe(true);
      expect(c.areSomeParticipantsSelected('non-confirmed')).toBe(false);
      c.toggleAllParticipants(true, 'all');
      expect(c.areSomeParticipantsSelected('all')).toBe(false);
    });

    it('hands back the list the open panel section names', () => {
      c.activePanelSection = 'confirmed';
      expect(c.getActiveParticipantsList()).toBe(c.confirmedParticipants);
      expect(c.getFilteredParticipantsList()).toBe(c.confirmedParticipants);
      c.activePanelSection = 'all';
      expect(c.getActiveParticipantsList()).toBe(c.allParticipantsForStage);
      c.activePanelSection = null;
      expect(c.getActiveParticipantsList()).toEqual([]);
      expect(c.getFilteredParticipantsList()).toEqual([]);
    });
  });
});
