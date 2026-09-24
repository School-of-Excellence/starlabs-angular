import { JourneyCoachHealthDashboardComponent } from './journey-coach-health-dashboard.component';

/**
 * Needs-attention predicate coverage (doc item 4).
 *
 * isNeedsAttention / isNeedsAttentionLite are pure functions of a single row's own fields —
 * they read no component state (no `this`) — so we exercise them off the prototype without
 * constructing the component (which would require Firestore / Router injection). This keeps the
 * test fast and free of Angular TestBed setup while still covering the real production predicate.
 */
type AnyRow = Record<string, unknown>;
const proto = JourneyCoachHealthDashboardComponent.prototype as unknown as {
  isNeedsAttention(r: AnyRow): boolean;
  isNeedsAttentionLite(l: AnyRow): boolean;
};
const isNeedsAttention = (r: AnyRow) => proto.isNeedsAttention.call(null, r);
const isNeedsAttentionLite = (l: AnyRow) => proto.isNeedsAttentionLite.call(null, l);

const clean: AnyRow = {
  lapsed: false,
  notStarted: false,
  openTickets: 0,
  financialstatus: 'active',
  llCritical: false,
  llAttention: false,
};

const cases: Array<[string, (r: AnyRow) => boolean]> = [
  ['isNeedsAttention', isNeedsAttention],
  ['isNeedsAttentionLite', isNeedsAttentionLite],
];

for (const [name, predicate] of cases) {
  describe(`JourneyCoachHealthDashboard ${name}`, () => {
    it('is false for a clean row (nothing to address)', () => {
      expect(predicate({ ...clean })).toBeFalsy();
    });

    it('flags a lapsed row', () => {
      expect(predicate({ ...clean, lapsed: true })).toBeTruthy();
    });

    it('flags a not-started row', () => {
      expect(predicate({ ...clean, notStarted: true })).toBeTruthy();
    });

    it('flags a row with open tickets', () => {
      expect(predicate({ ...clean, openTickets: 2 })).toBeTruthy();
    });

    it('flags locked / defaulted finance case-insensitively, but not other statuses', () => {
      expect(predicate({ ...clean, financialstatus: 'Locked' })).toBeTruthy();
      expect(predicate({ ...clean, financialstatus: 'DEFAULTED' })).toBeTruthy();
      // 'late' (the Missed tile's field value) is intentionally NOT a Needs-attention trigger.
      expect(predicate({ ...clean, financialstatus: 'late' })).toBeFalsy();
      expect(predicate({ ...clean, financialstatus: 'active' })).toBeFalsy();
    });

    it('flags love-letter critical or needs-attention tags', () => {
      expect(predicate({ ...clean, llCritical: true })).toBeTruthy();
      expect(predicate({ ...clean, llAttention: true })).toBeTruthy();
    });

    it('does not flag a love-letter opportunity on its own', () => {
      expect(predicate({ ...clean, llOpportunity: true })).toBeFalsy();
    });

    it('tolerates a missing financialstatus', () => {
      const row: AnyRow = { ...clean };
      delete row['financialstatus'];
      expect(predicate(row)).toBeFalsy();
    });

    it('does NOT flag going-quiet or renewal-window (doc item 4 removed them from the union)', () => {
      expect(predicate({ ...clean, goingQuiet: true })).toBeFalsy();
      expect(predicate({ ...clean, renewalWindow: true })).toBeFalsy();
      expect(predicate({ ...clean, goingQuiet: true, renewalWindow: true })).toBeFalsy();
    });
  });
}
