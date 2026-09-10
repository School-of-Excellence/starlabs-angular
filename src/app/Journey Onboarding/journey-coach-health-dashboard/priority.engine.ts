/**
 * Coach Portfolio Priority Engine (pure, dependency-free).
 *
 * Decides which participants a coach should contact first: a weighted 0-100 priority, a High/Medium/Low
 * band, and a human-readable reason naming the top two drivers and the suggested action.
 *
 * Extracted from JourneyCoachHealthDashboardComponent.scoreRow() on 2026-09-10. The logic is UNCHANGED —
 * same weights, same thresholds, same driver strings, same rounding and clamping. Only its location moved.
 *
 * WHY IT LIVES HERE, mirroring health-score.engine.ts in this same folder:
 * - NO Angular / Firestore imports. Pure functions, so the rules can be unit-tested offline against
 *   synthetic rows instead of standing up a 3,000-line component with a mocked Firestore.
 * - As a private method on that component it was unreachable from a spec, and an e2e case could only
 *   assert a RENDERED band — so a wrong weight that still landed in the same band passed silently.
 * - Unlike the health engine (gated behind SHOW_HEALTH), this one RUNS IN PRODUCTION today and drives what
 *   every coach sees at the top of their list.
 *
 * The thresholds below are the component's own readonly values, kept as defaults so behaviour is identical
 * when the caller passes nothing, and injectable so tests can pin a boundary without rewriting a constant.
 */

/** The subset of a portfolio row the priority rules actually read. */
export interface PriorityInput {
  daysSinceCoach: number | null;
  daysToRenewal: number | null;
  notStarted: boolean;
  lapsed: boolean;
  renewalWindow: boolean;
  goingQuiet: boolean;
  financialstatus: string | null;
  openTickets: number;
  opportunities: string[];
  opportunitiesConsumed: string[];
}

export type PriorityBand = 'High' | 'Medium' | 'Low';

export interface PriorityResult {
  priority: number;        // 0..100, rounded
  priorityBand: PriorityBand;
  reason: string;          // "top driver + second driver → action", or 'On track'
}

/** Component defaults (journey-coach-health-dashboard.component.ts:180-182). */
export const QUIET_DAYS = 60;
export const RENEWAL_DAYS = 90;

/** Band cut-offs. */
export const HIGH_MIN = 40;
export const MEDIUM_MIN = 22;

export interface PriorityThresholds {
  quietDays: number;
  renewalDays: number;
}

const DEFAULTS: PriorityThresholds = { quietDays: QUIET_DAYS, renewalDays: RENEWAL_DAYS };

/**
 * A continuity opportunity exists but has not been taken up yet — worth a nudge, so it adds weight to a
 * renewal-window row.
 */
export function continuityOpen(r: Pick<PriorityInput, 'opportunities' | 'opportunitiesConsumed'>): boolean {
  return r.opportunities.some((o) => /continuity/i.test(o))
    && !r.opportunitiesConsumed.some((o) => /continuity/i.test(o));
}

/** The single next action suggested for a row, in priority order of what is wrong. */
export function actionFor(r: PriorityInput): string {
  if (r.lapsed) return 'win-back';
  if (r.renewalWindow) return 'continuity call';
  if (r.notStarted) return 'kickstart journey';
  const fin = (r.financialstatus ?? '').toLowerCase();
  if (fin === 'defaulted' || fin === 'locked' || fin === 'late') return 'finance follow-up';
  if (r.openTickets > 0) return 'resolve support';
  if (r.goingQuiet) return 're-engage';
  return 'check in';
}

/** Band a 0-100 priority. */
export function bandFor(priority: number): PriorityBand {
  return priority >= HIGH_MIN ? 'High' : priority >= MEDIUM_MIN ? 'Medium' : 'Low';
}

/**
 * Score one row.
 *
 * Weights (unchanged from scoreRow):
 *   quiet beyond quietDays   -> up to 20, scaled by min(days,180)/180
 *   journey not started      -> 24
 *   lapsed                   -> 40
 *   in renewal window        -> up to 32, scaled by how close the renewal is, +8 if continuity is open
 *   payments defaulted/locked-> 26   (late -> 15)
 *   open tickets             -> 4 each, counting at most 3
 *
 * NOTE (carried over from the original): customerstatus 'late' means the participant is gone
 * (unactionable). It does NOT add priority; such rows are excluded from the active board upstream.
 */
export function scorePriority(r: PriorityInput, thresholds: PriorityThresholds = DEFAULTS): PriorityResult {
  const { quietDays, renewalDays } = thresholds;
  let p = 0;
  const drivers: string[] = [];

  if (r.daysSinceCoach != null && r.daysSinceCoach > quietDays) {
    p += Math.min(r.daysSinceCoach, 180) / 180 * 20;
    drivers.push(`quiet ${r.daysSinceCoach}d`);
  }
  if (r.notStarted) { p += 24; drivers.push('journey not started'); }
  if (r.lapsed) { p += 40; drivers.push(`lapsed ${Math.abs(r.daysToRenewal ?? 0)}d ago`); }
  if (r.renewalWindow) {
    p += (renewalDays - (r.daysToRenewal ?? renewalDays)) / renewalDays * 32;
    if (continuityOpen(r)) p += 8;
    drivers.push(`renewal ${r.daysToRenewal}d`);
  }
  const fin = (r.financialstatus ?? '').toLowerCase();
  if (fin === 'defaulted' || fin === 'locked') { p += 26; drivers.push(`${fin} payments`); }
  else if (fin === 'late') { p += 15; drivers.push('late payments'); }
  if (r.openTickets > 0) {
    p += Math.min(r.openTickets, 3) * 4;
    drivers.push(`${r.openTickets} open ticket${r.openTickets > 1 ? 's' : ''}`);
  }

  const priority = Math.max(0, Math.min(100, Math.round(p)));
  return {
    priority,
    priorityBand: bandFor(priority),
    reason: drivers.length ? `${drivers.slice(0, 2).join(' + ')} → ${actionFor(r)}` : 'On track',
  };
}
