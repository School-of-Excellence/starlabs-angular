import { DeliveryDashboardCloneComponent } from './delivery-dashboard-clone.component';

/**
 * Contract: qa/delivery-dashboard-hidden-scope.md
 *
 * Predicate spec, same shape as delivery-dashboard-days-waiting.spec.ts: it drives the
 * real getters on a bare prototype instance, so there is no Firestore, no TestBed and no
 * DOM, and it runs in isolation while the repo-wide Karma suite is broken.
 *
 * Invariant under test: every headline funnel number is computed over the SAME population.
 *
 * "Hidden" is a Products-table display preference, not a filter on people.
 * populateActionableCohorts (Awaiting / Ready / Stuck / Not-consuming) iterates
 * allMatchedProductsRaw and never consults hiddenProductIds, and getCompletionSummary
 * already sums visibleCardIds + hiddenCardIds. kpiOngoingTotal used to iterate
 * visibleCardIds alone, which made In-delivery the one number computed over a smaller
 * population than the numbers printed beside it: a participant in a hidden product could
 * be counted as Stuck and not as In delivery.
 *
 * Goes RED on revert: restore `this.visibleCardIds.reduce(...)` in kpiOngoingTotal and
 * both specs below fail (3 instead of 5, and the parity assertion reports 1 vs 0).
 */

const DAY = 24 * 60 * 60 * 1000;

/** Firestore-style Timestamp stand-in. */
function ts(daysAgo: number) {
  const d = new Date(Date.now() - daysAgo * DAY);
  return { toDate: () => d };
}

const VISIBLE = 'prodVisible';
const HIDDEN = 'prodHidden';

/** One ongoing participantsproduct doc, last touched `staleDays` ago. */
function ongoingDoc(profileid: string, productId: string, staleDays: number) {
  return {
    profileid,
    status: 'ongoing',
    productref: { id: productId },
    journeyref: { id: 'jrn1' },
    statusdate: { ongoing: ts(staleDays) },
    minimumpayment: 1000,
  };
}

/**
 * A component instance carrying only the collaborators the getters under test touch.
 * Everything not stubbed here is the real prototype implementation.
 */
function makeComponent(): any {
  const c: any = Object.create(DeliveryDashboardCloneComponent.prototype);

  // memoGet is real and reads this._memo
  c._memo = new Map<string, any>();

  // Product-filter inactive: this spec is about hidden products, not scoping.
  // Scoping rides on allProductIdsFromRaw -> itemPassesProductFilter either way.
  c.itemPassesProductFilter = () => true;

  c.mergedGroupIds = {};
  c.hiddenProductIds = new Set<string>([HIDDEN]);

  // 3 in delivery on the visible product, 2 on the hidden one.
  c.funnelData = {
    [VISIBLE]: {
      awaiting: [], initiated: [], started: [], completed: [],
      ongoing: [{}, {}, {}],
    },
    [HIDDEN]: {
      awaiting: [], initiated: [], started: [], completed: [],
      ongoing: [{}, {}],
    },
  };

  // Backing rows: one participant per product, both stale enough to be Stuck.
  c.allMatchedProductsRaw = [
    ongoingDoc('pf-visible', VISIBLE, 40),
    ongoingDoc('pf-hidden', HIDDEN, 40),
  ];
  c.groupedAll = {
    [VISIBLE]: [{}, {}, {}],
    [HIDDEN]: [{}, {}],
  };

  // populateActionableCohorts collaborators
  c.excludedModes = new Set(['installation event mode', 'event mode', 'integration mode']);
  c.mapProductName = { [VISIBLE]: 'EI Custom Solutions', [HIDDEN]: 'Glimpse' };
  c.mapjourneyname = { jrn1: 'uP!' };
  c.journeyProductMap = {};
  c.mapMetaData = {};
  c.products = [];
  c.currentPage = 1;
  c.calculatePagination = () => { /* pagination is exercised by the e2e, not here */ };
  // private readonly fields live on the instance, not the prototype
  c.IDLE_DAYS = 7;
  c.STUCK_DAYS = 15;
  c.originalData = {
    awaitingInitiation: { data: [], count: 0 },
    readyForInitiation: { data: [], count: 0 },
    currentJourneyInitiated: { data: [], count: 0 },
    stuckCases: { data: [], count: 0 },
  };

  return c;
}

describe('delivery dashboard — one population for every funnel number', () => {

  it('counts In delivery across hidden products as well as visible ones', () => {
    const c = makeComponent();

    // Guard the fixture itself: the hidden product really is excluded from the table list.
    expect(c.visibleCardIds).toEqual([VISIBLE]);
    expect(c.hiddenCardIds).toEqual([HIDDEN]);

    // 3 visible + 2 hidden. Reverting to visibleCardIds.reduce(...) yields 3.
    expect(c.kpiOngoingTotal).toBe(5);
  });

  it('agrees with the Stuck cohort about which products are in scope', () => {
    const c = makeComponent();

    c.populateActionableCohorts([]);

    // The hidden product's stale participant is Stuck...
    const stuckProducts = c.originalData['stuckCases'].data.map((r: any) => r.product);
    expect(stuckProducts).toContain('Glimpse');

    // ...so In delivery must see that product too. Before the fix, Stuck counted a
    // participant that In delivery did not, and the two tiles sat side by side.
    const ongoingWithoutHidden = c.visibleCardIds.reduce(
      (sum: number, id: string) => sum + (c.getCardFunnel(id)?.ongoing?.length || 0), 0,
    );
    expect(c.kpiOngoingTotal - ongoingWithoutHidden).toBe(2);
  });

  it('still scopes to the product filter once one is active', () => {
    const c = makeComponent();
    // Only the hidden product passes the filter -> it is the only card on the board,
    // and In delivery reports its 2. Proves the fix did not bypass product scoping.
    c.itemPassesProductFilter = (item: any) => item?.productref?.id === HIDDEN;
    c._memo.clear();

    expect(c.visibleCardIds).toEqual([]);
    expect(c.hiddenCardIds).toEqual([HIDDEN]);
    expect(c.kpiOngoingTotal).toBe(2);
  });
});
