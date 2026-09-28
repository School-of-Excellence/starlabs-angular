import { JourneyCoachHealthDashboardComponent } from './journey-coach-health-dashboard.component';

/**
 * Going-Quiet BUCKET mutual-exclusivity (Joshua: "either Needs Attention or Going Quiet, no
 * duplicates"). isGoingQuietBucket / isGoingQuietBucketLite are `goingQuiet && !isNeedsAttention`,
 * so they only read the row's own fields plus the needs-attention predicate. We exercise them off
 * the prototype with a minimal `this` that provides the needs-attention predicates — no Firestore /
 * Router / TestBed needed.
 *
 * REVERT GUARD: the "quiet AND needs-attention -> excluded" cases below go RED if the bucket is
 * reverted to the raw `goingQuiet` flag (which would return true and re-introduce the duplicate).
 */
type AnyRow = Record<string, unknown>;
const proto = JourneyCoachHealthDashboardComponent.prototype as unknown as {
  isNeedsAttention(r: AnyRow): boolean;
  isNeedsAttentionLite(l: AnyRow): boolean;
  isGoingQuietBucket(r: AnyRow): boolean;
  isGoingQuietBucketLite(l: AnyRow): boolean;
};
const ctx = { isNeedsAttention: proto.isNeedsAttention, isNeedsAttentionLite: proto.isNeedsAttentionLite };
const isGoingQuietBucket = (r: AnyRow) => proto.isGoingQuietBucket.call(ctx, r);
const isGoingQuietBucketLite = (l: AnyRow) => proto.isGoingQuietBucketLite.call(ctx, l);

const clean: AnyRow = {
  goingQuiet: false,
  lapsed: false,
  notStarted: false,
  openTickets: 0,
  financialstatus: 'active',
  llCritical: false,
  llAttention: false,
};

const cases: Array<[string, (r: AnyRow) => boolean]> = [
  ['isGoingQuietBucket', isGoingQuietBucket],
  ['isGoingQuietBucketLite', isGoingQuietBucketLite],
];

for (const [name, bucket] of cases) {
  describe(`JourneyCoachHealthDashboard ${name}`, () => {
    it('is false for a clean, non-quiet row', () => {
      expect(bucket({ ...clean })).toBeFalsy();
    });

    it('is true for a quiet row with no other flagged issue', () => {
      expect(bucket({ ...clean, goingQuiet: true })).toBeTruthy();
    });

    it('is false when the row is not quiet, regardless of issues', () => {
      expect(bucket({ ...clean, goingQuiet: false, openTickets: 3 })).toBeFalsy();
    });

    // Needs Attention wins: a quiet row that ALSO has a needs-attention issue leaves the bucket
    // (these are the revert-guard cases — raw goingQuiet would return true here).
    it('EXCLUDES a quiet row that also has open tickets (Needs Attention wins)', () => {
      expect(bucket({ ...clean, goingQuiet: true, openTickets: 2 })).toBeFalsy();
    });

    it('EXCLUDES a quiet row that is also lapsed', () => {
      expect(bucket({ ...clean, goingQuiet: true, lapsed: true })).toBeFalsy();
    });

    it('EXCLUDES a quiet row that is also payments-locked/defaulted', () => {
      expect(bucket({ ...clean, goingQuiet: true, financialstatus: 'Locked' })).toBeFalsy();
      expect(bucket({ ...clean, goingQuiet: true, financialstatus: 'DEFAULTED' })).toBeFalsy();
    });

    it('EXCLUDES a quiet row with a love-letter critical / needs-attention tag', () => {
      expect(bucket({ ...clean, goingQuiet: true, llCritical: true })).toBeFalsy();
      expect(bucket({ ...clean, goingQuiet: true, llAttention: true })).toBeFalsy();
    });

    it('still INCLUDES a quiet row whose only extra flag is a non-NA one (opportunity / renewal)', () => {
      expect(bucket({ ...clean, goingQuiet: true, llOpportunity: true })).toBeTruthy();
      expect(bucket({ ...clean, goingQuiet: true, renewalWindow: true })).toBeTruthy();
    });
  });
}
