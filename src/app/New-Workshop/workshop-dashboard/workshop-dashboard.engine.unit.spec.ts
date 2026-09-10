// workshop-dashboard.engine.unit.spec.ts — unit tests for the Workshop Dashboard rules.
//
// WHY THESE TESTS EXIST: this engine decides what a facilitator sees about every participant in a
// workshop — how far through they are, which challenge they are stuck on, whether they are allowed to
// see a challenge at all, and which of the clickable status counts they land in. All of it lived as
// methods on TWO ~3,000-line components (workshop-dashboard and workshop-dashboardv2) that inject a
// Firestore, an HttpClient, a MatDialog and four live snapshots, so nothing could reach the rules: not
// a unit test, and not e2e, which could only assert a rendered chip. An e2e case could see
// "In Progress" — it could not see that the card and the statistics table use two DIFFERENT
// definitions of in-progress on the same data (DEFECT 3 below).
//
// WHY ONE SPEC FOR TWO COMPONENTS: every rule here was byte-identical in both. v2 is a fork that
// changed the shell and the queries, not the maths. One engine, one spec, one place a product
// decision changes — the alternative would have re-created the duplication this work exists to
// remove.
//
// WHAT THE TESTS PROTECT: the progress arithmetic and the "current challenge" cursor, the unlock
// chain (including the zoom-call special case, which is facilitator-controlled and not
// per-participant), the status vocabulary, the category access rules that decide whose progress is
// measured against what, the evergreen day buckets, and the table filters.
//
// ELEVEN behaviours here are WRONG and are pinned as-is with `DEFECT (pinned)` titles, because this
// was a refactor and fixing them was explicitly out of scope. Each carries a comment saying what it
// costs a real facilitator.
//
// NOT COVERED HERE: Firestore reads/writes, dialogs, the MatTableDataSource, file downloads and
// message sending — those stay with the workshop e2e suite.
import {
  CHALLENGE_STATUSES,
  CategoryContext,
  DAY_MS,
  ParticipantChallenge,
  ParticipantProgress,
  SUB_CHALLENGE_STATUSES,
  TABLE_CAT_PREFIX,
  accessBasedProgress,
  areChallengesEqual,
  averageProgress,
  bucketByProgress,
  calculateParticipantProgress,
  canReviewAssignment,
  challengeCategoryNames,
  challengeDisplayStatus,
  challengeStatusBuckets,
  completionRatePct,
  createCsvContent,
  evergreenDayDistribution,
  evergreenWorkshopDays,
  fallbackCurrent,
  filterTableParticipants,
  filteredProgressListForChallenge,
  formatDate,
  groupProgressStat,
  hasAccessToChallenge,
  headlineMetrics,
  isChallengeVisibleForCategory,
  isPreviousChallengeCompleted,
  isReadyForChallenge,
  isReadyForSubChallenge,
  moveButtonText,
  moveButtonTooltip,
  neverStartedIds,
  normalizeSubChallengeStatus,
  oldResultTooltip,
  overallProgressLabel,
  participantChallengeStatus,
  participantTypeClass,
  participantTypeLabel,
  previousNonZoomIndex,
  shouldSetAsCurrent,
  shouldSetZoomCallAsCurrent,
  toMillis,
} from './workshop-dashboard.engine';

// ---------------------------------------------------------------------------------------------
// Builders — a challenge with N sub-challenges, and the workshop-side twin of the same shape.
// ---------------------------------------------------------------------------------------------

/** A participant-side challenge with the given sub-challenge statuses (undefined = untouched). */
const ch = (statuses: (string | undefined)[], status?: string): ParticipantChallenge => ({
  type: 'challenge', status,
  challenges: statuses.map((s, i) => ({ name: 'sub' + i, type: 'assignment', status: s })),
});

/** A participant-side zoom call. Its state lives on the WORKSHOP doc, not here. */
const zoom = (): ParticipantChallenge => ({ type: 'zoomcall' });

/** A workshop-side challenge definition. */
const wch = (over: any = {}) => ({ type: 'challenge', challenges: [{ name: 'sub0' }], ...over });

/** The default context: a plain (non-category) workshop where everyone sees everything. */
const plainCtx = (over: Partial<CategoryContext> = {}): CategoryContext => ({
  categoryBased: false,
  facilitatorProfiles: [],
  workshopChallenges: [],
  isCohort: () => false,
  categoryOf: () => undefined,
  ...over,
});

/** A category-based workshop context. */
const catCtx = (over: Partial<CategoryContext> = {}): CategoryContext =>
  plainCtx({ categoryBased: true, ...over });

const progress = (over: Partial<ParticipantProgress> = {}): ParticipantProgress => ({
  profileid: 'p1', challenges: [], currentChallengeIndex: 0, currentSubChallengeIndex: 0,
  completedChallenges: 0, totalChallenges: 0, progressPercentage: 0, ...over,
});

describe('workshop-dashboard.engine', () => {

  // ===============================================================================================
  // WSU-01 — the status vocabulary
  // ===============================================================================================
  describe('WSU-01 sub-challenge status vocabulary', () => {
    it('passes through the four terminal statuses unchanged', () => {
      expect(normalizeSubChallengeStatus('completed')).toBe('completed');
      expect(normalizeSubChallengeStatus('inreview')).toBe('inreview');
      expect(normalizeSubChallengeStatus('rework')).toBe('rework');
      expect(normalizeSubChallengeStatus('readyformobile')).toBe('readyformobile');
    });

    it('folds the two "started" statuses into inprogress', () => {
      // 'ready' and 'ongoing' are what the mobile app writes; the dashboard shows one column.
      expect(normalizeSubChallengeStatus('ready')).toBe('inprogress');
      expect(normalizeSubChallengeStatus('ongoing')).toBe('inprogress');
    });

    it('is case-insensitive about what the app wrote', () => {
      expect(normalizeSubChallengeStatus('COMPLETED')).toBe('completed');
      expect(normalizeSubChallengeStatus('Ongoing')).toBe('inprogress');
    });

    it('treats a missing status as not started', () => {
      expect(normalizeSubChallengeStatus(undefined)).toBe('notstarted');
      expect(normalizeSubChallengeStatus('')).toBe('notstarted');
    });

    it('DEFECT (pinned): an UNKNOWN status silently reports as "not started"', () => {
      // The mobile app owns these strings. The day it ships a new one — 'submitted', say — every
      // participant using it drops into the Not Started column, and the facilitator chases people
      // who have already done the work. There is no warning anywhere.
      expect(normalizeSubChallengeStatus('submitted')).toBe('notstarted');
      expect(normalizeSubChallengeStatus('awaiting-review')).toBe('notstarted');
    });

    it('exposes the two bucket vocabularies the counts are built from', () => {
      expect(CHALLENGE_STATUSES).toEqual(['completed', 'inprogress', 'notstarted', 'notstartedcurrent']);
      expect(SUB_CHALLENGE_STATUSES).toEqual(
        ['completed', 'inprogress', 'inreview', 'rework', 'readyformobile', 'notstarted', 'notstartedcurrent']
      );
    });
  });

  // ===============================================================================================
  // WSU-02 — a whole challenge's status
  // ===============================================================================================
  describe('WSU-02 challenge status', () => {
    it('is completed when the participant\'s challenge says so', () => {
      expect(participantChallengeStatus(ch([], 'completed'), wch())).toBe('completed');
    });

    it('is notstarted when the participant has no such challenge at all', () => {
      expect(participantChallengeStatus(undefined, wch())).toBe('notstarted');
    });

    it('reads a zoom call off the WORKSHOP doc, ignoring the participant entirely', () => {
      // A zoom call has no per-participant state: when the facilitator marks the call done, every
      // participant flips at once. That is deliberate, and worth stating.
      expect(participantChallengeStatus(zoom(), { status: 'completed' })).toBe('completed');
      expect(participantChallengeStatus(zoom(), { status: 'ongoing' })).toBe('notstarted');
      expect(participantChallengeStatus(zoom(), undefined)).toBe('notstarted');
    });

    it('is inprogress when a sub-challenge has been started', () => {
      expect(participantChallengeStatus(ch(['ongoing']), wch())).toBe('inprogress');
    });

    it('is notstarted when no sub-challenge has any status', () => {
      expect(participantChallengeStatus(ch([undefined, undefined]), wch())).toBe('notstarted');
    });

    it('DEFECT (pinned): a literal "notstarted" sub-status counts as IN PROGRESS', () => {
      // The test is `.some(sc => sc.status)` — any truthy string, and 'notstarted' is truthy. The
      // card beside it (challengeDisplayStatus) excludes 'notstarted' explicitly, so the SAME
      // participant is "In Progress" in the statistics table and "Not Started" on the card. Whichever
      // number a facilitator quotes in a stand-up, the other one contradicts it.
      const c = ch(['notstarted']);
      expect(participantChallengeStatus(c, wch())).toBe('inprogress');
      expect(challengeDisplayStatus(c, wch())).toBe('notstarted');
    });

    it('agrees with the card everywhere else', () => {
      expect(challengeDisplayStatus(ch([], 'completed'), wch())).toBe('completed');
      expect(challengeDisplayStatus(ch(['ongoing']), wch())).toBe('inprogress');
      expect(challengeDisplayStatus(zoom(), { status: 'completed' })).toBe('completed');
      expect(challengeDisplayStatus(undefined, wch())).toBe('notstarted');
    });
  });

  // ===============================================================================================
  // WSU-03 — the unlock chain
  // ===============================================================================================
  describe('WSU-03 unlock chain', () => {
    it('always unlocks the first challenge', () => {
      expect(isPreviousChallengeCompleted([ch([])], 0)).toBe(true);
      expect(isPreviousChallengeCompleted([], -1)).toBe(true);
    });

    it('needs the previous challenge completed on the PARTICIPANT doc', () => {
      expect(isPreviousChallengeCompleted([ch([], 'completed'), ch([])], 1)).toBe(true);
      expect(isPreviousChallengeCompleted([ch([], 'ongoing'), ch([])], 1)).toBe(false);
    });

    it('needs a previous ZOOM call completed on the WORKSHOP doc', () => {
      // The participant doc carries nothing for a zoom call, so reading it there would block the
      // whole workshop forever.
      const chs = [zoom(), ch([])];
      expect(isPreviousChallengeCompleted(chs, 1, [{ status: 'completed' }, wch()])).toBe(true);
      expect(isPreviousChallengeCompleted(chs, 1, [{ status: 'pending' }, wch()])).toBe(false);
    });

    it('makes the first sub-challenge current only once the challenge is unlocked', () => {
      const chs = [ch([], 'ongoing'), ch([undefined])];
      expect(shouldSetAsCurrent(chs, 0, 0)).toBe(true);
      expect(shouldSetAsCurrent(chs, 1, 0)).toBe(false);
    });

    it('makes a later sub-challenge current only once the one before it is completed', () => {
      const chs = [ch(['completed', undefined, undefined])];
      expect(shouldSetAsCurrent(chs, 0, 1)).toBe(true);
      expect(shouldSetAsCurrent(chs, 0, 2)).toBe(false);
    });

    it('makes a zoom call current when it is unlocked and not yet run', () => {
      expect(shouldSetZoomCallAsCurrent([zoom()], 0, { status: 'pending' })).toBe(true);
      expect(shouldSetZoomCallAsCurrent([zoom()], 0, { status: 'completed' })).toBe(false);
    });

    it('never makes a locked zoom call current', () => {
      const chs = [ch([], 'ongoing'), zoom()];
      expect(shouldSetZoomCallAsCurrent(chs, 1, { status: 'pending' }, [wch(), { status: 'pending' }])).toBe(false);
    });
  });

  // ===============================================================================================
  // WSU-04 — the fallback cursor
  // ===============================================================================================
  describe('WSU-04 fallback cursor', () => {
    it('points at the LAST sub-challenge of the last real challenge', () => {
      // A finished participant must land at the end of the workshop, not back at the start.
      expect(fallbackCurrent([ch(['completed']), ch(['completed', 'completed'])]))
        .toEqual({ challengeIndex: 1, subChallengeIndex: 1 });
    });

    it('points at a trailing zoom call', () => {
      expect(fallbackCurrent([ch(['completed']), zoom()]))
        .toEqual({ challengeIndex: 1, subChallengeIndex: 0 });
    });

    it('returns null when there is nothing to point at', () => {
      expect(fallbackCurrent([])).toBeNull();
      expect(fallbackCurrent([{ type: 'mystery' } as any])).toBeNull();
    });
  });

  // ===============================================================================================
  // WSU-05 — participant progress
  // ===============================================================================================
  describe('WSU-05 participant progress', () => {
    it('counts every sub-challenge as one unit of work', () => {
      const r = calculateParticipantProgress('p1', [ch(['completed', undefined]), ch([undefined])]);
      expect(r.totalChallenges).toBe(3);
      expect(r.completedChallenges).toBe(1);
      expect(r.progressPercentage).toBeCloseTo(33.333, 3);
    });

    it('reads 0% rather than dividing by zero on an empty workshop', () => {
      const r = calculateParticipantProgress('p1', []);
      expect(r.progressPercentage).toBe(0);
      expect(r.totalChallenges).toBe(0);
    });

    it('parks the cursor on the first unstarted sub-challenge', () => {
      const r = calculateParticipantProgress('p1', [ch(['completed', undefined, undefined])]);
      expect(r.currentChallengeIndex).toBe(0);
      expect(r.currentSubChallengeIndex).toBe(1);
    });

    it('does not move the cursor once it has been set', () => {
      // The first thing that qualifies wins; later candidates must not overwrite it.
      const r = calculateParticipantProgress('p1', [ch([undefined]), ch([undefined])]);
      expect(r.currentChallengeIndex).toBe(0);
    });

    it('falls back to the end of the workshop when everything is done', () => {
      const r = calculateParticipantProgress('p1', [ch(['completed', 'completed'])]);
      expect(r.progressPercentage).toBe(100);
      expect(r.currentChallengeIndex).toBe(0);
      expect(r.currentSubChallengeIndex).toBe(1);
    });

    it('carries the profile id and the challenges through untouched', () => {
      const chs = [ch(['completed'])];
      const r = calculateParticipantProgress('abc', chs);
      expect(r.profileid).toBe('abc');
      expect(r.challenges).toBe(chs);
    });

    it('DEFECT (pinned): a zoom call is INVISIBLE to the percentage', () => {
      // Only `type === 'challenge'` contributes to totalChallenges, so a participant with every
      // written challenge done and an unattended zoom call still reads 100% — "Completed" on their
      // row, "Completed" in the tile, and nobody is told they skipped the call.
      const r = calculateParticipantProgress('p1', [ch(['completed']), zoom()], [wch(), { status: 'pending' }]);
      expect(r.totalChallenges).toBe(1);
      expect(r.progressPercentage).toBe(100);
      expect(r.currentChallengeIndex).toBe(1);   // the cursor DOES know about the zoom call
    });
  });

  // ===============================================================================================
  // WSU-06 — the progress cache key
  // ===============================================================================================
  describe('WSU-06 challenge equality (cache key)', () => {
    it('matches when every status matches', () => {
      expect(areChallengesEqual([ch(['completed'])], [ch(['completed'])])).toBe(true);
    });

    it('differs on a changed sub-challenge status', () => {
      expect(areChallengesEqual([ch(['completed'])], [ch(['ongoing'])])).toBe(false);
    });

    it('differs on a changed challenge status, and on a different shape', () => {
      expect(areChallengesEqual([ch([], 'completed')], [ch([], 'ongoing')])).toBe(false);
      expect(areChallengesEqual([ch(['a'])], [ch(['a', 'b'])])).toBe(false);
      expect(areChallengesEqual([ch([])], [])).toBe(false);
    });

    it('treats a missing side as "not equal" so the cache is rebuilt, not trusted', () => {
      expect(areChallengesEqual(null as any, [])).toBe(false);
      expect(areChallengesEqual([], null as any)).toBe(false);
    });

    it('ignores everything that is not a status — that is the point of the key', () => {
      // A challenge doc that gains a title or a due date has not moved anyone's progress, and
      // recomputing every participant on that would be the expensive path this key exists to avoid.
      const a = [{ type: 'challenge', status: 'x', challenges: [{ status: 'completed', name: 'one' }] }];
      const b = [{ type: 'challenge', status: 'x', challenges: [{ status: 'completed', name: 'TWO' }] }];
      expect(areChallengesEqual(a, b)).toBe(true);
    });
  });

  // ===============================================================================================
  // WSU-07 — "ready to start"
  // ===============================================================================================
  describe('WSU-07 ready to start', () => {
    const wchs = [wch(), { type: 'zoomcall' }, wch()];

    it('finds the nearest non-zoom challenge before an index', () => {
      expect(previousNonZoomIndex(2, wchs)).toBe(0);
      expect(previousNonZoomIndex(1, wchs)).toBe(0);
      expect(previousNonZoomIndex(0, wchs)).toBe(-1);
    });

    it('is always ready for the first challenge', () => {
      expect(isReadyForChallenge({ challenges: [] }, 0)).toBe(true);
    });

    it('is ready when only zoom calls precede — a zoom call cannot gate the queue', () => {
      const p = { challenges: [zoom(), ch([undefined])] };
      expect(isReadyForChallenge(p, 1, [{ type: 'zoomcall' }, wch()])).toBe(true);
    });

    it('needs the previous real challenge completed', () => {
      const done = { challenges: [ch([], 'completed'), ch([undefined])] };
      const notDone = { challenges: [ch(['ongoing']), ch([undefined])] };
      expect(isReadyForChallenge(done, 1, [wch(), wch()])).toBe(true);
      expect(isReadyForChallenge(notDone, 1, [wch(), wch()])).toBe(false);
    });

    it('lets the first sub-challenge inherit the challenge\'s own readiness', () => {
      const p = { challenges: [ch([], 'completed'), ch([undefined])] };
      expect(isReadyForSubChallenge(p, 1, 0, [wch(), wch()])).toBe(true);
    });

    it('needs the sub-challenge directly before it completed', () => {
      const p = { challenges: [ch(['completed', undefined, undefined])] };
      expect(isReadyForSubChallenge(p, 0, 1)).toBe(true);
      expect(isReadyForSubChallenge(p, 0, 2)).toBe(false);
    });

    it('is not ready when the participant has no sub-challenge array yet', () => {
      expect(isReadyForSubChallenge({ challenges: [{ type: 'challenge' }] }, 0, 1)).toBe(false);
    });
  });

  // ===============================================================================================
  // WSU-08 — the clickable status counts
  // ===============================================================================================
  describe('WSU-08 challenge status buckets', () => {
    // NOTE the challenge-level 'completed' on `done`: a challenge is only completed when its OWN
    // status says so. Every sub-challenge being done is not enough — that still reads as in progress
    // until the app writes the challenge status. Asserted explicitly two cases down.
    const participants = [
      { profileid: 'done', challenges: [ch(['completed'], 'completed')] },
      { profileid: 'busy', challenges: [ch(['ongoing'])] },
      { profileid: 'fresh', challenges: [ch([undefined])] },
    ];

    it('buckets every participant on the challenge itself', () => {
      const b = challengeStatusBuckets(participants, wch(), 0, [wch()]);
      expect(b.participantsByStatus.get('completed')).toEqual(['done']);
      expect(b.participantsByStatus.get('inprogress')).toEqual(['busy']);
      expect(b.participantsByStatus.get('notstarted')).toEqual(['fresh']);
    });

    it('counts "ready to start" as a SUBSET of "not started", not a sibling', () => {
      // The not-started total must stay whole — it is the number a facilitator reports — while the
      // dashboard can still highlight the ones who could start right now.
      const b = challengeStatusBuckets(participants, wch(), 0, [wch()]);
      expect(b.participantsByStatus.get('notstarted')).toEqual(['fresh']);
      expect(b.participantsByStatus.get('notstartedcurrent')).toEqual(['fresh']);
    });

    it('does NOT call a challenge completed just because every sub-challenge is', () => {
      // The challenge-level status is the authority; sub-challenges rolling up to it is the app's
      // job, not the dashboard's. Until that write lands the participant reads as in progress.
      const rolled = [{ profileid: 'x', challenges: [ch(['completed'])] }];
      const b = challengeStatusBuckets(rolled, wch(), 0, [wch()]);
      expect(b.participantsByStatus.get('completed')).toEqual([]);
      expect(b.participantsByStatus.get('inprogress')).toEqual(['x']);
    });

    it('does not mark someone ready when the previous challenge is unfinished', () => {
      const locked = [{ profileid: 'x', challenges: [ch(['ongoing']), ch([undefined])] }];
      const b = challengeStatusBuckets(locked, wch(), 1, [wch(), wch()]);
      expect(b.participantsByStatus.get('notstarted')).toEqual(['x']);
      expect(b.participantsByStatus.get('notstartedcurrent')).toEqual([]);
    });

    it('buckets each sub-challenge separately, carrying its name and type', () => {
      const b = challengeStatusBuckets(participants, wch({ challenges: [{ name: 'Read it', type: 'form' }] }), 0, [wch()]);
      expect(b.subChallengeStats.length).toBe(1);
      expect(b.subChallengeStats[0].subChallengeName).toBe('Read it');
      expect(b.subChallengeStats[0].type).toBe('form');
      expect(b.subChallengeStats[0].participantsByStatus.get('completed')).toEqual(['done']);
      expect(b.subChallengeStats[0].participantsByStatus.get('inprogress')).toEqual(['busy']);
    });

    it('opens every bucket even when nobody is in it, so a count is never undefined', () => {
      const b = challengeStatusBuckets([], wch(), 0, [wch()]);
      CHALLENGE_STATUSES.forEach(s => expect(b.participantsByStatus.get(s)).toEqual([]));
    });

    it('DEFECT (pinned): a zoom-call challenge produces NO statistics at all', () => {
      // A zoom call has no `challenges` array, so there are no sub-stats — and the component's
      // calculateZoomCallStats() is an EMPTY method, so nothing fills the gap either. Every zoom-call
      // row on the statistics table is permanently blank: a facilitator cannot see who attended from
      // this screen, even though the attendance list exists on the doc.
      const b = challengeStatusBuckets(participants, { type: 'zoomcall' }, 0, [{ type: 'zoomcall', status: 'pending' }]);
      expect(b.subChallengeStats).toEqual([]);
    });
  });

  // ===============================================================================================
  // WSU-09 — headline metrics
  // ===============================================================================================
  describe('WSU-09 headline metrics', () => {
    const enrolled = [
      { profileid: 'a', status: 'enrolled' },
      { profileid: 'b', status: 'enrollednotstarted' },
      { profileid: 'c', status: 'enrolled' },
    ];
    const progressList = [
      { profileid: 'a', progressPercentage: 100 },
      { profileid: 'c', progressPercentage: 40 },
    ];

    it('splits enrolled participants by their enrolment status', () => {
      const m = headlineMetrics(enrolled, progressList);
      expect(m['totalEnrolled']).toEqual(['a', 'b', 'c']);
      expect(m['totalStarted']).toEqual(['a', 'c']);
      expect(m['notStarted']).toEqual(['b']);
    });

    it('DEFECT (pinned): the "active" tile INCLUDES the completed participants', () => {
      // active is `> 0`, completed is `=== 100`, so the finished ones are counted twice and the
      // tiles do not add up to the enrolled total. A facilitator reading "2 active, 1 completed" out
      // of 3 believes everyone is engaged; in fact only one person is still working.
      const m = headlineMetrics(enrolled, progressList);
      expect(m['activeParticipants']).toEqual(['a', 'c']);
      expect(m['completedParticipants']).toEqual(['a']);
    });

    it('computes the completion rate, and 0 for an empty workshop', () => {
      expect(completionRatePct(1, 4)).toBe(25);
      expect(completionRatePct(0, 0)).toBe(0);
    });

    it('averages progress, and reads 0 for an empty list', () => {
      expect(averageProgress([{ progressPercentage: 100 }, { progressPercentage: 0 }])).toBe(50);
      expect(averageProgress([])).toBe(0);
    });

    it('labels overall progress in the CSV\'s three words', () => {
      expect(overallProgressLabel(100)).toBe('Completed');
      expect(overallProgressLabel(1)).toBe('In Progress');
      expect(overallProgressLabel(0)).toBe('Not Started');
      expect(overallProgressLabel(undefined)).toBe('Not Started');   // no progress record at all
    });

    it('finds the enrolled participants who never appear in the progress list', () => {
      expect(neverStartedIds(enrolled, progressList)).toEqual(['b']);
    });
  });

  // ===============================================================================================
  // WSU-10 — evergreen day buckets
  // ===============================================================================================
  describe('WSU-10 evergreen day distribution', () => {
    const NOW = Date.UTC(2026, 4, 18, 12, 0, 0);
    const enrolledDaysAgo = (profileid: string, days: number) =>
      ({ profileid, enrollmentdate: new Date(NOW - days * DAY_MS) });

    it('puts a participant enrolled today on Day 1', () => {
      const d = evergreenDayDistribution([enrolledDaysAgo('a', 0)], 5, NOW);
      expect(d.buckets[0]).toEqual({ day: 1, count: 1, profileIds: ['a'] });
      expect(d.total).toBe(1);
    });

    it('advances a day for every full 24 hours', () => {
      const d = evergreenDayDistribution([enrolledDaysAgo('a', 3)], 5, NOW);
      expect(d.buckets[3].count).toBe(1);   // day 4
    });

    it('moves anyone past the last day into the Completed bucket', () => {
      const d = evergreenDayDistribution([enrolledDaysAgo('a', 9)], 5, NOW);
      expect(d.completed.count).toBe(1);
      expect(d.completed.profileIds).toEqual(['a']);
      expect(d.completed.day).toBe(-1);
      expect(d.buckets.every(b => b.count === 0)).toBe(true);
    });

    it('opens a bucket for every day even when nobody is on it', () => {
      const d = evergreenDayDistribution([], 3, NOW);
      expect(d.buckets.map(b => b.day)).toEqual([1, 2, 3]);
      expect(d.total).toBe(0);
    });

    it('skips a participant with no enrolment date, and does not count them in the total', () => {
      // No date is not "day 1" — it is unknown, and inventing a day would put someone on a bucket
      // the facilitator then works through.
      const d = evergreenDayDistribution([{ profileid: 'a' }, enrolledDaysAgo('b', 0)], 5, NOW);
      expect(d.total).toBe(1);
      expect(d.buckets[0].profileIds).toEqual(['b']);
    });

    it('returns nothing at all when the workshop has no configured length', () => {
      const d = evergreenDayDistribution([enrolledDaysAgo('a', 0)], 0, NOW);
      expect(d.buckets).toEqual([]);
      expect(d.total).toBe(0);
    });

    it('DEFECT (pinned): a FUTURE-dated enrolment is silently clamped to Day 1', () => {
      // A device with a skewed clock, or a scheduled enrolment, lands on Day 1 alongside the people
      // who genuinely started today — and the facilitator welcomes someone whose workshop has not
      // begun. The guard hides the bad data instead of surfacing it.
      const d = evergreenDayDistribution([enrolledDaysAgo('future', -30)], 5, NOW);
      expect(d.buckets[0].profileIds).toEqual(['future']);
    });

    it('reads the configured length off the meta, defaulting to 0', () => {
      expect(evergreenWorkshopDays({ workshopDays: '7' })).toBe(7);
      expect(evergreenWorkshopDays({ workshopDays: 'seven' })).toBe(0);
      expect(evergreenWorkshopDays(undefined)).toBe(0);
    });

    it('accepts every timestamp shape Firestore hands back', () => {
      expect(toMillis({ toMillis: () => 42 })).toBe(42);
      expect(toMillis({ toDate: () => new Date(42) })).toBe(42);
      expect(toMillis({ seconds: 2 })).toBe(2000);
      expect(toMillis(new Date(42))).toBe(42);
      expect(toMillis('2026-05-18T00:00:00.000Z')).toBe(Date.UTC(2026, 4, 18));
      expect(toMillis(null)).toBeNull();
      expect(toMillis('not a date')).toBeNull();
    });
  });

  // ===============================================================================================
  // WSU-11 — category access
  // ===============================================================================================
  describe('WSU-11 category access', () => {
    it('gives everyone everything on a workshop that is not category-based', () => {
      expect(hasAccessToChallenge('p1', 0, plainCtx({ workshopChallenges: [wch({ facilitatoronly: true })] }))).toBe(true);
    });

    it('restricts a facilitator-only challenge to facilitators', () => {
      const ctx = catCtx({ workshopChallenges: [wch({ facilitatoronly: true })], facilitatorProfiles: ['fac'] });
      expect(hasAccessToChallenge('fac', 0, ctx)).toBe(true);
      expect(hasAccessToChallenge('p1', 0, ctx)).toBe(false);
    });

    it('excludes a COHORT member from a facilitator-only challenge', () => {
      // Cohort membership is a broad pass everywhere else, so this exception is easy to break.
      const ctx = catCtx({ workshopChallenges: [wch({ facilitatoronly: true })], isCohort: () => true });
      expect(hasAccessToChallenge('p1', 0, ctx)).toBe(false);
    });

    it('gives cohort members and facilitators everything else', () => {
      const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: ['catA'] })], isCohort: id => id === 'coh', facilitatorProfiles: ['fac'] });
      expect(hasAccessToChallenge('coh', 0, ctx)).toBe(true);
      expect(hasAccessToChallenge('fac', 0, ctx)).toBe(true);
    });

    it('matches a category participant against the challenge\'s categories', () => {
      const ctx = catCtx({
        workshopChallenges: [wch({ workshopcategory: ['catA'] })],
        categoryOf: id => (id === 'inA' ? 'catA' : 'catB'),
      });
      expect(hasAccessToChallenge('inA', 0, ctx)).toBe(true);
      expect(hasAccessToChallenge('inB', 0, ctx)).toBe(false);
    });

    it('denies a participant with no category on a categorised challenge', () => {
      const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: ['catA'] })] });
      expect(hasAccessToChallenge('p1', 0, ctx)).toBe(false);
    });

    it('allows access when the challenge index does not exist yet', () => {
      // The participant doc can be ahead of the workshop doc mid-edit; blocking would blank the row.
      expect(hasAccessToChallenge('p1', 9, catCtx({ workshopChallenges: [wch()] }))).toBe(true);
    });

    it('DEFECT (pinned): an UNCATEGORISED challenge is invisible to every plain participant', () => {
      // A challenge with no `workshopcategory` falls to the final `return false`. The natural reading
      // of "no restriction listed" is "open to everyone"; this does the opposite. On a category-based
      // workshop, adding a challenge and forgetting to tag it hides it from everybody except
      // facilitators and the cohort — and it silently stops counting toward their progress too.
      const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: [] })], categoryOf: () => 'catA' });
      expect(hasAccessToChallenge('p1', 0, ctx)).toBe(false);
    });
  });

  // ===============================================================================================
  // WSU-12 — access-scoped progress
  // ===============================================================================================
  describe('WSU-12 access-based progress', () => {
    it('passes the plain progress straight through when not category-based', () => {
      const p = progress({ completedChallenges: 2, totalChallenges: 4, progressPercentage: 50 });
      expect(accessBasedProgress(p, plainCtx())).toEqual({ completedChallenges: 2, totalChallenges: 4, progressPercentage: 50 });
    });

    it('measures a participant only against the challenges they can see', () => {
      // The whole point: a category participant must not be marked down for work never offered.
      const p = progress({
        profileid: 'p1',
        challenges: [ch(['completed']), ch([undefined])],
      });
      const ctx = catCtx({
        workshopChallenges: [wch({ workshopcategory: ['catA'] }), wch({ workshopcategory: ['catB'] })],
        categoryOf: () => 'catA',
      });
      const r = accessBasedProgress(p, ctx);
      expect(r.totalChallenges).toBe(1);
      expect(r.completedChallenges).toBe(1);
      expect(r.progressPercentage).toBe(100);
    });

    it('ignores zoom calls here too', () => {
      const p = progress({ profileid: 'p1', challenges: [ch(['completed']), zoom()] });
      const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: ['catA'] }), { type: 'zoomcall' }], categoryOf: () => 'catA' });
      expect(accessBasedProgress(p, ctx).totalChallenges).toBe(1);
    });

    it('DEFECT (pinned): no accessible challenges reads as 0%, exactly like "has done nothing"', () => {
      // A participant whose category matches no challenge at all — a mis-tagged category, or the
      // uncategorised-challenge defect above — sits at 0% forever. They appear at the top of the
      // "not started" list and get chased repeatedly for work that was never assigned to them.
      const p = progress({ profileid: 'p1', challenges: [ch(['completed'])] });
      const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: ['catB'] })], categoryOf: () => 'catA' });
      const r = accessBasedProgress(p, ctx);
      expect(r.totalChallenges).toBe(0);
      expect(r.progressPercentage).toBe(0);
    });
  });

  // ===============================================================================================
  // WSU-13 — participant type badges
  // ===============================================================================================
  describe('WSU-13 participant type', () => {
    const nameOf = (id: string) => ({ catA: 'Category A' } as any)[id];

    it('shows nothing on a workshop that is not category-based', () => {
      expect(participantTypeLabel('p1', plainCtx(), nameOf)).toBe('');
      expect(participantTypeClass('p1', plainCtx())).toBe('');
    });

    it('ranks facilitator above cohort above category', () => {
      // Someone can be all three; the badge has to pick one, and this is the order it picks in.
      const ctx = catCtx({ facilitatorProfiles: ['x'], isCohort: () => true, categoryOf: () => 'catA' });
      expect(participantTypeLabel('x', ctx, nameOf)).toBe('Facilitator');
      expect(participantTypeClass('x', ctx)).toBe('type-facilitator');
    });

    it('names the cohort in the product\'s own words', () => {
      const ctx = catCtx({ isCohort: () => true });
      expect(participantTypeLabel('x', ctx, nameOf)).toBe('Above Diagnostics');
      expect(participantTypeClass('x', ctx)).toBe('type-cohort');
    });

    it('shows the category name, falling back to "Category" when it cannot be resolved', () => {
      expect(participantTypeLabel('x', catCtx({ categoryOf: () => 'catA' }), nameOf)).toBe('Category A');
      expect(participantTypeLabel('x', catCtx({ categoryOf: () => 'unknown' }), nameOf)).toBe('Category');
    });

    it('shows N/A for a participant with no category at all', () => {
      expect(participantTypeLabel('x', catCtx(), nameOf)).toBe('N/A');
      expect(participantTypeClass('x', catCtx())).toBe('type-category');   // still styled as one
    });

    it('joins a challenge\'s category names, marking ones it cannot resolve', () => {
      expect(challengeCategoryNames(['catA', 'gone'], nameOf)).toBe('Category A, Unknown');
      expect(challengeCategoryNames([], nameOf)).toBe('');
    });
  });

  // ===============================================================================================
  // WSU-14 — challenge visibility under a category filter
  // ===============================================================================================
  describe('WSU-14 challenge visibility', () => {
    const ctx = catCtx({ workshopChallenges: [wch({ workshopcategory: ['catA'] }), wch({ facilitatoronly: true })] });

    it('shows everything under "all", under "cohort", and on a plain workshop', () => {
      expect(isChallengeVisibleForCategory(1, 'all', ctx)).toBe(true);
      expect(isChallengeVisibleForCategory(0, 'cohort', ctx)).toBe(true);
      expect(isChallengeVisibleForCategory(0, 'catB', plainCtx())).toBe(true);
    });

    it('shows only facilitator-only challenges under the facilitator filter', () => {
      expect(isChallengeVisibleForCategory(1, 'facilitator', ctx)).toBe(true);
      expect(isChallengeVisibleForCategory(0, 'facilitator', ctx)).toBe(false);
    });

    it('matches the picked category against the challenge\'s own list', () => {
      expect(isChallengeVisibleForCategory(0, 'catA', ctx)).toBe(true);
      expect(isChallengeVisibleForCategory(0, 'catB', ctx)).toBe(false);
    });
  });

  // ===============================================================================================
  // WSU-15 — whose progress a challenge's statistics cover
  // ===============================================================================================
  describe('WSU-15 statistics population', () => {
    const list = [progress({ profileid: 'coh' }), progress({ profileid: 'fac' }), progress({ profileid: 'a' }), progress({ profileid: 'b' })];
    const base = {
      facilitatorProfiles: ['fac'],
      isCohort: (id: string) => id === 'coh',
      categoryOf: (id: string) => (id === 'a' ? 'catA' : id === 'b' ? 'catB' : undefined),
    };

    it('covers everyone on a workshop that is not category-based', () => {
      expect(filteredProgressListForChallenge(list, 0, 'all', plainCtx(base)).length).toBe(4);
    });

    it('honours an explicit filter over anything the challenge says', () => {
      expect(filteredProgressListForChallenge(list, 1, 'cohort', catCtx(base)).map(p => p.profileid)).toEqual(['coh']);
      expect(filteredProgressListForChallenge(list, 1, 'facilitator', catCtx(base)).map(p => p.profileid)).toEqual(['fac']);
      expect(filteredProgressListForChallenge(list, 1, 'catA', catCtx(base)).map(p => p.profileid)).toEqual(['coh', 'fac', 'a']);
    });

    it('counts only facilitators on a facilitator-only challenge', () => {
      const ctx = catCtx({ ...base, workshopChallenges: [wch({ facilitatoronly: true })] });
      expect(filteredProgressListForChallenge(list, 0, 'all', ctx).map(p => p.profileid)).toEqual(['fac']);
    });

    it('counts cohort + facilitators + the matching category on a categorised challenge', () => {
      const ctx = catCtx({ ...base, workshopChallenges: [wch({ workshopcategory: ['catA'] })] });
      expect(filteredProgressListForChallenge(list, 0, 'all', ctx).map(p => p.profileid)).toEqual(['coh', 'fac', 'a']);
    });

    it('counts only cohort + facilitators on an UNCATEGORISED challenge', () => {
      // The same "no categories means nobody" default as hasAccessToChallenge — pinned there as a
      // defect; asserted here because the statistics silently inherit it.
      const ctx = catCtx({ ...base, workshopChallenges: [wch({ workshopcategory: [] })] });
      expect(filteredProgressListForChallenge(list, 0, 'all', ctx).map(p => p.profileid)).toEqual(['coh', 'fac']);
    });

    it('covers everyone when no challenge index is given', () => {
      expect(filteredProgressListForChallenge(list, undefined, 'all', catCtx(base)).length).toBe(4);
      expect(filteredProgressListForChallenge(list, null, 'all', catCtx(base)).length).toBe(4);
    });
  });

  // ===============================================================================================
  // WSU-16 — the participants table's filters
  // ===============================================================================================
  describe('WSU-16 table filters', () => {
    // The status filter runs on ACCESS-scoped progress, which is recomputed from the challenge docs
    // on a category-based workshop — so these rows carry real sub-challenges rather than a bare
    // percentage. One challenge, open to both categories, two sub-challenges each.
    const mk = (profileid: string, doneCount: number) => progress({
      profileid,
      challenges: [ch([doneCount > 0 ? 'completed' : undefined, doneCount > 1 ? 'completed' : undefined])],
      progressPercentage: doneCount * 50, completedChallenges: doneCount, totalChallenges: 2,
    });
    const list = [mk('coh', 2), mk('fac', 1), mk('a', 0), mk('b', 2)];
    const base = {
      workshopChallenges: [wch({ workshopcategory: ['catA', 'catB'] })],
      facilitatorProfiles: ['fac'],
      isCohort: (id: string) => id === 'coh',
      categoryOf: (id: string) => (id === 'a' ? 'catA' : id === 'b' ? 'catB' : undefined),
    };
    const f = (over: any = {}) => ({ selectedCategoryFilter: 'all', tableTypeFilter: 'all', tableStatusFilter: 'all', ...over });

    it('does nothing on a workshop that is not category-based', () => {
      expect(filterTableParticipants(list, f({ tableStatusFilter: 'completed' }), plainCtx(base)).length).toBe(4);
    });

    it('filters by type', () => {
      expect(filterTableParticipants(list, f({ tableTypeFilter: 'facilitator' }), catCtx(base)).map(p => p.profileid)).toEqual(['fac']);
      expect(filterTableParticipants(list, f({ tableTypeFilter: 'cohort' }), catCtx(base)).map(p => p.profileid)).toEqual(['coh']);
    });

    it('makes the cat_ type filter EXCLUSIVE where the category filter is inclusive', () => {
      // "Show me category A" here means the plain category-A participants — deliberately dropping
      // facilitators and cohort members, who would otherwise dominate every category view.
      const only = filterTableParticipants(list, f({ tableTypeFilter: TABLE_CAT_PREFIX + 'catA' }), catCtx(base));
      expect(only.map(p => p.profileid)).toEqual(['a']);
      const inclusive = filterTableParticipants(list, f({ selectedCategoryFilter: 'catA' }), catCtx(base));
      expect(inclusive.map(p => p.profileid)).toEqual(['coh', 'fac', 'a']);
    });

    it('filters by status using ACCESS-scoped progress', () => {
      expect(filterTableParticipants(list, f({ tableStatusFilter: 'completed' }), catCtx(base)).map(p => p.profileid)).toEqual(['coh', 'b']);
      expect(filterTableParticipants(list, f({ tableStatusFilter: 'notstarted' }), catCtx(base)).map(p => p.profileid)).toEqual(['a']);
    });

    it('DEFECT (pinned): the table\'s "active" EXCLUDES the completed, but the tile\'s includes them', () => {
      // filterTableParticipants uses `pct > 0 && pct < 100`; headlineMetrics uses `pct > 0`. Clicking
      // the Active tile and then reading the table gives two different numbers for the same word, on
      // the same screen, with nothing to say why.
      const table = filterTableParticipants(list, f({ tableStatusFilter: 'active' }), catCtx(base));
      expect(table.map(p => p.profileid)).toEqual(['fac']);
      const tile = headlineMetrics([], list as any)['activeParticipants'];
      expect(tile).toEqual(['coh', 'fac', 'b']);
    });

    it('stacks the three filters', () => {
      const r = filterTableParticipants(
        list, f({ selectedCategoryFilter: 'catA', tableTypeFilter: 'cohort', tableStatusFilter: 'completed' }), catCtx(base)
      );
      expect(r.map(p => p.profileid)).toEqual(['coh']);
    });
  });

  // ===============================================================================================
  // WSU-17 — aggregate progress buckets
  // ===============================================================================================
  describe('WSU-17 aggregate buckets', () => {
    const pct = (p: ParticipantProgress) => p.progressPercentage;
    const list = [progress({ profileid: 'a', progressPercentage: 100 }), progress({ profileid: 'b', progressPercentage: 50 }), progress({ profileid: 'c', progressPercentage: 0 })];

    it('splits a list three ways and accumulates the total in one pass', () => {
      const b = bucketByProgress(list, pct);
      expect(b.completedIds).toEqual(['a']);
      expect(b.activeIds).toEqual(['b']);
      expect(b.notStartedIds).toEqual(['c']);
      expect(b.completedCount).toBe(1);
      expect(b.totalProgress).toBe(150);
    });

    it('computes a group\'s average and completion rate', () => {
      const s = groupProgressStat(list, pct);
      expect(s.avgProgress).toBe(50);
      expect(s.completionRate).toBeCloseTo(33.333, 3);
      expect(s.totalCount).toBe(3);
    });

    it('reads zeroes for an empty group rather than NaN', () => {
      // An empty category is normal early in a workshop; NaN would render as "NaN%" on the card.
      expect(groupProgressStat([], pct)).toEqual({ avgProgress: 0, completionRate: 0, completedCount: 0, totalCount: 0 });
    });
  });

  // ===============================================================================================
  // WSU-18 — row actions
  // ===============================================================================================
  describe('WSU-18 row actions', () => {
    it('says Completed once the participant is at 100%', () => {
      expect(moveButtonText({ progressPercentage: 100 }, wch())).toBe('Completed');
      expect(moveButtonTooltip({ progressPercentage: 100 }, wch())).toBe('Workshop completed');
    });

    it('refuses to advance a zoom call by hand, and says why', () => {
      expect(moveButtonText({ progressPercentage: 10 }, { type: 'zoomcall' })).toBe('Zoom Call');
      expect(moveButtonTooltip({ progressPercentage: 10 }, { type: 'zoomcall' }))
        .toBe('Zoom call challenges cannot be moved manually');
    });

    it('offers Move Next otherwise, including when the challenge is unknown', () => {
      expect(moveButtonText({ progressPercentage: 10 }, wch())).toBe('Move Next');
      expect(moveButtonText({ progressPercentage: 10 }, undefined)).toBe('Move Next');
    });

    it('offers a review only for an assignment that is in review AND flagged reviewable', () => {
      // All three must hold — `reviewassignemnt` is misspelled in Firestore and the misspelling is
      // load-bearing; correcting it here would silently switch the button off for everyone.
      const p = (sub: any) => ({ currentChallengeIndex: 0, currentSubChallengeIndex: 0, challenges: [{ challenges: [sub] }] });
      expect(canReviewAssignment(p({ type: 'assignment', reviewassignemnt: true, status: 'inreview' }))).toBe(true);
      expect(canReviewAssignment(p({ type: 'assignment', reviewassignemnt: true, status: 'ongoing' }))).toBe(false);
      expect(canReviewAssignment(p({ type: 'assignment', reviewassignemnt: false, status: 'inreview' }))).toBe(false);
      expect(canReviewAssignment(p({ type: 'form', reviewassignemnt: true, status: 'inreview' }))).toBe(false);
    });

    it('returns false rather than throwing on a half-built participant', () => {
      expect(canReviewAssignment({})).toBe(false);
      expect(canReviewAssignment({ challenges: [], currentChallengeIndex: 3, currentSubChallengeIndex: 0 })).toBe(false);
    });

    it('words the history tooltip for the two submission kinds', () => {
      expect(oldResultTooltip({ isQuestionAssignment: true, date: '18 May 2026' }))
        .toBe('Click to view previous question assignment from 18 May 2026');
      expect(oldResultTooltip({ date: '18 May 2026' }))
        .toBe('Click to view previous form submission from 18 May 2026');
    });
  });

  // ===============================================================================================
  // WSU-19 — CSV and dates
  // ===============================================================================================
  describe('WSU-19 CSV and dates', () => {
    it('emits a header row followed by one row per record', () => {
      const csv = createCsvContent([{ Name: 'Ada', Days: 3 }, { Name: 'Grace', Days: 4 }]);
      expect(csv.split('\n')).toEqual(['Name,Days', 'Ada,3', 'Grace,4']);
    });

    it('quotes only the text cells that need it, doubling inner quotes', () => {
      const csv = createCsvContent([{ A: 'a,b', B: 'say "hi"', C: 'line\nbreak', D: 'plain', E: 5 }]);
      expect(csv).toBe('A,B,C,D,E\n"a,b","say ""hi""","line\nbreak",plain,5');
    });

    it('returns an empty string for no data', () => {
      expect(createCsvContent([])).toBe('');
    });

    it('DEFECT (pinned): the header comes from the FIRST row only', () => {
      // A row carrying a key the first row lacks loses that column entirely, and a row missing a key
      // emits an empty cell with no complaint. An export that silently drops a column is worse than
      // one that fails: nobody re-runs it.
      const csv = createCsvContent([{ A: 1 }, { A: 2, B: 'lost' }]);
      expect(csv).toBe('A\n1\n2');
    });

    it('formats a date as dd Mon yyyy', () => {
      expect(formatDate(new Date(2026, 4, 18))).toBe('18 May 2026');
      expect(formatDate({ toDate: () => new Date(2026, 4, 18) })).toBe('18 May 2026');
    });

    it('renders nothing for a missing date', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
    });

    it('DEFECT (pinned): a broken timestamp is swallowed into an empty string', () => {
      // A doc whose date field is corrupt renders exactly like one that has no date, so nothing on
      // screen or in the export distinguishes "never enrolled properly" from "enrolment date is
      // garbage" — and the try/catch means it is never logged either.
      expect(formatDate({ toDate: () => { throw new Error('bad doc'); } })).toBe('');
    });
  });
});
