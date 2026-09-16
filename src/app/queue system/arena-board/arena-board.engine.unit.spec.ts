// arena-board.engine.unit.spec.ts — unit tests for the Arena board's coordination rules.
//
// WHAT THESE PROTECT: the decisions a queue coordinator acts on live, with participants waiting —
// who is next up and in what order, which studios are free to receive them, whether a studio is
// idle / ringing / joined / in-call, whether a call has actually ended (and therefore whether its
// timer freezes), and every countdown and clock string on a card.
//
// WHY THEY DID NOT EXIST BEFORE: all of this lived as getters and methods on a component that
// injects a Firestore, a Storage, a Router, an ActivatedRoute, a DomSanitizer and an
// AuthguardService, and opens six live collectionData streams in its constructor. Nothing could
// reach the rules except through a template fed by those streams, so the only available assertion
// was "the ACTIVE column shows two cards" — which cannot tell "the specialist joined" from "the
// webhook log said someone joined", the exact distinction presenceOverlay() draws. Extracted
// 2026-09-10 into arena-board.engine.ts with the logic unchanged, following the
// delivery-dashboard.engine.ts / priority.engine.ts precedent in ../../Journey Onboarding.
//
// THE CLOCK IS FROZEN IN EVERY TIME-DEPENDENT CASE. `now` is an injected parameter defaulting to
// Date.now(), so a boundary (0:00 vs 0:01, expired vs not) is asserted exactly rather than raced.
//
// CASES MARKED "DEFECT (pinned)" assert behaviour that is arguably WRONG. They are pinned, not
// fixed: this was a refactor. Each carries a comment saying why it looks wrong. See the engine
// header and the report for the full list.
import {
  ArenaAssignment,
  ArenaInvitation,
  ArenaStudio,
  ArenaToken,
  CHAT_FILE_MAX_BYTES,
  LOG_SUB_CHUNK_SIZE,
  attemptsLabel,
  bonusSpecialists,
  bothInCall,
  buildChatNameCache,
  callEnded,
  callEndedClock,
  callStartedClock,
  completedFeed,
  displayNameFromProfileDoc,
  filterPendingInvitations,
  hasName,
  idleStudios,
  initials,
  invitingStudios,
  isAcceptableChatFile,
  isImageFile,
  inviteCountdown,
  latestLeaveMs,
  linkifyMessage,
  liveStudios,
  logSubscriptionChunks,
  logSubscriptionKey,
  mmss,
  onlyParticipantLeft,
  onlySpecialistLeft,
  pairingSpecialists,
  participantInCall,
  participantName,
  participantPresent,
  presenceOverlay,
  profileIdsToPreload,
  queuedTokens,
  sessionElapsed,
  sinceStudioEntry,
  sortByChatActivity,
  specialistInCall,
  specialistJoined,
  specialistJoinedById,
  specialistList,
  specialistPresentById,
  stageActivityCombos,
  stageStudios,
  studioChatName,
  tokenPosition,
  tokensForStage,
  unreadCountsByStudio,
  unreadMessagesFor,
  waitingTokens,
} from './arena-board.engine';

// ---- Builders ----------------------------------------------------------------------------------

/** A Firestore Timestamp stand-in: only .toDate()/.toMillis() are ever called on one. */
const ts = (ms: number) => ({ toDate: () => new Date(ms), toMillis: () => ms });

/** A value that LOOKS like a timestamp to a `.toDate()` caller but has no .toMillis(). */
const dateOnly = (ms: number) => ({ toDate: () => new Date(ms) });

const token = (over: Partial<ArenaToken> = {}): ArenaToken => ({
  docid: 't1', profile_id: 'p1', queueid: 'q1', currentstage: 'Stage A', ...over,
});

const studio = (over: Partial<ArenaStudio> = {}): ArenaStudio => ({
  docid: 's1', participants: [], queueid: 'q1', ...over,
});

const invite = (over: Partial<ArenaInvitation> = {}): ArenaInvitation => ({
  docid: 'i1', studioid: 's1', tokenref: null, stage: 'Stage A', status: 'pending', ...over,
});

const assignment = (over: Partial<ArenaAssignment> = {}): ArenaAssignment => ({
  docid: 'la1', studioid: 's1', stagename: 'Stage A', status: 'live', participantid: 'p1', ...over,
});

const T0 = new Date('2026-09-10T09:00:00Z').getTime();

describe('arena-board.engine', () => {

  // ===============================================================================================
  // ABU-01 — the Waiting / Queued columns
  // ===============================================================================================
  describe('ABU-01 token columns and ordering', () => {
    it('keeps only tokens whose currentstage matches the board stage', () => {
      const rows = [token({ docid: 'a', currentstage: 'Stage A' }), token({ docid: 'b', currentstage: 'Stage B' })];
      expect(tokensForStage(rows, 'Stage A').map(t => t.docid)).toEqual(['a']);
    });

    it('orders by queueposition — the same field the dynamic queue manager uses', () => {
      const rows = [
        token({ docid: 'third', queueposition: 3 }),
        token({ docid: 'first', queueposition: 1 }),
        token({ docid: 'second', queueposition: 2 }),
      ];
      expect(tokensForStage(rows, 'Stage A').map(t => t.docid)).toEqual(['first', 'second', 'third']);
    });

    it('falls back to tokennumber when queueposition is missing', () => {
      const rows = [token({ docid: 'b', tokennumber: 9 }), token({ docid: 'a', queueposition: 2 })];
      expect(tokensForStage(rows, 'Stage A').map(t => t.docid)).toEqual(['a', 'b']);
    });

    it('sinks tokens with neither position nor number to the bottom', () => {
      const rows = [token({ docid: 'none' }), token({ docid: 'pos', queueposition: 5 })];
      expect(tokensForStage(rows, 'Stage A').map(t => t.docid)).toEqual(['pos', 'none']);
    });

    it('treats queueposition 0 as a real position, not as missing', () => {
      // `??` (not `||`) — a zeroth position must sort first rather than falling through to tokennumber.
      const rows = [token({ docid: 'one', queueposition: 1 }), token({ docid: 'zero', queueposition: 0, tokennumber: 99 })];
      expect(tokensForStage(rows, 'Stage A').map(t => t.docid)).toEqual(['zero', 'one']);
    });

    it('Waiting is exactly status === ready', () => {
      const rows = [token({ docid: 'r', status: 'ready' }), token({ docid: 'q', status: 'queued' })];
      expect(waitingTokens(rows).map(t => t.docid)).toEqual(['r']);
    });

    it('Queued is queued, invited, or no status at all', () => {
      const rows = [
        token({ docid: 'q', status: 'queued' }),
        token({ docid: 'i', status: 'invited' }),
        token({ docid: 'n', status: undefined }),
        token({ docid: 'r', status: 'ready' }),
      ];
      expect(queuedTokens(rows).map(t => t.docid)).toEqual(['q', 'i', 'n']);
    });

    it('DEFECT (pinned): a token with an UNKNOWN status vanishes from both columns', () => {
      // 'paused', 'onhold', a typo, or any status a future writer introduces belongs to neither
      // Waiting (=== 'ready') nor Queued (null | queued | invited). The participant is in the queue
      // and holds an Active token, but the coordinator's board shows them nowhere at all — the two
      // columns are not exhaustive and nothing surfaces the leftovers.
      const rows = [token({ docid: 'x', status: 'paused' })];
      expect(waitingTokens(rows).length).toBe(0);
      expect(queuedTokens(rows).length).toBe(0);
    });

    it('collects the participant and this stage\'s preassigned specialists for name preloading', () => {
      const rows = [token({ profile_id: 'p1', preassigned: { 'Stage A': ['s1', 's2'], 'Stage B': ['other'] } })];
      expect(profileIdsToPreload(rows, 'Stage A')).toEqual(['p1', 's1', 's2']);
    });

    it('shows a position chip only when the token carries queueposition', () => {
      expect(tokenPosition(token({ queueposition: 4 }))).toBe(4);
      // Deliberately NOT falling back to tokennumber — different concept, would mislead.
      expect(tokenPosition(token({ tokennumber: 4 }))).toBeNull();
    });
  });

  // ===============================================================================================
  // ABU-02 — which studios serve this stage
  // ===============================================================================================
  describe('ABU-02 stage eligibility', () => {
    const queueData = {
      stageproperty: { 'Stage A': { compulsoryactivity: { c1: ['coach', 'agent'], c2: 'solo' } } },
    };

    it('collapses each configured combination to a sorted comma signature', () => {
      expect(stageActivityCombos(queueData, 'Stage A')).toEqual(['agent,coach', 'solo']);
    });

    it('returns no combos for a stage with no activity config', () => {
      expect(stageActivityCombos(queueData, 'Stage Z')).toEqual([]);
      expect(stageActivityCombos(null, 'Stage A')).toEqual([]);
    });

    it('keeps only studios whose activity signature matches a combination', () => {
      const match = studio({ docid: 'match', participantsactivity: { a: 'coach', b: 'agent' } });
      const other = studio({ docid: 'other', participantsactivity: { a: 'reviewer' } });
      expect(stageStudios([match, other], stageActivityCombos(queueData, 'Stage A')).map(s => s.docid))
        .toEqual(['match']);
    });

    it('does NOT filter at all when the stage has no activity config', () => {
      // Deliberate: a missing or edge config must never blank the whole board.
      const all = [studio({ docid: 'a' }), studio({ docid: 'b' })];
      expect(stageStudios(all, []).length).toBe(2);
    });
  });

  // ===============================================================================================
  // ABU-03 — the studio columns
  // ===============================================================================================
  describe('ABU-03 idle / live / inviting columns', () => {
    const s1 = studio({ docid: 's1' }), s2 = studio({ docid: 's2' }), s3 = studio({ docid: 's3' });

    it('idle = checked in, no live assignment, no invitation ringing', () => {
      const live = [assignment({ studioid: 's2' })];
      const invs = [invite({ studioid: 's3' })];
      expect(idleStudios([s1, s2, s3], live, invs).map(s => s.docid)).toEqual(['s1']);
    });

    it('live = has a live assignment', () => {
      expect(liveStudios([s1, s2], [assignment({ studioid: 's2' })]).map(s => s.docid)).toEqual(['s2']);
    });

    it('DEFECT (pinned): liveStudios reads the UNFILTERED studio list, unlike idleStudios', () => {
      // idleStudios() is handed the stage-filtered list; liveStudios() is handed every checked-in
      // studio in the queue. Today the live-assignment query is itself filtered by stagename, which
      // masks it — but the two columns disagree about what "a studio on this board" means, so any
      // change to that query silently bleeds other stages' studios into the LIVE column.
      const wrongStage = studio({ docid: 'sX', participantsactivity: { a: 'unrelated' } });
      const live = [assignment({ studioid: 'sX' })];
      expect(liveStudios([wrongStage], live).map(s => s.docid)).toEqual(['sX']);
      expect(idleStudios(stageStudios([wrongStage], ['coach']), [], []).length).toBe(0);
    });

    it('drops an INVITING card once the participant has actually landed', () => {
      const invs = [invite({ docid: 'i1', studioid: 's1' }), invite({ docid: 'i2', studioid: 's2' })];
      const rows = invitingStudios(invs, [s1, s2], [assignment({ studioid: 's2' })]);
      expect(rows.map(r => r.invitation.docid)).toEqual(['i1']);
      expect(rows[0].studio?.docid).toBe('s1');
    });

    it('still shows the INVITING card when the studio doc has not loaded', () => {
      const rows = invitingStudios([invite({ studioid: 'unknown' })], [], []);
      expect(rows.length).toBe(1);
      expect(rows[0].studio).toBeNull();
    });
  });

  // ===============================================================================================
  // ABU-04 — invitation liveness and the Done feed
  // ===============================================================================================
  describe('ABU-04 invitation liveness', () => {
    const now = new Date(T0);

    it('drops resolved invitations', () => {
      const rows = [invite({ docid: 'ok' }), invite({ docid: 'done', status: 'success' }), invite({ docid: 'x', status: 'cancelled' })];
      expect(filterPendingInvitations(rows, now).map(i => i.docid)).toEqual(['ok']);
    });

    it('drops invitations whose expiry has passed', () => {
      const rows = [
        invite({ docid: 'live', expirydate: ts(T0 + 1000) }),
        invite({ docid: 'dead', expirydate: ts(T0 - 1000) }),
      ];
      expect(filterPendingInvitations(rows, now).map(i => i.docid)).toEqual(['live']);
    });

    it('keeps an invitation expiring at exactly now (the comparison is strict <)', () => {
      expect(filterPendingInvitations([invite({ expirydate: ts(T0) })], now).length).toBe(1);
    });

    it('DEFECT (pinned): an invitation with NO status is treated as pending forever', () => {
      // The guard is `if (inv.status && inv.status !== 'pending')`, so a falsy status short-circuits
      // to "keep". A write that forgets the field — or writes '' — produces a phantom INVITING card
      // that keeps a studio out of the IDLE column and that the coordinator has no way to clear.
      const rows = [invite({ docid: 'nostatus', status: undefined as any }), invite({ docid: 'empty', status: '' })];
      expect(filterPendingInvitations(rows, now).map(i => i.docid)).toEqual(['nostatus', 'empty']);
    });

    it('Done feed keeps only isactivitydone rows, newest first', () => {
      const rows = [
        { ...assignment({ docid: 'old', status: 'completed' }), isactivitydone: true, created: ts(T0 - 5000) },
        { ...assignment({ docid: 'new', status: 'completed' }), isactivitydone: true, created: ts(T0) },
        { ...assignment({ docid: 'unfinished', status: 'completed' }), isactivitydone: false, created: ts(T0) },
      ] as any[];
      expect(completedFeed(rows).map(a => a.docid)).toEqual(['new', 'old']);
    });

    it('sorts a created-less row last (its millis read as 0)', () => {
      const rows = [
        { ...assignment({ docid: 'nodate' }), isactivitydone: true },
        { ...assignment({ docid: 'dated' }), isactivitydone: true, created: ts(T0) },
      ] as any[];
      expect(completedFeed(rows).map(a => a.docid)).toEqual(['dated', 'nodate']);
    });
  });

  // ===============================================================================================
  // ABU-05 — log subscription chunking (Firestore caps `in` at 30)
  // ===============================================================================================
  describe('ABU-05 live-assignment-log subscription', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => assignment({ docid: 'la' + i }));

    it('chunks ids at the Firestore `in` limit', () => {
      expect(LOG_SUB_CHUNK_SIZE).toBe(30);
      const chunks = logSubscriptionChunks(many(31));
      expect(chunks.length).toBe(2);
      expect(chunks[0].length).toBe(30);
      expect(chunks[1].length).toBe(1);
    });

    it('dedupes ids and drops blanks', () => {
      const rows = [assignment({ docid: 'a' }), assignment({ docid: 'a' }), assignment({ docid: '' })];
      expect(logSubscriptionChunks(rows)).toEqual([['a']]);
    });

    it('key is order-independent, so a re-emitted list does not churn the listener', () => {
      const a = [assignment({ docid: 'x' }), assignment({ docid: 'y' })];
      const b = [assignment({ docid: 'y' }), assignment({ docid: 'x' })];
      expect(logSubscriptionKey(a)).toBe(logSubscriptionKey(b));
    });

    it('key changes when the id SET changes', () => {
      expect(logSubscriptionKey([assignment({ docid: 'x' })]))
        .not.toBe(logSubscriptionKey([assignment({ docid: 'x' }), assignment({ docid: 'z' })]));
    });
  });

  // ===============================================================================================
  // ABU-06 — presence overlay (webhook truth over client one-shots)
  // ===============================================================================================
  describe('ABU-06 presenceOverlay', () => {
    it('returns the row untouched when there is no log doc', () => {
      const a = assignment({ specialistJoinedAt: ts(T0) });
      expect(presenceOverlay(a, null)).toBe(a);
    });

    it('overlays the webhook participant timestamps', () => {
      const out = presenceOverlay(assignment(), { participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 5) });
      expect(out.participantInCallAt.toMillis()).toBe(T0);
      expect(out.participantLeftAt.toMillis()).toBe(T0 + 5);
    });

    it('NEVER overrides participantReadyAt — the webhook cannot see the wait screen', () => {
      const a = assignment({ participantReadyAt: ts(T0) });
      const out = presenceOverlay(a, { participantReadyAt: ts(999), specialists: {} });
      expect(out.participantReadyAt.toMillis()).toBe(T0);
    });

    it('collapses the specialists map to the EARLIEST join', () => {
      const log = { specialists: { a: { joinedAt: ts(T0 + 60), leftAt: ts(T0 + 90) }, b: { joinedAt: ts(T0), leftAt: ts(T0 + 30) } } };
      expect(presenceOverlay(assignment(), log).specialistJoinedAt.toMillis()).toBe(T0);
    });

    it('collapses to the LATEST leave once everyone has gone', () => {
      const log = { specialists: { a: { joinedAt: ts(T0), leftAt: ts(T0 + 30) }, b: { joinedAt: ts(T0 + 5), leftAt: ts(T0 + 90) } } };
      expect(presenceOverlay(assignment(), log).specialistLeftAt.toMillis()).toBe(T0 + 90);
    });

    it('nulls specialistLeftAt while ANYONE is still present', () => {
      const log = { specialists: { a: { joinedAt: ts(T0), leftAt: ts(T0 + 30) }, b: { joinedAt: ts(T0 + 5) } } };
      expect(presenceOverlay(assignment(), log).specialistLeftAt).toBeNull();
    });

    it('falls back to meetingEndedAt when everyone joined but nobody has a leave stamp', () => {
      const log = { specialists: { a: { joinedAt: ts(T0) } }, meetingEndedAt: ts(T0 + 100) };
      // `a` has joinedAt and no leftAt → present → left is nulled. The fallback only applies when
      // every joiner has left, which is why this asserts null rather than meetingEndedAt.
      expect(presenceOverlay(assignment(), log).specialistLeftAt).toBeNull();
    });

    it('leaves the specialist fields alone when nobody in the log ever joined', () => {
      const a = assignment({ specialistJoinedAt: ts(T0) });
      const out = presenceOverlay(a, { specialists: { a: { leftAt: ts(T0) } } });
      expect(out.specialistJoinedAt.toMillis()).toBe(T0); // client one-shot survives
    });

    it('DEFECT (pinned): a joinedAt without .toMillis() always wins "earliest join"', () => {
      // The comparator coerces anything that is not a Firestore Timestamp to 0 millis. A joinedAt
      // written as a plain Date or an ISO string therefore scores 0 and beats every real timestamp,
      // so the ACTIVE card's session timer counts from a bogus start and reads far too long.
      const bogus = dateOnly(T0 + 10_000);
      const log = { specialists: { real: { joinedAt: ts(T0) }, weird: { joinedAt: bogus } } };
      expect(presenceOverlay(assignment(), log).specialistJoinedAt).toBe(bogus);
    });

    it('DEFECT (pinned): the same coercion makes such a value always LOSE "latest leave"', () => {
      // Mirror image of the above: a non-Timestamp leftAt scores 0 and can never be the latest, so
      // the "Call ended at" clock reports the wrong party's departure.
      const bogus = dateOnly(T0 + 10_000);
      const log = { specialists: { real: { joinedAt: ts(T0), leftAt: ts(T0 + 1) }, weird: { joinedAt: ts(T0), leftAt: bogus } } };
      expect(presenceOverlay(assignment(), log).specialistLeftAt).not.toBe(bogus);
    });

    it('reads a single specialist\'s own presence straight off the log', () => {
      const log = { specialists: { me: { joinedAt: ts(T0) }, you: { joinedAt: ts(T0), leftAt: ts(T0 + 1) } } };
      expect(specialistPresentById(log, 'me')).toBe(true);
      expect(specialistPresentById(log, 'you')).toBe(false);
      expect(specialistJoinedById(log, 'you')).toBe(true);   // joined, then left
      expect(specialistPresentById(null, 'me')).toBe(false);
      expect(specialistJoinedById(log, 'nobody')).toBe(false);
    });
  });

  // ===============================================================================================
  // ABU-07 — call state (the only state ACTIVE cards branch on)
  // ===============================================================================================
  describe('ABU-07 call-state predicates', () => {
    it('specialist is in call when joined and not left', () => {
      expect(specialistInCall({ specialistJoinedAt: ts(T0) })).toBe(true);
      expect(specialistInCall({ specialistJoinedAt: ts(T0), specialistLeftAt: ts(T0 + 1) })).toBe(false);
      expect(specialistInCall({})).toBe(false);
    });

    it('participant is in call when in-call stamped and not left', () => {
      expect(participantInCall({ participantInCallAt: ts(T0) })).toBe(true);
      expect(participantInCall({ participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 1) })).toBe(false);
    });

    it('neither party is gated on the OTHER party leaving', () => {
      // Deliberate: gating would hide the case where one person dropped while the other is still in.
      const p = { specialistJoinedAt: ts(T0), participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 1) };
      expect(specialistInCall(p)).toBe(true);
      expect(onlyParticipantLeft(p)).toBe(true);
      expect(onlySpecialistLeft(p)).toBe(false);
      expect(bothInCall(p)).toBe(false);
    });

    it('bothInCall only when both are live', () => {
      expect(bothInCall({ specialistJoinedAt: ts(T0), participantInCallAt: ts(T0) })).toBe(true);
    });

    it('call ended = both gone AND at least one actually joined', () => {
      expect(callEnded({ specialistJoinedAt: ts(T0), specialistLeftAt: ts(T0 + 1) })).toBe(true);
      expect(callEnded({ participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 1) })).toBe(true);
    });

    it('a still-loading session with nobody ever present is NOT ended', () => {
      expect(callEnded({})).toBe(false);
      expect(callEnded({ participantReadyAt: ts(T0) })).toBe(false);
    });

    it('participant present = on the wait screen (ready and not left)', () => {
      expect(participantPresent({ participantReadyAt: ts(T0) })).toBe(true);
      expect(participantPresent({ participantReadyAt: ts(T0), participantLeftAt: ts(T0 + 1) })).toBe(false);
      expect(participantPresent({})).toBe(false);
    });

    it('DEFECT (pinned): participantPresent stays TRUE after the participant joins the call', () => {
      // The predicate ignores participantInCallAt entirely and relies on the client nulling
      // participantReadyAt on join. If that write is lost (tab killed, offline, rules denial) the
      // board shows the same person as both "waiting at the studio" and "in the call".
      expect(participantPresent({ participantReadyAt: ts(T0), participantInCallAt: ts(T0 + 1) })).toBe(true);
    });

    it('specialistJoined splits the JOINED column from the ACTIVE column', () => {
      expect(specialistJoined({ specialistJoinedAt: ts(T0) })).toBe(true);
      expect(specialistJoined({})).toBe(false);
    });
  });

  // ===============================================================================================
  // ABU-08 — timers and clocks (clock frozen)
  // ===============================================================================================
  describe('ABU-08 timers and clocks', () => {
    it('formats M:SS with a zero-padded seconds field', () => {
      expect(mmss(0)).toBe('0:00');
      expect(mmss(-5_000)).toBe('0:00');
      expect(mmss(1_000)).toBe('0:01');
      expect(mmss(65_000)).toBe('1:05');
      expect(mmss(600_000)).toBe('10:00');
    });

    it('truncates rather than rounds partial seconds', () => {
      expect(mmss(1_999)).toBe('0:01');
    });

    it('DEFECT (pinned): minutes are never wrapped into hours', () => {
      // A 75-minute session reads "75:04", not "1:15:04". It looks like a clock but is not one, so a
      // coordinator scanning the board reads a long-overrunning session as a short one.
      expect(mmss(75 * 60_000 + 4_000)).toBe('75:04');
    });

    it('invite countdown counts down to the expiry', () => {
      expect(inviteCountdown(invite({ expirydate: ts(T0 + 65_000) }), T0)).toBe('1:05');
      expect(inviteCountdown(invite({ expirydate: ts(T0 - 1) }), T0)).toBe('0:00');
    });

    it('invite countdown reads "—" when there is no expiry to count to', () => {
      expect(inviteCountdown(invite(), T0)).toBe('—');
      expect(inviteCountdown(null, T0)).toBe('—');
    });

    it('session timer runs while the call is live', () => {
      const p = { specialistJoinedAt: ts(T0) };
      expect(sessionElapsed(p, T0 + 125_000)).toBe('2:05');
    });

    it('session timer FREEZES at the last departure once the call has ended', () => {
      const p = {
        specialistJoinedAt: ts(T0), specialistLeftAt: ts(T0 + 60_000),
        participantInCallAt: ts(T0), participantLeftAt: ts(T0 + 90_000),
      };
      // Frozen at the LATER leave (90s), regardless of how much later "now" is.
      expect(sessionElapsed(p, T0 + 999_000)).toBe('1:30');
    });

    it('session timer keeps running when only the specialist dropped', () => {
      const p = { specialistJoinedAt: ts(T0), specialistLeftAt: ts(T0 + 10_000), participantInCallAt: ts(T0) };
      expect(sessionElapsed(p, T0 + 120_000)).toBe('2:00'); // participant still in → not ended
    });

    it('session timer is "—" before the specialist joins', () => {
      expect(sessionElapsed({}, T0)).toBe('—');
    });

    it('studio-entry timer counts from the assignment created stamp', () => {
      expect(sinceStudioEntry({ created: ts(T0) }, T0 + 30_000)).toBe('0:30');
      expect(sinceStudioEntry({}, T0)).toBe('—');
    });

    it('latestLeaveMs picks the later stamp, or null when neither is numeric', () => {
      expect(latestLeaveMs({ specialistLeftAt: ts(T0), participantLeftAt: ts(T0 + 5) })).toBe(T0 + 5);
      expect(latestLeaveMs({ specialistLeftAt: ts(T0) })).toBe(T0);
      expect(latestLeaveMs({})).toBeNull();
    });

    it('clocks render 12-hour with AM/PM', () => {
      const at = (h: number, m: number) => new Date(2026, 8, 10, h, m).getTime();
      expect(callStartedClock({ specialistJoinedAt: ts(at(9, 42)) })).toBe('9:42 AM');
      expect(callStartedClock({ specialistJoinedAt: ts(at(14, 5)) })).toBe('2:05 PM');
      expect(callStartedClock({ specialistJoinedAt: ts(at(0, 7)) })).toBe('12:07 AM'); // midnight is 12, not 0
      expect(callStartedClock({ specialistJoinedAt: ts(at(12, 0)) })).toBe('12:00 PM'); // noon is PM
    });

    it('clocks read "—" when the stamp is absent', () => {
      expect(callStartedClock({})).toBe('—');
      expect(callEndedClock({})).toBe('—');
    });

    it('call-ended clock uses the later departure', () => {
      const at = (h: number, m: number) => new Date(2026, 8, 10, h, m).getTime();
      expect(callEndedClock({ specialistLeftAt: ts(at(10, 0)), participantLeftAt: ts(at(10, 30)) })).toBe('10:30 AM');
    });
  });

  // ===============================================================================================
  // ABU-09 — card labels and rosters
  // ===============================================================================================
  describe('ABU-09 labels and rosters', () => {
    const mapProfile = { p1: 'Ada Lovelace', s1: 'Grace Hopper', s2: 'Alan Turing' };
    const mapActivity = { act1: 'Coaching', act2: 'Review' };

    it('initials take the first letter of the first two words, uppercased', () => {
      expect(initials('ada lovelace')).toBe('AL');
      expect(initials('Ada Something Lovelace')).toBe('AS'); // first TWO only
      expect(initials('Ada')).toBe('A');
      expect(initials('')).toBe('?');
      expect(initials('  Ada   Lovelace ')).toBe('AL'); // extra spaces filtered out
    });

    it('participant name falls back to the em dash', () => {
      expect(participantName(mapProfile, 'p1')).toBe('Ada Lovelace');
      expect(participantName(mapProfile, 'nope')).toBe('—');
    });

    it('hasName is false for a blank id or an unresolved one', () => {
      expect(hasName(mapProfile, 'p1')).toBe(true);
      expect(hasName(mapProfile, '')).toBe(false);
      expect(hasName(mapProfile, 'nope')).toBe(false);
    });

    it('attempts label singularises exactly one attempt and defaults to 1', () => {
      expect(attemptsLabel(invite({ attempts: 1 }))).toBe('1 attempt');
      expect(attemptsLabel(invite({ attempts: 3 }))).toBe('3 attempts');
      expect(attemptsLabel(invite())).toBe('1 attempt');
    });

    it('DEFECT (pinned): zero attempts reads "0 attempts" instead of falling back to 1', () => {
      // `?? 1` only catches null/undefined, so a stored 0 passes through. A card can claim the studio
      // has been rung "0 attempts" while an invitation is visibly ringing on it.
      expect(attemptsLabel(invite({ attempts: 0 }))).toBe('0 attempts');
    });

    it('studio specialist list falls back to the raw ID, not the em dash', () => {
      const s = studio({ participants: ['s1', 'ghost'], participantsactivity: { s1: 'act1' } });
      expect(specialistList(s, mapProfile, mapActivity)).toEqual([
        { name: 'Grace Hopper', activity: 'Coaching' },
        { name: 'ghost', activity: '' },
      ]);
      expect(specialistList(null, mapProfile, mapActivity)).toEqual([]);
    });

    it('pairing specialists list everyone in the session with their activity', () => {
      const a = assignment({ pairing: ['s1', 's2'], participantsactivity: { s1: 'act1' } });
      expect(pairingSpecialists(a, mapProfile, mapActivity)).toEqual([
        { id: 's1', name: 'Grace Hopper', activity: 'Coaching' },
        { id: 's2', name: 'Alan Turing', activity: '' },
      ]);
    });

    it('bonus specialists exclude the participant and the main pairing', () => {
      const a = assignment({
        participantid: 'p1', pairing: ['s1'],
        bonusactivity: { p1: 'act1', s1: 'act1', s2: 'act2' },
      });
      expect(bonusSpecialists(a, mapProfile, mapActivity)).toEqual([
        { id: 's2', name: 'Alan Turing', activity: 'Review' },
      ]);
    });

    it('profile display name prefers name, then profilename, then displayname', () => {
      expect(displayNameFromProfileDoc({ name: 'A', profilename: 'B', displayname: 'C' })).toBe('A');
      expect(displayNameFromProfileDoc({ profilename: 'B', displayname: 'C' })).toBe('B');
      expect(displayNameFromProfileDoc({ displayname: 'C' })).toBe('C');
      expect(displayNameFromProfileDoc({})).toBe('');
      expect(displayNameFromProfileDoc(null)).toBe('');
    });
  });

  // ===============================================================================================
  // ABU-10 — chat
  // ===============================================================================================
  describe('ABU-10 chat', () => {
    const mapProfile = { s1: 'Grace Hopper', s2: 'Alan Turing' };
    const mapActivity = { act1: 'Coaching' };

    it('chat label joins each specialist with their activity', () => {
      const s = studio({ participants: ['s1', 's2'], participantsactivity: { s1: 'act1' } });
      expect(studioChatName(s, mapProfile, mapActivity)).toBe('Grace Hopper - Coaching, Alan Turing');
    });

    it('an empty studio is labelled "Studio"', () => {
      expect(studioChatName(studio(), mapProfile, mapActivity)).toBe('Studio');
    });

    it('the name cache is keyed by studio docid', () => {
      const cache = buildChatNameCache([studio({ docid: 'sA', participants: ['s2'] })], mapProfile, mapActivity);
      expect(cache['sA']).toBe('Alan Turing');
    });

    it('unread counts tally per studio', () => {
      const msgs = [{ studioid: 'a' }, { studioid: 'a' }, { studioid: 'b' }];
      expect(unreadCountsByStudio(msgs)).toEqual({ a: 2, b: 1 });
      expect(unreadCountsByStudio([])).toEqual({});
    });

    it('unread messages exclude my own and those I have already read', () => {
      const msgs = [
        { messageid: 'mine', sent_by: 'me', pending: ['you'] },
        { messageid: 'unread', sent_by: 'you', pending: ['me'] },
        { messageid: 'read', sent_by: 'you', pending: [] },
        { messageid: 'nopending', sent_by: 'you' },
      ];
      expect(unreadMessagesFor(msgs, 'me').map(m => m['messageid'])).toEqual(['unread']);
    });

    it('sorts unread studios first, then by most recent message', () => {
      const threads = { a: { lastmessageat: ts(T0) }, b: { lastmessageat: ts(T0 + 100) }, c: { lastmessageat: ts(T0 + 200) } };
      const rows = [studio({ docid: 'a' }), studio({ docid: 'b' }), studio({ docid: 'c' })];
      const out = sortByChatActivity(rows, s => s.docid, new Set(['a']), threads);
      expect(out.map(s => s.docid)).toEqual(['a', 'c', 'b']); // unread first, then newest
    });

    it('sorts a studio with no thread last', () => {
      const rows = [studio({ docid: 'silent' }), studio({ docid: 'chatty' })];
      const out = sortByChatActivity(rows, s => s.docid, new Set(), { chatty: { lastmessageat: ts(T0) } });
      expect(out.map(s => s.docid)).toEqual(['chatty', 'silent']);
    });

    it('does not mutate the array it is handed', () => {
      const rows = [studio({ docid: 'a' }), studio({ docid: 'b' })];
      sortByChatActivity(rows, s => s.docid, new Set(['b']), {});
      expect(rows.map(s => s.docid)).toEqual(['a', 'b']);
    });

    it('recognises image attachments case-insensitively', () => {
      expect(isImageFile('photo.JPG')).toBe(true);
      expect(isImageFile('a.webp')).toBe(true);
      expect(isImageFile('notes.pdf')).toBe(false);
      expect(isImageFile('')).toBe(false);
    });

    it('caps chat attachments at 10MB', () => {
      expect(CHAT_FILE_MAX_BYTES).toBe(10 * 1024 * 1024);
      expect(isAcceptableChatFile(CHAT_FILE_MAX_BYTES)).toBe(true);
      expect(isAcceptableChatFile(CHAT_FILE_MAX_BYTES + 1)).toBe(false);
    });

    it('linkifies bare URLs and turns newlines into breaks', () => {
      const out = linkifyMessage('see\nhttps://example.com now');
      expect(out).toContain('see<br>');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('color:#1a56db');
    });

    it('honours the link colour parameter', () => {
      expect(linkifyMessage('https://x.dev', '#ff0000')).toContain('color:#ff0000');
    });

    it('returns empty string for an empty message', () => {
      expect(linkifyMessage('')).toBe('');
    });

    it('DEFECT (pinned): a URL at end of line swallows the <br> into its own href', () => {
      // `\n` → `<br>` runs BEFORE the `https?://[^\s]+` match, and `<br>` contains no whitespace, so
      // it is captured as part of the URL. The rendered link points at "https://example.com<br>",
      // which 404s, and the line break the sender typed disappears from the message.
      const out = linkifyMessage('https://example.com\nnext line');
      expect(out).toContain('href="https://example.com<br>next"');
    });
  });
});
