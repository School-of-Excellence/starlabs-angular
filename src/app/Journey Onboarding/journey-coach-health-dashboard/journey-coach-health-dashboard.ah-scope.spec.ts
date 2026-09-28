import { JourneyCoachHealthDashboardComponent } from './journey-coach-health-dashboard.component';

/**
 * The A&H analytics card follows the Viewing scope (2026-09-23).
 *
 * The bug: loadAHSummary reads `ask AH` + `love letter` ONCE, base-wide, and the card counted every doc
 * it returned regardless of the Viewing selector. A coach therefore saw ecosystem-wide numbers and could
 * drill into participants on another coach's base — while every other card on the screen was scoped.
 *
 * The fix keeps the single base-wide read (cheap, once) and filters the CACHED docs per scope:
 *   ALL              -> no filter (the ecosystem view; what the admin/Coaches view is for)
 *   one coach / Unassigned -> only docs whose profileid is in that roster
 * Both the counts (computeAhSummary) and the drill-down list (openAhDrill) go through ahDocsInScope(),
 * so the list length keeps reconciling the clicked cell.
 *
 * ahScopeIds / ahDocsInScope read only `this.selectedCoachId`, `this.ALL`, `this.rosterIds()` and
 * `this.ahDocs`, so they run off the prototype with a minimal `this` — no TestBed, no Firestore.
 *
 * REVERT GUARD: return `this.ahDocs` unfiltered (or drop the null/ALL distinction) and the coach-scope
 * cases below go RED.
 */
type Doc = { profileid: string; coll: 'ask' | 'love' };
const proto = JourneyCoachHealthDashboardComponent.prototype as unknown as {
  ahScopeIds(): Set<string> | null;
  ahDocsInScope(): Doc[];
};

const DOCS: Doc[] = [
  { profileid: 'mine-1', coll: 'love' },
  { profileid: 'mine-2', coll: 'ask' },
  { profileid: 'theirs-1', coll: 'love' },   // another coach's participant
  { profileid: '', coll: 'love' },           // orphan: no profileid, belongs to no base
];
/** The component state these two helpers actually read. ahDocsInScope() calls this.ahScopeIds(), so the
 *  real predicate is on the context too — the pair is what the screen runs. */
const ctx = (selectedCoachId: string, roster: string[]) => ({
  ALL: 'ALL',
  selectedCoachId,
  ahDocs: DOCS,
  rosterIds: () => roster,
  ahScopeIds: proto.ahScopeIds,
});
const scopeIds = (c: ReturnType<typeof ctx>) => proto.ahScopeIds.call(c);
const inScope = (c: ReturnType<typeof ctx>) => proto.ahDocsInScope.call(c);

describe('A&H analytics card — scope', () => {
  describe('the ALL view is the ecosystem view', () => {
    it('applies no filter', () => {
      expect(scopeIds(ctx('ALL', ['mine-1']))).toBeNull();
    });
    it('counts every doc, including one with no profileid', () => {
      expect(inScope(ctx('ALL', ['mine-1'])).length).toBe(DOCS.length);
    });
  });

  describe('a coach sees only their own base', () => {
    const coach = () => ctx('coach-1', ['mine-1', 'mine-2']);

    it('scopes to the roster', () => {
      expect([...(scopeIds(coach()) as Set<string>)]).toEqual(['mine-1', 'mine-2']);
    });
    it('keeps their participants docs', () => {
      expect(inScope(coach()).map((d) => d.profileid)).toEqual(['mine-1', 'mine-2']);
    });
    it('drops another coach\'s participant — the leak this fix closes', () => {
      expect(inScope(coach()).some((d) => d.profileid === 'theirs-1')).toBe(false);
    });
    it('drops a doc with no profileid: it cannot be attributed to a base', () => {
      expect(inScope(coach()).some((d) => !d.profileid)).toBe(false);
    });
    it('returns nothing for a coach with an empty roster', () => {
      expect(inScope(ctx('coach-2', []))).toEqual([]);
    });
  });

  it('scopes the Unassigned view like any other non-ALL scope', () => {
    const unassigned = ctx('UNASSIGNED', ['theirs-1']);
    expect(scopeIds(unassigned)).not.toBeNull();
    expect(inScope(unassigned).map((d) => d.profileid)).toEqual(['theirs-1']);
  });

  it('never invents docs: every scoped doc came from the one base-wide read', () => {
    for (const c of [ctx('ALL', []), ctx('coach-1', ['mine-1'])]) {
      expect(inScope(c).every((d) => DOCS.includes(d))).toBe(true);
    }
  });
});
