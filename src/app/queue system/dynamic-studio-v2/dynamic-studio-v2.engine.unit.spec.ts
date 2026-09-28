// dynamic-studio-v2.engine.unit.spec.ts — unit tests for the Dynamic Studio V2 rules.
//
// WHAT THESE PROTECT: what a specialist sees and can do while a real participant is on the other end
// of a call. Whether the participant reads as waiting, live, or gone; whether the call has ENDED and
// therefore whether the Zoom link may be reused or must be regenerated; which stage "Send Back"
// targets; which stage notes this particular participant's variation should show; and the AEL band
// the slider will save. Getting the call-state wrong strands somebody: a call that reads as live
// after it ended sends the specialist to Zoom's link-timeout page while the participant waits.
//
// WHY THEY DID NOT EXIST BEFORE: all of it lived as getters on a 5,523-line component that injects a
// Firestore, a Storage, a Router, an ActivatedRoute, an NgZone, a MatDialog, a MatSnackBar, a
// DomSanitizer and a FormBuilder, and re-evaluates these getters off a 5-second presence ticker.
// Nothing could reach the rules except a rendered template driven by live streams, so the only
// available assertion was "the pill says Call ended" — which cannot distinguish an ended call from a
// regenerate-and-rejoin, the exact case the `endedMeetingId` check exists for. Extracted 2026-09-10
// into dynamic-studio-v2.engine.ts with the logic unchanged, following the
// delivery-dashboard.engine.ts / priority.engine.ts precedent in ../../Journey Onboarding.
//
// THE CLOCK IS FROZEN: `now` is an injected parameter defaulting to Date.now(), so link expiry is
// asserted at the exact boundary rather than raced.
//
// ATC IS OUT OF SCOPE and nothing here touches it — see the engine header and the report for what
// was deliberately left on the component.
//
// CASES MARKED "DEFECT (pinned)" assert behaviour that is arguably WRONG. They are pinned, not
// fixed: this was a refactor. Each carries a comment saying why.
import {
  AelLevel,
  BROKEN_LINK_MARKER,
  DEFAULT_INVITATION_TIMER_SECONDS,
  PRESENCE_TICK_MS,
  additionalSpecialists,
  aelBandIndex,
  aelBandLabel,
  aelBandValue,
  callEnded,
  canRegenerate,
  compareByDocId,
  currentStageNotes,
  evolutionWishlistContactsLabel,
  formatEvolutionWishlistStatus,
  formatEvolutionWishlistType,
  formatFieldValueForOverlay,
  formatOrdinal,
  isMentor,
  isStepCompleted,
  isZoomLinkBroken,
  linkExpired,
  linkifyMessage,
  mergeQueueStudioCounts,
  participantHasJoinedCall,
  participantInWaitingRoom,
  participantProfileId,
  presenceView,
  previousStageName,
  queuesWithStudios,
  specialistInMeeting,
  stageListFor,
  stepIndex,
  topBarStatus,
  widgetFetchSignature,
} from './dynamic-studio-v2.engine';

// ---- Builders ----------------------------------------------------------------------------------

const T0 = new Date('2026-09-10T09:00:00Z').getTime();
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });

/** A live assignment. Timestamps are only ever truthiness-checked by these rules. */
const la = (over: any = {}): any => ({ docid: 'la1', stagename: 'Stage B', ...over });

const STEPS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('dynamic-studio-v2.engine', () => {

  // ===============================================================================================
  // DSU-01 — who the participant is
  // ===============================================================================================
  describe('DSU-01 participant identity', () => {
    it('prefers the token profile id', () => {
      expect(participantProfileId(la({ token: { profile_id: 'tok' }, participantid: 'pid' }))).toBe('tok');
    });

    it('falls back to participantid on the auto-enter path (no token hydrated)', () => {
      expect(participantProfileId(la({ participantid: 'pid' }))).toBe('pid');
    });

    it('is empty when neither is known', () => {
      expect(participantProfileId(la())).toBe('');
      expect(participantProfileId(null)).toBe('');
    });
  });

  // ===============================================================================================
  // DSU-02 — presence overlay
  // ===============================================================================================
  describe('DSU-02 presenceView', () => {
    it('returns the assignment untouched when no log doc exists', () => {
      const a = la({ specialistJoinedAt: ts(T0) });
      expect(presenceView(a, null)).toBe(a);
    });

    it('overlays the webhook participant timestamps', () => {
      const out = presenceView(la(), { participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 5) });
      expect(out['participantInCallAt'].toMillis()).toBe(T0);
      expect(out['participantLeftAt'].toMillis()).toBe(T0 + 5);
    });

    it('NEVER overrides participantReadyAt — the webhook cannot see the wait screen', () => {
      const out = presenceView(la({ participantReadyAt: ts(T0) }), { participantReadyAt: ts(999), specialists: {} });
      expect(out['participantReadyAt'].toMillis()).toBe(T0);
    });

    it('collapses the specialists map: joined = anyone joined, left = null while anyone is present', () => {
      const log = { specialists: { a: { joinedAt: ts(T0), leftAt: ts(T0 + 5) }, b: { joinedAt: ts(T0 + 1) } } };
      const out = presenceView(la(), log);
      expect(out['specialistJoinedAt']).toBeTruthy();
      expect(out['specialistLeftAt']).toBeNull(); // b is still in
    });

    it('reports a leave once every joiner has gone', () => {
      const log = { specialists: { a: { joinedAt: ts(T0), leftAt: ts(T0 + 5) } } };
      expect(presenceView(la(), log)['specialistLeftAt']).toBeTruthy();
    });

    it('falls back to meetingEndedAt, then to `true`, for the leave stamp', () => {
      const withEnd = presenceView(la(), { specialists: { a: { joinedAt: ts(T0) } }, meetingEndedAt: ts(T0 + 9) });
      // `a` never left, so specialistPresent is true → left is nulled regardless of meetingEndedAt.
      expect(withEnd['specialistLeftAt']).toBeNull();
    });

    it('leaves the specialist fields alone when nobody in the log ever joined', () => {
      const out = presenceView(la({ specialistJoinedAt: ts(T0) }), { specialists: { a: { leftAt: ts(T0) } } });
      expect(out['specialistJoinedAt'].toMillis()).toBe(T0); // client one-shot survives
    });

    it('honours meeting.ended only for the CURRENT meeting', () => {
      const assignment = la({ zoomdata: { id: 555 } });
      const same = presenceView(assignment, { meetingEndedAt: ts(T0), endedMeetingId: '555' });
      expect(same['meetingEndedAt']).toBeTruthy(); // compared as strings, so 555 === '555'
    });

    it('IGNORES the old meeting\'s end after a regenerate', () => {
      // This is why regenerate works at all: without the id check, the previous meeting's
      // `meeting.ended` webhook would instantly mark the freshly created meeting as over.
      const out = presenceView(la({ zoomdata: { id: 999 } }), { meetingEndedAt: ts(T0), endedMeetingId: '555' });
      expect(out['meetingEndedAt']).toBeUndefined();
    });

    it('ignores a meeting end with no endedMeetingId at all', () => {
      const out = presenceView(la({ zoomdata: { id: 999 } }), { meetingEndedAt: ts(T0) });
      expect(out['meetingEndedAt']).toBeUndefined();
    });

    it('DEFECT (pinned): "anyone joined" is the FIRST map key, not the earliest join', () => {
      // `specVals.find(s => s.joinedAt)` walks the specialists map in object-key order. With two
      // specialists in one studio, the reported call start is whichever key Firestore happened to
      // serialise first — here the LATER joiner. The Arena board's copy of this same overlay does
      // compare timestamps, so the two screens can disagree about when the same call began.
      const late = ts(T0 + 60_000), early = ts(T0);
      const log = { specialists: { zeta: { joinedAt: late }, alpha: { joinedAt: early } } };
      expect(presenceView(la(), log)['specialistJoinedAt']).toBe(late);
    });

    it('DEFECT (pinned): "anyone left" is the LAST map key, not the latest leave', () => {
      // Mirror image: `.filter(...).pop()` takes the last key in the map, so the reported end of the
      // call is an arbitrary specialist's departure rather than the final one.
      const early = ts(T0 + 1), late = ts(T0 + 60_000);
      const log = { specialists: { a: { joinedAt: ts(T0), leftAt: late }, b: { joinedAt: ts(T0), leftAt: early } } };
      expect(presenceView(la(), log)['specialistLeftAt']).toBe(early);
    });
  });

  // ===============================================================================================
  // DSU-03 — participant state
  // ===============================================================================================
  describe('DSU-03 participant state', () => {
    it('is in the waiting room when ready and neither in-call nor left', () => {
      expect(participantInWaitingRoom({ participantReadyAt: ts(T0) })).toBe(true);
    });

    it('is NOT in the waiting room once in the call or once gone', () => {
      expect(participantInWaitingRoom({ participantReadyAt: ts(T0), participantInCallAt: ts(T0 + 1) })).toBe(false);
      expect(participantInWaitingRoom({ participantReadyAt: ts(T0), participantLeftAt: ts(T0 + 1) })).toBe(false);
      expect(participantInWaitingRoom({})).toBe(false);
    });

    it('has joined the call when in-call stamped and not left', () => {
      expect(participantHasJoinedCall({ participantInCallAt: ts(T0) })).toBe(true);
      expect(participantHasJoinedCall({ participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 1) })).toBe(false);
      expect(participantHasJoinedCall({})).toBe(false);
    });
  });

  // ===============================================================================================
  // DSU-04 — call state and the Zoom link
  // ===============================================================================================
  describe('DSU-04 call state and link', () => {
    it('the webhook meeting-end is definitive', () => {
      expect(callEnded({ meetingEndedAt: ts(T0) })).toBe(true);
    });

    it('the legacy signal needs BOTH parties gone AND the specialist to have joined', () => {
      expect(callEnded({ participantLeftAt: ts(T0), specialistLeftAt: ts(T0), specialistJoinedAt: ts(T0) })).toBe(true);
      expect(callEnded({ participantLeftAt: ts(T0), specialistLeftAt: ts(T0) })).toBe(false); // never joined
      expect(callEnded({ participantLeftAt: ts(T0), specialistJoinedAt: ts(T0) })).toBe(false); // specialist still in
      expect(callEnded({})).toBe(false);
    });

    it('the specialist is "in meeting" only while joined, not left, and not ended', () => {
      expect(specialistInMeeting({ specialistJoinedAt: ts(T0) })).toBe(true);
      expect(specialistInMeeting({ specialistJoinedAt: ts(T0), specialistLeftAt: ts(T0 + 1) })).toBe(false);
      expect(specialistInMeeting({ specialistJoinedAt: ts(T0), meetingEndedAt: ts(T0 + 1) })).toBe(false);
    });

    it('a missing or marked start_url is a broken link', () => {
      expect(isZoomLinkBroken(la())).toBe(true);
      expect(isZoomLinkBroken(la({ zoomdata: { start_url: '' } }))).toBe(true);
      expect(isZoomLinkBroken(la({ zoomdata: { start_url: BROKEN_LINK_MARKER } }))).toBe(true);
      expect(BROKEN_LINK_MARKER).toBe('Link Broken');
    });

    it('a real start_url is not broken', () => {
      expect(isZoomLinkBroken(la({ zoomdata: { start_url: 'https://zoom.us/s/1' } }))).toBe(false);
    });

    it('reads linkExpiresAt as a Timestamp, a {seconds} shape, or a parseable date', () => {
      expect(linkExpired(la({ linkExpiresAt: ts(T0 - 1) }), T0)).toBe(true);
      expect(linkExpired(la({ linkExpiresAt: { seconds: (T0 - 1000) / 1000 } }), T0)).toBe(true);
      expect(linkExpired(la({ linkExpiresAt: new Date(T0 - 1).toISOString() }), T0)).toBe(true);
    });

    it('a link expiring at exactly now is NOT yet expired (strict <)', () => {
      expect(linkExpired(la({ linkExpiresAt: ts(T0) }), T0)).toBe(false);
    });

    it('no expiry, or an unparseable one, does not expire the link', () => {
      // Deliberate: we would rather offer a live link than lock a specialist out of a working
      // meeting because one field was written badly.
      expect(linkExpired(la(), T0)).toBe(false);
      expect(linkExpired(la({ linkExpiresAt: 'not a date' }), T0)).toBe(false);
    });

    it('regenerate is offered only when the link is unusable', () => {
      expect(canRegenerate(false, false, false)).toBe(false); // healthy call → rejoin instead
      expect(canRegenerate(true, false, false)).toBe(true);
      expect(canRegenerate(false, true, false)).toBe(true);
      expect(canRegenerate(false, false, true)).toBe(true);
    });

    it('mentor gating reads the role map', () => {
      expect(isMentor({ mentor: true })).toBe(true);
      expect(isMentor({ mentor: false })).toBe(false);
      expect(isMentor({})).toBe(false);
      expect(isMentor(null)).toBe(false);
    });
  });

  // ===============================================================================================
  // DSU-05 — the top-bar status pill
  // ===============================================================================================
  describe('DSU-05 topBarStatus', () => {
    const map = { p1: 'Ada Lovelace' };

    it('"Call ended" wins over every other branch', () => {
      // Order matters: checked before the participant-left branch, otherwise an ended call reads as
      // "participant left · waiting for rejoin" and the specialist waits for a rejoin that cannot come.
      const ended = topBarStatus({
        meetingEndedAt: ts(T0), participantLeftAt: ts(T0), participantReadyAt: ts(T0),
      }, map);
      expect(ended.title).toBe('Call ended');
      expect(ended.tone).toBe('slate');
      expect(ended.icon).toBe('check_circle');
    });

    it('recognises the legacy both-parties-left signal too', () => {
      const out = topBarStatus({
        participantLeftAt: ts(T0), specialistLeftAt: ts(T0), specialistJoinedAt: ts(T0),
      }, map);
      expect(out.title).toBe('Call ended');
    });

    it('names the participant once they are live', () => {
      const out = topBarStatus({ participantInCallAt: ts(T0), token: { profile_id: 'p1' } }, map);
      expect(out.title).toBe('Participant has joined');
      expect(out.tone).toBe('primary');
      expect(out.sub).toBe('Ada Lovelace is now live in the meeting');
    });

    it('shows the review hint while they wait', () => {
      const out = topBarStatus({ participantReadyAt: ts(T0) }, map);
      expect(out.title).toBe('Participant is waiting');
      expect(out.tone).toBe('green');
    });

    it('flags a mid-call drop while the specialist is still in', () => {
      const out = topBarStatus({ participantLeftAt: ts(T0), specialistJoinedAt: ts(T0) }, map);
      expect(out.title).toBe('Participant left the meeting');
      expect(out.tone).toBe('amber');
    });

    it('defaults to a quiet "Awaiting participant" rather than scary no-signal copy', () => {
      const out = topBarStatus({}, map);
      expect(out.title).toBe('Awaiting participant');
      expect(out.tone).toBe('slate');
      expect(out.icon).toBe('schedule');
    });

    it('DEFECT (pinned): the joined pill ignores the participantid fallback', () => {
      // It reads only `la.token.profile_id`, while participantProfileId() falls back to
      // `la.participantid`. On the auto-enter path the pill says the generic "Participant is now
      // live" while the sidebar right beside it already shows the person's real name.
      const out = topBarStatus({ participantInCallAt: ts(T0), participantid: 'p1' }, map);
      expect(out.sub).toBe('Participant is now live in the meeting');
    });

    it('falls back to "Participant" when the name is genuinely unknown', () => {
      const out = topBarStatus({ participantInCallAt: ts(T0), token: { profile_id: 'ghost' } }, map);
      expect(out.sub).toBe('Participant is now live in the meeting');
    });
  });

  // ===============================================================================================
  // DSU-06 — stage resolution through the participant's variation
  // ===============================================================================================
  describe('DSU-06 stage resolution', () => {
    const queue = { stages: ['S1', 'S2', 'S3'] };
    const variations = { v1: ['S1', 'S3'] };

    it('uses the variation\'s stage list when the token names one', () => {
      expect(stageListFor(la({ token: { variationid: 'v1' } }), variations, queue)).toEqual(['S1', 'S3']);
    });

    it('uses the queue\'s full list when there is no variation', () => {
      expect(stageListFor(la(), variations, queue)).toEqual(['S1', 'S2', 'S3']);
    });

    it('returns null — "we do not know" — for an unknown variation id', () => {
      // Conservative on purpose: falling back to the queue list would show this participant a stage
      // their variation never includes.
      expect(stageListFor(la({ token: { variationid: 'vGONE' } }), variations, queue)).toBeNull();
    });

    it('previous stage is the one before the current in the resolved list', () => {
      expect(previousStageName(la({ stagename: 'S2' }), variations, queue)).toBe('S1');
      expect(previousStageName(la({ stagename: 'S3', token: { variationid: 'v1' } }), variations, queue)).toBe('S1');
    });

    it('there is no previous stage at the first stage', () => {
      expect(previousStageName(la({ stagename: 'S1' }), variations, queue)).toBeNull();
    });

    it('hides Send Back when the stage list is unknown or does not contain the current stage', () => {
      expect(previousStageName(la({ stagename: 'S2', token: { variationid: 'vGONE' } }), variations, queue)).toBeNull();
      expect(previousStageName(la({ stagename: 'ELSEWHERE' }), variations, queue)).toBeNull();
      expect(previousStageName(null, variations, queue)).toBeNull();
    });

    it('reads stage notes in the new ARRAY format', () => {
      const q = { ...queue, stageproperty: { 'S2': { stagenote: [{ stage: 'S3', note: 'Bring the form' }] } } };
      expect(currentStageNotes(la({ stagename: 'S2' }), q, variations))
        .toEqual([{ stage: 'S3', note: 'Bring the form' }]);
    });

    it('reads stage notes in the legacy MAP format', () => {
      const q = { ...queue, stageproperty: { 'S2': { stagenote: { 'S3': 'Bring the form' } } } };
      expect(currentStageNotes(la({ stagename: 'S2' }), q, variations))
        .toEqual([{ stage: 'S3', note: 'Bring the form' }]);
    });

    it('hides a note about a stage this participant\'s variation never reaches', () => {
      const q = { ...queue, stageproperty: { 'S1': { stagenote: { 'S2': 'Only for the S2 crowd' } } } };
      // v1 = [S1, S3] — no S2, so the note is not for them.
      expect(currentStageNotes(la({ stagename: 'S1', token: { variationid: 'v1' } }), q, variations)).toEqual([]);
    });

    it('drops blank and whitespace-only notes', () => {
      const q = { ...queue, stageproperty: { 'S2': { stagenote: { 'S3': '   ', 'S1': null } } } };
      expect(currentStageNotes(la({ stagename: 'S2' }), q, variations)).toEqual([]);
    });

    it('shows nothing when the variation is unknown, the stage has no note, or there is no assignment', () => {
      const q = { ...queue, stageproperty: { 'S2': { stagenote: { 'S3': 'note' } } } };
      expect(currentStageNotes(la({ stagename: 'S2', token: { variationid: 'vGONE' } }), q, variations)).toEqual([]);
      expect(currentStageNotes(la({ stagename: 'S2' }), queue, variations)).toEqual([]);
      expect(currentStageNotes(null, q, variations)).toEqual([]);
      expect(currentStageNotes(la({ stagename: '' }), q, variations)).toEqual([]);
    });
  });

  // ===============================================================================================
  // DSU-07 — the extra-specialists roster
  // ===============================================================================================
  describe('DSU-07 additional specialists', () => {
    const mapProfile = { s1: 'Grace Hopper', blank: '' };
    const mapActivity = { act1: 'Coaching' };

    it('resolves each bonus-activity entry to a name and an activity', () => {
      const out = additionalSpecialists(la({ bonusactivity: { s1: 'act1' } }), mapProfile, mapActivity);
      expect(out).toEqual([{ profileId: 's1', name: 'Grace Hopper', activity: 'Coaching' }]);
    });

    it('is empty when nobody extra was invited', () => {
      expect(additionalSpecialists(la(), mapProfile, mapActivity)).toEqual([]);
      expect(additionalSpecialists(null, mapProfile, mapActivity)).toEqual([]);
    });

    it('shows the placeholder for an unresolved profile', () => {
      const out = additionalSpecialists(la({ bonusactivity: { ghost: 'act1' } }), mapProfile, mapActivity);
      expect(out[0].name).toBe('—');
    });

    it('DEFECT (pinned): an EMPTY-STRING name renders a blank chip, not the placeholder', () => {
      // The fallback is `?? '—'`, which only fires on null/undefined. A profile map entry holding ''
      // — as a half-written profile doc produces — passes straight through, so an invited specialist
      // shows up on the roster as an empty row with no way to tell who it is.
      const out = additionalSpecialists(la({ bonusactivity: { blank: 'act1' } }), mapProfile, mapActivity);
      expect(out[0].name).toBe('');
    });

    it('leaves the activity blank when the activity id is unknown', () => {
      const out = additionalSpecialists(la({ bonusactivity: { s1: 'nope' } }), mapProfile, mapActivity);
      expect(out[0].activity).toBe('');
    });
  });

  // ===============================================================================================
  // DSU-08 — AEL bands
  // ===============================================================================================
  describe('DSU-08 AEL bands', () => {
    const levels: AelLevel[] = [
      { startpoint: 0, endpoint: 10 },
      { startpoint: 11, endpoint: 20 },
      { startpoint: 21, endpoint: 30 },
    ];

    it('builds the stored value string from the endpoints', () => {
      expect(aelBandValue(levels[1])).toBe('11---20');
      expect(aelBandValue(null)).toBe('');
    });

    it('finds the index of a stored band', () => {
      expect(aelBandIndex(levels, '11---20')).toBe(1);
      expect(aelBandIndex(levels, '21---30')).toBe(2);
    });

    it('labels the current band with an en dash', () => {
      expect(aelBandLabel(levels, '11---20')).toBe('11 – 20');
    });

    it('labels an empty level list as unknown', () => {
      expect(aelBandLabel([], '11---20')).toBe('—');
    });

    it('DEFECT (pinned): an UNRECOGNISED band silently becomes band 0', () => {
      // `idx < 0 ? 0 : idx` — a stored value that no longer matches any configured level (a band was
      // renamed or its endpoints edited) displays the FIRST band instead of flagging the mismatch.
      // The slider then sits on band 0, so nudging it and saving rewrites a real participant's
      // crossover metric down to the lowest band, and nothing in the UI says so.
      expect(aelBandIndex(levels, 'no-such-band')).toBe(0);
      expect(aelBandLabel(levels, 'no-such-band')).toBe('0 – 10');
      expect(aelBandIndex(levels, null)).toBe(0);
    });
  });

  // ===============================================================================================
  // DSU-09 — Evolution Wishlist labels
  // ===============================================================================================
  describe('DSU-09 evolution wishlist labels', () => {
    it('renames the known types and passes anything else through', () => {
      expect(formatEvolutionWishlistType('familyandpeers')).toBe('Family & Peers');
      expect(formatEvolutionWishlistType('self')).toBe('Self');
      expect(formatEvolutionWishlistType('other')).toBe('other');
      expect(formatEvolutionWishlistType('')).toBe('-');
    });

    it('renames "sended" to "Shared"', () => {
      expect(formatEvolutionWishlistStatus({ status: 'sended' })).toBe('Shared');
      expect(formatEvolutionWishlistStatus({ status: 'draft' })).toBe('draft');
      expect(formatEvolutionWishlistStatus({})).toBe('-');
    });

    it('prefixes "Partially " when the entry was manually completed', () => {
      expect(formatEvolutionWishlistStatus({ status: 'sended', mannualcompleted: true })).toBe('Partially Shared');
      expect(formatEvolutionWishlistStatus({ mannualcompleted: true })).toBe('Partially -');
    });

    it('counts submitted contacts out of the total', () => {
      const entry = { contacts: [{ submitted: true }, { submitted: false }, {}] };
      expect(evolutionWishlistContactsLabel(entry)).toBe('1/3');
    });

    it('counts only an exact `true`, not a truthy value', () => {
      expect(evolutionWishlistContactsLabel({ contacts: [{ submitted: 'yes' }] })).toBe('0/1');
    });

    it('hides the chip when there are no contacts at all', () => {
      expect(evolutionWishlistContactsLabel({ contacts: [] })).toBeNull();
      expect(evolutionWishlistContactsLabel({})).toBeNull();
      expect(evolutionWishlistContactsLabel(null)).toBeNull();
    });

    it('renders English ordinals', () => {
      expect(formatOrdinal(1)).toBe('1st');
      expect(formatOrdinal(2)).toBe('2nd');
      expect(formatOrdinal(3)).toBe('3rd');
      expect(formatOrdinal(4)).toBe('4th');
      expect(formatOrdinal(11)).toBe('11th'); // the teens exception
      expect(formatOrdinal(12)).toBe('12th');
      expect(formatOrdinal(13)).toBe('13th');
      expect(formatOrdinal(21)).toBe('21st');
      expect(formatOrdinal(111)).toBe('111th');
    });

    it('DEFECT (pinned): a negative count renders as a plausible-looking ordinal', () => {
      // The suffix table is indexed with `(v - 20) % 10`, which goes negative below 20 and relies on
      // out-of-range lookups falling through. A bad visit count comes out as "-1th" — a label that
      // reads like real data instead of surfacing that the count is wrong.
      expect(formatOrdinal(-1)).toBe('-1th');
    });
  });

  // ===============================================================================================
  // DSU-10 — queue cards, steps and small helpers
  // ===============================================================================================
  describe('DSU-10 queue cards and helpers', () => {
    it('sums the per-chunk studio counts', () => {
      expect(mergeQueueStudioCounts([{ q1: 2 }, { q1: 1, q2: 3 }])).toEqual({ q1: 3, q2: 3 });
      expect(mergeQueueStudioCounts([])).toEqual({});
    });

    it('drops the __seeded bookkeeping key', () => {
      // It exists only to force a first emission; counting it would invent a phantom queue card.
      expect(mergeQueueStudioCounts([{ __seeded: 1, q1: 2 }])).toEqual({ q1: 2 });
    });

    it('keeps only queues that actually have a studio', () => {
      const queues = [{ docid: 'q1' }, { docid: 'q2' }, { docid: 'q3' }];
      expect(queuesWithStudios(queues, { q1: 2, q2: 0 }).map(q => q['docid'])).toEqual(['q1']);
    });

    it('compares select options by docid', () => {
      expect(compareByDocId({ docid: 'a' }, { docid: 'a' })).toBe(true);
      expect(compareByDocId({ docid: 'a' }, { docid: 'b' })).toBe(false);
      expect(compareByDocId(null, null)).toBe(true);
      expect(compareByDocId({ docid: 'a' }, null)).toBe(false);
    });

    it('finds a step\'s index, or -1', () => {
      expect(stepIndex(STEPS, 'b')).toBe(1);
      expect(stepIndex(STEPS, 'zz')).toBe(-1);
    });

    it('marks only the steps strictly before the active one as completed', () => {
      expect(isStepCompleted(STEPS, 'a', 'b')).toBe(true);
      expect(isStepCompleted(STEPS, 'b', 'b')).toBe(false); // the active step is not "completed"
      expect(isStepCompleted(STEPS, 'c', 'b')).toBe(false);
    });

    it('marks nothing completed when the active step is unknown', () => {
      expect(isStepCompleted(STEPS, 'a', 'gone')).toBe(false);
    });

    it('signs the widget fetch by assignment, stage and token', () => {
      expect(widgetFetchSignature(la({ token: { docid: 'tk' } }))).toBe('la1|Stage B|tk');
    });

    it('marks a not-yet-hydrated token as "pending", so the next hydration re-fetches once', () => {
      expect(widgetFetchSignature(la())).toBe('la1|Stage B|pending');
      expect(widgetFetchSignature(la())).not.toBe(widgetFetchSignature(la({ token: { docid: 'tk' } })));
    });

    it('refuses to sign an assignment with no id or no stage', () => {
      expect(widgetFetchSignature(la({ docid: null }))).toBeNull();
      expect(widgetFetchSignature(la({ stagename: '' }))).toBeNull();
      expect(widgetFetchSignature(null)).toBeNull();
    });

    it('keeps the documented timer defaults', () => {
      expect(DEFAULT_INVITATION_TIMER_SECONDS).toBe(120);
      expect(PRESENCE_TICK_MS).toBe(5000);
    });
  });

  // ===============================================================================================
  // DSU-11 — chat message rendering
  // ===============================================================================================
  describe('DSU-11 linkifyMessage', () => {
    it('linkifies bare URLs and turns newlines into breaks', () => {
      const out = linkifyMessage('see\nhttps://example.com now');
      expect(out).toContain('see<br>');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('rel="noopener"');
    });

    it('honours the link colour parameter', () => {
      expect(linkifyMessage('https://x.dev', '#ff0000')).toContain('color:#ff0000');
    });

    it('returns the empty string for an empty message', () => {
      expect(linkifyMessage('')).toBe('');
    });

    it('DEFECT (pinned): a URL at end of line swallows the <br> into its own href', () => {
      // `\n` → `<br>` runs BEFORE the `https?://[^\s]+` match, and `<br>` has no whitespace in it, so
      // it is captured as part of the URL. The link points at "https://example.com<br>next", which
      // 404s, and the line break the sender typed vanishes. Same bug as arena-board.engine.ts — the
      // two screens carry copies of this function.
      expect(linkifyMessage('https://example.com\nnext line')).toContain('href="https://example.com<br>next"');
    });
  });

  // ===============================================================================================
  // DSU-12 — submitted-form field rendering
  // ===============================================================================================
  describe('DSU-12 formatFieldValueForOverlay', () => {
    it('says "Not answered" for a blank value, but renders a real 0', () => {
      expect(formatFieldValueForOverlay({ type: 'text' }, '')).toBe('Not answered');
      expect(formatFieldValueForOverlay({ type: 'text' }, null)).toBe('Not answered');
      expect(formatFieldValueForOverlay({ type: 'text' }, 0)).toBe('0'); // a zero answer IS an answer
    });

    it('renders a Firestore date through toDate()', () => {
      const d = new Date(2026, 8, 10);
      expect(formatFieldValueForOverlay({ type: 'date' }, { toDate: () => d })).toBe(d.toLocaleDateString());
    });

    it('renders checkboxes and booleans as Yes / No', () => {
      expect(formatFieldValueForOverlay({ type: 'Checkbox' }, true)).toBe('Yes');
      expect(formatFieldValueForOverlay({ type: 'anything' }, true)).toBe('Yes');
    });

    it('joins multi-select answers with commas', () => {
      expect(formatFieldValueForOverlay({ type: 'MultiSelect' }, ['a', 'b'])).toBe('a, b');
      expect(formatFieldValueForOverlay({ type: 'multicheckbox' }, 'single')).toBe('single');
    });

    it('appends the configured range to a slider answer', () => {
      expect(formatFieldValueForOverlay({ type: 'slider', options: [1, 2, 3] }, 2)).toBe('2 (Range: 1-3)');
      expect(formatFieldValueForOverlay({ type: 'slider' }, 2)).toBe('2');
    });

    it('renders a repeating group using the configured sub-fields', () => {
      const field = { type: 'array', array: [{ fieldname: 'who' }, { fieldname: 'what' }] };
      expect(formatFieldValueForOverlay(field, [{ who: 'Ada', what: 'notes', ignored: 'x' }]))
        .toBe('who: Ada\nwhat: notes');
    });

    it('falls back to the object\'s own keys when no sub-fields are configured', () => {
      expect(formatFieldValueForOverlay({ type: 'array' }, [{ a: 1, b: '' }])).toBe('a: 1');
    });

    it('says "No items" for an empty repeating group', () => {
      // [] is TRUTHY in JavaScript, so the `!value` guard at the top does NOT catch it — an empty
      // repeating group reaches the 'array' case, fails the `length > 0` test, and renders 'No items'.
      // Worth stating explicitly: 'Not answered' (the field was never filled) and 'No items' (the field
      // was opened and left with zero rows) are different states, and this is the one that distinguishes
      // them. A non-array truthy value lands on the same branch.
      expect(formatFieldValueForOverlay({ type: 'array' }, [])).toBe('No items');
      expect(formatFieldValueForOverlay({ type: 'array' }, 'oops')).toBe('No items');
    });

    it('flattens an unexpected object into key: value pairs', () => {
      expect(formatFieldValueForOverlay({ type: 'text' }, { a: 1, b: null, c: 'x' })).toBe('a: 1, c: x');
    });
  });
});
