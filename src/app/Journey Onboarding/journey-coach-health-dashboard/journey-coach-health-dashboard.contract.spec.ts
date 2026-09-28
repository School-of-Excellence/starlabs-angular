import { signal } from '@angular/core';
import { JourneyCoachHealthDashboardComponent } from './journey-coach-health-dashboard.component';

/**
 * CONTRACT SPEC — the three JC-Health fixes (qa/jc-health-3fixes.md).
 *
 * Predicate style: methods are exercised off the prototype with a minimal `this`, no Firestore /
 * Router / TestBed (mirrors the going-quiet / needs-attention specs). Each REVERT-GUARD block goes
 * RED if the corresponding fix is reverted.
 *
 * Fix 1 ALSO has a template invariant — the coach <select> must be one-way `[ngModel]`, not
 * `[(ngModel)]` — which lives in the HTML and cannot be reached from a Karma (browser) spec. That
 * half is guarded by qa/checks/jc-health-contract.mjs (a Node file assertion). Here we cover the
 * onCoachChange guard LOGIC.
 */
type Any = Record<string, any>;
const proto = JourneyCoachHealthDashboardComponent.prototype as any;

// ---- Fix 2: Onboarding vs Journey-Coaching partition (isOnboardingAppt) --------------------------
describe('JourneyCoachHealthDashboard · isOnboardingAppt (JC vs Onboarding split)', () => {
  const ctx = { onboardingApptTypeIds: new Set<string>(['ONB_TYPE_1', 'ONB_TYPE_2']) };
  const isOnboarding = (data: Any) => proto.isOnboardingAppt.call(ctx, data);

  it('a pure coach call (no markers, JC-type ref) is NOT onboarding', () => {
    expect(isOnboarding({ appointment: { id: 'JC_TYPE' } })).toBeFalse();
    expect(isOnboarding({})).toBeFalse();
  });

  it('the explicit onboarding flag marks onboarding', () => {
    expect(isOnboarding({ onboarding: true })).toBeTrue();
  });

  it('a journeyid or pjp ref marks onboarding (current schedule-dialog writers)', () => {
    expect(isOnboarding({ journeyid: 'j1' })).toBeTrue();
    expect(isOnboarding({ participantjourneyproductid: 'pjp1' })).toBeTrue();
  });

  // REVERT GUARD: drop the appointment-type-ref clause and this markerless onboarding doc reads as
  // Journey-Coaching (returns false) -> RED. This is the exact leak the fix closes.
  it('a legacy onboarding call with NO markers is caught by its onboarding appointment-type ref', () => {
    expect(isOnboarding({ appointment: { id: 'ONB_TYPE_1' } })).toBeTrue();
  });

  it('partitions a mixed set into DISJOINT JC and Onboarding buckets', () => {
    const appts: Any[] = [
      { id: 'a', appointment: { id: 'JC_TYPE' } },      // JC (coach-type ref, no markers)
      { id: 'b', onboarding: true },                     // OB (explicit flag)
      { id: 'c', journeyid: 'j' },                       // OB (journey ref)
      { id: 'd', appointment: { id: 'ONB_TYPE_2' } },    // OB (onboarding-type ref, legacy)
      { id: 'e' },                                       // JC (nothing)
    ];
    const ob = new Set(appts.filter(isOnboarding).map(a => a['id']));
    const jc = new Set(appts.filter(a => !isOnboarding(a)).map(a => a['id']));
    expect([...ob].sort()).toEqual(['b', 'c', 'd']);
    expect([...jc].sort()).toEqual(['a', 'e']);
    ob.forEach(id => expect(jc.has(id)).toBeFalse());   // the two buckets never share a row
  });
});

// ---- Fix 3: A&H drill is a native in-page overlay, NOT a MatDialog -------------------------------
describe('JourneyCoachHealthDashboard · openAhDrill / pickAhDrill (native A&H overlay)', () => {
  const makeCtx = () => ({
    ahDocs: [
      { coll: 'ask',  tagged: true,  liked: false, opportunity: false, critical: false, resolved: false, profileid: 'p1', created: 300 },
      { coll: 'love', tagged: true,  liked: false, opportunity: false, critical: false, resolved: false, profileid: 'p2', created: 100 },
      { coll: 'love', tagged: true,  liked: false, opportunity: false, critical: false, resolved: false, profileid: 'p3', created: 200 },
      { coll: 'ask',  tagged: false, liked: true,  opportunity: false, critical: false, resolved: false, profileid: 'p4', created: 400 },
    ] as Any[],
    // openAhDrill routes through ahDocsInScope() since 2026-09-23 (the card follows the Viewing
    // scope). These cases are about the overlay, not the scope, so the context runs in the ALL view
    // where no filter applies — the real helpers, not stubs.
    ALL: 'ALL',
    selectedCoachId: 'ALL',
    rosterIds: () => [],
    ahScopeIds: proto.ahScopeIds,
    ahDocsInScope: proto.ahDocsInScope,
    nameOf: (id: string) => 'Name ' + id,
    ahDrill: signal<any>(null),
    dialog: { open: jasmine.createSpy('dialog.open') },
    openJcParticipant: jasmine.createSpy('openJcParticipant'),
  });

  it('opens the drill by SETTING the ahDrill signal (no MatDialog)', () => {
    const ctx = makeCtx();
    proto.openAhDrill.call(ctx, 'both', 'tagged', false, 'Needs Attention · combined');
    const drill = ctx.ahDrill();
    expect(drill).toBeTruthy();
    expect(drill.title).toBe('Needs Attention · combined');
    expect(drill.entries.length).toBe(3);                                     // 3 tagged (p4 excluded)
    expect(drill.entries.map((e: Any) => e['profileid'])).toEqual(['p1', 'p3', 'p2']); // newest first
    expect(ctx.dialog.open).not.toHaveBeenCalled();       // REVERT GUARD: a MatDialog open => RED
  });

  it('reconciles the drill list length with the filtered cell count', () => {
    const ctx = makeCtx();
    proto.openAhDrill.call(ctx, 'both', 'tagged', false, 'T');
    const cellCount = ctx.ahDocs.filter(d => d['tagged']).length;
    expect(ctx.ahDrill().entries.length).toBe(cellCount);
  });

  it('pickAhDrill closes the overlay and opens that participant', () => {
    const ctx = makeCtx();
    ctx.ahDrill.set({ title: 'x', entries: [] });
    proto.pickAhDrill.call(ctx, { profileid: 'p9', name: 'N', created: 1 });
    expect(ctx.ahDrill()).toBeNull();
    expect(ctx.openJcParticipant).toHaveBeenCalledWith('p9');
  });

  it('pickAhDrill is a no-op for an entry with no profileid', () => {
    const ctx = makeCtx();
    ctx.ahDrill.set({ title: 'x', entries: [] });
    proto.pickAhDrill.call(ctx, { profileid: '', name: 'N', created: 1 });
    expect(ctx.openJcParticipant).not.toHaveBeenCalled();
    expect(ctx.ahDrill()).not.toBeNull();
  });
});

// ---- Fix 1: coach-scope guard logic (onCoachChange) ---------------------------------------------
describe('JourneyCoachHealthDashboard · onCoachChange (coach-scope guard)', () => {
  const baseCtx = (over: Any = {}): Any => ({
    selectedCoachId: 'coach-A',
    activeLever: '', assignTargetCoachId: '',
    sumLifecycle: { set() {} }, sumJourneys: { set() {} },
    journeyMenuOpen: false,
    isPagedView: () => false,
    applyPaginatorBinding() {}, setProgress() {}, loadProgress: 0,
    paginator: null, fullPjpData: null,
    loadFullPortfolio: jasmine.createSpy('loadFullPortfolio').and.resolveTo(undefined),
    // onCoachChange also re-scopes the A&H analytics card (2026-09-23).
    computeAhSummary: jasmine.createSpy('computeAhSummary'),
    ...over,
  });

  it('no-ops when the coach is unchanged (perf guard holds)', async () => {
    const ctx = baseCtx();
    await proto.onCoachChange.call(ctx, 'coach-A');
    expect(ctx['loadFullPortfolio']).not.toHaveBeenCalled();
    expect(ctx['selectedCoachId']).toBe('coach-A');
  });

  // REVERT GUARD (logic half): removing the guard or breaking the rebuild dispatch fails this.
  it('re-scopes the base when the coach changes (guard passes -> reload)', async () => {
    const ctx = baseCtx();
    await proto.onCoachChange.call(ctx, 'coach-B');
    expect(ctx['selectedCoachId']).toBe('coach-B');        // onCoachChange is the sole writer
    expect(ctx['loadFullPortfolio']).toHaveBeenCalled();   // base rebuilt for the new scope
  });
});
