import { FormControl, FormGroup } from '@angular/forms';
import { DeliveryDashboardCloneComponent } from './delivery-dashboard-clone.component';

/**
 * Contract: qa/delivery-dashboard-v4-ia.md
 *
 * The "Ongoing by product" strip is a one-click VIEW of the Products dropdown, not a
 * second filter. Both write and read the same productFilterControl, so they cannot
 * disagree about scope — the failure class here is a control that looks like a filter
 * and is a no-op, or a parallel filter that drifts from the dropdown.
 *
 * Predicate spec on a bare prototype instance: no Firestore, no TestBed, no DOM.
 * onProductMultiFilterChange is stubbed to record the call rather than run the whole
 * reload path; that the handler IS invoked is the invariant, what it then reloads is
 * covered by the app's own change path.
 */

function makeComponent(): any {
  const c: any = Object.create(DeliveryDashboardCloneComponent.prototype);

  c._memo = new Map<string, any>();
  c.filterForm = new FormGroup({ product: new FormControl<string[]>([]) });

  // Two plain products and one merged group, so label resolution is exercised on both.
  c.mergedGroupIds = { 'EI Starter Pack': new Set(['pidStarterA', 'pidStarterB']) };
  c.mapProductName = {
    prodCustom: 'EI Custom Solutions',
    prodWish: 'WiSH',
    pidStarterA: 'EI Starter Pack Level 1',
    pidStarterB: 'EI Starter Pack Level 2',
  };
  c.products = [];
  c.allMatchedProductsRaw = [
    { productref: { id: 'prodCustom' } },
    { productref: { id: 'prodWish' } },
    { productref: { id: 'pidStarterA' } },
  ];

  c.changeCalls = 0;
  c.onProductMultiFilterChange = async () => { c.changeCalls++; };

  return c;
}

describe('delivery dashboard — the product strip drives the product filter', () => {

  it('offers the same labels the dropdown offers', () => {
    const c = makeComponent();
    expect(c.availableCardLabels).toEqual(['EI Custom Solutions', 'EI Starter Pack', 'WiSH']);
  });

  it('narrows the shared control to the clicked product, and runs the change path', async () => {
    const c = makeComponent();

    await c.selectProductFromStrip('prodWish');

    // Same control the mat-select is bound to.
    expect(c.productFilterControl.value).toEqual(['WiSH']);
    expect(c.productFilterActive).toBeTrue();
    // Not a no-op: the normal reload path ran.
    expect(c.changeCalls).toBe(1);
  });

  it('resolves a merged group to its group label, as the cohorts do', async () => {
    const c = makeComponent();

    await c.selectProductFromStrip('group:EI Starter Pack');

    expect(c.productFilterControl.value).toEqual(['EI Starter Pack']);
    // The label it wrote is one the dropdown actually offers - otherwise the filter
    // would silently match nothing.
    expect(c.availableCardLabels).toContain('EI Starter Pack');
  });

  it('clears the narrowing when All products is clicked', async () => {
    const c = makeComponent();

    await c.selectProductFromStrip('prodWish');
    expect(c.productFilterActive).toBeTrue();

    await c.selectProductFromStrip(null);

    expect(c.productFilterActive).toBeFalse();
    expect(c.isStripAllSelected).toBeTrue();
    expect(c.changeCalls).toBe(2);
  });

  it('marks exactly the selected chip, and none while All is active', async () => {
    const c = makeComponent();

    await c.selectProductFromStrip('prodCustom');
    expect(c.isStripSelected('prodCustom')).toBeTrue();
    expect(c.isStripSelected('prodWish')).toBeFalse();
    expect(c.isStripAllSelected).toBeFalse();

    await c.selectProductFromStrip(null);
    expect(c.isStripSelected('prodCustom')).toBeFalse();
    expect(c.isStripSelected('prodWish')).toBeFalse();
  });

  it('leaves the multi-select alone: a 2-product selection highlights no chip', () => {
    const c = makeComponent();
    // What the dropdown produces when two products are ticked.
    c.productFilterControl.setValue(['WiSH', 'EI Custom Solutions']);

    expect(c.productFilterActive).toBeTrue();
    expect(c.isStripSelected('prodWish')).toBeFalse();
    expect(c.isStripSelected('prodCustom')).toBeFalse();
    expect(c.isStripAllSelected).toBeFalse();
    expect(c.speedScopeLabel).toBe('Scoped to 2 products');
  });

  it('says out loud what the numbers are scoped to', async () => {
    const c = makeComponent();

    expect(c.speedScopeLabel).toBe('Across all products');

    await c.selectProductFromStrip('prodWish');
    expect(c.speedScopeLabel).toBe('Scoped to WiSH');
    expect(c.funnelScopeCaption).toContain('WiSH participants');
  });
});

describe('delivery dashboard — the delivery-speed gauge', () => {

  function gauge(avgDays: number): any {
    const c: any = Object.create(DeliveryDashboardCloneComponent.prototype);
    c._memo = new Map<string, any>();
    // Field initialisers run in the constructor, so a bare prototype instance does not
    // carry them. Mirror the declared values rather than reaching into a real instance.
    c.avgTimeTarget = 30;
    c.avgGaugeMaxDays = 90;
    Object.defineProperty(c, 'kpiAvgComplete', { get: () => avgDays });
    return c;
  }

  it('marks the 30-day target a third of the way along a 0-90d scale', () => {
    // 30 / 90 -> 33%. Asserting avgGaugeMaxDays here would only re-read the fixture,
    // so the ratio is what is pinned: move the target or the scale and this fails.
    expect(gauge(0).avgTargetMarkPct).toBe(33);
  });

  it('places the fill on the same 0-90d scale, so target and fill are comparable', () => {
    expect(gauge(30).avgGaugePct).toBe(33);   // exactly on target
    expect(gauge(45).avgGaugePct).toBe(50);   // past it, road left
    expect(gauge(90).avgGaugePct).toBe(100);
  });

  it('clamps rather than overflowing the track', () => {
    // The old avgTimePct returned 150% here, which the eye cannot place.
    expect(gauge(180).avgGaugePct).toBe(100);
    expect(gauge(0).avgGaugePct).toBe(0);
  });
});
