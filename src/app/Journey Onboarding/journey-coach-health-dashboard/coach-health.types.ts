/**
 * Coach-set health scale + unified activity-log types.
 *
 * The coach-SET health state is a manual coach assessment and is INTENTIONALLY separate from the
 * Phase-2 computed `HealthState` (Sad/Neutral/Happy/Evangelist) in health-score.engine.ts — that
 * engine's contract is untouched. This scale is what coaches pick via the Set-health composer.
 *
 * Severity order (best -> worst): HAPPY > NEUTRAL > UNHAPPY > AT_RISK > CRITICAL.
 * "Not assessed" is the absence of any record (no value in this union).
 */
export type CoachHealthState = 'HAPPY' | 'NEUTRAL' | 'UNHAPPY' | 'AT_RISK' | 'CRITICAL';

/** Event types written to the unified append-only healthtracker_activity log. */
export type ActivityType = 'call' | 'health' | 'schedule' | 'note' | 'flag' | 'coach_change' | 'addressed';

/** Ordered list of the coach-set states for option pickers / distribution iteration. */
export const COACH_HEALTH_OPTIONS: CoachHealthState[] = ['HAPPY', 'NEUTRAL', 'UNHAPPY', 'AT_RISK', 'CRITICAL'];

/** Human label for a coach-set health state. */
export function coachHealthLabel(s: CoachHealthState | null | undefined): string {
  switch (s) {
    case 'HAPPY': return 'Happy';
    case 'NEUTRAL': return 'Neutral';
    case 'UNHAPPY': return 'Unhappy';
    case 'AT_RISK': return 'At-risk';
    case 'CRITICAL': return 'Critical';
    default: return 'Not assessed';
  }
}

/** CSS class for a coach-set health state (matches the .state-* block in the dashboard CSS). */
export function coachHealthStateClass(s: CoachHealthState | null | undefined): string {
  switch (s) {
    case 'HAPPY': return 'state-happy';
    case 'NEUTRAL': return 'state-neutral';
    case 'UNHAPPY': return 'state-unhappy';
    case 'AT_RISK': return 'state-at-risk';
    case 'CRITICAL': return 'state-critical';
    default: return 'state-not-assessed';
  }
}

/** Map a legacy stored value to the new coach-set scale. SAD->UNHAPPY, EVANGELIST->HAPPY; the
 *  new values and HAPPY/NEUTRAL pass through unchanged. Unknown -> null (treated as Not assessed). */
export function normalizeCoachHealth(raw: any): CoachHealthState | null {
  const v = (typeof raw === 'string' ? raw : '').trim().toUpperCase();
  switch (v) {
    case 'HAPPY': return 'HAPPY';
    case 'NEUTRAL': return 'NEUTRAL';
    case 'UNHAPPY': return 'UNHAPPY';
    case 'AT_RISK': return 'AT_RISK';
    case 'CRITICAL': return 'CRITICAL';
    case 'SAD': return 'UNHAPPY';        // legacy
    case 'EVANGELIST': return 'HAPPY';   // legacy
    default: return null;
  }
}
