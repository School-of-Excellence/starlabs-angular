import { DeliveryDashboardCloneComponent } from './delivery-dashboard-clone.component';

/**
 * Contract: qa/delivery-dashboard-days-waiting.md
 *
 * Predicate spec. It drives populateActionableCohorts() on a bare prototype
 * instance so no Firestore, no TestBed and no DOM are needed - the bug lives in
 * pure bucketing logic, so the test stays at that level and runs in isolation
 * even while the repo-wide Karma suite is broken.
 *
 * Both invariants go RED if the fix is reverted:
 *   1. DAYS WAITING counts from participantsproduct.productonboardingscheduled, else the ONGOING
 *      participantjourneyproduct (journeyProductMap) of the row's journey — never 'participant
 *      metadata', where the field does not exist. Reverting -> waitingperiod 0/null.
 *   2. Awaiting / Ready rows are one-per-participant. Reverting -> 2 rows for a
 *      profile holding 2 products.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Firestore-style Timestamp stand-in. */
function ts(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * DAY);
  return { toDate: () => d };
}

/** A component instance with only the collaborators populateActionableCohorts touches. */
function makeComponent(): any {
  const c: any = Object.create(DeliveryDashboardCloneComponent.prototype);

  c.excludedModes = new Set(['installation event mode', 'event mode', 'integration mode']);
  c.mapProductName = { prodA: 'EI Custom Solutions', prodB: 'WiSH Diagnostics & Implementation' };
  c.mapjourneyname = { jrn1: 'uP!' };
  c.journeyProductMap = {};
  c.mapMetaData = {};
  c.allMatchedProductsRaw = [];
  c.currentPage = 1;
  c.calculatePagination = () => { /* pagination is exercised by the e2e, not here */ };

  c.originalData = {
    awaitingInitiation: { data: [], count: 0 },
    readyForInitiation: { data: [], count: 0 },
    currentJourneyInitiated: { data: [], count: 0 },
    stuckCases: { data: [], count: 0 },
    allParticipants: { data: [], count: 0 }, // the All tab, added on charan-release after this spec was written
  };

  // Ready to Start on charan-release comes from the card funnel (getCardFunnel(card).awaiting over
  // visibleCardIds), not from "payment cleared" rows as on the branch this spec was written against.
  // Stub that source; tests that exercise Ready put their rows in `c.readyFunnelItems`.
  c._memo = new Map();
  c.readyFunnelItems = [];
  Object.defineProperty(c, 'visibleCardIds', { get: () => ['card-under-test'] });
  c.getCardFunnel = () => ({ awaiting: c.readyFunnelItems });

  return c;
}

/** One participantsproduct doc. Distinct doc ids, same profile => the duplicate case. */
function productDoc(profileid: string, productId: string, status = '') {
  return {
    profileid,
    status,
    productref: { id: productId },
    journeyref: { id: 'jrn1' },
    statusdate: {},
    minimumpayment: 1000,
  };
}

/** One ONGOING participantjourneyproduct doc (the only kind the screen fetches), for journey `journeyId`. */
function ongoingJourney(profileid: string, onboardedDaysAgo: number, journeyId = 'jrn1') {
  return { profileid, journeystatus: 'ongoing', journeyref: { id: journeyId }, onboardedtime: ts(onboardedDaysAgo) };
}

describe('Delivery Dashboard - days waiting and duplicate rows', () => {

  describe('isKnownWait', () => {
    it('separates "no onboarding date on record" from "waited zero days"', () => {
      const c = makeComponent();
      expect(c.isKnownWait(0)).toBe(true);
      expect(c.isKnownWait(41)).toBe(true);
      expect(c.isKnownWait(null)).toBe(false);
      expect(c.isKnownWait(undefined)).toBe(false);
    });
  });

  describe('INVARIANT 1 - waiting period comes from participantjourneyproduct', () => {

    it('computes real days waiting from the journey product onboardedtime', () => {
      const c = makeComponent();
      c.mapMetaData = { p1: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' } };
      // The onboarding date lives ONLY here - exactly as in production.
      c.journeyProductMap = { p1: [ongoingJourney('p1', 41)] };
      c.allMatchedProductsRaw = [productDoc('p1', 'prodA')];

      c.populateActionableCohorts([]);

      const rows = c.originalData['awaitingInitiation'].data;
      expect(rows.length).toBe(1);
      // RED on revert: reading meta['onboardedtime'] yields null -> 0.
      expect(rows[0].waitingperiod).toBe(41);
    });

    it('reports null - not 0 - when no onboarding date exists anywhere', () => {
      const c = makeComponent();
      c.mapMetaData = { p2: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' } };
      c.journeyProductMap = {};
      c.allMatchedProductsRaw = [productDoc('p2', 'prodA')];

      c.populateActionableCohorts([]);

      const rows = c.originalData['awaitingInitiation'].data;
      expect(rows.length).toBe(1);
      // RED on revert: daysSinceTs used to return 0, which renders as "0 DAYS"
      // and reads as "onboarded today".
      expect(rows[0].waitingperiod).toBeNull();
      expect(c.isKnownWait(rows[0].waitingperiod)).toBe(false);
    });

    it('does not let a missing date masquerade as a fresh participant', () => {
      const c = makeComponent();
      c.mapMetaData = {
        pOld: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
        pNew: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
      };
      c.journeyProductMap = { pOld: [ongoingJourney('pOld', 63)] };
      c.allMatchedProductsRaw = [productDoc('pOld', 'prodA'), productDoc('pNew', 'prodB')];

      c.populateActionableCohorts([]);

      const rows = c.originalData['awaitingInitiation'].data;
      const old = rows.find((r: any) => r.profileid === 'pOld');
      const unknown = rows.find((r: any) => r.profileid === 'pNew');

      expect(old.waitingperiod).toBe(63);
      expect(unknown.waitingperiod).toBeNull();
      // Before the fix BOTH were 0, so triage could not tell them apart at all.
      expect(old.waitingperiod).not.toEqual(unknown.waitingperiod);
    });

    it('prefers the PRODUCT onboarding call over the journey onboarding call', () => {
      const c = makeComponent();
      c.mapMetaData = { pp: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' } };
      c.journeyProductMap = { pp: [ongoingJourney('pp', 90)] };
      c.allMatchedProductsRaw = [{ ...productDoc('pp', 'prodA'), productonboardingscheduled: ts(5) }];

      c.populateActionableCohorts([]);

      expect(c.originalData['awaitingInitiation'].data[0].waitingperiod).toBe(5);
    });

    it('uses only the ongoing journey that matches the row, not another journey', () => {
      const c = makeComponent();
      c.mapMetaData = { pj: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' } };
      // Row is on jrn1; the only ongoing journey doc is for jrn2 -> no date for this row.
      c.journeyProductMap = { pj: [ongoingJourney('pj', 120, 'jrn2')] };
      c.allMatchedProductsRaw = [productDoc('pj', 'prodA')];

      c.populateActionableCohorts([]);

      expect(c.originalData['awaitingInitiation'].data[0].waitingperiod).toBeNull();
    });
  });

  describe('INVARIANT 2 - one row per participant in Awaiting and Ready', () => {

    it('collapses a participant holding two products into a single awaiting row', () => {
      const c = makeComponent();
      c.mapMetaData = { dup: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '9000' } };
      c.journeyProductMap = { dup: [ongoingJourney('dup', 12)] };
      // Two DISTINCT participantsproduct docs, same person - the production case.
      c.allMatchedProductsRaw = [productDoc('dup', 'prodA'), productDoc('dup', 'prodB')];

      c.populateActionableCohorts([]);

      // RED on revert: this was 2 identical, indistinguishable rows.
      expect(c.originalData['awaitingInitiation'].data.length).toBe(1);
      expect(c.originalData['awaitingInitiation'].count).toBe(1);
    });

    it('collapses duplicates in Ready to Start too', () => {
      const c = makeComponent();
      // Two funnel rows (two products) for one participant -> Ready to Start.
      c.mapMetaData = { paid: { participantmode: 'journey mode', pp_totalpaid: '9000', pp_totalpurchasevalue: '9000' } };
      c.journeyProductMap = { paid: [ongoingJourney('paid', 31)] };
      c.readyFunnelItems = [productDoc('paid', 'prodA'), productDoc('paid', 'prodB')];

      c.populateActionableCohorts([]);

      expect(c.originalData['readyForInitiation'].data.length).toBe(1);
      expect(c.originalData['readyForInitiation'].count).toBe(1);
      expect(c.originalData['readyForInitiation'].data[0].waitingperiod).toBe(31);
    });

    it('keeps the longest wait when collapsing', () => {
      const c = makeComponent();
      c.mapMetaData = { dup: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '9000' } };
      c.journeyProductMap = { dup: [ongoingJourney('dup', 55)] };
      c.allMatchedProductsRaw = [productDoc('dup', 'prodA'), productDoc('dup', 'prodB')];

      c.populateActionableCohorts([]);

      const rows = c.originalData['awaitingInitiation'].data;
      expect(rows.length).toBe(1);
      expect(rows[0].waitingperiod).toBe(55);
    });

    it('does not merge two different participants', () => {
      const c = makeComponent();
      c.mapMetaData = {
        a: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
        b: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
      };
      c.journeyProductMap = {
        a: [ongoingJourney('a', 10)],
        b: [ongoingJourney('b', 20)],
      };
      c.allMatchedProductsRaw = [productDoc('a', 'prodA'), productDoc('b', 'prodA')];

      c.populateActionableCohorts([]);

      expect(c.originalData['awaitingInitiation'].data.length).toBe(2);
    });
  });

  describe('INVARIANT 3 - tile equals list, and buckets stay disjoint', () => {

    it('count always equals the rendered array length', () => {
      const c = makeComponent();
      c.mapMetaData = {
        a: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
        b: { participantmode: 'journey mode', pp_totalpaid: '5000', pp_totalpurchasevalue: '5000' },
      };
      c.journeyProductMap = {
        a: [ongoingJourney('a', 9)],
        b: [ongoingJourney('b', 9)],
      };
      c.allMatchedProductsRaw = [
        productDoc('a', 'prodA'), productDoc('a', 'prodB'),
        productDoc('b', 'prodA'), productDoc('b', 'prodB'),
      ];

      c.populateActionableCohorts([]);

      const d = c.originalData;
      expect(d['awaitingInitiation'].count).toBe(d['awaitingInitiation'].data.length);
      expect(d['readyForInitiation'].count).toBe(d['readyForInitiation'].data.length);
      expect(d['stuckCases'].count).toBe(d['stuckCases'].data.length);
    });

    it('a participant is never both awaiting payment and ready to start', () => {
      const c = makeComponent();
      c.mapMetaData = {
        a: { participantmode: 'journey mode', pp_totalpaid: '0', pp_totalpurchasevalue: '5000' },
        b: { participantmode: 'journey mode', pp_totalpaid: '5000', pp_totalpurchasevalue: '5000' },
      };
      c.journeyProductMap = {
        a: [ongoingJourney('a', 3)],
        b: [ongoingJourney('b', 3)],
      };
      c.allMatchedProductsRaw = [productDoc('a', 'prodA'), productDoc('b', 'prodA')];

      c.populateActionableCohorts([]);

      const awaiting = new Set(c.originalData['awaitingInitiation'].data.map((r: any) => r.profileid));
      const ready = new Set(c.originalData['readyForInitiation'].data.map((r: any) => r.profileid));
      const overlap = [...awaiting].filter((p) => ready.has(p as string));
      expect(overlap).toEqual([]);
    });
  });
});
