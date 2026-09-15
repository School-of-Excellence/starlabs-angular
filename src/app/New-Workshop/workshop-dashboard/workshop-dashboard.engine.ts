/**
 * Workshop Dashboard Rules Engine (pure, dependency-free).
 *
 * The arithmetic and the decisions behind the Workshop Dashboard: how far through a workshop a
 * participant is and which challenge counts as their "current" one, whether the previous challenge
 * unlocked the next, which of the seven sub-challenge statuses a raw Firestore string normalises to,
 * which participants a category-based workshop actually grants a challenge to (and therefore whose
 * progress it is measured against), the evergreen day-bucket distribution, the table's type/status
 * filters, and the CSV export's shape.
 *
 * Extracted on 2026-09-10 from BOTH dashboards in this folder — WorkshopDashboardComponent (3,068
 * lines) and WorkshopDashboardV2Component (2,946 lines) — following the pattern set by
 * delivery-dashboard.engine.ts and priority.engine.ts under ../../Journey Onboarding. The logic is
 * UNCHANGED: same operators, same rounding, same strings, same quirks. Several oddities (DEFECT notes
 * below) were deliberately left intact and pinned by tests rather than fixed, because this is a
 * refactor.
 *
 * WHY ONE ENGINE FOR TWO COMPONENTS: every rule extracted here was BYTE-IDENTICAL in the two
 * components — v2 is a fork of v1 that changed the shell and the queries, not the maths. Giving each
 * its own engine would have re-created the duplication this extraction exists to remove, and would
 * have let the two drift again the moment one is edited. Both components now delegate here, so there
 * is one implementation and one place a product decision changes.
 *
 * WHY IT LIVES HERE:
 * - NO Angular, NO Firestore, NO rxjs, NO DOM. Every function takes its inputs as arguments and
 *   returns a value, so the rules can be exercised offline instead of standing up a 3,000-line
 *   component that injects a Firestore, an HttpClient, a MatDialog and four live snapshots.
 * - As methods on those components the rules were reachable only through a rendered template. An e2e
 *   case could assert that a chip read "In Progress" — it could not tell "one sub-challenge has any
 *   status at all" from "one sub-challenge has actually been started", and those two definitions are
 *   both live in this codebase today (see DEFECT 4 in the spec).
 * - These are product decisions. Whether a zoom call counts toward completion, whether an uncategorised
 *   challenge is visible to a plain category participant, and what "ready to start" means all change
 *   what a facilitator does next. Changing one should turn a test red on purpose.
 *
 * WHAT IS DELIBERATELY *NOT* HERE:
 * - Anything that reads or writes Firestore, opens a dialog, drives a MatTableDataSource, downloads a
 *   file or mutates component state. Where a method mixed both, only the pure core moved — see
 *   updateCategoryBasedMetrics(), which still assigns its results onto the component and only asks the
 *   engine to do the bucketing and the averages.
 *
 * `now` is an injectable parameter with a default matching current behaviour, so a test can freeze the
 * clock without rewriting a constant.
 */

// =================================================================================================
// Shapes — the subset of each Firestore doc the rules actually read. `any` where the underlying doc
// is genuinely untyped in the components; narrowing it would be a behaviour change, not a refactor.
// =================================================================================================

/** One challenge as it appears on a PARTICIPANT's workshop doc. */
export interface ParticipantChallenge {
  type?: string;                       // 'challenge' | 'zoomcall'
  status?: string;
  challenges?: any[];                  // sub-challenges, each with its own `status`
  [key: string]: any;
}

/** One challenge as it appears on the WORKSHOP doc (the shared definition). */
export interface WorkshopChallenge {
  type?: string;
  status?: string;
  challenges?: any[];
  workshopcategory?: string[];
  facilitatoronly?: boolean;
  [key: string]: any;
}

/** The progress record the dashboard builds per participant. */
export interface ParticipantProgress {
  profileid: string;
  challenges: ParticipantChallenge[];
  currentChallengeIndex: number;
  currentSubChallengeIndex: number;
  completedChallenges: number;
  totalChallenges: number;
  progressPercentage: number;
}

/**
 * Everything the category-based access rules need to know about a workshop, gathered by the caller.
 * `categoryBased !== true` short-circuits every one of them, exactly as the components do.
 */
export interface CategoryContext {
  categoryBased: boolean;
  facilitatorProfiles: string[];
  workshopChallenges: WorkshopChallenge[];
  isCohort: (profileid: string) => boolean;
  categoryOf: (profileid: string) => string | undefined;
}

// =================================================================================================
// Status vocabulary
// =================================================================================================

/** The four buckets a whole challenge is tallied into. */
export const CHALLENGE_STATUSES = ['completed', 'inprogress', 'notstarted', 'notstartedcurrent'];

/** The seven buckets a sub-challenge is tallied into. */
export const SUB_CHALLENGE_STATUSES = [
  'completed', 'inprogress', 'inreview', 'rework', 'readyformobile', 'notstarted', 'notstartedcurrent'
];

/**
 * Raw sub-challenge status → the vocabulary the dashboard counts in.
 *
 * DEFECT (pinned): anything not in this map falls through to 'notstarted', silently. A status the
 * mobile app starts writing tomorrow reports as "not started" rather than as unknown.
 */
export function normalizeSubChallengeStatus(status: string | undefined): string {
  if (!status) { return 'notstarted'; }
  const statusMap = new Map([
    ['completed', 'completed'], ['inreview', 'inreview'], ['rework', 'rework'],
    ['readyformobile', 'readyformobile'], ['ready', 'inprogress'], ['ongoing', 'inprogress']
  ]);
  return statusMap.get(status.toLowerCase()) || 'notstarted';
}

/**
 * The status one participant is at on one whole challenge.
 *
 * A zoom call has no per-participant state, so it reads the WORKSHOP challenge's own status: when the
 * facilitator marks the call done, every participant flips to completed at once.
 *
 * DEFECT (pinned): the in-progress test is `.some(sc => sc.status)` — ANY truthy status, including the
 * literal string 'notstarted'. challengeDisplayStatus() below tests the same thing while excluding
 * 'notstarted', so the two disagree on the same data.
 */
export function participantChallengeStatus(
  challenge: ParticipantChallenge | undefined,
  workshopChallenge: WorkshopChallenge | undefined
): string {
  if (!challenge) { return 'notstarted'; }
  if (challenge.type === 'zoomcall') { return workshopChallenge?.status === 'completed' ? 'completed' : 'notstarted'; }
  if (challenge.status === 'completed') { return 'completed'; }
  if (challenge.challenges?.some((sc: any) => sc.status)) { return 'inprogress'; }
  return 'notstarted';
}

/** The status rendered on the challenge card. Same rule as above, but 'notstarted' does not count. */
export function challengeDisplayStatus(
  challenge: ParticipantChallenge | undefined,
  workshopChallenge: WorkshopChallenge | undefined
): string {
  if (!challenge) { return 'notstarted'; }
  if (challenge.type === 'zoomcall') { return workshopChallenge?.status === 'completed' ? 'completed' : 'notstarted'; }
  if (challenge.status === 'completed') { return 'completed'; }
  if (challenge.challenges?.some((sc: any) => sc.status && sc.status !== 'notstarted')) { return 'inprogress'; }
  return 'notstarted';
}

// =================================================================================================
// Progress — which challenge is "current", and how far through the participant is
// =================================================================================================

/**
 * Has the challenge before `currentIndex` been finished? Index 0 has nothing before it, so it is
 * always unlocked.
 *
 * A zoom call is judged on the WORKSHOP doc (facilitator-controlled), everything else on the
 * participant's own doc.
 */
export function isPreviousChallengeCompleted(
  challenges: ParticipantChallenge[],
  currentIndex: number,
  workshopChallenges: WorkshopChallenge[] = []
): boolean {
  if (currentIndex <= 0) { return true; }
  const previousChallenge = challenges[currentIndex - 1];
  const workshopPreviousChallenge = workshopChallenges?.[currentIndex - 1];
  return previousChallenge.type === 'zoomcall'
    ? workshopPreviousChallenge?.status === 'completed'
    : previousChallenge.status === 'completed';
}

/** Is sub-challenge (i, j) the one the participant is on? First in a challenge unlocks with the
 *  previous challenge; later ones unlock with the sub-challenge directly before them. */
export function shouldSetAsCurrent(
  challenges: ParticipantChallenge[],
  i: number,
  j: number,
  workshopChallenges: WorkshopChallenge[] = []
): boolean {
  if (j === 0) {
    return i === 0 || isPreviousChallengeCompleted(challenges, i, workshopChallenges);
  }
  return challenges[i].challenges![j - 1].status === 'completed';
}

/** A zoom call is current when it is unlocked and the facilitator has not marked it done. */
export function shouldSetZoomCallAsCurrent(
  challenges: ParticipantChallenge[],
  i: number,
  workshopChallenge: WorkshopChallenge | undefined,
  workshopChallenges: WorkshopChallenge[] = []
): boolean {
  if (i === 0 || isPreviousChallengeCompleted(challenges, i, workshopChallenges)) {
    return workshopChallenge?.status !== 'completed';
  }
  return false;
}

/**
 * Where to park the cursor when nothing is current — i.e. everything is finished. Walks BACKWARDS to
 * the last real challenge and points at its final sub-challenge, so a finished participant lands on
 * the end of the workshop rather than back at the start. null when there is nothing to point at.
 */
export function fallbackCurrent(
  challenges: ParticipantChallenge[]
): { challengeIndex: number; subChallengeIndex: number } | null {
  for (let i = challenges.length - 1; i >= 0; i--) {
    if (challenges[i].type === 'challenge' && challenges[i].challenges) {
      return { challengeIndex: i, subChallengeIndex: challenges[i].challenges!.length - 1 };
    } else if (challenges[i].type === 'zoomcall') {
      return { challengeIndex: i, subChallengeIndex: 0 };
    }
  }
  return null;
}

/** Cheap structural equality over statuses only — the cache key that decides whether progress needs
 *  recomputing. Anything else changing on a challenge doc does not move progress, so it is ignored. */
export function areChallengesEqual(challenges1: any[], challenges2: any[]): boolean {
  if (!challenges1 || !challenges2) { return false; }
  if (challenges1.length !== challenges2.length) { return false; }
  for (let i = 0; i < challenges1.length; i++) {
    const c1 = challenges1[i];
    const c2 = challenges2[i];
    if (c1?.status !== c2?.status) { return false; }
    if (c1?.challenges && c2?.challenges) {
      if (c1.challenges.length !== c2.challenges.length) { return false; }
      for (let j = 0; j < c1.challenges.length; j++) {
        if (c1.challenges[j]?.status !== c2.challenges[j]?.status) { return false; }
      }
    }
  }
  return true;
}

/**
 * One participant's progress record: the cursor, the counts and the percentage.
 *
 * DEFECT (pinned): only `type === 'challenge'` challenges contribute to totalChallenges, so a zoom
 * call is invisible to the percentage — a participant can read 100% with an outstanding zoom call.
 */
export function calculateParticipantProgress(
  profileId: string,
  challenges: ParticipantChallenge[],
  workshopChallenges: WorkshopChallenge[] = []
): ParticipantProgress {
  let currentChallengeIndex = 0;
  let currentSubChallengeIndex = 0;
  let completedChallenges = 0;
  let totalChallenges = 0;
  let foundCurrent = false;

  for (let i = 0; i < challenges.length; i++) {
    const challenge = challenges[i];
    const workshopChallenge = workshopChallenges?.[i];

    if (challenge.type === 'challenge' && challenge.challenges) {
      totalChallenges += challenge.challenges.length;

      for (let j = 0; j < challenge.challenges.length; j++) {
        const subChallenge = challenge.challenges[j];
        if (subChallenge.status === 'completed') {
          completedChallenges++;
        } else if (!foundCurrent && shouldSetAsCurrent(challenges, i, j, workshopChallenges)) {
          currentChallengeIndex = i;
          currentSubChallengeIndex = j;
          foundCurrent = true;
        }
      }
    } else if (challenge.type === 'zoomcall' && !foundCurrent) {
      if (shouldSetZoomCallAsCurrent(challenges, i, workshopChallenge, workshopChallenges)) {
        currentChallengeIndex = i;
        currentSubChallengeIndex = 0;
        foundCurrent = true;
      }
    }
  }

  if (!foundCurrent && challenges.length > 0) {
    const fb = fallbackCurrent(challenges);
    if (fb) { currentChallengeIndex = fb.challengeIndex; currentSubChallengeIndex = fb.subChallengeIndex; }
  }

  const progressPercentage = totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;

  return {
    profileid: profileId,
    challenges,
    currentChallengeIndex,
    currentSubChallengeIndex,
    completedChallenges,
    totalChallenges,
    progressPercentage
  };
}

// =================================================================================================
// "Ready to start" — the notstartedcurrent bucket
// =================================================================================================

/** The nearest challenge before `challengeIndex` that is not a zoom call, or -1 if there is none. */
export function previousNonZoomIndex(challengeIndex: number, workshopChallenges: WorkshopChallenge[] = []): number {
  for (let i = challengeIndex - 1; i >= 0; i--) {
    if (workshopChallenges?.[i]?.type !== 'zoomcall') { return i; }
  }
  return -1;
}

/**
 * Is this participant standing at the door of `challengeIndex`? True at the start, true when nothing
 * but zoom calls precede it, otherwise only when the previous real challenge is completed.
 */
export function isReadyForChallenge(
  participant: { challenges: ParticipantChallenge[] },
  challengeIndex: number,
  workshopChallenges: WorkshopChallenge[] = []
): boolean {
  if (challengeIndex === 0) { return true; }
  const prev = previousNonZoomIndex(challengeIndex, workshopChallenges);
  if (prev === -1) { return true; }
  return participantChallengeStatus(participant.challenges[prev], workshopChallenges?.[prev]) === 'completed';
}

/**
 * Same question for a sub-challenge. The first sub-challenge inherits the challenge's own readiness;
 * later ones need the sub-challenge directly before them completed.
 */
export function isReadyForSubChallenge(
  participant: { challenges: ParticipantChallenge[] },
  challengeIndex: number,
  subChallengeIndex: number,
  workshopChallenges: WorkshopChallenge[] = []
): boolean {
  if (subChallengeIndex === 0) {
    return isReadyForChallenge(participant, challengeIndex, workshopChallenges);
  }
  const challenge = participant.challenges[challengeIndex];
  if (!challenge?.challenges) { return false; }
  return challenge.challenges[subChallengeIndex - 1]?.status === 'completed';
}

// =================================================================================================
// Challenge statistics — the per-status participant lists behind every clickable count
// =================================================================================================

export interface SubChallengeStats {
  subChallengeIndex: number;
  subChallengeName: string;
  type: string;
  participantsByStatus: Map<string, string[]>;
}

export interface ChallengeStatusBuckets {
  participantsByStatus: Map<string, string[]>;
  subChallengeStats: SubChallengeStats[];
}

/**
 * Bucket every participant by their status on one challenge and on each of its sub-challenges.
 *
 * 'notstartedcurrent' is a SUBSET of 'notstarted', not a sibling: a participant who has not started
 * AND is next in line is counted in both, so the "not started" total stays whole while the dashboard
 * can still highlight the ones who could start right now.
 */
export function challengeStatusBuckets(
  participants: { profileid: string; challenges: ParticipantChallenge[] }[],
  challenge: WorkshopChallenge,
  challengeIndex: number,
  workshopChallenges: WorkshopChallenge[] = []
): ChallengeStatusBuckets {
  const statusMap = new Map<string, string[]>(CHALLENGE_STATUSES.map(s => [s, [] as string[]]));
  const subChallengeStats: SubChallengeStats[] = [];

  challenge.challenges?.forEach((subChallenge: any, subIndex: number) => {
    const subStats: SubChallengeStats = {
      subChallengeIndex: subIndex,
      subChallengeName: subChallenge.name,
      type: subChallenge.type,
      participantsByStatus: new Map<string, string[]>(SUB_CHALLENGE_STATUSES.map(s => [s, [] as string[]]))
    };
    participants.forEach(participant => {
      const participantSubChallenge = participant.challenges[challengeIndex]?.challenges?.[subIndex];
      const status = normalizeSubChallengeStatus(participantSubChallenge?.status);
      subStats.participantsByStatus.get(status)?.push(participant.profileid);
      if (status === 'notstarted' && isReadyForSubChallenge(participant, challengeIndex, subIndex, workshopChallenges)) {
        subStats.participantsByStatus.get('notstartedcurrent')?.push(participant.profileid);
      }
    });
    subChallengeStats.push(subStats);
  });

  participants.forEach(participant => {
    const participantStatus = participantChallengeStatus(
      participant.challenges[challengeIndex], workshopChallenges?.[challengeIndex]
    );
    statusMap.get(participantStatus)?.push(participant.profileid);
    if (participantStatus === 'notstarted' && isReadyForChallenge(participant, challengeIndex, workshopChallenges)) {
      statusMap.get('notstartedcurrent')?.push(participant.profileid);
    }
  });

  return { participantsByStatus: statusMap, subChallengeStats };
}

// =================================================================================================
// Evergreen workshops — bucket participants by which day they are on
// =================================================================================================

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayBucket { day: number; count: number; profileIds: string[]; completed?: boolean; }

export interface EvergreenDistribution {
  buckets: DayBucket[];
  completed: DayBucket;
  total: number;
}

/** Firestore Timestamp | Date | seconds-object | parsable string → epoch ms, or null. */
export function toMillis(ts: any): number | null {
  if (!ts) { return null; }
  if (typeof ts.toMillis === 'function') { return ts.toMillis(); }
  if (typeof ts.toDate === 'function') { return ts.toDate().getTime(); }
  if (typeof ts.seconds === 'number') { return ts.seconds * 1000; }
  if (ts instanceof Date) { return ts.getTime(); }
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.getTime();
}

/** `Number(meta.workshopDays)`, with anything unparsable reading as 0 (which disables the section). */
export function evergreenWorkshopDays(meta: any): number {
  return Number(meta?.workshopDays) || 0;
}

/**
 * Bucket enrolled participants by their current workshop day.
 *   day = floor((now - enrollmentdate) / 24h) + 1, exact to the second.
 * Anything past `days` falls into the Completed bucket. Participants with no enrollment date are
 * skipped entirely and are not counted in `total`.
 *
 * DEFECT (pinned): a future-dated enrolment is clamped to Day 1 rather than flagged.
 */
/**
 * NOT WIRED as of the 2026-09-10 development merge — kept for its tests, not called by either component.
 * Development split the over-run branch: a participant past the final day who has any workshop extension
 * (getExtendEntries / extenduntill) now goes to an EXTENDED bucket with an activeCount, instead of
 * straight to Completed. This function has no extended bucket at all, so wiring it back would delete
 * that feature. Re-extracting it needs an extendEntriesOf(profileid) accessor injected, and a check that
 * workshop-dashboardv2 — which shares this engine and has no extension data — still works.
 */
export function evergreenDayDistribution(
  participants: { profileid: string; enrollmentdate?: any }[],
  days: number,
  now: number = Date.now()
): EvergreenDistribution {
  const empty: EvergreenDistribution = {
    buckets: [], completed: { day: -1, count: 0, profileIds: [], completed: true }, total: 0
  };
  if (days <= 0) { return empty; }

  const buckets: DayBucket[] = [];
  for (let i = 1; i <= days; i++) { buckets.push({ day: i, count: 0, profileIds: [] }); }
  const completed: DayBucket = { day: -1, count: 0, profileIds: [], completed: true };
  let total = 0;

  for (const p of participants) {
    const enrolledMs = toMillis(p.enrollmentdate);
    if (enrolledMs == null) { continue; }
    total++;
    let day = Math.floor((now - enrolledMs) / DAY_MS) + 1;
    if (day < 1) { day = 1; }   // guard against clock skew / future-dated enrollment
    if (day > days) {
      completed.count++;
      completed.profileIds.push(p.profileid);
    } else {
      const b = buckets[day - 1];
      b.count++;
      b.profileIds.push(p.profileid);
    }
  }

  return { buckets, completed, total };
}

// =================================================================================================
// Headline metrics
// =================================================================================================

/**
 * The five headline participant lists.
 *
 * DEFECT (pinned): `active` is `progress > 0`, which INCLUDES the 100% participants also counted as
 * `completed` — the two tiles overlap and do not sum to the enrolled total.
 */
export function headlineMetrics(
  enrolled: { profileid: string; status?: string }[],
  progressList: { profileid: string; progressPercentage: number }[]
): { [key: string]: string[] } {
  return {
    totalEnrolled: enrolled.map(p => p.profileid),
    totalStarted: enrolled.filter(p => p.status === 'enrolled').map(p => p.profileid),
    notStarted: enrolled.filter(p => p.status === 'enrollednotstarted').map(p => p.profileid),
    activeParticipants: progressList.filter(p => p.progressPercentage > 0).map(p => p.profileid),
    completedParticipants: progressList.filter(p => p.progressPercentage === 100).map(p => p.profileid)
  };
}

/** Completed over enrolled, as a percentage. 0 when nobody is enrolled. */
export function completionRatePct(completed: number, total: number): number {
  return total > 0 ? (completed / total) * 100 : 0;
}

/** Mean progress across a list. 0 for an empty list. */
export function averageProgress(list: { progressPercentage: number }[]): number {
  return list.length > 0
    ? list.reduce((sum, p) => sum + p.progressPercentage, 0) / list.length
    : 0;
}

/** The 'Not Started' / 'In Progress' / 'Completed' wording used by the CSV export. */
export function overallProgressLabel(progressPercentage: number | null | undefined): string {
  if (progressPercentage === 100) { return 'Completed'; }
  if ((progressPercentage ?? 0) > 0) { return 'In Progress'; }
  return 'Not Started';
}

// =================================================================================================
// Category-based workshops — access, progress, labels
// =================================================================================================

/**
 * Does this participant have access to this challenge?
 *
 * On a workshop that is not category-based, everyone has access to everything. Otherwise:
 *   facilitator-only challenge → facilitators only
 *   cohort member or facilitator → everything
 *   challenge with categories → the participant's category must be one of them
 *
 * DEFECT (pinned): the final `return false`. A challenge with NO categories listed, on a
 * category-based workshop, is invisible to every plain category participant — the opposite of the
 * "no restriction listed = open to all" reading, and the same shape of default that
 * getFilteredParticipantProgressList() applies to its statistics.
 */
export function hasAccessToChallenge(profileid: string, challengeIndex: number, ctx: CategoryContext): boolean {
  if (ctx.categoryBased !== true) { return true; }
  const challenge = ctx.workshopChallenges?.[challengeIndex];
  if (!challenge) { return true; }

  const isFacilitator = ctx.facilitatorProfiles.includes(profileid);
  const isCohort = ctx.isCohort(profileid);
  const isFacilitatorOnly = challenge.facilitatoronly === true;
  const challengeCatIds: string[] = challenge.workshopcategory || [];

  if (isFacilitatorOnly) { return isFacilitator; }
  if (isCohort || isFacilitator) { return true; }
  if (challengeCatIds.length > 0) {
    const participantCat = ctx.categoryOf(profileid);
    return participantCat ? challengeCatIds.includes(participantCat) : false;
  }
  return false;
}

/**
 * Progress measured only over the challenges this participant can actually see, so a category
 * participant is not marked down for work that was never offered to them. Falls straight through to
 * the plain progress record when the workshop is not category-based.
 *
 * DEFECT (pinned): with no accessible challenges at all, totalChallenges is 0 and the percentage is 0
 * — indistinguishable from "enrolled and has done nothing".
 */
export function accessBasedProgress(
  participant: ParticipantProgress,
  ctx: CategoryContext
): { completedChallenges: number; totalChallenges: number; progressPercentage: number } {
  if (ctx.categoryBased !== true) {
    return {
      completedChallenges: participant.completedChallenges,
      totalChallenges: participant.totalChallenges,
      progressPercentage: participant.progressPercentage
    };
  }
  let completedChallenges = 0;
  let totalChallenges = 0;
  for (let i = 0; i < (participant.challenges || []).length; i++) {
    if (!hasAccessToChallenge(participant.profileid, i, ctx)) { continue; }
    const challenge = participant.challenges[i];
    if (challenge.type === 'challenge' && challenge.challenges) {
      totalChallenges += challenge.challenges.length;
      for (let j = 0; j < challenge.challenges.length; j++) {
        if (challenge.challenges[j].status === 'completed') { completedChallenges++; }
      }
    }
  }
  const progressPercentage = totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;
  return { completedChallenges, totalChallenges, progressPercentage };
}

/** The badge under a participant's name. '' on a workshop that is not category-based. */
export function participantTypeLabel(
  profileid: string,
  ctx: CategoryContext,
  categoryName: (id: string) => string | undefined
): string {
  if (ctx.categoryBased !== true) { return ''; }
  if (ctx.facilitatorProfiles.includes(profileid)) { return 'Facilitator'; }
  if (ctx.isCohort(profileid)) { return 'Above Diagnostics'; }
  const catId = ctx.categoryOf(profileid);
  if (catId) { return categoryName(catId) || 'Category'; }
  return 'N/A';
}

/** The CSS modifier for that badge. Note the fall-through: anyone who is neither a facilitator nor a
 *  cohort member is styled as a category participant, even when they have no category. */
export function participantTypeClass(profileid: string, ctx: CategoryContext): string {
  if (ctx.categoryBased !== true) { return ''; }
  if (ctx.facilitatorProfiles.includes(profileid)) { return 'type-facilitator'; }
  if (ctx.isCohort(profileid)) { return 'type-cohort'; }
  return 'type-category';
}

/** Category ids on a challenge, resolved to names and joined. '' when the challenge has none. */
export function challengeCategoryNames(catIds: string[], nameOf: (id: string) => string | undefined): string {
  if (!catIds || catIds.length === 0) { return ''; }
  return catIds.map(id => nameOf(id) || 'Unknown').join(', ');
}

/** Is the challenge card rendered at all under the current category filter? */
export function isChallengeVisibleForCategory(
  challengeIndex: number,
  selectedCategoryFilter: string,
  ctx: CategoryContext
): boolean {
  if (selectedCategoryFilter === 'all' || selectedCategoryFilter === 'cohort' || ctx.categoryBased !== true) { return true; }
  const challenge = ctx.workshopChallenges?.[challengeIndex];
  if (selectedCategoryFilter === 'facilitator') { return challenge?.facilitatoronly === true; }
  const catIds: string[] = challenge?.workshopcategory || [];
  return catIds.includes(selectedCategoryFilter);
}

/**
 * The participants a challenge's STATISTICS are computed over.
 *
 * An explicit category filter wins outright. Otherwise, per challenge: facilitator-only counts
 * facilitators, a categorised challenge counts cohort + facilitators + matching categories, and an
 * uncategorised challenge counts ONLY cohort + facilitators — the same "no categories means nobody"
 * default as hasAccessToChallenge().
 */
export function filteredProgressListForChallenge(
  progressList: ParticipantProgress[],
  challengeIndex: number | undefined | null,
  selectedCategoryFilter: string,
  ctx: CategoryContext
): ParticipantProgress[] {
  if (ctx.categoryBased !== true) { return progressList; }
  const facilitatorProfiles = ctx.facilitatorProfiles;

  if (selectedCategoryFilter === 'cohort') { return progressList.filter(p => ctx.isCohort(p.profileid)); }
  if (selectedCategoryFilter === 'facilitator') { return progressList.filter(p => facilitatorProfiles.includes(p.profileid)); }
  if (selectedCategoryFilter !== 'all') {
    return progressList.filter(p => {
      if (ctx.isCohort(p.profileid)) { return true; }
      if (facilitatorProfiles.includes(p.profileid)) { return true; }
      return ctx.categoryOf(p.profileid) === selectedCategoryFilter;
    });
  }

  if (challengeIndex !== undefined && challengeIndex !== null) {
    const challenge = ctx.workshopChallenges?.[challengeIndex];
    const challengeCatIds: string[] = challenge?.workshopcategory || [];
    if (challenge?.facilitatoronly === true) {
      return progressList.filter(p => facilitatorProfiles.includes(p.profileid));
    }
    if (challengeCatIds.length > 0) {
      return progressList.filter(p => {
        if (ctx.isCohort(p.profileid)) { return true; }
        if (facilitatorProfiles.includes(p.profileid)) { return true; }
        const participantCat = ctx.categoryOf(p.profileid);
        return !!participantCat && challengeCatIds.includes(participantCat);
      });
    }
    return progressList.filter(p => ctx.isCohort(p.profileid) || facilitatorProfiles.includes(p.profileid));
  }

  return progressList;
}

// =================================================================================================
// The participants table's own filters
// =================================================================================================

export interface TableFilters {
  selectedCategoryFilter: string;   // 'all' | 'cohort' | 'facilitator' | <categoryId>
  tableTypeFilter: string;          // 'all' | 'facilitator' | 'cohort' | 'cat_<categoryId>'
  tableStatusFilter: string;        // 'all' | 'completed' | 'active' | 'notstarted'
}

/** The `cat_` prefix the type filter uses to carry a category id in a single string value. */
export const TABLE_CAT_PREFIX = 'cat_';

/**
 * The table's rows, after the three stacked filters.
 *
 * The type filter's `cat_<id>` branch is EXCLUSIVE where the category filter above it is inclusive:
 * it deliberately drops facilitators and cohort members so "show me category X" means the plain
 * category-X participants, not everyone who can see category X's work.
 */
export function filterTableParticipants(
  progressList: ParticipantProgress[],
  filters: TableFilters,
  ctx: CategoryContext
): ParticipantProgress[] {
  if (ctx.categoryBased !== true) { return progressList; }
  const facilitatorProfiles = ctx.facilitatorProfiles;
  let list = progressList;

  if (filters.selectedCategoryFilter === 'cohort') {
    list = list.filter(p => ctx.isCohort(p.profileid));
  } else if (filters.selectedCategoryFilter === 'facilitator') {
    list = list.filter(p => facilitatorProfiles.includes(p.profileid));
  } else if (filters.selectedCategoryFilter !== 'all') {
    list = list.filter(p => {
      if (ctx.isCohort(p.profileid)) { return true; }
      if (facilitatorProfiles.includes(p.profileid)) { return true; }
      return ctx.categoryOf(p.profileid) === filters.selectedCategoryFilter;
    });
  }

  if (filters.tableTypeFilter !== 'all') {
    list = list.filter(p => {
      if (filters.tableTypeFilter === 'facilitator') { return facilitatorProfiles.includes(p.profileid); }
      if (filters.tableTypeFilter === 'cohort') { return ctx.isCohort(p.profileid); }
      if (filters.tableTypeFilter.startsWith(TABLE_CAT_PREFIX)) {
        const catId = filters.tableTypeFilter.slice(TABLE_CAT_PREFIX.length);
        return !facilitatorProfiles.includes(p.profileid) &&
          !ctx.isCohort(p.profileid) &&
          ctx.categoryOf(p.profileid) === catId;
      }
      return true;
    });
  }

  if (filters.tableStatusFilter !== 'all') {
    list = list.filter(p => {
      const pct = accessBasedProgress(p, ctx).progressPercentage;
      if (filters.tableStatusFilter === 'completed') { return pct === 100; }
      if (filters.tableStatusFilter === 'active') { return pct > 0 && pct < 100; }
      if (filters.tableStatusFilter === 'notstarted') { return pct === 0; }
      return true;
    });
  }

  return list;
}

// =================================================================================================
// Category-based aggregate metrics
// =================================================================================================

export interface ProgressBuckets {
  activeIds: string[];
  completedIds: string[];
  notStartedIds: string[];
  totalProgress: number;
  completedCount: number;
}

/** Split a list three ways by percentage and accumulate the total, in one pass. */
export function bucketByProgress(
  list: ParticipantProgress[],
  progressOf: (p: ParticipantProgress) => number
): ProgressBuckets {
  const b: ProgressBuckets = { activeIds: [], completedIds: [], notStartedIds: [], totalProgress: 0, completedCount: 0 };
  list.forEach(p => {
    const pct = progressOf(p);
    b.totalProgress += pct;
    if (pct === 100) { b.completedCount++; b.completedIds.push(p.profileid); }
    else if (pct > 0) { b.activeIds.push(p.profileid); }
    else { b.notStartedIds.push(p.profileid); }
  });
  return b;
}

/** Average progress and completion rate for one subset (a category, the cohort, the facilitators). */
export function groupProgressStat(
  list: ParticipantProgress[],
  progressOf: (p: ParticipantProgress) => number
): { avgProgress: number; completionRate: number; completedCount: number; totalCount: number } {
  const b = bucketByProgress(list, progressOf);
  return {
    avgProgress: list.length > 0 ? b.totalProgress / list.length : 0,
    completionRate: list.length > 0 ? (b.completedCount / list.length) * 100 : 0,
    completedCount: b.completedCount,
    totalCount: list.length
  };
}

/**
 * Enrolled participants who never started AND have no progress record — appended to the
 * "not started" list so the tile counts them, since they never appear in progressList at all.
 */
export function neverStartedIds(
  enrolled: { profileid: string; status?: string }[],
  progressList: { profileid: string }[]
): string[] {
  const startedProfileIds = progressList.map(p => p.profileid);
  return enrolled
    .filter(p => p.status === 'enrollednotstarted' && !startedProfileIds.includes(p.profileid))
    .map(p => p.profileid);
}

// =================================================================================================
// Row actions and labels
// =================================================================================================

/** The action button's caption. A zoom call cannot be advanced by hand, so it says so. */
export function moveButtonText(
  participant: { progressPercentage: number },
  currentChallenge: WorkshopChallenge | undefined
): string {
  if (participant.progressPercentage === 100) { return 'Completed'; }
  if (currentChallenge?.type === 'zoomcall') { return 'Zoom Call'; }
  return 'Move Next';
}

/** The same button's tooltip, in the same three cases. */
export function moveButtonTooltip(
  participant: { progressPercentage: number },
  currentChallenge: WorkshopChallenge | undefined
): string {
  if (participant.progressPercentage === 100) { return 'Workshop completed'; }
  if (currentChallenge?.type === 'zoomcall') { return 'Zoom call challenges cannot be moved manually'; }
  return 'Move to next challenge';
}

/**
 * Is the participant's current sub-challenge an assignment sitting in review?
 *
 * All three conditions must hold, `reviewassignemnt` (sic — the field is misspelled in Firestore and
 * the misspelling is load-bearing) included.
 */
export function canReviewAssignment(participant: any): boolean {
  try {
    const currentChallenge = participant.challenges[participant.currentChallengeIndex];
    const currentSubChallenge = currentChallenge?.challenges?.[participant.currentSubChallengeIndex];
    return currentSubChallenge?.type === 'assignment' &&
      currentSubChallenge?.reviewassignemnt === true &&
      currentSubChallenge?.status === 'inreview';
  } catch (error) { return false; }
}

/** Tooltip on a previous submission in the assignment history. */
export function oldResultTooltip(oldResult: { isQuestionAssignment?: boolean; date?: any }): string {
  return oldResult.isQuestionAssignment
    ? `Click to view previous question assignment from ${oldResult.date}`
    : `Click to view previous form submission from ${oldResult.date}`;
}

// =================================================================================================
// CSV export
// =================================================================================================

/**
 * Rows of `{ header: value }` → a CSV body.
 *
 * DEFECT (pinned): the header row is taken from the FIRST row's keys only. A later row carrying a key
 * the first one lacks silently loses that column, and a row missing a key emits an empty cell without
 * complaint.
 */
export function createCsvContent(data: any[]): string {
  if (data.length === 0) { return ''; }
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  const csvRows = data.map(row => headers.map(header => {
    const value = row[header];
    if (typeof value === 'string' && (value.includes(',') || value.includes('\n') || value.includes('"'))) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(','));
  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * 'dd Mon yyyy' in en-IN, the format the export and the participant rows use.
 *
 * DEFECT (pinned): an unparsable value is swallowed and rendered as an empty string, so a corrupt
 * enrolment date is indistinguishable from a missing one.
 */
export function formatDate(timestamp: any): string {
  if (!timestamp) { return ''; }
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}
